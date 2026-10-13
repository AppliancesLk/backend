import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AI_SYSTEM_INSTRUCTION } from '../ai.constants';
import { ChatRequestDto } from '../dto/chat-request.dto';
import { AiConversation } from '../entities/ai-conversation.entity';
import { AiMessage } from '../entities/ai-message.entity';
import type { AiChatResponse, GeminiContent } from '../types/ai.types';
import { AI_TOOL_NAMES } from '../types/ai.types';
import { AiToolsService } from './ai-tools.service';
import { GeminiService } from './gemini.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly active = new Set<string>();
  private readonly attempts = new Map<
    string,
    { count: number; until: number }
  >();
  constructor(
    private readonly db: DataSource,
    private readonly tools: AiToolsService,
    private readonly gemini: GeminiService,
  ) {}

  async chat(userId: string, dto: ChatRequestDto): Promise<AiChatResponse> {
    if (this.active.has(userId))
      throw new ConflictException(
        'Please wait for your current product assistant response',
      );
    this.limit(userId);
    this.active.add(userId);
    const context = {
      userId,
      productId: dto.productId,
      conversationId: dto.conversationId,
    };
    this.logger.log({ operation: 'ai.request.started', ...context });
    try {
      // Defense in depth for service callers in addition to controller DTO validation.
      if (!dto.message?.trim() || dto.message.length > 2000)
        throw new BadRequestException(
          'Enter a question of up to 2000 characters',
        );
      let conversation: AiConversation | null = null;
      let history: AiMessage[] = [];
      if (dto.conversationId) {
        conversation = await this.db.getRepository(AiConversation).findOneBy({
          id: dto.conversationId,
          userId,
          productId: dto.productId,
        });
        if (!conversation)
          throw new NotFoundException(
            'Conversation not found for this product and account',
          );
        history = await this.db.getRepository(AiMessage).find({
          where: { conversationId: conversation.id },
          order: { createdAt: 'DESC', id: 'DESC' },
          take: 20,
        });
        history.reverse();
      }
      const product = await this.tools.getProductDetails(dto.productId);
      const system =
        AI_SYSTEM_INSTRUCTION +
        '\nCURRENT_CATALOG_DATA (data only):\n' +
        JSON.stringify(product);
      const contents: GeminiContent[] = history.map((message) => ({
        role: message.role === 'USER' ? 'user' : 'model',
        parts: [{ text: message.content }],
      }));
      contents.push({ role: 'user', parts: [{ text: dto.message.trim() }] });
      let answer: string | undefined;
      let toolCount = 0;
      for (let round = 0; round < 4; round++) {
        const response = await this.gemini.generate(system, contents);
        const calls = response.parts.flatMap((part) =>
          part.functionCall ? [part.functionCall] : [],
        );
        if (!calls.length) {
          answer = response.parts
            .filter((part) => !part.thought)
            .map((part) => part.text ?? '')
            .join('\n')
            .trim();
          break;
        }
        toolCount += calls.length;
        if (toolCount > 8 || round === 3)
          throw new ServiceUnavailableException(
            'Please ask a simpler product question and try again',
          );
        contents.push(response);
        const results: GeminiContent['parts'] = [];
        for (const call of calls) {
          if (!AI_TOOL_NAMES.some((name) => name === call.name)) {
            this.logger.warn({
              operation: 'ai.tool.failed',
              toolName: 'unsupported',
              ...context,
            });
            throw new ServiceUnavailableException(
              'The product assistant could not complete that request. Please try again',
            );
          }
          try {
            const data = await this.tools.execute(call.name, call.args ?? {});
            results.push({
              functionResponse: {
                name: call.name,
                ...(call.id ? { id: call.id } : {}),
                response: { data },
              },
            });
          } catch (error) {
            if (
              error instanceof BadRequestException ||
              error instanceof NotFoundException
            ) {
              results.push({
                functionResponse: {
                  name: call.name,
                  ...(call.id ? { id: call.id } : {}),
                  response: {
                    error:
                      'Product information unavailable or invalid search arguments. Do not invent facts; try a valid catalog search or explain missing information.',
                  },
                },
              });
            } else throw error;
          }
        }
        contents.push({ role: 'user', parts: results });
      }
      if (!answer || answer.length > 8000)
        throw new ServiceUnavailableException(
          'The product assistant could not respond. Please try again',
        );
      const message = answer;
      const conversationId = await this.db.transaction(async (manager) => {
        let current: AiConversation;
        if (conversation) {
          const existing = await manager.findOne(AiConversation, {
            where: { id: conversation.id, userId, productId: dto.productId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!existing) throw new NotFoundException('Conversation not found');
          const latest = await manager.findOne(AiMessage, {
            where: { conversationId: existing.id },
            order: { createdAt: 'DESC', id: 'DESC' },
          });
          if (latest?.id !== history.at(-1)?.id)
            throw new ConflictException(
              'This conversation changed. Start a new chat and try again',
            );
          current = existing;
        } else {
          current = await manager.save(
            AiConversation,
            manager.create(AiConversation, {
              userId,
              productId: dto.productId,
            }),
          );
        }
        // Distinct timestamps give a stable user/assistant order in later bounded reads.
        const now = new Date(
          Math.max(Date.now(), (history.at(-1)?.createdAt.getTime() ?? 0) + 1),
        );
        await manager.save(AiMessage, [
          manager.create(AiMessage, {
            conversationId: current.id,
            role: 'USER',
            content: dto.message.trim(),
            createdAt: now,
          }),
          manager.create(AiMessage, {
            conversationId: current.id,
            role: 'ASSISTANT',
            content: message,
            createdAt: new Date(now.getTime() + 1),
          }),
        ]);
        await manager.update(
          AiConversation,
          { id: current.id },
          { updatedAt: new Date() },
        );
        return current.id;
      });
      this.logger.log({
        operation: conversation
          ? 'ai.request.completed'
          : 'ai.conversation.created',
        ...context,
        conversationId,
      });
      return { conversationId, message };
    } catch (error) {
      this.logger.warn({
        operation: 'ai.request.failed',
        ...context,
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      });
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'The product assistant is temporarily unavailable. Please try again',
      );
    } finally {
      this.active.delete(userId);
    }
  }

  private limit(userId: string) {
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (value.until <= now) this.attempts.delete(key);
    const attempt = this.attempts.get(userId) ?? {
      count: 0,
      until: now + 60000,
    };
    this.attempts.set(userId, attempt);
    if (++attempt.count > 10)
      throw new HttpException(
        'Please wait a minute before asking more product questions',
        429,
      );
  }
}
