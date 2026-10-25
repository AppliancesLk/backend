import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProductsModule } from '../products/products.module';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage } from './entities/ai-message.entity';
import { AiController } from './controllers/ai.controller';
import { AiService } from './services/ai.service';
import { AiToolsService } from './services/ai-tools.service';
import { GeminiService } from './services/gemini.service';

@Module({
  imports: [
    AuthModule,
    ProductsModule,
    TypeOrmModule.forFeature([AiConversation, AiMessage]),
  ],
  controllers: [AiController],
  providers: [AiService, AiToolsService, GeminiService],
})
export class AiModule {}
