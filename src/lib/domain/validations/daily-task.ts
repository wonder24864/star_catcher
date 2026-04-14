import { z } from "zod";

export const todayTasksSchema = z.object({
  studentId: z.string().min(1).optional(),
});

export const completeTaskSchema = z.object({
  taskId: z.string().min(1),
});

export const taskHistorySchema = z.object({
  studentId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(30).default(7),
});
