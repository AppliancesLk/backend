import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ProductsService } from '../../products/services/products.service';
import { ProductCatalogService } from '../../products/services/product-catalog.service';
import { ProductQueryDto } from '../../products/dto/product-query.dto';
import { Product } from '../../products/entities/product.entity';
import { AI_TOOL_NAMES } from '../types/ai.types';

@Injectable()
export class AiToolsService {
  private readonly logger = new Logger(AiToolsService.name);
  constructor(
    private readonly products: ProductsService,
    private readonly catalog: ProductCatalogService,
  ) {}

  async getProductDetails(productId: string) {
    const product = await this.products.findById(productId);
    return this.safeProduct(product);
  }

  private safeProduct(product: Product) {
    return {
      productId: product.productID,
      name: product.name,
      SKU: product.SKU,
      category: {
        id: product.category.categoryID,
        name: product.category.name,
      },
      brand: product.brand,
      description: product.description,
      subtitle: product.subtitle,
      currency: 'LKR',
      price: String(product.price),
      compareAtPrice:
        product.compareAtPrice === null ? null : String(product.compareAtPrice),
      stockQty: product.stockQty,
      available: product.stockQty > 0,
      specifications: product.specifications,
      features: product.features,
      boxContents: product.boxContents,
      warranty: product.warranty,
      ratingAverage: Number(product.ratingAverage),
      ratingCount: product.ratingCount,
    };
  }

  async execute(name: string, input: unknown) {
    this.logger.log({
      operation: 'ai.tool.requested',
      toolName: AI_TOOL_NAMES.find((tool) => tool === name) ?? 'unsupported',
    });
    try {
      const args = this.arguments(input);
      let result: unknown;
      switch (name) {
        case 'getProductDetails':
          this.keys(args, ['productId']);
          result = await this.getProductDetails(this.uuid(args.productId));
          break;
        case 'searchProducts':
          this.keys(args, [
            'q',
            'categoryId',
            'brand',
            'minPrice',
            'maxPrice',
            'inStock',
          ]);
          result = await this.search(args);
          break;
        case 'getRelatedProducts':
          this.keys(args, ['productId']);
          result = await this.related(this.uuid(args.productId));
          break;
        case 'compareProducts': {
          this.keys(args, ['productId', 'otherProductId']);
          const first = this.uuid(args.productId),
            second = this.uuid(args.otherProductId);
          if (first === second)
            throw new BadRequestException('Choose two different products');
          result = await Promise.all([
            this.getProductDetails(first),
            this.getProductDetails(second),
          ]);
          break;
        }
        default:
          throw new BadRequestException('Unsupported product assistant tool');
      }
      this.logger.log({
        operation: 'ai.tool.completed',
        toolName: name,
        resultCount: Array.isArray(result) ? result.length : 1,
      });
      return result;
    } catch (error) {
      this.logger.warn({
        operation: 'ai.tool.failed',
        toolName: AI_TOOL_NAMES.find((tool) => tool === name) ?? 'unsupported',
      });
      throw error;
    }
  }

  private arguments(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Invalid product tool arguments');
    return value as Record<string, unknown>;
  }
  private keys(args: Record<string, unknown>, allowed: string[]) {
    if (Object.keys(args).some((key) => !allowed.includes(key)))
      throw new BadRequestException('Invalid product tool arguments');
  }
  private uuid(value: unknown): string {
    if (typeof value !== 'string' || !isUUID(value))
      throw new BadRequestException('Invalid product tool identifier');
    return value;
  }
  private text(value: unknown, max: number): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.trim().length > max)
      throw new BadRequestException('Invalid product search');
    return value.trim() || undefined;
  }
  private price(value: unknown): number | undefined {
    if (value === undefined) return undefined;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 9999999999.99 ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.0001
    )
      throw new BadRequestException('Invalid search price');
    return value;
  }
  private async search(args: Record<string, unknown>) {
    const query = new ProductQueryDto();
    query.q = this.text(args.q, 120);
    query.categoryId =
      args.categoryId === undefined ? undefined : this.uuid(args.categoryId);
    const brand = this.text(args.brand, 80);
    query.brands = brand ? [brand] : undefined;
    query.minPrice = this.price(args.minPrice);
    query.maxPrice = this.price(args.maxPrice);
    if (args.inStock !== undefined && typeof args.inStock !== 'boolean')
      throw new BadRequestException('Invalid availability filter');
    query.inStock = args.inStock === true;
    query.limit = 5;
    query.sort = 'price-asc';
    const result = await this.catalog.find(query);
    return result.items.map((product) => this.safeProduct(product));
  }
  private async related(productId: string) {
    const rows = await this.products.findRelatedPublicProducts(productId);
    return rows.map((item) => this.safeProduct(item));
  }
}
