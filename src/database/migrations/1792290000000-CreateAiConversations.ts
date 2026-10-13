import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiConversations1792290000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE ai_conversations (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "productId" uuid NOT NULL REFERENCES products("productID") ON DELETE CASCADE,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(
      'CREATE INDEX "IDX_ai_conversations_user_product" ON ai_conversations ("userId", "productId")',
    );
    await runner.query(`CREATE TABLE ai_messages (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "conversationId" uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      role varchar(9) NOT NULL,
      content text NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_ai_messages_role" CHECK (role IN ('USER','ASSISTANT')),
      CONSTRAINT "CHK_ai_messages_content" CHECK (char_length(content) BETWEEN 1 AND 8000)
    )`);
    await runner.query(
      'CREATE INDEX "IDX_ai_messages_conversation_created" ON ai_messages ("conversationId", "createdAt")',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE ai_messages');
    await runner.query('DROP TABLE ai_conversations');
  }
}
