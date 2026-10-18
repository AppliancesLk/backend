import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Header,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';
import { ImageStorageService } from '../../media/services/image-storage.service';
import { UpdateBannerSectionDto } from '../dto/update-banner-section.dto';
import { BannersService } from '../services/banners.service';
@Controller('banners')
export class BannersController {
  constructor(
    private readonly banners: BannersService,
    private readonly storage: ImageStorageService,
  ) {}
  @Get() findAll() {
    return this.banners.findAll();
  }
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  admin() {
    return this.banners.findAll(true);
  }
  @Put(':position')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('position') position: string,
    @Body() input: UpdateBannerSectionDto,
  ) {
    return this.banners.update(position, input);
  }
  @Post('images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  upload(@UploadedFile() file?: { buffer: Buffer }) {
    return this.storage.store(
      file?.buffer,
      process.env.BANNER_UPLOAD_DIR ?? 'uploads/banners',
      '/banners/images',
    );
  }
  @Get('images/:filename')
  @Header('X-Content-Type-Options', 'nosniff')
  image(@Param('filename') filename: string) {
    return this.storage.read(
      filename,
      process.env.BANNER_UPLOAD_DIR ?? 'uploads/banners',
    );
  }
}
