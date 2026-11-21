import path from "node:path";
import { z } from "zod";

const BACKEND_ROOT = path.resolve(__dirname, "..");

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  RPC_URL: z.string().url().default("http://127.0.0.1:8545"),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGIN: z.string().default("*"),
  CONTRACT_FILE: z.string().optional(),
  DATABASE_FILE: z.string().default("./data/rxchain.db"),
  UPLOADS_DIR: z.string().default("./uploads"),
  SAMPLES_DIR: z.string().default("../samples"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
  INDEXER_POLL_MS: z.coerce.number().int().positive().default(1000),
});

export interface AppConfig {
  port: number;
  rpcUrl: string;
  publicAppUrl: string;
  corsOrigin: string | string[];
  contractFile: string;
  databaseFile: string;
  uploadsDir: string;
  samplesDir: string;
  maxUploadBytes: number;
  indexerPollMs: number;
}

/** Resolves a path relative to the backend package root (so cwd does not matter). */
function fromRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(BACKEND_ROOT, p);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Treat empty strings in .env as "unset" so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const e = EnvSchema.parse(cleaned);
  return {
    port: e.PORT,
    rpcUrl: e.RPC_URL,
    publicAppUrl: e.PUBLIC_APP_URL.replace(/\/+$/, ""),
    corsOrigin: e.CORS_ORIGIN === "*" ? "*" : e.CORS_ORIGIN.split(",").map((s) => s.trim()),
    contractFile: fromRoot(e.CONTRACT_FILE ?? "src/contracts/RxChain.json"),
    databaseFile: e.DATABASE_FILE === ":memory:" ? ":memory:" : fromRoot(e.DATABASE_FILE),
    uploadsDir: fromRoot(e.UPLOADS_DIR),
    samplesDir: fromRoot(e.SAMPLES_DIR),
    maxUploadBytes: Math.round(e.MAX_UPLOAD_MB * 1024 * 1024),
    indexerPollMs: e.INDEXER_POLL_MS,
  };
}
