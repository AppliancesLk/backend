/**
 * ProductImageStorageService Unit Tests
 *
 * Test Case IDs: TC-IMG-U-001 through TC-IMG-U-020
 *
 * These tests verify image storage operations including:
 * - Image upload with validation
 * - Image removal from blob storage and database
 * - Image reading with access control
 * - MIME type validation
 * - Size limits
 * - Azure Blob Storage integration (mocked)
 */

import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { ProductImageStorageService } from './product-image-storage.service';

describe('ProductImageStorageService', () => {
  const productID = 'a0dc4924-bce1-4043-a7de-7515f14646d2';
  const imageID = 'b0dc4924-bce1-4043-a7de-7515f14646d2';
  const blobName = `${imageID}.jpg`;
  const imageRepository = {
    create: jest.fn((value: object) => value),
    findOne: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const productRepository = { findOne: jest.fn() };
  const categories = { findAll: jest.fn() };
  let service: ProductImageStorageService;
  let blob: { uploadData: jest.Mock; deleteIfExists: jest.Mock; download: jest.Mock };

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.STORAGE_MODE;
    service = new ProductImageStorageService(
      imageRepository as never,
      productRepository as never,
      categories as never,
    );
    blob = { uploadData: jest.fn(), deleteIfExists: jest.fn(), download: jest.fn() };
    (service as unknown as { client: object }).client = { getBlockBlobClient: () => blob };
    categories.findAll.mockResolvedValue([{ categoryID: 'category' }]);
  });

  describe('upload', () => {
    // TC-IMG-U-001
    it('should reject upload without file', async () => {
      await expect(service.upload(productID)).rejects.toThrow(BadRequestException);
      await expect(service.upload(productID)).rejects.toThrow('Choose a JPEG');
    });

    // TC-IMG-U-002
    it('should reject upload with empty buffer', async () => {
      await expect(
        service.upload(productID, { buffer: Buffer.alloc(0), mimetype: 'image/jpeg' }),
      ).rejects.toThrow(BadRequestException);
    });

    // TC-IMG-U-003
    it('should reject files above the configured maximum before buffering work', async () => {
      await expect(
        service.upload(productID, {
          buffer: Buffer.alloc(10),
          mimetype: 'image/png',
          size: 5 * 1024 * 1024 + 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // TC-IMG-U-004
    it('should reject unsupported declared MIME types before storage access', async () => {
      await expect(
        service.upload(productID, {
          buffer: Buffer.from('svg'),
          mimetype: 'image/svg+xml',
          size: 3,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.upload(productID, {
          buffer: Buffer.from('gif'),
          mimetype: 'image/gif',
          size: 3,
        }),
      ).rejects.toThrow('Only JPEG, PNG, and WebP');
    });

    // TC-IMG-U-005
    it('should reject when declared MIME type does not match detected format', async () => {
      const png = await sharp({
        create: { width: 1, height: 1, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer();

      await expect(
        service.upload(productID, {
          buffer: png,
          mimetype: 'image/jpeg', // PNG declared as JPEG
          size: png.length,
        }),
      ).rejects.toThrow('does not match');
    });

    // TC-IMG-U-006
    it('should upload valid PNG image successfully', async () => {
      const png = await sharp({
        create: { width: 1, height: 1, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer();

      imageRepository.manager.transaction.mockImplementation(async (callback) => {
        const manager = {
          getRepository: () => ({
            findOne: jest.fn().mockResolvedValue({ productID, images: [] }),
            save: jest.fn().mockResolvedValue({ imageID, productID, blobName }),
          }),
        };
        return callback(manager);
      });

      const result = await service.upload(productID, {
        buffer: png,
        mimetype: 'image/png',
        size: png.length,
      });

      expect(result).toHaveProperty('imageID');
      expect(result).toHaveProperty('imageUrl');
      expect(blob.uploadData).toHaveBeenCalled();
    });

    // TC-IMG-U-007
    it('should throw NotFoundException when product not found during upload', async () => {
      const png = await sharp({
        create: { width: 1, height: 1, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer();

      imageRepository.manager.transaction.mockImplementation(async (callback) => {
        const manager = {
          getRepository: () => ({
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
          }),
        };
        return callback(manager);
      });

      await expect(
        service.upload(productID, {
          buffer: png,
          mimetype: 'image/png',
          size: png.length,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    // TC-IMG-U-008
    it('should attempt blob cleanup when the product image database write fails', async () => {
      const png = await sharp({
        create: { width: 1, height: 1, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer();

      productRepository.findOne.mockResolvedValue({ productID, images: [] });
      imageRepository.manager.transaction.mockRejectedValue(new Error('db unavailable'));

      await expect(
        service.upload(productID, { buffer: png, mimetype: 'image/png', size: png.length }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(blob.uploadData).toHaveBeenCalled();
      expect(blob.deleteIfExists).toHaveBeenCalled();
    });

    // TC-IMG-U-009
    it('should reject invalid image data that cannot be decoded', async () => {
      await expect(
        service.upload(productID, {
          buffer: Buffer.from('not an image'),
          mimetype: 'image/jpeg',
          size: 12,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.upload(productID, {
          buffer: Buffer.from('not an image'),
          mimetype: 'image/jpeg',
          size: 12,
        }),
      ).rejects.toThrow('valid, non-animated');
    });
  });

  describe('remove', () => {
    // TC-IMG-U-010
    it('should throw NotFoundException when image record not found', async () => {
      imageRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(productID, imageID)).rejects.toThrow(NotFoundException);
      await expect(service.remove(productID, imageID)).rejects.toThrow('image not found');
    });

    // TC-IMG-U-011
    it('should delete blob and database record successfully', async () => {
      imageRepository.findOne.mockResolvedValue({
        imageID,
        productID,
        blobName,
      });
      imageRepository.manager.transaction.mockImplementation(async (callback) => {
        const manager = {
          getRepository: () => ({
            findOne: jest.fn().mockResolvedValue({ productID, images: [`/products/${productID}/images/${imageID}`] }),
            save: jest.fn().mockResolvedValue({}),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
          }),
        };
        return callback(manager);
      });

      const result = await service.remove(productID, imageID);

      expect(result).toEqual({ imageID });
      expect(blob.deleteIfExists).toHaveBeenCalled();
    });

    // TC-IMG-U-012
    it('should throw InternalServerErrorException when blob deletion fails', async () => {
      imageRepository.findOne.mockResolvedValue({
        imageID,
        productID,
        blobName,
      });
      blob.deleteIfExists.mockRejectedValue(new Error('Blob storage error'));

      await expect(service.remove(productID, imageID)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.remove(productID, imageID)).rejects.toThrow(
        'could not be deleted',
      );
    });

    // TC-IMG-U-013
    it('should throw NotFoundException when product not found during removal', async () => {
      imageRepository.findOne.mockResolvedValue({
        imageID,
        productID,
        blobName,
      });
      imageRepository.manager.transaction.mockImplementation(async (callback) => {
        const manager = {
          getRepository: () => ({
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
            delete: jest.fn(),
          }),
        };
        return callback(manager);
      });

      await expect(service.remove(productID, imageID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('read', () => {
    // TC-IMG-U-014
    it('should throw NotFoundException when product not found', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.read(productID, imageID)).rejects.toThrow(NotFoundException);
    });

    // TC-IMG-U-015
    it('should not allow public reads for hidden products', async () => {
      productRepository.findOne.mockResolvedValue({
        productID,
        isActive: false,
        category: { categoryID: 'category' },
      });

      await expect(service.read(productID, imageID)).rejects.toThrow(NotFoundException);
    });

    // TC-IMG-U-016
    it('should throw NotFoundException when product category is not visible', async () => {
      productRepository.findOne.mockResolvedValue({
        productID,
        isActive: true,
        category: { categoryID: 'hidden-category' },
      });
      categories.findAll.mockResolvedValue([]); // No visible categories

      await expect(service.read(productID, imageID)).rejects.toThrow(NotFoundException);
    });

    // TC-IMG-U-017
    it('should throw NotFoundException when image record not found', async () => {
      productRepository.findOne.mockResolvedValue({
        productID,
        isActive: true,
        category: { categoryID: 'category' },
      });
      imageRepository.findOne.mockResolvedValue(null);

      await expect(service.read(productID, imageID)).rejects.toThrow(NotFoundException);
    });

    // TC-IMG-U-018
    it('should return streamable file for valid image', async () => {
      productRepository.findOne.mockResolvedValue({
        productID,
        isActive: true,
        category: { categoryID: 'category' },
      });
      imageRepository.findOne.mockResolvedValue({
        imageID,
        productID,
        blobName,
        contentType: 'image/jpeg',
      });
      blob.download.mockResolvedValue({
        readableStreamBody: { pipe: jest.fn() },
      });

      const result = await service.read(productID, imageID);

      expect(result).toBeDefined();
      expect(blob.download).toHaveBeenCalled();
    });

    // TC-IMG-U-019
    it('should throw NotFoundException when blob download fails', async () => {
      productRepository.findOne.mockResolvedValue({
        productID,
        isActive: true,
        category: { categoryID: 'category' },
      });
      imageRepository.findOne.mockResolvedValue({
        imageID,
        productID,
        blobName,
        contentType: 'image/jpeg',
      });
      blob.download.mockRejectedValue(new Error('Blob not found'));

      await expect(service.read(productID, imageID)).rejects.toThrow(NotFoundException);
    });

    // TC-IMG-U-020
    it('should throw NotFoundException when blob stream is missing', async () => {
      productRepository.findOne.mockResolvedValue({
        productID,
        isActive: true,
        category: { categoryID: 'category' },
      });
      imageRepository.findOne.mockResolvedValue({
        imageID,
        productID,
        blobName,
        contentType: 'image/jpeg',
      });
      blob.download.mockResolvedValue({ readableStreamBody: null });

      await expect(service.read(productID, imageID)).rejects.toThrow(NotFoundException);
    });
  });
});
