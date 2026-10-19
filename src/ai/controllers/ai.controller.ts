import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { ChatRequestDto } from '../dto/chat-request.dto';
import { AiService } from '../services/ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}
  @Post('chat')
  chat(@Req() request: AuthenticatedRequest, @Body() dto: ChatRequestDto) {
    if (!request.user?.sub) throw new UnauthorizedException();
    return this.ai.chat(request.user.sub, dto);
  }
}
