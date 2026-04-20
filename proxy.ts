// Next.js 16 proxy (replaces deprecated middleware.ts)
// Protects /dashboard and /api/reviews routes — all other routes are public.
//
// BUG FIX: Previously this file did `export { auth as default } from '@/auth'`
// which re-exported next-auth's `auth` as the proxy default. Next.js 16's
// Turbopack static analysis could not extract the `config.matcher` from that
// re-export pattern, causing the proxy to run on ALL routes. Combined with
// next-auth's default behavior, unauthenticated visitors were redirected away
// from public pages like `/`.
//
// FIX: Use `auth(handler)` wrapper pattern from next-auth v5 so the proxy
// function itself gates on route patterns before enforcing authentication.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'

// T-03-04: CRITICAL — do NOT include /api/auth/* — that would intercept NextAuth callback handlers.
const protectedPatterns = [/^\/dashboard(\/|$)/, /^\/api\/reviews(\/|$)/]

function isProtectedRoute(pathname: string): boolean {
  return protectedPatterns.some((pattern) => pattern.test(pathname))
}

// next-auth v5: auth(handler) wraps the proxy and augments request with req.auth
export default auth((req) => {
  // Public routes — no auth required
  if (!isProtectedRoute(req.nextUrl.pathname)) {
    return NextResponse.next()
  }

  // Protected routes — redirect to login if unauthenticated
  if (!req.auth?.user) {
    const signInUrl = req.nextUrl.clone()
    signInUrl.pathname = '/login'
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.href)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
})

export const config = {
  // Protect dashboard routes and future review API routes.
  // T-03-04: CRITICAL — do NOT include /api/auth/* — that would intercept NextAuth callback handlers.
  matcher: ['/dashboard/:path*', '/api/reviews/:path*'],
}
