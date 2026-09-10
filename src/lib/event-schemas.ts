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
  name: z.string().trim().min(3).max(180),
  room: z.string().trim().min(2).max(180),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  active: z.boolean()
}).refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
  message: "La hora final debe ser posterior a la inicial"
});
