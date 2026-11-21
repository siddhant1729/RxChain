import { z } from "zod";

export const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const bytes32 = z.string().regex(BYTES32_RE, "must be 0x followed by 64 hex characters");
export const address = z.string().regex(ADDRESS_RE, "must be a 0x-prefixed 20-byte address");

export function isBytes32(v: string): boolean {
  return BYTES32_RE.test(v);
}
