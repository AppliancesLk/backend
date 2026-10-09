import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { UserRole } from '../../users/enums/user-role.enum';

import { Roles } from '../decorators/roles.decorator';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { AuthService } from '../services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
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