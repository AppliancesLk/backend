import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';
import {
  accountLink,
  safeEmailLink,
} from '../../notification/email/templates/email-layout';
import { promotionTemplate } from '../../notification/email/templates/promotion.template';
import {
  EMAIL_BRAND_CID,
  EMAIL_BRAND_PNG,
} from '../../notification/email/email-brand';
import {
  Promotion,
  PromotionRecipient,
  PromotionRun,
} from '../entities/promotion.entity';
import {
  PromotionAudience,
  type PromotionContent,
  type PromotionSnapshot,
} from '../types/promotion.types';
import {
  PromotionContentDto,
  PromotionListDto,
  SendPromotionDto,
  UpdatePromotionDto,
} from '../dto/promotion.dto';
import { promotionQueueKey } from '../promotion-queue';

export function promotionEmail(
  snapshot: PromotionSnapshot,
  name = 'Valued customer',
) {
  return promotionTemplate(name, {
    subject: snapshot.subject || 'Your promotion subject',
    title: snapshot.headline || 'Your next great find',
    description:
      snapshot.body || 'Write your promotion message to see it here.',
    preheader: snapshot.preheader,
    products: snapshot.products,
    buttonText: snapshot.buttonText || 'Explore products',
    link: snapshot.buttonUrl || accountLink('/products'),
    footerNote: snapshot.footerNote,
  });
}
export function promotionPreview(snapshot: PromotionSnapshot) {
  const email = promotionEmail(snapshot);
  return {
    subject: email.subject,
    text: email.text,
    html: email.html
      .replaceAll(
        `src="cid:${EMAIL_BRAND_CID}"`,
        `src="data:image/png;base64,${EMAIL_BRAND_PNG}"`,
      )
      .replace('</head>', '<style>a{pointer-events:none}</style></head>')
      .replaceAll('<a href=', '<a tabindex="-1" href='),
  };
}

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);
  constructor(private readonly db: DataSource) {}
  private validate(content: PromotionContent) {
    if (content.buttonUrl && !safeEmailLink(content.buttonUrl))
      throw new BadRequestException('Use a complete http or https button URL');
  }
  private eligible(manager: EntityManager, content: PromotionContent) {
    const query = manager
      .getRepository(User)
      .createQueryBuilder('user')
      .select(['user.id', 'user.username', 'user.email'])
      .where(
        'user.isActive = true AND user.emailVerifiedAt IS NOT NULL AND user.deactivatedAt IS NULL',
      );
    if (content.audience === PromotionAudience.SELECTED)
      query.andWhere('user.id IN (:...ids)', {
        ids: content.userIds.length
          ? content.userIds
          : ['00000000-0000-0000-0000-000000000000'],
      });
    return query;
  }
  private async snapshot(
    manager: EntityManager,
    content: PromotionContent,
  ): Promise<PromotionSnapshot> {
    this.validate(content);
    const products = content.productIds.length
      ? await manager.findBy(Product, {
          productID: In(content.productIds),
          isActive: true,
        })
      : [];
    if (products.length !== content.productIds.length)
      throw new BadRequestException(
        'A selected product is no longer available. Remove it before continuing',
      );
    return {
      ...content,
      products: content.productIds.map((id) => {
        const product = products.find((item) => item.productID === id)!;
        return {
          id,
          name: product.name,
          SKU: product.SKU,
          price: String(product.price),
          images: product.images,
          link: accountLink(`/products/${id}`),
        };
      }),
    };
  }
  async preview(content: PromotionContentDto) {
    const [snapshot, recipientCount] = await Promise.all([
      this.snapshot(this.db.manager, content),
      this.eligible(this.db.manager, content).getCount(),
    ]);
    return {
      ...promotionPreview(snapshot),
      recipientCount,
      excludedCount:
        content.audience === PromotionAudience.SELECTED
          ? content.userIds.length - recipientCount
          : 0,
      products: snapshot.products,
    };
  }
  async list(query: PromotionListDto) {
    const builder = this.db
      .getRepository(Promotion)
      .createQueryBuilder('promotion');
    if (query.search.trim())
      builder.where("promotion.content->>'subject' ILIKE :search", {
        search: `%${query.search.trim()}%`,
      });
    const [items, total] = await builder
      .orderBy('promotion.updatedAt', 'DESC')
      .addOrderBy('promotion.id', 'DESC')
      .skip((query.page - 1) * 10)
      .take(10)
      .getManyAndCount();
    return {
      items: await Promise.all(
        items.map(async (item) => {
          const latest = await this.db.manager.findOne(PromotionRun, {
            where: { campaignId: item.id },
            order: { createdAt: 'DESC', id: 'DESC' },
          });
          return {
            id: item.id,
            subject: item.content.subject,
            headline: item.content.headline,
            audience: item.content.audience,
            productCount: item.content.productIds.length,
            version: item.version,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            latestRun: latest ? await this.runSummary(latest) : null,
          };
        }),
      ),
      total,
      page: query.page,
      limit: 10,
    };
  }
  async detail(id: string) {
    const item = await this.db.manager.findOneBy(Promotion, { id });
    if (!item) throw new NotFoundException('Promotion not found');
    const selectedUsers = item.content.userIds.length
      ? await this.db.manager.find(User, {
          where: { id: In(item.content.userIds) },
          select: {
            id: true,
            username: true,
            email: true,
            isActive: true,
            emailVerifiedAt: true,
            deactivatedAt: true,
          },
        })
      : [];
    const runs = await this.db.manager.find(PromotionRun, {
      where: { campaignId: id },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 20,
    });
    const selectedProducts = item.content.productIds.length
      ? await this.db.manager.find(Product, {
          where: { productID: In(item.content.productIds) },
          select: {
            productID: true,
            name: true,
            price: true,
            images: true,
            isActive: true,
          },
        })
      : [];
    return {
      id: item.id,
      ...item.content,
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      selectedUsers,
      selectedProducts,
      runs: await Promise.all(runs.map((run) => this.runSummary(run))),
    };
  }
  async create(actorId: string, content: PromotionContentDto) {
    this.validate(content);
    const item = await this.db.manager.save(
      Promotion,
      this.db.manager.create(Promotion, { content, createdBy: actorId }),
    );
    this.logger.log({
      operation: 'promotion.created',
      promotionId: item.id,
      actorId,
    });
    return this.detail(item.id);
  }
  async update(id: string, actorId: string, dto: UpdatePromotionDto) {
    const { version, ...content } = dto;
    this.validate(content);
    await this.db.transaction(async (manager) => {
      const item = await manager.findOne(Promotion, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Promotion not found');
      if (item.version !== version)
        throw new ConflictException(
          'This promotion changed in another session. Reload before saving',
        );
      item.content = content;
      item.version++;
      await manager.save(item);
    });
    this.logger.log({
      operation: 'promotion.updated',
      promotionId: id,
      actorId,
    });
    return this.detail(id);
  }
  async send(id: string, actorId: string, dto: SendPromotionDto) {
    const run = await this.db.transaction(async (manager) => {
      const campaign = await manager.findOne(Promotion, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!campaign) throw new NotFoundException('Promotion not found');
      const duplicate = await manager.findOneBy(PromotionRun, {
        id: dto.requestId,
      });
      if (duplicate) {
        if (
          duplicate.campaignId.toLowerCase() !== id.toLowerCase() ||
          duplicate.campaignVersion !== dto.version
        )
          throw new ConflictException('This send request was already used');
        return duplicate;
      }
      if (campaign.version !== dto.version)
        throw new ConflictException(
          'This promotion changed. Reload and review before sending',
        );
      if (
        await manager.existsBy(PromotionRun, {
          campaignId: id,
          status: In(['QUEUED', 'SENDING']),
        })
      )
        throw new ConflictException(
          'A send is already in progress for this promotion',
        );
      const content = campaign.content;
      if (
        !content.subject ||
        !content.headline ||
        !content.body ||
        !content.productIds.length
      )
        throw new BadRequestException(
          'Add a subject, headline, message and at least one product before sending',
        );
      const snapshot = await this.snapshot(manager, content);
      const recipients = await this.eligible(manager, content)
        .orderBy('user.id', 'ASC')
        .getMany();
      if (!recipients.length)
        throw new BadRequestException(
          'Choose at least one active, email-verified recipient',
        );
      if (recipients.length !== dto.expectedRecipients)
        throw new ConflictException(
          'The recipient count changed. Review the preview again before sending',
        );
      const created = await manager.save(
        PromotionRun,
        manager.create(PromotionRun, {
          id: dto.requestId,
          campaignId: id,
          campaignVersion: campaign.version,
          snapshot,
          recipientCount: recipients.length,
          createdBy: actorId,
          queueKey: promotionQueueKey(),
        }),
      );
      for (let start = 0; start < recipients.length; start += 500)
        await manager.insert(
          PromotionRecipient,
          recipients.slice(start, start + 500).map((user) => ({
            runId: created.id,
            userId: user.id,
            username: user.username,
            email: user.email,
          })),
        );
      return created;
    });
    this.logger.log({
      operation: 'promotion.queued',
      promotionId: id,
      runId: run.id,
      actorId,
      recipientCount: run.recipientCount,
    });
    return this.runSummary(run);
  }
  async runSummary(run: PromotionRun) {
    const rows: { status: string; count: string }[] = await this.db
      .getRepository(PromotionRecipient)
      .createQueryBuilder('recipient')
      .select('recipient.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('recipient.runId = :id', { id: run.id })
      .groupBy('recipient.status')
      .getRawMany();
    const counts = {
      QUEUED: 0,
      PROCESSING: 0,
      SENT: 0,
      FAILED: 0,
      SKIPPED: 0,
      UNKNOWN: 0,
    };
    for (const row of rows)
      if (row.status in counts)
        counts[row.status as keyof typeof counts] = Number(row.count);
    return {
      id: run.id,
      campaignVersion: run.campaignVersion,
      subject: run.snapshot.subject,
      recipientCount: run.recipientCount,
      status: run.status,
      counts,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
    };
  }
  async runDetail(campaignId: string, runId: string, page = 1) {
    const run = await this.db.manager.findOneBy(PromotionRun, {
      id: runId,
      campaignId,
    });
    if (!run) throw new NotFoundException('Send history not found');
    const [recipients, total] = await this.db.manager.findAndCount(
      PromotionRecipient,
      {
        where: { runId },
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          finishedAt: true,
        },
        order: { createdAt: 'ASC', id: 'ASC' },
        skip: (page - 1) * 20,
        take: 20,
      },
    );
    return {
      ...(await this.runSummary(run)),
      preview: promotionPreview(run.snapshot),
      recipients,
      total,
      page,
      limit: 20,
    };
  }
}
