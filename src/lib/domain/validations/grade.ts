/**
 * Single source of truth for the Grade enum.
 *
 * Before this module, the 12 grade codes were declared inline in 10 places
 * (register form, settings, several tRPC routers, GradeSwitcherDialog, etc.).
 * That made it easy to add a new grade in one place and forget another.
 *
 * Shape mirrors Prisma's Grade enum exactly — if schema.prisma grows a new
 * code, update the `GRADES` tuple below and every consumer picks it up via
 * zod / TS narrowing.
 */
import { z } from "zod";

export const GRADES = [
  "PRIMARY_1", "PRIMARY_2", "PRIMARY_3", "PRIMARY_4", "PRIMARY_5", "PRIMARY_6",
  "JUNIOR_1",  "JUNIOR_2",  "JUNIOR_3",
  "SENIOR_1",  "SENIOR_2",  "SENIOR_3",
] as const;

export type Grade = (typeof GRADES)[number];

/** Zod schema for input validation. Matches Prisma's Grade enum. */
export const gradeEnum = z.enum(GRADES);
