# ADR-004: Three-Level Progressive Help with Answer-Change Gating

## Status
Accepted (2026-04-08)

## Context
Star Catcher serves K-12 students across elementary, middle, and high school. The core educational philosophy is that students should genuinely attempt to solve problems before receiving answers. A simple "show answer" button would undermine learning by encouraging shortcut behavior. At the same time, students who are truly stuck need scaffolded assistance. Parents also want control over how much help their child can access, with different expectations by grade level.

## Decision
Implement a three-level progressive help system with answer-change gating:

- **Level 1 (Thinking Direction)**: Identifies the knowledge point and suggests an approach direction. No calculation steps, no answer. AI prompt uses encouraging tone calibrated to the student's grade.
- **Level 2 (Key Steps)**: Provides a step-by-step framework for solving the problem, but omits the final calculation result. AI prompt uses guiding tone.
- **Level 3 (Full Solution)**: Complete worked solution with the correct answer and explanations appropriate to grade level.

**Gating rule**: Each level requires the student to submit at least one new answer attempt before the next level unlocks. A student cannot jump from L1 to L3 without trying again after receiving L1.

**Parent controls**: Parents configure a maximum help level per student via `ParentStudentConfig.maxHelpLevel`. Defaults follow grade bands -- elementary defaults to max Level 2 (adjustable to 1 or 3), middle and high school default to max Level 3. Settings take effect immediately.

**Caching**: Help responses are cached in the `HelpRequest` table. Requesting the same question at the same level returns the stored `aiResponse` without a second AI call.

## Consequences

**Positive:**
- Pedagogically sound: students must engage with the problem at each stage before escalating, building problem-solving habits.
- Parent control respects family preferences; a parent who wants their elementary child to struggle more can set max Level 1.
- Grade-calibrated AI prompts ensure explanations match cognitive development (e.g., simpler language for PRIMARY_3 vs. SENIOR_2).
- Help usage is fully tracked (level, timestamp, which question) and visible to parents on the session timeline, enabling informed conversations about study habits.

**Negative:**
- More complex UX flow: the frontend must track per-question help state, enforce gating, and show appropriate unlock messaging. This is more work than a single "reveal answer" button.
- Three distinct prompt templates (L1/L2/L3) per the `help-generate` operation must be maintained and tuned for quality across grade levels.
- Students may find the gating frustrating, especially younger ones who want immediate answers. The UI must clearly communicate why the next level is locked and what action is needed.
- Edge case: if a student submits the same wrong answer repeatedly to unlock higher levels, the system does not currently detect this pattern (potential Phase 2 enhancement).
