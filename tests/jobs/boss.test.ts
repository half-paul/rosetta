import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PgBoss } from 'pg-boss'

describe('pg-boss job lifecycle', () => {
  let boss: PgBoss

  beforeAll(async () => {
    boss = new PgBoss(process.env.DATABASE_URL!)
    boss.on('error', console.error)
    await boss.start()
  }, 15000)

  afterAll(async () => {
    await boss.stop({ graceful: true, timeout: 5000 })
  })

  it('job is enqueued, picked up by worker, and completed exactly once', async () => {
    const queueName = `test-queue-${Date.now()}`
    await boss.createQueue(queueName, { retryLimit: 0 })

    let callCount = 0
    const received: unknown[] = []

    await boss.work(queueName, async ([job]) => {
      callCount++
      received.push(job.data)
    })

    const payload = { test: true, timestamp: Date.now() }
    const jobId = await boss.send(queueName, payload)
    expect(jobId).toBeDefined()

    // Allow pg-boss poll cycle (default 2s) + processing time
    await new Promise((r) => setTimeout(r, 4000))

    expect(callCount).toBe(1)
    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(payload)
  }, 10000)

  it('dead-letter queue receives failed jobs after retries exhausted', async () => {
    const queueName = `test-dl-${Date.now()}`
    const dlQueue = `${queueName}-dead`

    await boss.createQueue(dlQueue)
    await boss.createQueue(queueName, {
      retryLimit: 0,
      deadLetter: dlQueue,
    })

    await boss.work(queueName, async () => {
      throw new Error('Intentional failure')
    })

    await boss.send(queueName, { shouldFail: true })

    // Wait for failure + DL routing
    await new Promise((r) => setTimeout(r, 5000))

    const [dlJob] = await boss.fetch(dlQueue)
    expect(dlJob).toBeDefined()
  }, 12000)
})
