export function shortAddress(a: string | null | undefined, chars = 4): string {
  if (!a) return "—";
  return `${a.slice(0, 2 + chars)}…${a.slice(-chars)}`;
}

export function shortHash(h: string, chars = 6): string {
  return `${h.slice(0, 2 + chars)}…${h.slice(-chars)}`;
}

export function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(unix: number, now = Date.now() / 1000): string {
  const s = Math.round(now - unix);
  if (s < 0) return formatDateTime(unix);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return formatDate(unix);
}

/** yyyy-mm-dd (local) → unix seconds at local midnight. */
export function dateInputToUnix(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
}

export function unixToDateInput(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatNumber(n: string | number): string {
  return Number(n).toLocaleString("en-IN");
}

export const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());
export const isBatchId = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s.trim());

/** Pulls a batch ID out of scanned QR text: a /verify/<id> URL or a bare 0x…64-hex ID. */
export function extractBatchId(text: string): string | null {
  const t = text.trim();
  const m = /(0x[0-9a-fA-F]{64})(?![0-9a-fA-F])/.exec(t);
  return m ? m[1].toLowerCase() : null;
}
