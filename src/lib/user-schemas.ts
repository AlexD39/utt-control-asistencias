import { z } from "zod";

export const roleSchema = z.enum(["super_admin", "event_admin", "scanner", "viewer"]);

export const userSchema = z.object({
  name: z.string().trim().min(3).max(150),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  role: roleSchema,
  active: z.boolean()
});

export const passwordSchema = z.string().min(8).max(100)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "La contraseña debe incluir letras y números");

export const createUserSchema = userSchema.extend({ password: passwordSchema });
