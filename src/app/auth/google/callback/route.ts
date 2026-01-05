import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

import { exchangeCodeForTokens, fetchGoogleProfile, isGoogleConfigured } from '@/lib/auth/google';
import { consumeStateCookie, persistSession } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL('/?auth=disabled', request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = consumeStateCookie();

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL('/?auth=invalid_state', request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await fetchGoogleProfile(tokens.access_token);
    persistSession({
      sessionId: `google-${nanoid(8)}`,
      userId: profile.sub,
      mode: 'google',
      email: profile.email,
      name: profile.name,
    });
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    console.error('[auth] google callback failed', error);
    return NextResponse.redirect(new URL('/?auth=error', request.url));
  }
}
