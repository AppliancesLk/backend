import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1792300000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE notifications (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type varchar(40) NOT NULL,
      channel varchar(10) NOT NULL DEFAULT 'EMAIL',
      recipient varchar(320) NOT NULL,
      subject varchar(300) NOT NULL,
      status varchar(10) NOT NULL DEFAULT 'PENDING',
      "eventKey" varchar(300) NOT NULL,
      "relatedEntityType" varchar(10), "relatedEntityId" uuid,
      "sentAt" timestamptz, "failedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_notifications_event_key" UNIQUE ("eventKey"),
      CONSTRAINT "CHK_notifications_channel" CHECK (channel = 'EMAIL'),
      CONSTRAINT "CHK_notifications_status" CHECK (status IN ('PENDING','SENT','FAILED')),
      CONSTRAINT "CHK_notifications_type" CHECK (type IN ('WELCOME','LOGIN','ORDER_CREATED','PAYMENT_SUCCESS','PAYMENT_FAILED','ORDER_STATUS_UPDATED','REPAIR_CREATED','REPAIR_APPROVED','REPAIR_REJECTED','REPAIR_STATUS_UPDATED','REPAIR_READY_FOR_COLLECTION','PROMOTION'))
    )`);
    await runner.query(
      'CREATE INDEX "IDX_notifications_user_created" ON notifications ("userId", "createdAt")',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE notifications');
  }
}
