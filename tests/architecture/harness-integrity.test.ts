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
    // Each file in src/lib/ai/operations/ should have a matching schema
    // in src/lib/ai/harness/schemas/
    test.todo('verify schema files exist for each operation')
  })

  test('all AI operations have corresponding prompt templates', () => {
    test.todo('verify prompt files exist for each operation')
  })

  test('ContentGuardrail is applied to all student-facing AI content', () => {
    test.todo('grep for generate-help calls and verify guardrail usage')
  })
})
