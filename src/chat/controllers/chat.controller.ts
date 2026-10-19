import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import type { ChatActor } from '../types/chat.types';
import { ChatQueryDto } from '../dto/chat.dto';
import { ChatService } from '../services/chat.service';
function actor(request: AuthenticatedRequest): ChatActor {
  if (!request.user || !['CUSTOMER', 'ADMIN'].includes(request.user.role))
    throw new UnauthorizedException('Please sign in to live chat');
  return {
    id: request.user.sub,
    role: request.user.role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER',
  };
}
@Controller('chats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class ChatController {
  constructor(private readonly chat: ChatService) {}
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    if (
      body !== undefined &&
      (!body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length)
    )
      throw new BadRequestException(
        'Creating a chat requires no customer or role fields',
      );
    return this.chat.create(actor(req));
  }
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: ChatQueryDto) {
    return this.chat.list(actor(req), query);
  }
  @Get(':id/messages') messages(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.messages(actor(req), id);
  }
  @Get(':id') detail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.detail(actor(req), id);
  }
}
@Controller('admin/chats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminChatController {
  constructor(private readonly chat: ChatService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: ChatQueryDto) {
    return this.chat.list(actor(req), query);
  }
  @Get(':id/messages') messages(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.messages(actor(req), id);
  }
  @Get(':id') detail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.detail(actor(req), id);
  }
  @Patch(':id/close') close(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.close(actor(req), id);
  }
}
