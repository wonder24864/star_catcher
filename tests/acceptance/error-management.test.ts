/**
 * Acceptance Tests: Error Management Module
 * User Stories: US-020 ~ US-022
 * Sprint: 3
 */
import { describe, test } from 'vitest'

describe('US-020: Error Question List', () => {
  test.todo('lists error questions with subject color coding')
  test.todo('filter by subject')
  test.todo('filter by date range')
  test.todo('pagination shows 20 questions per page')
  test.todo('next/previous page navigation works')
  test.todo('search by content keyword')
})

describe('US-021: Error Question Detail', () => {
  test.todo('shows full question with student/correct answers')
  test.todo('shows AI knowledge point annotation')
  test.todo('shows check history')
  test.todo('shows help request history')
})

describe('US-022: Parent Notes', () => {
  test.todo('parent can add note to error question')
  test.todo('parent can edit own note')
  test.todo('parent can delete own note')
  test.todo('note input enforces 500 character limit')
  test.todo('notes display author and timestamp')
})
