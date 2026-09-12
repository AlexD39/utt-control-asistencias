import type { SessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function hasEventAccess(user: SessionUser, eventId: string) {
  if (user.role === "super_admin") return true;
  const result = await query("SELECT 1 FROM event_staff WHERE event_id = $1 AND user_id = $2", [eventId, user.id]);
  return result.rowCount === 1;
}

export async function canManageEvent(user: SessionUser, eventId: string) {
  return user.role === "super_admin" || (user.role === "event_admin" && await hasEventAccess(user, eventId));
}
