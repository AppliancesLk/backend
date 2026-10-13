import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CategoriesService } from '../../categories/services/categories.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { Product } from '../entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,

    private readonly categoriesService: CategoriesService,
  ) {}

async findAll(
  categoryId?: string,
): Promise<Product[]> {
  return this.productsRepository.find({
    where: categoryId
      ? {
          category: {
            categoryID: categoryId,
          },
        }
      : undefined,

    relations: {
      category: true,
    },
  });
}

  async findById(productID: string): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { productID },
      relations: {
        category: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async create(
    createProductDto: CreateProductDto,
  ): Promise<Product> {
    const existingProduct =
      await this.productsRepository.findOne({
        where: {
          SKU: createProductDto.SKU,
        },
      });

    if (existingProduct) {
      throw new ConflictException(
        'A product with this SKU already exists',
      );
    }

    const category = await this.categoriesService.findById(
      createProductDto.categoryID,
    );

    const product = this.productsRepository.create({
      name: createProductDto.name,
      SKU: createProductDto.SKU,
      price: createProductDto.price,
      images: createProductDto.images ?? [],
      specifications:
        createProductDto.specifications ?? null,
      isActive: createProductDto.isActive ?? true,
      category,
    });

    return this.productsRepository.save(product);
  }

  async update(
    productID: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findById(productID);

    if (
      updateProductDto.SKU !== undefined &&
      updateProductDto.SKU !== product.SKU
    ) {
      const productWithSameSKU =
        await this.productsRepository.findOne({
          where: {
            SKU: updateProductDto.SKU,
          },
        });

      if (productWithSameSKU) {
        throw new ConflictException(
          'A product with this SKU already exists',
        );
      }

      product.SKU = updateProductDto.SKU;
    }

    if (updateProductDto.name !== undefined) {
      product.name = updateProductDto.name;
    }

    if (updateProductDto.price !== undefined) {
      product.price = updateProductDto.price;
    }

    if (updateProductDto.images !== undefined) {
      product.images = updateProductDto.images;
    }

    if (updateProductDto.specifications !== undefined) {
      product.specifications =
        updateProductDto.specifications;
    }

    if (updateProductDto.isActive !== undefined) {
      product.isActive = updateProductDto.isActive;
    }

    if (updateProductDto.categoryID !== undefined) {
      product.category =
        await this.categoriesService.findById(
          updateProductDto.categoryID,
        );
    }

    return this.productsRepository.save(product);
  }
}