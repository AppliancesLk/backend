import { AuthService } from './auth.service';
import { UsersService } from '../../users/services/users.service';
import { Repository } from 'typeorm';
import { AuthSession } from '../entities/auth-session.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { sessionCookieOptions } from '../session.config';

describe('Cookie authentication', () => {
  const user = {
    id: 'user-id',
    username: 'customer',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
    isActive: true,
  };
  const sessions = { findOne: jest.fn(), delete: jest.fn() };
  const users = { findByUsername: jest.fn() };
  const service = new AuthService(
    users as unknown as UsersService,
    sessions as unknown as Repository<AuthSession>,
  );
  beforeEach(() => jest.clearAllMocks());

  it('rejects malformed session tokens without querying the database', async () => {
    await expect(service.authenticate('invalid')).rejects.toThrow(
      'Please sign in',
    );
    expect(sessions.findOne).not.toHaveBeenCalled();
  });
  it('rejects and removes expired sessions', async () => {
    sessions.findOne.mockResolvedValue({
      tokenHash: 'hash',
      user,
      expiresAt: new Date(0),
    });
    await expect(service.authenticate('a'.repeat(64))).rejects.toThrow(
      'expired',
    );
    expect(sessions.delete).toHaveBeenCalledWith({ tokenHash: 'hash' });
  });
  it('uses the current database role and returns only public user fields', async () => {
    sessions.findOne.mockResolvedValue({
      user: { ...user, role: UserRole.ADMIN, passwordHash: 'private' },
      expiresAt: new Date(Date.now() + 60000),
    });
    expect(await service.authenticate('a'.repeat(64))).toEqual({
      id: user.id,
      username: user.username,
      email: user.email,
      role: UserRole.ADMIN,
    });
  });
  it('rejects deactivated users even with a valid session', async () => {
    sessions.findOne.mockResolvedValue({
      tokenHash: 'hash',
      user: { ...user, isActive: false },
      expiresAt: new Date(Date.now() + 60000),
    });
    await expect(service.authenticate('a'.repeat(64))).rejects.toThrow(
      'expired',
    );
  });
  it('revokes the hashed token on logout', async () => {
    await service.logout('a'.repeat(64));
    const hash = sessions.delete.mock.calls[0][0].tokenHash;
    expect(hash).toHaveLength(64);
    expect(hash).not.toEqual('a'.repeat(64));
  });
  it('sets secure cookies in production', () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(sessionCookieOptions()).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
