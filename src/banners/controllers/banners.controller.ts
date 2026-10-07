import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  StreamableFile,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';
import { UpdateBannerSectionDto } from '../dto/update-banner-section.dto';
import { BannersService } from '../services/banners.service';

@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}
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
  async upload(@UploadedFile() file?: { buffer: Buffer }) {
    const bytes = file?.buffer;
    const extension = bytes
      ?.subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'png'
      : bytes?.[0] === 255 && bytes?.[1] === 216 && bytes?.[2] === 255
        ? 'jpg'
        : bytes?.toString('ascii', 0, 4) === 'RIFF' &&
            bytes?.toString('ascii', 8, 12) === 'WEBP'
          ? 'webp'
          : null;
    if (!bytes || !extension)
      throw new BadRequestException(
        'Choose a PNG, JPEG, or WebP image up to 5 MB',
      );
    const filename = `${randomUUID()}.${extension}`;
    try {
      const directory = resolve(
        process.env.BANNER_UPLOAD_DIR ?? 'uploads/banners',
      );
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, filename), bytes, { flag: 'wx' });
      Logger.log(
        `Banner image uploaded: filename=${filename}`,
        'BannersController',
      );
      return { imageUrl: `/banners/images/${filename}` };
    } catch (error) {
      Logger.error(
        'Banner image upload failed',
        undefined,
        'BannersController',
      );
      throw error;
    }
  }

  @Get('images/:filename')
  async image(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(filename))
      throw new BadRequestException('Invalid image filename');
    response.type(filename.split('.').pop()!);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = resolve(
      process.env.BANNER_UPLOAD_DIR ?? 'uploads/banners',
      filename,
    );
    try {
      await access(path);
    } catch {
      throw new NotFoundException('Banner image not found');
    }
    return new StreamableFile(createReadStream(path));
  }
}
