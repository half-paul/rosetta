import { PgBoss } from 'pg-boss'

async function startWorkers() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  const boss = new PgBoss(process.env.DATABASE_URL)
  boss.on('error', console.error)
  await boss.start()

  // Queue with retry, backoff, and dead-letter routing:
  await boss.createQueue('analysis-jobs', {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 900,
    deadLetter: 'analysis-failures',
  })

  // Dead-letter queue for failed jobs:
  await boss.createQueue('analysis-failures')

  // Worker registration:
  await boss.work('analysis-jobs', async ([job]) => {
    console.log(`Processing job ${job.id}`, job.data)
    // Job handlers will be registered here in Phase 3
  })

  console.log('Workers started. Listening for jobs...')
}

startWorkers().catch((err) => {
  console.error('Worker startup failed:', err)
  process.exit(1)
})
