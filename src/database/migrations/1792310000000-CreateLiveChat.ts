import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateLiveChat1792310000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE chat_sessions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "customerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status varchar(6) NOT NULL DEFAULT 'OPEN', "messageCount" integer NOT NULL DEFAULT 0,
      "customerUnreadCount" integer NOT NULL DEFAULT 0, "adminUnreadCount" integer NOT NULL DEFAULT 0,
      "lastMessagePreview" varchar(120) NOT NULL DEFAULT '',
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "lastMessageAt" timestamptz NOT NULL DEFAULT now(), "closedAt" timestamptz,
      CONSTRAINT "CHK_chat_sessions_status" CHECK (status IN ('OPEN','CLOSED')),
      CONSTRAINT "CHK_chat_sessions_count" CHECK ("messageCount" BETWEEN 0 AND 100 AND "customerUnreadCount" BETWEEN 0 AND 100 AND "adminUnreadCount" BETWEEN 0 AND 100)
    )`);
    await runner.query(
      'CREATE INDEX "IDX_chat_sessions_customer_created" ON chat_sessions ("customerId", "createdAt")',
    );
    await runner.query(
      'CREATE INDEX "IDX_chat_sessions_status_activity" ON chat_sessions (status, "lastMessageAt")',
    );
    await runner.query(`CREATE TABLE chat_messages (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "chatSessionId" uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      "senderUserId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, "senderRole" varchar(8) NOT NULL,
      "clientMessageId" uuid NOT NULL, sequence integer NOT NULL, content text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_chat_messages_request" UNIQUE ("chatSessionId", "senderUserId", "clientMessageId"),
      CONSTRAINT "UQ_chat_messages_sequence" UNIQUE ("chatSessionId", sequence),
      CONSTRAINT "CHK_chat_messages_sequence" CHECK (sequence BETWEEN 1 AND 100),
      CONSTRAINT "CHK_chat_messages_role" CHECK ("senderRole" IN ('CUSTOMER','ADMIN')),
      CONSTRAINT "CHK_chat_messages_content" CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000)
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE chat_messages');
    await runner.query('DROP TABLE chat_sessions');
  }
}
