import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { AuthService } from '../auth/services/auth.service';
import { readSessionCookie } from '../auth/session.config';
import { frontendOrigin } from '../auth/browser-security';
import { ChatSessionDto, SendMessageDto } from './dto/chat.dto';
import { ChatService } from './services/chat.service';
import { ChatEventsService } from './services/chat-events.service';
import type {
  ChatAck,
  ChatActor,
  ChatNamespace,
  ChatSocket,
} from './types/chat.types';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) => callback(null, origin === frontendOrigin()),
    credentials: true,
  },
  maxHttpBufferSize: 16384,
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);
  private readonly validation = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  constructor(
    private readonly auth: AuthService,
    private readonly chat: ChatService,
    private readonly events: ChatEventsService,
  ) {}
  async authenticate(socket: ChatSocket): Promise<ChatActor> {
    if (socket.handshake.headers.origin !== frontendOrigin())
      throw new ForbiddenException('Untrusted chat origin');
    const user = await this.auth.authenticate(
      readSessionCookie(socket.handshake.headers.cookie),
    );
    if (user.role !== 'CUSTOMER' && user.role !== 'ADMIN')
      throw new ForbiddenException(
        'Live chat is available to customers and admins only',
      );
    const actor: ChatActor = { id: user.id, role: user.role };
    socket.data.actor = actor;
    return actor;
  }
  afterInit(server: ChatNamespace) {
    this.events.bind(server);
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then(() => next())
        .catch(() => {
          this.logger.warn({
            operation: 'chat.socket.rejected',
            socketId: socket.id,
          });
          next(
            new Error(
              'Please sign in with a customer or admin account to use live chat',
            ),
          );
        });
    });
  }
  handleConnection(socket: ChatSocket) {
    const actor = socket.data.actor;
    void socket.join(
      actor.role === 'ADMIN' ? 'support:admins' : `support:user:${actor.id}`,
    );
    this.logger.log({
      operation: 'chat.socket.connected',
      userId: actor.id,
      role: actor.role,
      socketId: socket.id,
    });
  }
  handleDisconnect(socket: ChatSocket) {
    this.logger.log({
      operation: 'chat.socket.disconnected',
      userId: socket.data.actor?.id,
      socketId: socket.id,
    });
  }
  private async execute<T>(
    socket: ChatSocket,
    action: (actor: ChatActor) => Promise<T>,
  ): Promise<ChatAck<T>> {
    try {
      return { ok: true, data: await action(await this.authenticate(socket)) };
    } catch (error) {
      const statusCode =
        error instanceof HttpException ? error.getStatus() : 500;
      const message =
        error instanceof BadRequestException
          ? 'Enter valid chat details and text of 1–2000 characters'
          : error instanceof HttpException
            ? error.message
            : 'Live chat is temporarily unavailable. Please try again';
      this.logger.warn({
        operation: 'chat.socket.error',
        userId: socket.data.actor?.id,
        statusCode,
      });
      socket.emit('chat:error', { statusCode, message });
      if (
        [401, 403].includes(statusCode) &&
        error instanceof ForbiddenException &&
        message === 'Untrusted chat origin'
      )
        socket.disconnect(true);
      return { ok: false, error: { statusCode, message } };
    }
  }
  @SubscribeMessage('chat:join')
  join(@ConnectedSocket() socket: ChatSocket, @MessageBody() input: unknown) {
    return this.execute(socket, async (actor) => {
      const dto: ChatSessionDto = await this.validation.transform(input, {
        type: 'body',
        metatype: ChatSessionDto,
      });
      await this.chat.detail(actor, dto.sessionId);
      for (const room of socket.rooms)
        if (room.startsWith('chat:')) await socket.leave(room);
      await socket.join(`chat:${dto.sessionId}`);
      return this.chat.read(actor, dto.sessionId);
    });
  }
  @SubscribeMessage('chat:leave')
  leave(@ConnectedSocket() socket: ChatSocket, @MessageBody() input: unknown) {
    return this.execute(socket, async () => {
      const dto: ChatSessionDto = await this.validation.transform(input, {
        type: 'body',
        metatype: ChatSessionDto,
      });
      await socket.leave(`chat:${dto.sessionId}`);
      return null;
    });
  }
  @SubscribeMessage('chat:read')
  read(@ConnectedSocket() socket: ChatSocket, @MessageBody() input: unknown) {
    return this.execute(socket, async (actor) => {
      const dto: ChatSessionDto = await this.validation.transform(input, {
        type: 'body',
        metatype: ChatSessionDto,
      });
      return this.chat.read(actor, dto.sessionId);
    });
  }
  @SubscribeMessage('chat:message')
  message(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() input: unknown,
  ) {
    return this.execute(socket, async (actor) => {
      const dto: SendMessageDto = await this.validation.transform(input, {
        type: 'body',
        metatype: SendMessageDto,
      });
      return this.chat.send(actor, dto);
    });
  }
}
