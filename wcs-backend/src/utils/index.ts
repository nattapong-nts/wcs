import { randomUUID } from 'crypto';

// RCS-2000 enforces a maximum reqCode length of 32 characters.
// UUID v4 with dashes is 36 chars, so we strip dashes and take the first 32 hex chars.
export function generateReqCode(): string {
  return randomUUID().replace(/-/g, '').substring(0, 32);
}

/**
 * Parses a position string like "012000AA012000" into { x, mapCode, y }.
 * Expects format: 6 digits + 2 uppercase letters + 6 digits.
 */
function parsePosition(
  pos: string,
): { x: number; mapCode: string; y: number } | null {
  const match = pos.match(/^(\d{6})([A-Z]{2})(\d{6})$/);
  if (!match) return null;
  return {
    x: parseInt(match[1], 10),
    mapCode: match[2],
    y: parseInt(match[3], 10),
  };
}

/**
 * Returns true when the AGV's reported posX/posY are within `tolerance` units
 * of the target position string (e.g. "012000AA012000").
 * Leading zeros in posX/posY are padded automatically before comparison.
 */
export function isAtPosition(
  posX: string,
  posY: string,
  target: string,
  tolerance: number,
): boolean {
  const parsed = parsePosition(target);
  if (!parsed) return false;
  const agvX = parseInt(posX.padStart(6, '0'), 10);
  const agvY = parseInt(posY.padStart(6, '0'), 10);
  return (
    Math.abs(agvX - parsed.x) <= tolerance &&
    Math.abs(agvY - parsed.y) <= tolerance
  );
}
