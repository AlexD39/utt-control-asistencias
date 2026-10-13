import { z } from "zod";

export const eventSchema = z.object({
  name: z.string().trim().min(3).max(180),
  venue: z.string().trim().min(2).max(180),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: z.enum(["draft", "active", "closed"])
}).refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
  message: "La fecha final debe ser posterior a la inicial"
});

export const sessionSchema = z.object({
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()).refine(
    (value) => /^[A-Z0-9][A-Z0-9_-]*$/.test(value),
    "La clave sólo puede contener letras, números, guiones y guion bajo"
  ),
  name: z.string().trim().min(3).max(180),
  room: z.string().trim().min(2).max(180),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  sessionType: z.enum(["general", "workshop", "access"]),
  capacity: z.number().int().positive().max(10_000).nullable(),
  requiresEnrollment: z.boolean(),
  consumesCredentialUse: z.boolean(),
  active: z.boolean()
}).refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
  message: "La hora final debe ser posterior a la inicial"
});
