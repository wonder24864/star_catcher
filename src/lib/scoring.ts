/**
 * Score calculation for homework check rounds.
 * Business rule: score = round((correctCount / totalQuestions) * 100)
 * Returns null for sessions with zero questions.
 */
export function calculateScore(
  correctCount: number,
  totalQuestions: number
): number | null {
  if (totalQuestions === 0) return null;
  return Math.round((correctCount / totalQuestions) * 100);
}
