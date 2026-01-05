import { NextResponse } from 'next/server';

import { clearSession } from '@/lib/auth/session';

export async function GET() {
  clearSession();
  return NextResponse.redirect('/');
}
