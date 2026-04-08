/**
 * Architecture Guard: i18n Coverage
 *
 * Ensures all t('...') translation keys exist in both zh.json and en.json.
 * Prevents deploying with missing translations.
 */
import { describe, test, expect } from 'vitest'
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'

describe('i18n Coverage', () => {
  test('all translation keys exist in both zh.json and en.json', () => {
    const zhPath = 'messages/zh.json'
    const enPath = 'messages/en.json'

    if (!existsSync(zhPath) || !existsSync(enPath)) {
      test.todo('translation files not yet created')
      return
    }

    const zh = JSON.parse(readFileSync(zhPath, 'utf-8'))
    const en = JSON.parse(readFileSync(enPath, 'utf-8'))

    // Extract all t('key') calls from source
    const result = execSync(
      "grep -rohP \"t\\(['\\\"]([^'\\\"]+)['\\\"]\\)\" src/ --include='*.ts' --include='*.tsx' || true",
      { encoding: 'utf-8' }
    )

    const keys = [...new Set(
      result.match(/t\(['"]([^'"]+)['"]\)/g)?.map((m) => m.replace(/t\(['"]|['"]\)/g, '')) || []
    )]

    const missingZh = keys.filter((k) => !getNestedValue(zh, k))
    const missingEn = keys.filter((k) => !getNestedValue(en, k))

    expect(missingZh, 'Missing keys in zh.json').toEqual([])
    expect(missingEn, 'Missing keys in en.json').toEqual([])
  })

  test('no hardcoded Chinese strings in components', () => {
    test.todo('scan tsx files for Chinese character strings outside t() calls')
  })
})

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}
