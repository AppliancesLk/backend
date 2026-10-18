import {
  Controller,
  Get,
  Param,
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
import { ImageStorageService } from '../services/image-storage.service';
@Controller('media/images')
export class MediaController {
  constructor(private readonly storage: ImageStorageService) {}
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file?: { buffer: Buffer }) {
    return this.storage.store(file?.buffer);
  }
  @Get(':filename')
  @Header('X-Content-Type-Options', 'nosniff')
  read(@Param('filename') filename: string) {
    return this.storage.read(filename);
  }
}
