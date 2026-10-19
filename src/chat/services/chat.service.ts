import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { ChatEventsService } from './chat-events.service';
import type {
  ChatActor,
  ChatMessageView,
  ChatSessionView,
} from '../types/chat.types';
import { ChatQueryDto, SendMessageDto } from '../dto/chat.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  constructor(
    private readonly db: DataSource,
    private readonly events: ChatEventsService,
  ) {}
  private async run<T>(
    actor: ChatActor,
    operation: string,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      if (!['CUSTOMER', 'ADMIN'].includes(actor.role))
        throw new ForbiddenException(
          'Live chat is available to customers and admins only',
        );
      return await action();
    } catch (error) {
      this.logger.warn({
        operation,
        userId: actor.id,
        role: actor.role,
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      });
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Live chat is temporarily unavailable. Please try again',
      );
    }
  }
  private sessionView(session: ChatSession, admin = false): ChatSessionView {
    return {
      id: session.id,
      customerId: session.customerId,
      status: session.status,
      messageCount: session.messageCount,
      customerUnreadCount: session.customerUnreadCount,
      adminUnreadCount: session.adminUnreadCount,
      lastMessagePreview: session.lastMessagePreview,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastMessageAt: session.lastMessageAt,
      closedAt: session.closedAt,
      ...(admin && session.customer
        ? {
            customer: {
              id: session.customer.id,
              username: session.customer.username,
              email: session.customer.email,
            },
          }
        : {}),
    };
  }
  private messageView(message: ChatMessage): ChatMessageView {
    return {
      id: message.id,
      chatSessionId: message.chatSessionId,
      senderUserId: message.senderUserId,
      senderRole: message.senderRole,
      clientMessageId: message.clientMessageId,
      sequence: message.sequence,
      content: message.content,
      createdAt: message.createdAt,
    };
  }
  private async authorized(
    manager: EntityManager,
    actor: ChatActor,
    id: string,
    lock = false,
  ) {
    const session = await manager.findOne(ChatSession, {
      where: { id },
      ...(lock
        ? { lock: { mode: 'pessimistic_write' as const } }
        : { relations: { customer: actor.role === 'ADMIN' } }),
    });
    if (!session)
      throw new NotFoundException(
        'Chat session not found. It may have been removed by the five-session limit',
      );
    if (actor.role !== 'ADMIN' && session.customerId !== actor.id)
      throw new ForbiddenException('You cannot access another customer’s chat');
    return session;
  }
  create(actor: ChatActor) {
    return this.run(actor, 'chat.create', async () => {
      if (actor.role !== 'CUSTOMER')
        throw new ForbiddenException('Only customers can create support chats');
      const result = await this.db.transaction(async (manager) => {
        const user = await manager.findOne(User, {
          where: { id: actor.id },
          // Serialize creation without blocking message FK key-share locks.
          lock: { mode: 'for_no_key_update' },
        });
        if (!user || !user.isActive || user.role !== 'CUSTOMER')
          throw new ForbiddenException('Customer account is not available');
        const existing = await manager.find(ChatSession, {
          where: { customerId: actor.id },
          order: { createdAt: 'ASC', id: 'ASC' },
        });
        const removed = existing.slice(0, Math.max(0, existing.length - 4));
        for (const session of removed)
          await manager.delete(ChatSession, {
            id: session.id,
            customerId: actor.id,
          });
        const now = new Date(
          Math.max(Date.now(), (existing.at(-1)?.createdAt.getTime() ?? 0) + 1),
        );
        const session = await manager.save(
          ChatSession,
          manager.create(ChatSession, {
            customerId: actor.id,
            status: 'OPEN',
            messageCount: 0,
            customerUnreadCount: 0,
            adminUnreadCount: 0,
            lastMessagePreview: '',
            createdAt: now,
            lastMessageAt: now,
            closedAt: null,
          }),
        );
        return { session: this.sessionView(session), removed };
      });
      for (const session of result.removed) {
        this.logger.log({
          operation: 'chat.oldest.removed',
          userId: actor.id,
          chatSessionId: session.id,
        });
        await this.events.removed(session.id, actor.id);
      }
      this.logger.log({
        operation: 'chat.created',
        userId: actor.id,
        chatSessionId: result.session.id,
      });
      await this.events.changed(result.session, true);
      return {
        session: result.session,
        removedSessionIds: result.removed.map((session) => session.id),
      };
    });
  }
  list(actor: ChatActor, query: ChatQueryDto) {
    return this.run(actor, 'chat.list', async () => {
      const builder = this.db
        .getRepository(ChatSession)
        .createQueryBuilder('session');
      if (actor.role === 'CUSTOMER')
        builder.where('session.customerId = :userId', { userId: actor.id });
      else builder.innerJoinAndSelect('session.customer', 'customer');
      if (query.status)
        builder.andWhere('session.status = :status', { status: query.status });
      const total = await builder.getCount();
      const page = Math.min(
        query.page,
        Math.max(1, Math.ceil(total / query.limit)),
      );
      const sessions = await builder
        .orderBy('session.status', 'DESC')
        .addOrderBy('session.lastMessageAt', 'DESC')
        .addOrderBy('session.id', 'DESC')
        .limit(query.limit)
        .offset((page - 1) * query.limit)
        .getMany();
      return {
        items: sessions.map((session) =>
          this.sessionView(session, actor.role === 'ADMIN'),
        ),
        total,
        page,
        totalPages: Math.ceil(total / query.limit),
      };
    });
  }
  detail(actor: ChatActor, id: string) {
    return this.run(actor, 'chat.detail', async () =>
      this.sessionView(
        await this.authorized(this.db.manager, actor, id),
        actor.role === 'ADMIN',
      ),
    );
  }
  messages(actor: ChatActor, id: string) {
    return this.run(actor, 'chat.messages', async () => {
      await this.authorized(this.db.manager, actor, id);
      return (
        await this.db.manager.find(ChatMessage, {
          where: { chatSessionId: id },
          order: { createdAt: 'ASC', sequence: 'ASC' },
          take: 100,
        })
      ).map((message) => this.messageView(message));
    });
  }
  send(actor: ChatActor, dto: SendMessageDto) {
    return this.run(actor, 'chat.message.send', async () => {
      if (
        typeof dto.content !== 'string' ||
        !dto.content.trim() ||
        dto.content.trim().length > 2000
      )
        throw new BadRequestException(
          'Enter a text message of 1–2000 characters',
        );
      const content = dto.content.trim();
      const result = await this.db.transaction(async (manager) => {
        const session = await this.authorized(
          manager,
          actor,
          dto.sessionId,
          true,
        );
        const existing = await manager.findOneBy(ChatMessage, {
          chatSessionId: dto.sessionId,
          senderUserId: actor.id,
          clientMessageId: dto.clientMessageId,
        });
        if (existing) {
          if (existing.content !== content)
            throw new ConflictException(
              'That message request ID was already used for different text',
            );
          return {
            session: this.sessionView(session),
            message: this.messageView(existing),
            replayed: true,
          };
        }
        const count = await manager.countBy(ChatMessage, {
          chatSessionId: dto.sessionId,
        });
        if (count >= 100)
          throw new ConflictException(
            'This chat has reached the 100-message limit. Please start a new chat to continue',
          );
        if (session.status === 'CLOSED')
          throw new ConflictException(
            'This chat is closed. Please start a new chat to continue',
          );
        const at = new Date(
          Math.max(Date.now(), session.lastMessageAt.getTime() + 1),
        );
        const message = await manager.save(
          ChatMessage,
          manager.create(ChatMessage, {
            chatSessionId: session.id,
            senderUserId: actor.id,
            senderRole: actor.role,
            clientMessageId: dto.clientMessageId,
            content,
            sequence: count + 1,
            createdAt: at,
          }),
        );
        session.messageCount = count + 1;
        session.lastMessageAt = at;
        session.lastMessagePreview = content.slice(0, 120);
        if (actor.role === 'CUSTOMER') session.adminUnreadCount++;
        else session.customerUnreadCount++;
        if (session.messageCount === 100) {
          session.status = 'CLOSED';
          session.closedAt = at;
        }
        await manager.save(session);
        return {
          session: this.sessionView(session),
          message: this.messageView(message),
          replayed: false,
        };
      });
      if (!result.replayed) {
        this.logger.log({
          operation: 'chat.message.persisted',
          userId: actor.id,
          role: actor.role,
          chatSessionId: dto.sessionId,
          messageId: result.message.id,
          messageCount: result.session.messageCount,
        });
        await this.events.message(result);
        if (result.session.messageCount === 100)
          this.logger.log({
            operation: 'chat.limit.reached',
            chatSessionId: dto.sessionId,
          });
      }
      return { session: result.session, message: result.message };
    });
  }
  read(actor: ChatActor, id: string) {
    return this.run(actor, 'chat.read', async () => {
      const result = await this.db.transaction(async (manager) => {
        const session = await this.authorized(manager, actor, id, true);
        const field =
          actor.role === 'ADMIN' ? 'adminUnreadCount' : 'customerUnreadCount';
        const changed = session[field] > 0;
        if (changed) {
          session[field] = 0;
          await manager.save(session);
        }
        return { session: this.sessionView(session), changed };
      });
      if (result.changed) await this.events.changed(result.session);
      return result.session;
    });
  }
  close(actor: ChatActor, id: string) {
    return this.run(actor, 'chat.close', async () => {
      if (actor.role !== 'ADMIN')
        throw new ForbiddenException('Only admins can close support chats');
      const result = await this.db.transaction(async (manager) => {
        const session = await this.authorized(manager, actor, id, true);
        const changed = session.status !== 'CLOSED';
        if (changed) {
          session.status = 'CLOSED';
          session.closedAt = new Date();
          await manager.save(session);
        }
        return { session: this.sessionView(session), changed };
      });
      if (result.changed) {
        this.logger.log({
          operation: 'chat.closed',
          userId: actor.id,
          chatSessionId: id,
        });
        await this.events.closed(result.session);
      }
      return result.session;
    });
  }
}
