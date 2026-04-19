// Next.js 16 renamed middleware.ts to proxy.ts (middleware is deprecated)
// Re-export NextAuth's auth function as the proxy default export for route protection
export { auth as default } from '@/auth'

export const config = {
  // Protect dashboard routes and future review API routes.
  // T-03-04: CRITICAL — do NOT include /api/auth/* — that would intercept NextAuth callback handlers.
  matcher: ['/dashboard/:path*', '/api/reviews/:path*'],
}
