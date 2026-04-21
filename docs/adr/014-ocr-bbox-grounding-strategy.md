# ADR-014: OCR bbox grounding strategy

**Status**: Accepted — 2026-04-21
**Supersedes**: none (new concern first surfaced in Sprint 17)
**Implementation target**: blocked on GPU availability; will land in a future sprint

## Context

Sprint 17 shipped the canvas UX for homework correction (`/check/[sessionId]`)
where every AI-detected question is rendered as a tappable bounding box
(`<QuestionBox>`) on the original photo. The contract is that each
`SessionQuestion.imageRegion` is a `{x, y, w, h}` percentage rectangle
produced by `recognize-homework` — the single Azure OpenAI GPT vision call
in [ADR-001](./001-ai-harness-pipeline.md)'s harness pipeline that does OCR +
grading + layout extraction in one shot.

Production testing (2026-04-21) showed the bboxes are **not usable**:

- Questions stacked in regular grid patterns that don't match the actual
  paper layout (AI is clearly inventing round-number coordinates rather
  than measuring).
- Occasional off-image bboxes (e.g. `y=100, h=12` → extends past the image
  edge).
- Two-column layouts collapsed into one, or vice-versa.

This is the well-documented GPT-4V / GPT-5 class limitation: generalist
vision-language models are trained for semantic understanding, not pixel-
level spatial grounding. Published IoU numbers for GPT-4V on grounding
tasks like RefCOCO are ~15-30%, which matches what we observe.

Prompt tuning alone cannot fix this — the model does not have a reliable
coordinate prediction head.

## Decision

**Target architecture: Qwen2.5-VL-7B served via Ollama, called from the OCR
worker as a replacement for the layout extraction part of
`recognize-homework`.**

### Why this specifically

| Requirement | Qwen2.5-VL-7B | DeepSeek-OCR | Azure Document Intelligence | Keep Azure GPT only |
|-------------|---------------|--------------|----------------------------|--------------------|
| Pixel-precise bbox output | ✅ native `<|box_start|>` grounding tokens | ✅ native `<|det|>` tokens | ✅ line-level polygons | ❌ ~20-30% IoU |
| Chinese K-12 homework (print + handwriting) | ✅ trained on CN corpora | ✅ trained on CN corpora | ✅ | — |
| Runs locally (no per-call cost, no outbound) | ✅ | ✅ | ❌ Azure call | N/A |
| Ollama-packaged (single `docker compose` service) | ✅ | ❌ (vLLM / transformers only) | N/A | N/A |
| Works on mid-range consumer GPU (≥6GB via int4) | ✅ | ⚠️ minimum 6GB int4, tight | N/A | N/A |
| Aligns with "future local model" direction in user memory | ✅ | ✅ | ❌ (stays in cloud) | — |

Qwen2.5-VL is the **sweet spot**: grounding quality close to DeepSeek-OCR,
Ollama support out-of-the-box (so one container and a REST call),
well-maintained, and the 7B fits on a single consumer GPU. DeepSeek-OCR is
a plausible fallback if Qwen2.5-VL accuracy ever regresses on a new Ollama
release — they both fit the same harness slot.

### Not chosen (and why)

- **Azure Document Intelligence**: solves the technical problem cleanly
  but locks us deeper into cloud OCR. User direction (see
  [feedback_harness_engineering.md](../../.claude/memory/…)) is to move the
  AI stack toward self-hosted. Adds per-call cost and latency in the
  meantime. Good short-term bridge; not the target.
- **PaddleOCR**: acceptable CPU-only fallback. Chinese accuracy ~75-85%
  (handwriting), no grounding per se — needs post-processing to merge
  lines into question-level bboxes. Strictly worse than Qwen2.5-VL on GPU.
  Kept in mind as the escape hatch if the target hardware never arrives.
- **YOLO / DocLayNet-style custom layout detector**: zero per-call cost
  but requires labeling 1000+ real homework photos and training +
  maintaining a model. Uneconomical at current scale.
- **vLLM instead of Ollama**: better throughput under concurrency, but
  this is a single-user inference path (one student, one photo at a
  time). Ollama's DX win (one-line model pull, REST API, Windows + Linux
  Docker support) outweighs the ~5% inference-speed gap. vLLM remains the
  upgrade if we ever need concurrent serving, or if Ollama's Qwen2.5-VL
  integration regresses on image token alignment.
- **GPT + grid-overlay prompting (Set-of-Mark)**: literature shows ~40-60%
  IoU improvement over free-form coord prompting for GPT-4V. Still
  strictly worse than a grounding-trained model and adds a pre-processing
  step. Good "bridge" option that could land before the hardware — see
  "Rollout" below.

## Rollout plan

The pipeline stays in the harness (ADR-001) — this is a provider swap, not
an architecture change.

