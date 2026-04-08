// Mock for @/lib/db — avoids loading Prisma in Vitest unit tests
// Actual db is injected via mock context in tests
export const db = {} as never;
