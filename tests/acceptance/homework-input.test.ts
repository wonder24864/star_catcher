/**
 * Acceptance Tests: Homework Input Module
 * User Stories: US-008 ~ US-012
 * Sprint: 2
 */
import { describe, test } from 'vitest'

describe('US-008: Single Photo Upload', () => {
  test.todo('camera capture works in PWA and browser')
  test.todo('preview before upload with retake option')
  test.todo('album/file selection supported')
  test.todo('upload progress displayed')
  test.todo('enters AI recognition flow after upload')
  test.todo('supports JPG/PNG/HEIC/WebP formats')
  test.todo('rejects unsupported image formats with error message')
  test.todo('rejects images larger than 20MB')
  test.todo('client-side compression reduces image to ≤4MB before upload')
  test.todo('EXIF privacy data stripped before storage')
  test.todo('images stored in MinIO')
})

describe('US-009: Multi Photo Upload', () => {
  test.todo('up to 10 photos per session')
  test.todo('drag to reorder')
  test.todo('delete individual photos')
  test.todo('AI recognizes in order and merges results')
})

describe('US-010: Manual Input', () => {
  test.todo('text input with auto subject detection')
  test.todo('optional student answer and correct answer')
  test.todo('supports LaTeX formula input and preview')
  test.todo('subject auto-detection: confidence ≥ 0.8 auto-accepts, < 0.8 shows editable default')
})

describe('US-011: PDF Upload', () => {
  test.todo('PDF upload with page-by-page recognition')
  test.todo('max 20 pages, max 50MB')
})

describe('US-012: Screenshot Paste', () => {
  test.todo('Ctrl+V paste from clipboard')
  test.todo('paste triggers upload flow')
})
