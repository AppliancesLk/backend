import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { CategoriesService } from '../../categories/services/categories.service';
import { Product } from '../entities/product.entity';
import { ProductQueryDto } from '../dto/product-query.dto';

@Injectable()
export class ProductCatalogService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly categories: CategoriesService,
  ) {}

  async find(query: ProductQueryDto) {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    )
      throw new BadRequestException(
        'Minimum price must not exceed maximum price',
      );
    const categories = await this.categories.findAll();
    const children = new Map<string, string[]>();
    for (const category of categories)
      if (category.parent)
        children.set(category.parent.categoryID, [
          ...(children.get(category.parent.categoryID) ?? []),
          category.categoryID,
        ]);
    const descendants = (id: string): string[] => {
      const found = new Set<string>();
      const pending = [id];
      while (pending.length) {
        const current = pending.pop()!;
        if (found.has(current)) continue;
        found.add(current);
        pending.push(...(children.get(current) ?? []));
      }
      return [...found];
    };
    const visibleIds = categories.map((category) => category.categoryID);
    const selectedIds = query.categoryId
      ? descendants(query.categoryId).filter((id) => visibleIds.includes(id))
      : visibleIds;
    const base = this.products
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.category', 'category')
      .where('product.isActive = :active', { active: true });
    if (visibleIds.length)
      base.andWhere('category.categoryID IN (:...visibleIds)', { visibleIds });
    else base.andWhere('1 = 0');
    if (query.q) {
      const search = `%${query.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      base.andWhere(
        '(product.name ILIKE :search OR product.SKU ILIKE :search OR product.brand ILIKE :search OR category.name ILIKE :search)',
        { search },
      );
    }
    if (query.minPrice !== undefined)
      base.andWhere('product.price >= :minPrice', { minPrice: query.minPrice });
    if (query.maxPrice !== undefined)
      base.andWhere('product.price <= :maxPrice', { maxPrice: query.maxPrice });
    const withCategory = (builder: SelectQueryBuilder<Product>) => {
      if (selectedIds.length)
        builder.andWhere('category.categoryID IN (:...selectedIds)', {
          selectedIds,
        });
      else builder.andWhere('1 = 0');
      return builder;
    };
    const withBrands = (builder: SelectQueryBuilder<Product>) => {
      if (query.brands?.length)
        builder.andWhere('LOWER(product.brand) IN (:...brands)', {
          brands: query.brands.map((brand) => brand.toLowerCase()),
        });
      return builder;
    };
    const filtered = withBrands(withCategory(base.clone()));
    const total = await filtered.getCount();
    const totalPages = Math.ceil(total / query.limit);
    const page = Math.min(query.page, Math.max(1, totalPages));
    const sort = query.sort;
    if (sort === 'price-asc' || sort === 'price-desc')
      filtered.orderBy('product.price', sort === 'price-asc' ? 'ASC' : 'DESC');
    else if (sort === 'newest')
      filtered.orderBy('product.createdAt', 'DESC', 'NULLS LAST');
    else filtered.orderBy('product.name', 'ASC');
    filtered.addOrderBy('product.productID', 'ASC');
    const [items, categoryRows, brandRows, priceBounds] = await Promise.all([
      filtered
        .skip((page - 1) * query.limit)
        .take(query.limit)
        .getMany(),
      withBrands(base.clone())
        .select('category.categoryID', 'id')
        .addSelect('COUNT(*)', 'count')
        .groupBy('category.categoryID')
        .getRawMany<{ id: string; count: string }>(),
      withCategory(base.clone())
        .andWhere('product.brand IS NOT NULL')
        .select('MIN(product.brand)', 'name')
        .addSelect('COUNT(*)', 'count')
        .groupBy('LOWER(product.brand)')
        .orderBy('MIN(product.brand)', 'ASC')
        .getRawMany<{ name: string; count: string }>(),
      this.products
        .createQueryBuilder('product')
        .select('MIN(product.price)', 'min')
        .addSelect('MAX(product.price)', 'max')
        .where('product.isActive = true')
        .andWhere(
          visibleIds.length
            ? 'product.categoryID IN (:...visibleIds)'
            : '1 = 0',
          { visibleIds },
        )
        .getRawOne<{ min: string | null; max: string | null }>(),
    ]);
    const counts = new Map(
      categoryRows.map((row) => [row.id, Number(row.count)]),
    );
    return {
      items,
      total,
      page,
      limit: query.limit,
      totalPages,
      facets: {
        categories: categories
          .map((category) => ({
            categoryID: category.categoryID,
            name: category.name,
            parentId: category.parent?.categoryID ?? null,
            count: descendants(category.categoryID).reduce(
              (sum, id) => sum + (counts.get(id) ?? 0),
              0,
            ),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        brands: brandRows.map((row) => ({
          name: row.name,
          count: Number(row.count),
        })),
        allCount: categoryRows.reduce((sum, row) => sum + Number(row.count), 0),
        price: { min: priceBounds?.min ?? '0', max: priceBounds?.max ?? '0' },
      },
    };
  }
}
