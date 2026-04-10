import { z } from "zod";

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
  grade: z
    .enum([
      "PRIMARY_1", "PRIMARY_2", "PRIMARY_3", "PRIMARY_4", "PRIMARY_5", "PRIMARY_6",
      "JUNIOR_1", "JUNIOR_2", "JUNIOR_3",
      "SENIOR_1", "SENIOR_2", "SENIOR_3",
    ])
    .optional(),
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
