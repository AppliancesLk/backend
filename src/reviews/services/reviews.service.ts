import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ProductsService } from '../../products/services/products.service';
import { OrdersService } from '../../orders/services/orders.service';
import { ProductReview } from '../entities/product-review.entity';
import { SaveReviewDto } from '../dto/review.dto';
import { UserRole } from '../../users/enums/user-role.enum';
const reviewSelect = {
  id: true,
  rating: true,
  title: true,
  body: true,
  verifiedPurchase: true,
  createdAt: true,
  updatedAt: true,
  customer: { id: true, username: true },
} as const;
@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);
  constructor(
    @InjectRepository(ProductReview)
    private readonly reviews: Repository<ProductReview>,
    private readonly products: ProductsService,
    private readonly orders: OrdersService,
    private readonly db: DataSource,
  ) {}
  private response(review: ProductReview) {
    return {
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      author: review.customer?.username ?? 'Customer',
      verifiedPurchase: review.verifiedPurchase,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
  async list(productId: string, requestedPage: number, admin = false) {
    const product = await this.products.findById(productId, admin);
    const total = await this.reviews.countBy({ productId });
    const totalPages = Math.ceil(total / 5);
    const page = Math.min(requestedPage, Math.max(1, totalPages));
    const [items, distribution] = await Promise.all([
      this.reviews.find({
        where: { productId },
        relations: { customer: true },
        select: reviewSelect,
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * 5,
        take: 5,
      }),
      this.reviews
        .createQueryBuilder('review')
        .select('review.rating', 'rating')
        .addSelect('COUNT(*)', 'count')
        .where('review.productId = :productId', { productId })
        .groupBy('review.rating')
        .getRawMany<{ rating: number; count: string }>(),
    ]);
    return {
      items: items.map((item) => this.response(item)),
      total,
      page,
      totalPages,
      summary: {
        average: Number(product.ratingAverage),
        count: product.ratingCount,
        distribution: [5, 4, 3, 2, 1].map((rating) => ({
          rating,
          count: Number(
            distribution.find((item) => Number(item.rating) === rating)
              ?.count ?? 0,
          ),
        })),
      },
    };
  }
  async mine(productId: string, customerId: string) {
    await this.products.findById(productId);
    const review = await this.reviews.findOne({
      where: { productId, customerId },
      relations: { customer: true },
      select: reviewSelect,
    });
    return review ? this.response(review) : null;
  }
  async save(
    productId: string,
    customerId: string,
    dto: SaveReviewDto,
    editing: boolean,
  ) {
    try {
      const verified = await this.orders.hasDeliveredPurchase(
        customerId,
        productId,
      );
      const id = await this.db.transaction(async (manager) => {
        await this.products.lockForReview(productId, manager);
        const repository = manager.getRepository(ProductReview);
        const existing = await repository.findOneBy({ productId, customerId });
        if (existing && !editing)
          throw new ConflictException(
            'You have already reviewed this product. Edit your existing review.',
          );
        if (!existing && editing)
          throw new NotFoundException('Review not found');
        const review = repository.create({
          id: existing?.id,
          productId,
          customerId,
          rating: dto.rating,
          title: dto.title,
          body: dto.body,
          verifiedPurchase: verified,
        });
        const saved = await repository.save(review);
        await this.refresh(productId, manager);
        return saved.id;
      });
      this.logger.log(
        `Review saved: reviewId=${id}, productId=${productId}, actorId=${customerId}`,
      );
      return this.mine(productId, customerId);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException('You have already reviewed this product');
      this.logger.warn(
        `Review save failed: productId=${productId}, actorId=${customerId}`,
      );
      throw error;
    }
  }
  async remove(
    productId: string,
    reviewId: string,
    actorId: string,
    role: string,
  ) {
    await this.db
      .transaction(async (manager) => {
        await this.products.lockForReview(productId, manager, true);
        const repo = manager.getRepository(ProductReview);
        const review = await repo.findOneBy({ id: reviewId, productId });
        if (!review) throw new NotFoundException('Review not found');
        if (role !== UserRole.ADMIN && review.customerId !== actorId)
          throw new ForbiddenException('You can only delete your own reviews');
        await repo.delete({ id: reviewId });
        await this.refresh(productId, manager);
      })
      .catch((error) => {
        this.logger.warn(
          `Review removal failed: reviewId=${reviewId}, productId=${productId}, actorId=${actorId}`,
        );
        throw error;
      });
    this.logger.log(
      `Review removed: reviewId=${reviewId}, productId=${productId}, actorId=${actorId}`,
    );
    return { deleted: true };
  }
  private async refresh(productId: string, manager: EntityManager) {
    const stats = await manager
      .getRepository(ProductReview)
      .createQueryBuilder('review')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(ROUND(AVG(review.rating),2),0)', 'average')
      .where('review.productId = :productId', { productId })
      .getRawOne<{ count: string; average: string }>();
    await this.products.setReviewSummary(
      productId,
      Number(stats?.average ?? 0),
      Number(stats?.count ?? 0),
      manager,
    );
  }
}
