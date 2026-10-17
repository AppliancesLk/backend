import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

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
    includeInactive = false,
  ): Promise<Product[]> {
    if (includeInactive)
      return this.productsRepository.find({ relations: { category: true } });
    const visibleCategories = await this.categoriesService.findAll();
    const categoryIDs = visibleCategories
      .map((category) => category.categoryID)
      .filter((id) => !categoryId || id === categoryId);
    if (categoryIDs.length === 0) return [];
    return this.productsRepository.find({
      where: { isActive: true, category: { categoryID: In(categoryIDs) } },
      relations: { category: true },
    });
  }

  async findById(productID: string, includeInactive = false): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { productID },
      relations: {
        category: true,
      },
    });

    if (
      !product ||
      (!includeInactive &&
        (!product.isActive ||
          !(await this.categoriesService.findAll()).some(
            (category) => category.categoryID === product.category.categoryID,
          )))
    ) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const existingProduct = await this.productsRepository.findOne({
      where: {
        SKU: createProductDto.SKU,
      },
    });

    if (existingProduct) {
      throw new ConflictException('A product with this SKU already exists');
    }

    const category = await this.categoriesService.findById(
      createProductDto.categoryID,
    );

    const product = this.productsRepository.create({
      name: createProductDto.name,
      SKU: createProductDto.SKU,
      price: createProductDto.price,
      stockQty: createProductDto.stockQty ?? 0,
      images: createProductDto.images ?? [],
      specifications: createProductDto.specifications ?? null,
      isActive: createProductDto.isActive ?? true,
      category,
    });

    return this.productsRepository.save(product);
  }

  async updateStock(productID: string, stockQty: number): Promise<Product> {
    const product = await this.findById(productID, true);
    product.stockQty = stockQty;
    return this.productsRepository.save(product);
  }

  async update(
    productID: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findById(productID, true);

    if (
      updateProductDto.SKU !== undefined &&
      updateProductDto.SKU !== product.SKU
    ) {
      const productWithSameSKU = await this.productsRepository.findOne({
        where: {
          SKU: updateProductDto.SKU,
        },
      });

      if (productWithSameSKU) {
        throw new ConflictException('A product with this SKU already exists');
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
      product.specifications = updateProductDto.specifications;
    }

    if (updateProductDto.isActive !== undefined) {
      product.isActive = updateProductDto.isActive;
    }

    if (updateProductDto.categoryID !== undefined) {
      product.category = await this.categoriesService.findById(
        updateProductDto.categoryID,
      );
    }

    return this.productsRepository.save(product);
  }
}
