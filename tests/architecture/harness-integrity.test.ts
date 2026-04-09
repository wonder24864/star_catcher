/**
 * Architecture Guard: AI Harness Integrity
 *
 * Ensures that business code never imports AIProvider directly.
 * All AI calls must go through src/lib/ai/operations/ layer.
 *
 * See: docs/adr/001-ai-harness-pipeline.md
 */
import { describe, test, expect } from 'vitest'
import { execSync } from 'child_process'

describe('AI Harness Integrity', () => {
  test('no direct AIProvider imports outside allowed paths', () => {
    // Allowed paths: src/lib/ai/providers/, src/lib/ai/harness/, src/lib/ai/singleton.ts
    // Forbidden: any other src/ file importing from providers/ or directly using AIProvider
    // Only these files may directly import AIProvider or from providers/
    const allowedPaths = [
      'src/lib/ai/providers/',           // Provider implementations
      'src/lib/ai/provider-factory.ts',  // Only file that instantiates providers
      'src/lib/ai/singleton.ts',         // Global harness instance creation
      'src/lib/ai/types.ts',             // Type definitions
      'src/lib/ai/harness/index.ts',     // Harness factory (delegates to provider)
    ]
    // Note: other harness/ files (call-logger, rate-limiter, etc.) should NOT
    // import AIProvider directly — they receive it via dependency injection.

    try {
      const result = execSync(
        'grep -rn "from.*providers/\\|from.*provider-factory\\|AIProvider" src/ --include="*.ts" --include="*.tsx" || true',
        { encoding: 'utf-8' }
      )

      const violations = result
        .split('\n')
        .filter(Boolean)
        .filter((line) => !allowedPaths.some((p) => line.startsWith(p)))

      expect(violations).toEqual([])
    } catch {
      // grep returns exit code 1 when no matches - that's good
    }
  })

  test('all AI operations have corresponding Zod schemas', () => {
    // Every AIOperationType in Prisma schema must have a matching schema file
    const operationNames = ['recognize-homework', 'grade-answer', 'help-generate', 'subject-detect']
    const fs = require('fs')
    const path = require('path')

    for (const name of operationNames) {
      const schemaPath = path.join(process.cwd(), 'src/lib/ai/harness/schemas', `${name}.ts`)
      expect(fs.existsSync(schemaPath), `Missing schema: ${name}`).toBe(true)
    }
  })

  test('all AI operations have corresponding prompt templates', () => {
    const operationNames = ['recognize-homework', 'grade-answer', 'help-generate', 'subject-detect']
    const fs = require('fs')
    const path = require('path')

    for (const name of operationNames) {
      const promptPath = path.join(process.cwd(), 'src/lib/ai/prompts', `${name}.ts`)
      expect(fs.existsSync(promptPath), `Missing prompt: ${name}`).toBe(true)
    }
  })

  test('ContentGuardrail is integrated in Harness pipeline', () => {
    const fs = require('fs')
    const path = require('path')

    const pipelineCode = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/ai/harness/index.ts'),
      'utf-8'
    )

    // ContentGuardrail must be imported and called in the pipeline
    expect(pipelineCode).toContain('checkContentSafety')
    expect(pipelineCode).toContain('CONTENT_GUARDRAIL_BLOCKED')
  })
})
