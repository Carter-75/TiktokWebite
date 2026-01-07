import crypto from 'node:crypto';

import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';

import { SessionState } from '@/types/preferences';
import { authLogger } from '@/lib/logger';

export const SESSION_COOKIE = 'td_session';
export const PREF_COOKIE = 'td_pref_mirror';
export const STATE_COOKIE = 'td_oauth_state';

let cachedSecret: string | null = null;

const getSecret = () => {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    cachedSecret = secret;
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be configured in production environments.');
  }
  authLogger.warn('SESSION_SECRET missing; using development fallback');
  cachedSecret = 'development-secret';
  return cachedSecret;
};

const sign = (payload: string) =>
  crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');

const encode = (session: SessionState): string => {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = sign(payload);
  return `${payload}.${signature}`;
};

const decode = (value: string): SessionState | null => {
  try {
    const [payload, signature] = value.split('.');
    if (!payload || !signature) return null;
    if (sign(payload) !== signature) {
      authLogger.warn('Invalid session signature');
      return null;
    }
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as SessionState;
  } catch (error) {
    authLogger.warn('Failed to decode session', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const createGuestSession = (): SessionState => ({
  sessionId: `guest-session-${nanoid(8)}`,
  userId: `guest-${nanoid(6)}`,
  mode: 'guest',
});

export const readSession = (): SessionState => {
  const cookieStore = cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return createGuestSession();
  const parsed = decode(raw);
  return parsed ?? createGuestSession();
};

export const persistSession = (session: SessionState) => {
  const cookieStore = cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: encode(session),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
};

export const clearSession = () => {
  const cookieStore = cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: '',
    maxAge: 0,
    path: '/',
  });
};

export const setStateCookie = (state: string) => {
  const cookieStore = cookies();
  cookieStore.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 300,
  });
};

export const consumeStateCookie = (): string | null => {
  const cookieStore = cookies();
  const value = cookieStore.get(STATE_COOKIE)?.value ?? null;
  if (value) {
    cookieStore.set({ name: STATE_COOKIE, value: '', maxAge: 0, path: '/' });
  }
  return value;
};
