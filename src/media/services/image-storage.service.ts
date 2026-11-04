import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MEDIA_CONTAINER = 'site-media';
const DEFAULT_BANNER_CONTAINER = 'site-banners';

@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);
  private readonly clients = new Map<string, ContainerClient>();

  async store(
    bytes?: Buffer,
    directory = process.env.MEDIA_UPLOAD_DIR ?? 'uploads/media',
    prefix = '/media/images',
  ) {
    if (!bytes?.length || bytes.length > MAX_IMAGE_BYTES)
      throw new BadRequestException(
        'Choose a PNG, JPEG, or WebP image up to 5 MB',
      );
    const { contentType, extension } = await this.validate(bytes);
    const filename = `${randomUUID()}.${extension}`;

    if (this.isCloudStorage()) {
      const container = this.container(this.containerNameForPrefix(prefix));
      try {
        await container.getBlockBlobClient(filename).uploadData(bytes, {
          blobHTTPHeaders: { blobContentType: contentType },
        });
        this.logger.log(
          `Image uploaded to blob storage: filename=${filename}, container=${container.containerName}`,
        );
        return { imageUrl: `${prefix}/${filename}` };
      } catch (error) {
        this.logger.error(
          `Image blob upload failed: filename=${filename}, container=${container.containerName}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new ServiceUnavailableException(
          'Image storage is currently unavailable.',
        );
      }
    }

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
    prefix = '/media/images',
  ) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(filename))
      throw new BadRequestException('Invalid image filename');

    if (this.isCloudStorage()) {
      try {
        const response = await this.container(
          this.containerNameForPrefix(prefix),
        )
          .getBlockBlobClient(filename)
          .download();
        if (!response.readableStreamBody)
          throw new Error('Missing blob stream');
        return new StreamableFile(
          response.readableStreamBody as unknown as Readable,
          {
            type: this.contentTypeFor(filename),
            disposition: 'inline',
          },
        );
      } catch (error) {
        this.logger.warn(
          `Image blob read failed: filename=${filename}, prefix=${prefix}`,
        );
        throw new NotFoundException('Image not found');
      }
    }

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

  private async validate(bytes: Buffer) {
    try {
      const image = sharp(bytes, { limitInputPixels: 40000000 });
      const metadata = await image.metadata();
      if (
        !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error('Unsupported format');
      await image.stats();
      const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
      return {
        extension: extension as 'jpg' | 'png' | 'webp',
        contentType:
          metadata.format === 'jpeg'
            ? 'image/jpeg'
            : (`image/${metadata.format}` as 'image/png' | 'image/webp'),
      };
    } catch {
      throw new BadRequestException(
        'The file must be a valid, non-animated PNG, JPEG, or WebP image',
      );
    }
  }

  private isCloudStorage() {
    return process.env.STORAGE_MODE === 'cloud';
  }

  private containerNameForPrefix(prefix: string) {
    return prefix === '/banners/images'
      ? (process.env.BANNER_IMAGE_CONTAINER ?? DEFAULT_BANNER_CONTAINER)
      : (process.env.MEDIA_IMAGE_CONTAINER ?? DEFAULT_MEDIA_CONTAINER);
  }

  private container(containerName: string) {
    const existing = this.clients.get(containerName);
    if (existing) return existing;

    if (!process.env.STORAGE_ACCOUNT_URL) {
      throw new ConflictException(
        'STORAGE_ACCOUNT_URL is required in cloud storage mode',
      );
    }

    const client = new BlobServiceClient(
      process.env.STORAGE_ACCOUNT_URL,
      new DefaultAzureCredential(),
    ).getContainerClient(containerName);
    this.clients.set(containerName, client);
    return client;
  }

  private contentTypeFor(filename: string) {
    return filename.endsWith('.png')
      ? 'image/png'
      : filename.endsWith('.jpg')
        ? 'image/jpeg'
        : 'image/webp';
  }
}
