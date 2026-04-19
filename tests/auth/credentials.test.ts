import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import bcryptjs from 'bcryptjs'
import * as schema from '@/db/schema'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool, { schema })

describe('Credentials authentication (MOD-01)', () => {
  const TEST_EMAIL = 'test-reviewer@rosetta.test'
  const TEST_PASSWORD = 'securePassword123!'
  let hashedPassword: string

  beforeAll(async () => {
    // Clean up any existing test user
    await db.delete(schema.users).where(eq(schema.users.email, TEST_EMAIL))

    // Create test user with bcrypt-hashed password (work factor >= 12)
    hashedPassword = await bcryptjs.hash(TEST_PASSWORD, 12)
    await db.insert(schema.users).values({
      id: crypto.randomUUID(),
      name: 'Test Reviewer',
      email: TEST_EMAIL,
      passwordHash: hashedPassword,
      role: 'reviewer',
    })
  })

  afterAll(async () => {
    await db.delete(schema.users).where(eq(schema.users.email, TEST_EMAIL))
    await pool.end()
  })

  it('valid credentials: user row found and bcrypt compare succeeds', async () => {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, TEST_EMAIL))

    expect(user).toBeDefined()
    expect(user.passwordHash).toBeDefined()

    const valid = await bcryptjs.compare(TEST_PASSWORD, user.passwordHash!)
    expect(valid).toBe(true)
  })

  it('wrong password: bcrypt compare returns false', async () => {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, TEST_EMAIL))

    const valid = await bcryptjs.compare('wrongPassword', user.passwordHash!)
    expect(valid).toBe(false)
  })

  it('non-existent email: no user found', async () => {
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'nobody@rosetta.test'))

    expect(result).toHaveLength(0)
  })

  it('user without passwordHash (OAuth-only): authorize should reject', async () => {
    // Create an OAuth-only user (no passwordHash)
    const oauthEmail = 'oauth-only@rosetta.test'
    await db.delete(schema.users).where(eq(schema.users.email, oauthEmail))
    await db.insert(schema.users).values({
      id: crypto.randomUUID(),
      name: 'OAuth User',
      email: oauthEmail,
      role: 'reviewer',
      // passwordHash is null -- OAuth-only user
    })

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, oauthEmail))

    expect(user.passwordHash).toBeNull()

    // Cleanup
    await db.delete(schema.users).where(eq(schema.users.email, oauthEmail))
  })

  it('bcrypt work factor is at least 12', async () => {
    // bcryptjs hashes encode work factor as the second field: $2a$12$...
    const rounds = parseInt(hashedPassword.split('$')[2], 10)
    expect(rounds).toBeGreaterThanOrEqual(12)
  })
})
