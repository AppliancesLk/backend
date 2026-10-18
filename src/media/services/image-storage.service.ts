import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);
  async store(
    bytes?: Buffer,
    directory = process.env.MEDIA_UPLOAD_DIR ?? 'uploads/media',
    prefix = '/media/images',
  ) {
    if (!bytes?.length || bytes.length > 5 * 1024 * 1024)
      throw new BadRequestException(
        'Choose a PNG, JPEG, or WebP image up to 5 MB',
      );
    let extension: string;
    try {
      const image = sharp(bytes, { limitInputPixels: 40000000 });
      const metadata = await image.metadata();
      if (
        !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error('Unsupported format');
      await image.stats(); // Decode the image: a forged filename/signature alone is insufficient.
      extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format!;
    } catch {
      throw new BadRequestException(
        'The file must be a valid, non-animated PNG, JPEG, or WebP image',
      );
    }
    const filename = `${randomUUID()}.${extension}`;
    try {
      await mkdir(resolve(directory), { recursive: true });
      await writeFile(resolve(directory, filename), bytes, { flag: 'wx' });
      this.logger.log(`Image uploaded: filename=${filename}`);
      return { imageUrl: `${prefix}/${filename}` };
    } catch (error) {
      this.logger.error('Image upload failed');
      throw error;
    }
  }
  async read(
    filename: string,
    directory = process.env.MEDIA_UPLOAD_DIR ?? 'uploads/media',
  ) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(filename))
      throw new BadRequestException('Invalid image filename');
    const path = resolve(directory, filename);
    try {
      await access(path);
    } catch {
      throw new NotFoundException('Image not found');
    }
    return new StreamableFile(createReadStream(path), {
      type: filename.endsWith('.png')
        ? 'image/png'
        : filename.endsWith('.jpg')
          ? 'image/jpeg'
          : 'image/webp',
    });
  }
}
