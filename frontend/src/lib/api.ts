import { API_URL } from "./config";
import type { IndexedEvent, Stats, VerifyResult } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(0, `Cannot reach the RxChain API at ${API_URL}. Is the backend running?`);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  verify: (batchId: string) => request<VerifyResult>(`/api/verify/${encodeURIComponent(batchId)}`),
  stats: () => request<Stats>("/api/stats"),
  events: (params: { batchId?: string; address?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.batchId) q.set("batchId", params.batchId);
    if (params.address) q.set("address", params.address);
    if (params.limit) q.set("limit", String(params.limit));
    return request<{ events: IndexedEvent[]; lastBlock: number }>(`/api/events?${q.toString()}`);
  },
  uploadDocument: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ hash: string; fileId: string; originalName: string; size: number }>(
      "/api/documents",
      {
        method: "POST",
        body: fd,
      },
    );
  },
  verifyDocument: (batchId: string, file: File) => {
    const fd = new FormData();
    fd.append("batchId", batchId);
    fd.append("file", file);
    return request<{
      match: boolean;
      computedHash: string;
      onChainHash: string | null;
      message: string;
    }>("/api/documents/verify", { method: "POST", body: fd });
  },
  qrPngUrl: (batchId: string, download = false) =>
    `${API_URL}/api/qr/${batchId}.png${download ? "?download" : ""}`,
  labelUrl: (batchId: string) => `${API_URL}/api/label/${batchId}`,
  documentUrl: (hash: string) => `${API_URL}/api/documents/${hash}`,
};
