import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';
import { ProductImageStorageService } from '../services/product-image-storage.service';

@Controller('products/:productID/images')
export class ProductImagesController {
  constructor(private readonly storage: ProductImageStorageService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', { limits: { files: 1, fileSize: Number(process.env.PRODUCT_IMAGE_MAX_BYTES ?? 5 * 1024 * 1024) } }))
  upload(@Param('productID', ParseUUIDPipe) productID: string, @UploadedFile() file?: { buffer: Buffer; mimetype?: string; size?: number }) {
    return this.storage.upload(productID, file);
  }

  @Delete(':imageID')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('productID', ParseUUIDPipe) productID: string, @Param('imageID', ParseUUIDPipe) imageID: string) {
    return this.storage.remove(productID, imageID);
  }

  @Get(':imageID')
  read(@Param('productID', ParseUUIDPipe) productID: string, @Param('imageID', ParseUUIDPipe) imageID: string) {
    return this.storage.read(productID, imageID);
  }
}
