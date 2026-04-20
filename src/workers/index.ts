import { PgBoss } from 'pg-boss'
import { runIngestionJob } from '@/features/ingestion/ingest-worker'
import { runAnalysisJob } from '@/features/analysis/analysis-worker'

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

  // Ingestion queue — processes Wikipedia article fetch+parse+persist jobs
  await boss.createQueue('ingestion-jobs', {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 600,
    deadLetter: 'ingestion-failures',
  })
  await boss.createQueue('ingestion-failures')

  await boss.work('ingestion-jobs', async ([job]) => {
    console.log(`Processing ingestion job ${job.id}`, job.data)
    await runIngestionJob(job.data as { url: string; title: string })
  })

  // Worker registration:
  await boss.work('analysis-jobs', async ([job]) => {
    console.log(`Processing analysis job ${job.id}`, job.data)
    await runAnalysisJob(job.data as { articleId: string })
  })

  console.log('Workers started. Listening for jobs...')
}

startWorkers().catch((err) => {
  console.error('Worker startup failed:', err)
  process.exit(1)
})
