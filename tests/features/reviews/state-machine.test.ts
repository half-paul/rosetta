import { describe, it, expect } from 'vitest'
import {
  validateTransition,
  VALID_TRANSITIONS,
} from '@/features/reviews/state-machine'
import type { ReviewStatus } from '@/features/reviews/state-machine'

describe('state-machine', () => {
  describe('validateTransition', () => {
    it('allows PENDING -> AI_ANALYZED', () => {
      expect(validateTransition('PENDING', 'AI_ANALYZED')).toBe(true)
    })

    it('allows AI_ANALYZED -> HUMAN_APPROVED', () => {
      expect(validateTransition('AI_ANALYZED', 'HUMAN_APPROVED')).toBe(true)
    })

    it('allows AI_ANALYZED -> HUMAN_REJECTED', () => {
      expect(validateTransition('AI_ANALYZED', 'HUMAN_REJECTED')).toBe(true)
    })

    it('allows HUMAN_APPROVED -> PUBLISHED', () => {
      expect(validateTransition('HUMAN_APPROVED', 'PUBLISHED')).toBe(true)
    })

    it('allows HUMAN_REJECTED -> PENDING', () => {
      expect(validateTransition('HUMAN_REJECTED', 'PENDING')).toBe(true)
    })

    it('rejects PUBLISHED -> any status (terminal state)', () => {
      const allStatuses: ReviewStatus[] = [
        'PENDING',
        'AI_ANALYZED',
        'HUMAN_APPROVED',
        'HUMAN_REJECTED',
        'PUBLISHED',
      ]
      for (const target of allStatuses) {
        expect(validateTransition('PUBLISHED', target)).toBe(false)
      }
    })

    it('rejects AI_ANALYZED -> PUBLISHED (MOD-09: cannot skip HUMAN_APPROVED)', () => {
      expect(validateTransition('AI_ANALYZED', 'PUBLISHED')).toBe(false)
    })

    it('rejects PENDING -> PUBLISHED (MOD-09: cannot skip HUMAN_APPROVED)', () => {
      expect(validateTransition('PENDING', 'PUBLISHED')).toBe(false)
    })

    it('rejects PENDING -> HUMAN_APPROVED (cannot skip AI_ANALYZED)', () => {
      expect(validateTransition('PENDING', 'HUMAN_APPROVED')).toBe(false)
    })
  })

  describe('VALID_TRANSITIONS', () => {
    it('has exactly 5 keys matching reviewStatusEnum values', () => {
      const expectedKeys: ReviewStatus[] = [
        'PENDING',
        'AI_ANALYZED',
        'HUMAN_APPROVED',
        'HUMAN_REJECTED',
        'PUBLISHED',
      ]
      expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual(expectedKeys.sort())
    })
  })
})
