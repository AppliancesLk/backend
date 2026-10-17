import type { CookieOptions } from 'express';
export const SESSION_COOKIE = 'appliances_session';
export const sessionDuration = () => {
  const seconds = Number(process.env.SESSION_TTL_SECONDS ?? 86400);
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 2592000) {
    throw new Error('SESSION_TTL_SECONDS must be between 60 and 2592000');
  }
  return seconds * 1000;
};
export const sessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});
export function readSessionCookie(header?: string): string | undefined {
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}
