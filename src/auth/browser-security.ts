import type { Request, Response, NextFunction } from 'express';

const attempts = new Map<string, { count: number; until: number }>();
export const frontendOrigin = () =>
  process.env.FRONTEND_URL ?? 'http://localhost:5173';

// Custom headers require a CORS preflight; reject untrusted browser origins too.
export function browserSecurity(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (
      (req.headers.origin && req.headers.origin !== frontendOrigin()) ||
      req.headers['x-requested-with'] !== 'XMLHttpRequest'
    ) {
      res.status(403).json({ message: 'Request origin could not be verified' });
      return;
    }
  }
  if (
    req.method === 'POST' &&
    ['/auth/login', '/auth/register'].includes(req.path)
  ) {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.until <= now) attempts.delete(key);
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const attempt = attempts.get(key) ?? {
      count: 0,
      until: now + 15 * 60 * 1000,
    };
    attempts.set(key, attempt);
    if (++attempt.count > 20) {
      res.setHeader('Retry-After', Math.ceil((attempt.until - now) / 1000));
      res
        .status(429)
        .json({ message: 'Too many attempts. Please try again in 15 minutes' });
      return;
    }
  }
  next();
}
