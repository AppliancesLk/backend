import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import sharp from 'sharp';
import { ProductImageStorageService } from './product-image-storage.service';

describe('ProductImageStorageService', () => {
  const productID = 'a0dc4924-bce1-4043-a7de-7515f14646d2';
  const imageID = 'b0dc4924-bce1-4043-a7de-7515f14646d2';
  const imageRepository = {
    create: jest.fn((value: object) => value),
    findOne: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const productRepository = { findOne: jest.fn() };
  const categories = { findAll: jest.fn() };
  const service = new ProductImageStorageService(
    imageRepository as never,
    productRepository as never,
    categories as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.STORAGE_MODE;
  });

  it('rejects unsupported declared MIME types before storage access', async () => {
    await expect(service.upload(productID, { buffer: Buffer.from('svg'), mimetype: 'image/svg+xml', size: 3 })).rejects.toThrow(BadRequestException);
  });

  it('rejects files above the configured maximum before buffering work', async () => {
    await expect(service.upload(productID, { buffer: Buffer.alloc(10), mimetype: 'image/png', size: 5 * 1024 * 1024 + 1 })).rejects.toThrow(BadRequestException);
  });

  it('does not allow public reads for hidden products', async () => {
    productRepository.findOne.mockResolvedValue({ productID, isActive: false, category: { categoryID: 'category' } });
    await expect(service.read(productID, imageID)).rejects.toThrow(NotFoundException);
  });

  it('attempts blob cleanup when the product image database write fails', async () => {
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
    const blob = { uploadData: jest.fn(), deleteIfExists: jest.fn() };
    (service as unknown as { client: object }).client = { getBlockBlobClient: () => blob };
    productRepository.findOne.mockResolvedValue({ productID, images: [] });
    imageRepository.manager.transaction.mockRejectedValue(new Error('db unavailable'));
    await expect(service.upload(productID, { buffer: png, mimetype: 'image/png', size: png.length })).rejects.toThrow(ServiceUnavailableException);
    expect(blob.uploadData).toHaveBeenCalled();
    expect(blob.deleteIfExists).toHaveBeenCalled();
  });
});
