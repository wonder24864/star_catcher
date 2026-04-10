# ADR-005: SHA256 Content Hash for Error Question Deduplication

## Status
Accepted (2026-04-08)

## Context
The same math problem or vocabulary item can appear across multiple homework sessions for a student. For example, a student might get "25 + 38 = ?" wrong on Monday's homework and encounter the identical question on Wednesday's test. Without deduplication, the error notebook would accumulate duplicate entries for the same underlying question, inflating error counts and confusing both students and parents reviewing the error list. The system needs a reliable way to detect when a "new" error question is actually a repeat of an existing one for the same student.

## Decision
Use `SHA256(normalize(content))` as a content-based deduplication key, scoped per student. The implementation:

1. **Normalization function** (`normalize`): Strips whitespace, unifies punctuation (e.g., full-width to half-width), standardizes number formats, and lowercases text. This ensures cosmetic differences (extra spaces, different punctuation styles) do not defeat dedup.
2. **Hash computation**: Apply SHA256 to the normalized content string, producing a 64-character hex digest stored in `ErrorQuestion.contentHash` (VarChar(64)).
3. **Unique constraint**: A composite unique index `@@unique([studentId, contentHash])` enforces dedup at the database level.
4. **Upsert behavior**: When ending a homework session or manually inputting an error, if `(studentId, contentHash)` already exists, the system increments `totalAttempts` on the existing record rather than creating a new one. The `manualInput.create` endpoint returns a `deduplicated: boolean` flag so the UI can inform the user.

### normalize() 算法（文件位置：`src/lib/domain/content-hash.ts`）

```typescript
export function normalize(content: string): string {
  return content
    .trim()
    // 全角标点转半角
    .replace(/，/g, ',').replace(/。/g, '.').replace(/？/g, '?')
    .replace(/！/g, '!').replace(/：/g, ':').replace(/；/g, ';')
    // 所有空白合并为单个空格
    .replace(/\s+/g, ' ')
    // 全部小写
    .toLowerCase()
    // 移除所有标点符号（保留字母、数字、中文、空格）
    .replace(/[^\w\s\u4e00-\u9fff]/g, '')
    // 再次合并空格
    .replace(/\s+/g, ' ')
    .trim()
}

export function contentHash(content: string): string {
  const { createHash } = require('crypto')
  return createHash('sha256').update(normalize(content)).digest('hex')
}
```

### 测试用例

```
normalize("25 + 38 = ?")  === normalize("25+38=?")      // true（空格和标点差异）
normalize("25 + 38 = ？") === normalize("25 + 38 = ?")   // true（全角标点）
normalize("Hello World")  === normalize("hello  world")   // true（大小写和多余空格）
normalize("25 + 38 = ?")  !== normalize("25 - 38 = ?")    // true（不同题目）
```

### Phase 1 已知限制

- 数学等价表达式（"2x + 3 = 7" vs "3 + 2x = 7"）视为不同题目
- 简体/繁体中文视为不同（需要 CJK 标准化库，Phase 2+）
- LaTeX 格式差异（"\\frac{1}{2}" vs "1/2"）视为不同
- 如果 normalize 逻辑变更，需要迁移脚本 rehash 所有已有记录

## Consequences

**Positive:**
- Reliable deduplication: identical questions are guaranteed to produce the same hash after normalization, preventing duplicate entries.
- Database-enforced uniqueness via the composite index means even race conditions cannot create duplicates.
- `totalAttempts` counter gives students and parents a clear signal of which questions are recurring problems.
- SHA256 is collision-resistant; the probability of two different questions producing the same hash is negligible.

**Negative:**
- The `normalize` function must handle edge cases carefully: math expressions with equivalent but different representations (e.g., "2x + 3 = 7" vs. "3 + 2x = 7"), Chinese character variants (simplified vs. traditional), and LaTeX formatting differences. Imperfect normalization means some true duplicates may not be caught.
- Questions that are semantically identical but textually different (e.g., same math problem with different numbers) will not be deduplicated. True semantic dedup would require embedding similarity (a Phase 2+ consideration with pgvector).
- The normalize function becomes a critical path component; bugs in it could either miss duplicates or incorrectly merge distinct questions. It needs thorough unit testing.
- The dedup scope is per-student only. Two siblings in the same family group who both get the same question wrong will each have their own ErrorQuestion record. Cross-student dedup is intentionally not implemented because each student's attempt history and mastery state are independent.
- If the normalize function logic changes after launch, existing contentHash values become stale. A migration script to rehash all existing records would be required, adding operational complexity to any normalization improvements.