### Phase 0 (now — no hardware) — observability only

- Keep current GPT-only `recognize-homework`.
- Add server-side bbox sanitization:
  - Clamp all coords to `[0, 100]`.
  - Detect pathological bboxes (`h > 40` or `w > 90` or off-image) and mark
    the row `needsReview = true`; the canvas should gracefully degrade
    (show a subdued hint, not a wrong rectangle).
- Add a per-operation metric: fraction of bboxes flagged pathological.
  Gives us a baseline to compare against when the new model comes online.

### Phase 1 (short-term bridge, optional) — grid-overlay prompt

If the canvas UX becomes a blocker before GPU hardware is ready:

- Install `sharp` in the worker container.
- Pre-process the homework image: overlay a 10×20 labeled grid (cells
  A1-J20) at ~20% opacity in a distinguishable color.
- Change the prompt to ask GPT for grid cell ranges (e.g. `"B3-F6"`)
  instead of free-form coordinates.
- Decode grid ranges back to `{x, y, w, h}` server-side.
- Keep the single-call flow; new prompt and new schema field, no new
  service.

Expected improvement: ~40-60% better IoU over free-form coords. Not a
substitute for a grounding model, but visibly better in day-to-day use.

### Phase 2 (target — when hardware arrives) — Qwen2.5-VL via Ollama

New service:

```yaml
# deploy/docker-compose.dev.yml additions
star-catcher-ollama:
  image: ollama/ollama:latest
  container_name: star-catcher-ollama
  volumes:
    - star-catcher-ollamadata:/root/.ollama
  ports:
    - "11434:11434"
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
  restart: unless-stopped
```

One-time model pull after container starts:

```bash
docker exec star-catcher-ollama ollama pull qwen2.5vl:7b
```

Code changes (all in `src/lib/domain/ai/`):

- **New provider** `src/lib/domain/ai/providers/ollama.ts` implementing
  the existing `AIProvider` interface (stays in the harness pipeline per
  [ADR-001](./001-ai-harness-pipeline.md)).
- **New operation** `recognize-layout` — takes image URLs, returns lines
  with pixel-precise polygons + extracted text using Qwen2.5-VL's
  grounding tokens. Dedicated schema + prompt + operation per ADR-001.
- **Refactor** `recognize-homework` into a two-call pipeline:
  1. `recognize-layout` (new Ollama provider) → layout lines with bboxes.
  2. Existing GPT call → groups lines into questions by semantic
     relationship, references lineIds instead of inventing coords.
- **Worker computes `imageRegion`** as the union polygon of referenced
  lineIds — simple geometry, no AI involved in the spatial step.

Per ADR-001 the two AI ops each keep their own schema.json + prompt +
operation wrapper; per ADR-007 prompts stay English with `{{locale}}`.

### Phase 3 — deprecate single-shot grounding

Once Phase 2 is live and evaluated against the baseline from Phase 0:

- Remove the current `imageRegion` output field from the single-call GPT
  schema.
- Keep the GPT call purely for semantic work (question grouping, grading,
  knowledge point tagging).
- Update the eval dataset (`tests/eval/datasets/recognize-homework.json`)
  to drop bbox expectations and add `recognize-layout` as a separate eval
  target.

## Consequences

**Positive**

- Canvas UX becomes actually usable — bboxes tight enough to click
  confidently.
- OCR becomes fully self-hostable (Phase 2+), aligning with the project's
  long-term local-model direction.
- Grading and layout decouple: swapping either model in the future (e.g.
  DeepSeek-OCR replacing Qwen2.5-VL, or a stronger GPT for grading)
  doesn't touch the other.
- Per-homework OCR cost drops from "cloud GPT vision" to "local GPU
  compute time" — matters as the user base grows.

**Negative**

- New operational surface: a GPU-bound container to own, model weights to
  manage (~14GB on disk for 7B fp16, ~4GB int4), Ollama version drift to
  track.
- Latency becomes a function of local hardware, not Azure's fleet.
  Acceptable trade because the single-user path doesn't need
  sub-second OCR.
- Falls back to "worse than current" if the GPU is unavailable — Phase 1
  (grid overlay) plus Phase 0 sanitization is the graceful-degradation
  strategy until hardware is in place.

## References

- Sprint 17 canvas UX — `src/app/[locale]/(dashboard)/check/[sessionId]/page.tsx`
- Current OCR pipeline — `src/lib/domain/ai/operations/recognize-homework.ts`
- Harness contract — [ADR-001](./001-ai-harness-pipeline.md)
- i18n prompt convention — [ADR-007](./007-i18n-prompt-strategy.md)
- Set-of-Mark visual prompting — Yang et al., Microsoft Research, 2023
- Qwen2.5-VL technical report — Alibaba, 2025
