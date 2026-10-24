import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { UserRole } from '../../users/enums/user-role.enum';
import { UpdateStorefrontThemeDto } from '../dto/update-storefront-theme.dto';
import { StorefrontThemeService } from '../services/storefront-theme.service';

@Controller('storefront-theme')
export class StorefrontThemeController {
  constructor(private readonly themes: StorefrontThemeService) {}
  @Get() publicTheme() {
    return this.themes.publicTheme();
  }
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  settings() {
    return this.themes.adminSettings();
  }
  @Put('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateStorefrontThemeDto,
  ) {
    return this.themes.update(request.user!.sub, input);
  }
}
