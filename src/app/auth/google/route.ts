import { NextRequest, NextResponse } from 'next/server';

import { buildGoogleAuthUrl, isGoogleConfigured } from '@/lib/auth/google';

export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID/SECRET to enable sign-in.',
      },
      { status: 501 }
    );
  }

  const returnTo = request.nextUrl.searchParams.get('returnTo') ?? '/';
  const url = buildGoogleAuthUrl(returnTo);
  return NextResponse.redirect(url ?? '/');
}
