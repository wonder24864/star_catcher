import { z } from "zod";
import { gradeEnum } from "./grade";

export const usernameSchema = z
  .string()
  .min(4)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/);

export const passwordSchema = z
  .string()
  .min(8)
  .regex(/[a-zA-Z]/)
  .regex(/[0-9]/);

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  nickname: z.string().min(1).max(32),
  role: z.enum(["STUDENT", "PARENT"]),
  grade: gradeEnum.optional(),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
}).refine((data) => data.role !== "STUDENT" || data.grade, {
  path: ["grade"],
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
