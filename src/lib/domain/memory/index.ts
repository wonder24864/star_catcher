/**
 * Student Memory Layer
 *
 * The sole write gateway for student learning state.
 * Agent/Skill access via IPC: ctx.readMemory / ctx.writeMemory.
 *
 * See: docs/adr/010-student-memory-layer.md
 */
export { StudentMemoryImpl } from "./student-memory";
export {
  MASTERY_TRANSITIONS,
  InvalidTransitionError,
  OptimisticLockError,
} from "./types";
export type {
  StudentMemory,
  MasteryStatus,
  MasteryTransition,
  MasteryStateView,
  ReviewScheduleView,
  ReviewResult,
  InterventionKind,
  InterventionRecord,
} from "./types";
