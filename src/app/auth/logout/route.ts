import { NextRequest, NextResponse } from 'next/server';

import { PREF_COOKIE, SESSION_COOKIE, STATE_COOKIE } from '@/lib/auth/session';

const COOKIE_NAMES = [SESSION_COOKIE, PREF_COOKIE, STATE_COOKIE];

const buildLogoutResponse = (response: NextResponse) => {
  COOKIE_NAMES.forEach((name) => {
    response.cookies.set({
      name,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Clear-Site-Data', '"cache","storage"');
  return response;
};

export async function POST() {
  return buildLogoutResponse(NextResponse.json({ ok: true }));
}

export async function GET(request: NextRequest) {
  return buildLogoutResponse(NextResponse.redirect(new URL('/', request.url)));
}
