import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationService } from '../../notification/notification.service';
import { Notification } from '../../notification/entities/notification.entity';
import { User } from '../../users/entities/user.entity';
import { PromotionRecipient, PromotionRun } from '../entities/promotion.entity';
import type {
  PromotionDeliveryStatus,
  PromotionRunStatus,
} from '../types/promotion.types';
import { promotionQueueKey } from '../promotion-queue';
import { accountLink } from '../../notification/email/templates/email-layout';

@Injectable()
export class PromotionWorker implements OnModuleDestroy {
  private readonly logger = new Logger(PromotionWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly db: DataSource,
    private readonly notifications: NotificationService,
  ) {}
  start() {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => {
      void this.processBatch();
    }, 2500);
    this.timer.unref();
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.active;
  }
  processBatch(): Promise<void> {
    if (this.active || this.stopped) return this.active ?? Promise.resolve();
    this.active = this.work()
      .catch(() => {
        this.logger.error({ operation: 'promotion.worker.failed' });
      })
      .finally(() => {
        this.active = undefined;
      });
    return this.active;
  }
  private async work() {
    // A crashed SMTP attempt is uncertain: never automatically send it again.
    const stale: { runId: string }[] = await this.db.query(
      `WITH stale AS (UPDATE promotion_recipients SET status='UNKNOWN', "finishedAt"=now() WHERE "runId" IN (SELECT id FROM promotion_runs WHERE "queueKey"=$1) AND status='PROCESSING' AND "claimedAt" < now()-interval '15 minutes' RETURNING "runId") SELECT * FROM stale`,
      [promotionQueueKey()],
    );
    const claimed: { id: string; runId: string }[] = await this.db.query(
      `WITH next AS (SELECT id FROM promotion_recipients WHERE "runId" IN (SELECT id FROM promotion_runs WHERE "queueKey"=$1) AND status='QUEUED' ORDER BY "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 5), claimed AS (UPDATE promotion_recipients r SET status='PROCESSING', "claimedAt"=now() FROM next WHERE r.id=next.id RETURNING r.id, r."runId") SELECT * FROM claimed`,
      [promotionQueueKey()],
    );
    for (const runId of new Set([...claimed, ...stale].map((row) => row.runId)))
      await this.finalize(runId);
    for (const { id, runId } of claimed) {
      const recipient = await this.db.manager.findOneByOrFail(
        PromotionRecipient,
        { id },
      );
      let status: PromotionDeliveryStatus = 'UNKNOWN';
      let notificationId: string | null = null;
      try {
        const user = recipient.userId
          ? await this.db.manager.findOneBy(User, { id: recipient.userId })
          : null;
        if (
          !user?.isActive ||
          !user.emailVerifiedAt ||
          user.deactivatedAt ||
          user.email !== recipient.email
        )
          status = 'SKIPPED';
        else {
          const run = await this.db.manager.findOneByOrFail(PromotionRun, {
            id: runId,
          });
          const snapshot = run.snapshot;
          const result = await this.notifications.sendPromotionEmail(
            user.id,
            {
              subject: snapshot.subject,
              title: snapshot.headline,
              description: snapshot.body,
              preheader: snapshot.preheader,
              products: snapshot.products,
              buttonText: snapshot.buttonText || 'Explore products',
              link: snapshot.buttonUrl || accountLink('/products'),
              footerNote: snapshot.footerNote,
            },
            run.id,
          );
          notificationId = result.notificationId ?? null;
          if (result.status === 'DUPLICATE') {
            const record = await this.db.manager.findOneBy(Notification, {
              eventKey: `promotion:${user.id}:${run.id}`,
            });
            notificationId = record?.id ?? null;
            status =
              record?.status === 'SENT'
                ? 'SENT'
                : record?.status === 'FAILED'
                  ? 'FAILED'
                  : 'UNKNOWN';
          } else if (result.uncertain) status = 'UNKNOWN';
          else
            status =
              result.status === 'SENT'
                ? 'SENT'
                : result.status === 'SKIPPED'
                  ? 'SKIPPED'
                  : 'FAILED';
        }
      } catch {
        this.logger.warn({
          operation: 'promotion.recipient.uncertain',
          runId,
          recipientId: id,
        });
      }
      await this.db.manager.update(PromotionRecipient, id, {
        status,
        notificationId,
        finishedAt: new Date(),
      });
      await this.finalize(runId);
    }
  }
  private async finalize(runId: string) {
    await this.db.transaction(async (manager) => {
      const run = await manager.findOne(PromotionRun, {
        where: { id: runId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) return;
      const rows: { status: string; count: string }[] = await manager
        .getRepository(PromotionRecipient)
        .createQueryBuilder('r')
        .select('r.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('r.runId = :runId', { runId })
        .groupBy('r.status')
        .getRawMany();
      const count = (status: string) =>
        Number(rows.find((row) => row.status === status)?.count ?? 0);
      const pending = count('QUEUED') + count('PROCESSING');
      const sent = count('SENT'),
        failed = count('FAILED') + count('UNKNOWN');
      const status: PromotionRunStatus = pending
        ? 'SENDING'
        : failed
          ? sent
            ? 'PARTIAL'
            : 'FAILED'
          : sent
            ? 'SENT'
            : 'SKIPPED';
      await manager.update(PromotionRun, runId, {
        status,
        finishedAt: pending ? null : new Date(),
      });
    });
  }
}
