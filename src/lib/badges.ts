import { randomBytes } from "node:crypto";

export function generateBadgeCode() {
  return `UTT-${randomBytes(12).toString("hex").toUpperCase()}`;
}
