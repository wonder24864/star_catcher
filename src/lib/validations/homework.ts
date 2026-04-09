import { z } from "zod";

export const createSessionSchema = z.object({
  studentId: z.string().min(1),
});

export const getSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export const listSessionsSchema = z.object({
  studentId: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
});

export const updateImageOrderSchema = z.object({
  sessionId: z.string().min(1),
  imageIds: z.array(z.string().min(1)).min(1).max(10),
});

export const deleteSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type GetSessionInput = z.infer<typeof getSessionSchema>;
export type ListSessionsInput = z.infer<typeof listSessionsSchema>;
export type UpdateImageOrderInput = z.infer<typeof updateImageOrderSchema>;
