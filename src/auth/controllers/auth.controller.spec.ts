import { AccountActionsService } from '../services/account-actions.service';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import type { Response } from 'express';

describe('AuthController', () => {
  const publicUser = {
    id: 'id',
    username: 'customer',
    email: 'customer@example.com',
    role: 'CUSTOMER',
  };
  const auth = { login: jest.fn(), logout: jest.fn() };
  const controller = new AuthController(
    auth as unknown as AuthService,
    {} as AccountActionsService,
  );
  beforeEach(() => jest.clearAllMocks());
  it('sends the session only through an HttpOnly cookie', async () => {
    auth.login.mockResolvedValue({ token: 'secret', user: publicUser });
    const res = { cookie: jest.fn() };
    const result = await controller.login(
      { username: 'customer', password: 'password123' },
      { headers: {} } as AuthenticatedRequest,
      res as unknown as Response,
    );
    expect(result).toEqual({ user: publicUser });
    expect(res.cookie).toHaveBeenCalledWith(
      'appliances_session',
      'secret',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
  });
  it('revokes the server session and clears the matching cookie on logout', async () => {
    const res = { clearCookie: jest.fn() };
    await controller.logout(
      {
        headers: { cookie: 'appliances_session=secret' },
      } as AuthenticatedRequest,
      res as unknown as Response,
    );
    expect(auth.logout).toHaveBeenCalledWith('secret');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'appliances_session',
      expect.objectContaining({ path: '/' }),
    );
  });
});
