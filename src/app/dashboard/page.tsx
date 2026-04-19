import { auth } from '@/auth'
import { redirect } from 'next/navigation'

// UI-SPEC.md Dashboard Shell — server component with auth check
export default async function DashboardPage() {
  const session = await auth()
  // Belt-and-suspenders: middleware handles most cases, this catches edge cases
  if (!session?.user) redirect('/login')

  return (
    // UI-SPEC.md Layout: flex flex-col min-h-screen
    <div className="flex flex-col min-h-screen">
      {/* Topnav — h-14, border-b, bg-background, px-6 (UI-SPEC.md) */}
      <nav className="h-14 border-b bg-background px-6 flex items-center justify-between">
        {/* Left: Rosetta wordmark */}
        <span className="text-base font-semibold">Rosetta</span>
        {/* Right: reviewer display name (from session) */}
        <span className="text-sm text-muted-foreground">
          {session.user.name || session.user.email}
        </span>
      </nav>

      {/* Main content — centers empty state (UI-SPEC.md: flex-1 flex items-center justify-center) */}
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          {/* UI-SPEC.md Copywriting: exact empty state copy */}
          <h1 className="text-2xl font-semibold mb-2">No articles yet</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Articles you submit for fact-checking will appear here. Come back
            after Phase 2 is complete.
          </p>
        </div>
      </main>
    </div>
  )
}
