import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BlobServiceClient,
  ContainerClient,
} from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { Product } from '../../products/entities/product.entity';
import { ProductImage } from '../../products/entities/product-image.entity';
import { CategoriesService } from '../../categories/services/categories.service';

const MAX_IMAGE_BYTES = Number(process.env.PRODUCT_IMAGE_MAX_BYTES ?? 5 * 1024 * 1024);
const CONTAINER_NAME = process.env.PRODUCT_IMAGE_CONTAINER ?? 'product-images';
const API_IMAGE_PREFIX = '/products';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
type StoredType = 'image/jpeg' | 'image/png' | 'image/webp';

@Injectable()
export class ProductImageStorageService {
  private readonly logger = new Logger(ProductImageStorageService.name);
  private client?: ContainerClient;

  constructor(
    @InjectRepository(ProductImage)
    private readonly images: Repository<ProductImage>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    private readonly categories: CategoriesService,
  ) {}

  async upload(productID: string, file?: { buffer: Buffer; mimetype?: string; size?: number }) {
    if (!file?.buffer?.length || (file.size ?? file.buffer.length) > MAX_IMAGE_BYTES)
      throw new BadRequestException(`Choose a JPEG, PNG, or WebP image up to ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MiB`);
    if (!ALLOWED_TYPES.has(file.mimetype ?? ''))
      throw new BadRequestException('Only JPEG, PNG, and WebP images are supported');

    const detected = await this.detect(file.buffer);
    if (detected.contentType !== file.mimetype)
      throw new BadRequestException('The declared image type does not match the file contents');

    const blobName = `${randomUUID()}.${detected.extension}`;
    const blob = this.container().getBlockBlobClient(blobName);
    try {
      await blob.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: detected.contentType },
      });
      const record = this.images.create({
        productID,
        blobName,
        contentType: detected.contentType,
        sizeBytes: file.buffer.length,
      });
      const saved = await this.images.manager.transaction(async (manager) => {
        const product = await manager.getRepository(Product).findOne({ where: { productID } });
        if (!product) throw new NotFoundException('Product not found');
        const image = await manager.getRepository(ProductImage).save(record);
        product.images = [...(product.images ?? []), this.url(productID, image.imageID)];
        await manager.getRepository(Product).save(product);
        return image;
      });
      return { imageID: saved.imageID, imageUrl: this.url(productID, saved.imageID) };
    } catch (error: unknown) {
      try { await blob.deleteIfExists(); } catch { this.logger.error(`Orphaned product image cleanup failed: productId=${productID}`); }
      if (error instanceof NotFoundException) throw error;
      if (error instanceof ConflictException) throw error;
      this.logger.error(`Product image upload failed: productId=${productID}`);
      throw new ServiceUnavailableException(
        'Image storage is unavailable. Start Azurite and try again.',
      );
    }
  }

  async remove(productID: string, imageID: string) {
    const image = await this.images.findOne({ where: { imageID, productID } });
    if (!image) throw new NotFoundException('Product image not found');
    try {
      await this.container().getBlockBlobClient(image.blobName).deleteIfExists();
    } catch {
      this.logger.error(`Product image blob deletion failed: productId=${productID}, imageId=${imageID}`);
      throw new InternalServerErrorException('The image could not be deleted from storage');
    }
    try {
      await this.images.manager.transaction(async (manager) => {
        const product = await manager.getRepository(Product).findOne({ where: { productID } });
        if (!product) throw new NotFoundException('Product not found');
        product.images = (product.images ?? []).filter((url) => url !== this.url(productID, imageID));
        await manager.getRepository(Product).save(product);
        await manager.getRepository(ProductImage).delete({ imageID, productID });
      });
    } catch (error: unknown) {
      this.logger.error(`Product image database deletion failed after blob deletion: productId=${productID}, imageId=${imageID}`);
      throw error;
    }
    return { imageID };
  }

  async read(productID: string, imageID: string) {
    const product = await this.products.findOne({ where: { productID }, relations: { category: true } });
    if (!product || !product.isActive || !(await this.categories.findAll()).some((c) => c.categoryID === product.category.categoryID))
      throw new NotFoundException('Image not found');
    const image = await this.images.findOne({ where: { imageID, productID } });
    if (!image) throw new NotFoundException('Image not found');
    try {
      const response = await this.container().getBlockBlobClient(image.blobName).download();
      if (!response.readableStreamBody) throw new Error('Missing blob stream');
      return new StreamableFile(response.readableStreamBody as unknown as Readable, {
        type: image.contentType,
        disposition: 'inline',
      });
    } catch {
      throw new NotFoundException('Image not found');
    }
  }

  private async detect(buffer: Buffer): Promise<{ contentType: StoredType; extension: 'jpg' | 'png' | 'webp' }> {
    try {
      const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
      await sharp(buffer, { limitInputPixels: 40_000_000 }).stats();
      if (metadata.pages && metadata.pages > 1) throw new Error('Animated images are not supported');
      if (metadata.format === 'jpeg') return { contentType: 'image/jpeg', extension: 'jpg' };
      if (metadata.format === 'png') return { contentType: 'image/png', extension: 'png' };
      if (metadata.format === 'webp') return { contentType: 'image/webp', extension: 'webp' };
    } catch { /* mapped below */ }
    throw new BadRequestException('The file must be a valid, non-animated JPEG, PNG, or WebP image');
  }

  private container(): ContainerClient {
    if (this.client) return this.client;
    const mode = process.env.STORAGE_MODE;
    if (mode === 'local') {
      if (!process.env.STORAGE_CONNECTION_STRING) throw new ConflictException('STORAGE_CONNECTION_STRING is required in local storage mode');
      this.client = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION_STRING).getContainerClient(CONTAINER_NAME);
    } else if (mode === 'cloud') {
      if (!process.env.STORAGE_ACCOUNT_URL) throw new ConflictException('STORAGE_ACCOUNT_URL is required in cloud storage mode');
      this.client = new BlobServiceClient(process.env.STORAGE_ACCOUNT_URL, new DefaultAzureCredential()).getContainerClient(CONTAINER_NAME);
    } else throw new ConflictException('STORAGE_MODE must be explicitly set to local or cloud');
    return this.client;
  }

  private url(productID: string, imageID: string) { return `${API_IMAGE_PREFIX}/${productID}/images/${imageID}`; }
}
