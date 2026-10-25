import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatService } from './services/chat.service';
import { ChatEventsService } from './services/chat-events.service';
import { ChatGateway } from './chat.gateway';
import {
  AdminChatController,
  ChatController,
} from './controllers/chat.controller';
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ChatSession, ChatMessage])],
  providers: [ChatService, ChatEventsService, ChatGateway],
  controllers: [ChatController, AdminChatController],
})
export class ChatModule {}
