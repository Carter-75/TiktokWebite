import crypto from 'node:crypto';

import { nanoid } from 'nanoid';

import { setStateCookie } from '@/lib/auth/session';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_PROFILE_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const getBaseUrl = () => process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export const isGoogleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const buildGoogleAuthUrl = async (returnTo = '/') => {
  if (!isGoogleConfigured()) {
    return null;
  }
  const state = crypto.createHash('sha256').update(`${nanoid()}-${Date.now()}`).digest('hex');
  await setStateCookie(state);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${getBaseUrl()}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  if (returnTo && returnTo !== '/') {
    params.set('login_hint', Buffer.from(returnTo).toString('base64url'));
  }
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

export const exchangeCodeForTokens = async (code: string) => {
  if (!isGoogleConfigured()) throw new Error('Google OAuth not configured');
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${getBaseUrl()}/auth/google/callback`,
      grant_type: 'authorization_code',
      code_verifier: process.env.GOOGLE_CODE_VERIFIER ?? '',
    }),
  });
  if (!res.ok) {
    throw new Error('Failed to exchange code for tokens');
  }
  return (await res.json()) as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
};

export const fetchGoogleProfile = async (accessToken: string) => {
  const res = await fetch(GOOGLE_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch Google profile');
  }
  return (await res.json()) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };
};
