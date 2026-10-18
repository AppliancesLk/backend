import {
  ConflictException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  In,
  QueryFailedError,
  Repository,
  type DeepPartial,
} from 'typeorm';

import { CategoriesService } from '../../categories/services/categories.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { Product } from '../entities/product.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
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

  // Batch catalog reads avoid one query per cart item. Reuse the caller's
  // transaction for both product and category reads to avoid pool starvation.
  async findForCart(
    productIDs: string[],
    manager?: EntityManager,
  ): Promise<Map<string, { product: Product; isAvailable: boolean }>> {
    if (productIDs.length === 0) return new Map();
    const repository =
      manager?.getRepository(Product) ?? this.productsRepository;
    const products = await repository.find({
      where: { productID: In(productIDs) },
      relations: { category: true },
    });
    const visibleCategories = new Set(
      (await this.categoriesService.findAll(false, manager)).map(
        (category) => category.categoryID,
      ),
    );
    return new Map(
      products.map((product) => [
        product.productID,
        {
          product,
          isAvailable:
            product.isActive &&
            visibleCategories.has(product.category.categoryID),
        },
      ]),
    );
  }

  async create(createProductDto: CreateProductDto): Promise<Product> {
    this.validateComparePrice(
      createProductDto.price,
      createProductDto.compareAtPrice,
    );
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
      brand: createProductDto.brand ?? null,
      subtitle: createProductDto.subtitle ?? '',
      badge: createProductDto.badge ?? null,
      compareAtPrice: createProductDto.compareAtPrice ?? null,
      SKU: createProductDto.SKU,
      price: createProductDto.price,
      stockQty: createProductDto.stockQty ?? 0,
      images: createProductDto.images ?? [],
      specifications: createProductDto.specifications ?? null,
      isActive: createProductDto.isActive ?? true,
      category,
    });

    return this.persistProduct(product, 'create');
  }

  async updateStock(productID: string, stockQty: number): Promise<Product> {
    const product = await this.findById(productID, true);
    product.stockQty = stockQty;
    return this.productsRepository.save(product);
  }

  async update(productID: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findById(productID, true);
    if (dto.price !== undefined || dto.compareAtPrice !== undefined)
      this.validateComparePrice(
        dto.price ?? Number(product.price),
        dto.compareAtPrice !== undefined
          ? dto.compareAtPrice
          : product.compareAtPrice,
      );
    if (dto.SKU !== undefined && dto.SKU !== product.SKU) {
      const duplicate = await this.productsRepository.findOne({
        where: { SKU: dto.SKU },
      });
      if (duplicate)
        throw new ConflictException('A product with this SKU already exists');
    }

    const { categoryID, ...fields } = dto;
    // Save only supplied columns so a detail edit cannot write stale stock or
    // overwrite an unrelated field changed by another admin.
    const changes: DeepPartial<Product> = { productID, ...fields };
    if (categoryID !== undefined) {
      const category = await this.categoriesService.findById(categoryID);
      changes.category = { categoryID: category.categoryID };
    }
    if (!Object.values(dto).some((value) => value !== undefined))
      return product;
    await this.persistProduct(changes, 'update');
    return this.findById(productID, true);
  }

  private validateComparePrice(price: number, compareAtPrice?: number | null) {
    if (compareAtPrice != null && Number(compareAtPrice) <= price)
      throw new BadRequestException(
        'Original price must be greater than selling price',
      );
  }

  private async persistProduct(
    changes: DeepPartial<Product>,
    operation: 'create' | 'update',
  ): Promise<Product> {
    try {
      const saved = await this.productsRepository.save(changes);
      this.logger.log({
        operation: `products.${operation}`,
        productId: saved.productID,
        outcome: 'success',
      });
      return saved;
    } catch (error: unknown) {
      if (error instanceof QueryFailedError) {
        const driverError = error.driverError as {
          code?: string;
          constraint?: string;
        };
        if (
          driverError.code === '23514' &&
          driverError.constraint === 'CHK_product_compare_price'
        )
          throw new BadRequestException(
            'Original price must be greater than selling price',
          );
        // The existing products migration names the SKU uniqueness constraint.
        if (
          driverError.code === '23505' &&
          driverError.constraint === 'UQ_d750d40dee7a63a316039f246be'
        ) {
          this.logger.warn({
            operation: `products.${operation}`,
            productId: changes.productID,
            outcome: 'duplicate_sku',
          });
          throw new ConflictException('A product with this SKU already exists');
        }
      }
      this.logger.error({
        operation: `products.${operation}`,
        productId: changes.productID,
        outcome: 'persistence_failed',
      });
      throw error;
    }
  }
}
