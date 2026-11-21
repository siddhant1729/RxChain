import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { DB } from "./db";

export interface DocumentRecord {
  hash: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  storedName: string;
  source: string;
  uploadedAt: number;
}

interface Row {
  hash: string;
  file_id: string;
  original_name: string;
  mime_type: string;
  size: number;
  stored_name: string;
  source: string;
  uploaded_at: number;
}

const toRecord = (r: Row): DocumentRecord => ({
  hash: r.hash,
  fileId: r.file_id,
  originalName: r.original_name,
  mimeType: r.mime_type,
  size: r.size,
  storedName: r.stored_name,
  source: r.source,
  uploadedAt: r.uploaded_at,
});

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain",
  ".json": "application/json",
};

/** SHA-256 of a buffer as a 0x-prefixed bytes32 hex string (what goes on chain). */
export function sha256Hex(data: Buffer): string {
  return "0x" + createHash("sha256").update(data).digest("hex");
}

/**
 * Off-chain document store. Files live on disk under `uploadsDir`, named by their SHA-256;
 * metadata lives in SQLite. Only the hash is ever written on chain.
 */
export class DocumentStore {
  constructor(
    private readonly db: DB,
    readonly uploadsDir: string,
  ) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  save(data: Buffer, originalName: string, mimeType: string, source = "upload"): DocumentRecord {
    const hash = sha256Hex(data);
    const existing = this.get(hash);
    if (existing && fs.existsSync(this.pathOf(existing))) return existing;

    const ext = path
      .extname(originalName)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, "")
      .slice(0, 10);
    const storedName = `${hash.slice(2)}${ext}`;
    fs.writeFileSync(path.join(this.uploadsDir, storedName), data);
    const rec: DocumentRecord = {
      hash,
      fileId: existing?.fileId ?? randomUUID(),
      originalName: path.basename(originalName).slice(0, 255) || "document",
      mimeType: mimeType || "application/octet-stream",
      size: data.length,
      storedName,
      source,
      uploadedAt: Math.floor(Date.now() / 1000),
    };
    this.db
      .prepare(
        `INSERT OR REPLACE INTO documents
          (hash, file_id, original_name, mime_type, size, stored_name, source, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rec.hash,
        rec.fileId,
        rec.originalName,
        rec.mimeType,
        rec.size,
        rec.storedName,
        rec.source,
        rec.uploadedAt,
      );
    return rec;
  }

  get(hash: string): DocumentRecord | null {
    const row = this.db
      .prepare("SELECT * FROM documents WHERE hash = ?")
      .get(hash.toLowerCase()) as Row | undefined;
    return row ? toRecord(row) : null;
  }

  pathOf(rec: DocumentRecord): string {
    return path.join(this.uploadsDir, rec.storedName);
  }

  /** Imports every file of a directory (e.g. the demo CoA PDFs). Returns the number imported. */
  importDirectory(dir: string): number {
    if (!fs.existsSync(dir)) return 0;
    let n = 0;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!fs.statSync(full).isFile()) continue;
      const mime = MIME_BY_EXT[path.extname(name).toLowerCase()];
      if (!mime) continue;
      this.save(fs.readFileSync(full), name, mime, "sample");
      n++;
    }
    return n;
  }
}
