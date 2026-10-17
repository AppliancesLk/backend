import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { AuthService } from '../services/auth.service';
import { readSessionCookie } from '../session.config';

// Keep the existing guard name so protected feature controllers share the same policy.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.authService.authenticate(
      readSessionCookie(request.headers.cookie),
    );
    request.user = { ...user, sub: user.id };
    return true;
  }
}
