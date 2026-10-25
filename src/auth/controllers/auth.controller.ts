import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';
import {
  readSessionCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionDuration,
} from '../session.config';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { UserRole } from '../../users/enums/user-role.enum';

import { Roles } from '../decorators/roles.decorator';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { AuthService } from '../services/auth.service';
import { AccountActionsService } from '../services/account-actions.service';
import {
  AccountEmailDto,
  AccountTokenDto,
  ResetPasswordDto,
} from '../dto/account-action.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly actions: AccountActionsService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    await this.authService.logout(readSessionCookie(req.headers.cookie));
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return result;
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    await this.authService.logout(readSessionCookie(req.headers.cookie));
    res.cookie(SESSION_COOKIE, result.token, {
      ...sessionCookieOptions(),
      maxAge: sessionDuration(),
    });
    return { user: result.user };
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: AccountTokenDto) {
    return this.actions.consume(dto.token, 'VERIFY_EMAIL');
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: AccountEmailDto) {
    return this.actions.request(dto.email, 'VERIFY_EMAIL');
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: AccountEmailDto) {
    return this.actions.request(dto.email, 'RESET_PASSWORD');
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.actions.consume(dto.token, 'RESET_PASSWORD', dto.password);
  }

  @Post('logout')
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(readSessionCookie(req.headers.cookie));
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return { message: 'Signed out' };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  @Get('test/authenticated')
  @UseGuards(JwtAuthGuard)
  authenticatedTest() {
    return {
      message: 'Authenticated user access granted',
    };
  }

  @Get('test/customer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  customerTest() {
    return {
      message: 'Customer access granted',
    };
  }

  @Get('test/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminTest() {
    return {
      message: 'Admin access granted',
    };
  }

  @Get('test/repairer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.REPAIRER)
  repairerTest() {
    return {
      message: 'Repairer access granted',
    };
  }

  @Get('test/admin-or-repairer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.REPAIRER)
  adminOrRepairerTest() {
    return {
      message: 'Admin or Repairer access granted',
    };
  }
}
