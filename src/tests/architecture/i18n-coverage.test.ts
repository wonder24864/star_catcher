/**
 * Architecture Guard: i18n Coverage
 *
 * Ensures all t('...') translation keys exist in both zh.json and en.json.
 * Prevents deploying with missing translations.
 */
import { describe, test, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

function collectFiles(dir: string, exts: string[]): string[] {
  const files: string[] = []
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full, exts))
    } else if (exts.includes(extname(full))) {
      files.push(full)
    }
  }
  return files
}

describe('i18n Coverage', () => {
  test('all translation keys exist in both zh.json and en.json', () => {
    const zhPath = 'src/i18n/messages/zh.json'
    const enPath = 'src/i18n/messages/en.json'

    if (!existsSync(zhPath) || !existsSync(enPath)) {
      return // translation files not yet created, skip
    }

    const zh = JSON.parse(readFileSync(zhPath, 'utf-8'))
    const en = JSON.parse(readFileSync(enPath, 'utf-8'))

    // Extract all t('key') calls from source, resolving useTranslations namespace
    const srcFiles = collectFiles('src', ['.ts', '.tsx'])
      .filter((f) => !f.includes('tests') && !f.includes('test'))
    const keySet = new Set<string>()
    // \b ensures t( is standalone, not part of get(, redirect(, etc.
    const tCallPattern = /\bt\(['"]([^'"]+)['"]\)/g
    // Only match namespace from `const t = use*Translations("ns")`
    // (the variable named `t` specifically, not tC, tH, etc.)
    const nsPattern = /const\s+t\s*=\s*use(?:Translations|TierTranslations)\(['"]([^'"]+)['"]\)/

    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8')
      const nsMatch = content.match(nsPattern)
      const ns = nsMatch ? nsMatch[1] : ''

      let match
      while ((match = tCallPattern.exec(content)) !== null) {
        const key = ns ? `${ns}.${match[1]}` : match[1]
        keySet.add(key)
      }
      tCallPattern.lastIndex = 0
    }

    const keys = [...keySet]
    const missingZh = keys.filter((k) => !getNestedValue(zh, k))
    const missingEn = keys.filter((k) => !getNestedValue(en, k))

    expect(missingZh, 'Missing keys in zh.json').toEqual([])
    expect(missingEn, 'Missing keys in en.json').toEqual([])
  })

  test.todo('no hardcoded Chinese strings in components')
})

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}
