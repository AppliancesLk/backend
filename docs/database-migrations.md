# Database migrations

Configure DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD and DB_NAME in your local .env. Never commit credentials. TypeORM synchronization stays disabled.

From the backend directory:

- Inspect applied and pending migrations: npm run migration:show
- Apply all pending migrations atomically: npm run migration:run
- Generate a migration after changing entities: npm run migration:generate -- src/database/migrations/DescribeSchemaChange
- Revert the most recent migration: npm run migration:revert

Review generated SQL before running it. Commit entity changes and their migration together. Back up important data before migration; reverting can delete data created in the affected tables. Test rollback on a disposable database.

For a compiled deployment, first run npm run build, then use:

    node node_modules/typeorm/cli.js migration:show -d dist/database/data-source.js
    node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js

The data source resolves migrations relative to itself, loading TypeScript in development and JavaScript from the compiled directory. Migrations run explicitly rather than during application startup.
