import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    id: string;
    username: string;
    email: string;
    role: string;
    iat?: number;
    exp?: number;
  };
}
