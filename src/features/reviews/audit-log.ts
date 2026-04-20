import 'server-only'
import { auditLog } from '@/db/schema'

export interface AuditEntry {
  reviewerId: string
  claimId: string | null
  action:
    | 'approve'
    | 'reject'
    | 'edit'
    | 'assign'
    | 'flag'
    | 'explain'
    | 'verify-source'
  beforeState?: Record<string, unknown>
  afterState?: Record<string, unknown>
}

/**
 * Inserts an audit log entry within an existing transaction.
 * Must always be called inside a transaction — never opens its own.
 * The audit_log table is append-only: no UPDATE or DELETE operations (T-04-02).
 */
export async function insertAuditEntry(
  tx: any,
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(auditLog).values(entry)
}
