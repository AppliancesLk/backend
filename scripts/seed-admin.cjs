require('dotenv/config');
const bcrypt = require('bcrypt');

(async () => {
  const { AppDataSource } = require('../dist/database/data-source');
  const { User } = require('../dist/users/entities/user.entity');
  AppDataSource.setOptions({ migrations: [] });
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const username = 'admin';
      const passwordHash = await bcrypt.hash(
        process.env.SEED_ADMIN_PASSWORD ?? '12345678',
        12,
      );
      const existing = await users.findOne({ where: { username } });
      const user =
        existing ?? users.create({ username, email: 'admin@appliances.local' });
      user.passwordHash = passwordHash;
      user.role = 'ADMIN';
      user.isActive = true;
      await users.save(user);
      await manager.query('DELETE FROM auth_sessions WHERE "userId" = $1', [
        user.id,
      ]);
      console.log(
        'Admin account is ready (username: admin). Existing sessions were revoked.',
      );
    });
  } finally {
    await AppDataSource.destroy();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
