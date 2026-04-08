/**
 * Acceptance Tests: Homework Check Flow Module
 * User Stories: US-016 ~ US-019
 * Sprint: 2
 */
import { describe, test } from 'vitest'

describe('US-016: First Round Check Result', () => {
  test.todo('shows correct/wrong marks per question')
  test.todo('shows total score')
  test.todo('does NOT show answers or hints')
  test.todo('wrong questions highlighted for correction')
})

describe('US-017: Correction & Re-check', () => {
  test.todo('student can correct wrong answers and resubmit')
  test.todo('AI re-checks corrected answers')
  test.todo('updated score displayed')
  test.todo('multi-round history preserved')
})

describe('US-018: Progressive Help', () => {
  test.todo('Level 1: thinking direction (knowledge point, approach)')
  test.todo('Level 2: key steps without final answer')
  test.todo('Level 3: complete solution')
  test.todo('each level requires new answer attempt to unlock next')
  test.todo('parent maxHelpLevel setting respected')
  test.todo('elementary defaults to max Level 2')
  test.todo('middle/high school defaults to max Level 3')
  test.todo('correct answer during help skips remaining levels')
  test.todo('empty string does not count as new answer for unlock')
  test.todo('locked level shows message explaining unlock requirement')
})

describe('US-019: Complete Check', () => {
  test.todo('student can end check session')
  test.todo('final score saved')
  test.todo('wrong questions auto-added to error notebook')
  test.todo('deduplication via contentHash')
})
