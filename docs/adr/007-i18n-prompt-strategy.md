# ADR-007: English Prompts with Locale Variable Injection for i18n

## Status
Accepted (2026-04-08)

## Context
Star Catcher supports Chinese and English via next-intl for all UI text. AI-generated content (OCR results, help hints, subject detection labels) must also respect the user's language setting. Phase 1 defines three AI operations (`ocr-recognize`, `subject-detect`, `help-generate`), and help generation has three sub-variants (L1/L2/L3). Maintaining separate prompt template files per language would mean 3 operations x 2 languages = 6 prompt variants (or 5 x 2 = 10 counting help sub-levels), each requiring independent tuning and testing. With future language additions, this multiplies further.

## Decision
All prompt templates are written in English as the single source. Language-specific output is controlled by injecting a `{{locale}}` variable that appends an output language directive to the prompt. For example:

- When `locale = 'zh'`: the prompt includes `"Respond in Chinese (Simplified)."`
- When `locale = 'en'`: the prompt includes `"Respond in English."`

The PromptManager resolves `{{locale}}` along with other variables (`{{grade}}`, `{{subject}}`, `{{questionContent}}`, `{{studentAnswer}}`, `{{helpLevel}}`) during template rendering. The `systemMessage` and `userMessageTemplate` fields of every `PromptTemplate` are authored in English. No per-language prompt files exist.

This applies to all three operations: OCR recognition (output field names remain fixed English enum values like `MATH`, `FILL_BLANK` as defined by the Zod schema, but free-text fields like `content` follow locale), subject detection (enum output is language-independent), and help generation (the `helpText` markdown is generated in the requested language).

## Consequences

**Positive:**
- Exactly one prompt template per AI operation to maintain, test, and version. Halves the maintenance burden compared to per-language templates.
- Adding a new language (e.g., Japanese) requires no new prompt files -- only a new locale directive string and corresponding next-intl message files for UI text.
- Prompt engineering improvements apply to all languages simultaneously since there is a single template.
- Structured output (JSON keys, enum values) remains in English regardless of locale, ensuring Zod schema validation works uniformly.

**Negative:**
- AI output quality in Chinese depends entirely on the model's Chinese language capability. GPT-5.4 handles Chinese well, but a future switch to a smaller or local model may degrade Chinese output quality without dedicated Chinese prompts.
- Subtle prompt engineering for Chinese (e.g., culturally appropriate encouragement phrasing for elementary students) is harder to achieve through a locale directive alone than through a dedicated Chinese prompt.
- The locale directive is an instruction, not a guarantee. The model may occasionally mix languages or produce lower-quality Chinese for complex mathematical explanations. Monitoring AI output language accuracy is recommended.
- English subject content (per requirements) must stay in English regardless of locale. The prompt must handle this nuance, adding conditional logic to the template.

### 不支持的 Locale 降级

Phase 1 仅支持 `zh` 和 `en`。如果请求携带其他 locale（如 `es`）：
1. 记录警告日志
2. 回退到 `zh`（默认语言）
3. 返回结果携带 `fallback: true` 标记
