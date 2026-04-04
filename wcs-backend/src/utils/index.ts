import { randomUUID } from 'crypto';

// RCS-2000 enforces a maximum reqCode length of 32 characters.
// UUID v4 with dashes is 36 chars, so we strip dashes and take the first 32 hex chars.
export function generateReqCode(): string {
  return randomUUID().replace(/-/g, '').substring(0, 32);
}
