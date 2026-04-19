// server-only: this module must not be imported by client components
import 'server-only'
import { PgBoss } from 'pg-boss'

let boss: PgBoss | null = null

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
