import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';
describe('User account creation', () => {
  it('creates an unverified, inactive customer regardless of entity defaults', async () => {
    const repository = {
      create: jest.fn((value: Partial<User>) =>
        Object.assign(new User(), value),
      ),
      save: jest.fn(async (value: User) => value),
    };
    const service = new UsersService(repository as unknown as Repository<User>);
    const user = await service.createCustomer(
      'buyer@example.com',
      'buyer',
      'hashed-password',
    );
    expect(user).toMatchObject({
      role: UserRole.CUSTOMER,
      isActive: false,
      emailVerifiedAt: null,
      deactivatedAt: null,
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
});
