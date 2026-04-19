// server-only: this module must not be imported by client components
import 'server-only'
import { PgBoss } from 'pg-boss'

let boss: PgBoss | null = null
let started = false

export function getBoss(): PgBoss {
  if (!boss) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for pg-boss')
    }
    boss = new PgBoss(process.env.DATABASE_URL)
    boss.on('error', console.error)
  }
  return boss
}

/**
 * Returns a started pg-boss instance suitable for use in API routes.
 * Pitfall 5 fix: API routes must call start() before send() — getBoss() alone is insufficient.
 * pg-boss start() is idempotent — safe to call multiple times.
 */
export async function getStartedBoss(): Promise<PgBoss> {
  const b = getBoss()
  if (!started) {
    await b.start()
    started = true
  }
  return b
}
