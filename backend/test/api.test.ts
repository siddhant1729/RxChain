import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createContext } from "../src/context";
import { sha256Hex } from "../src/services/documents";
import { CONTRACT_FILE, TEST_DOC, TEST_RPC_URL, readFixture, type Fixture } from "./helpers";

let app: Express;
let ctx: ReturnType<typeof createContext>;
let fx: Fixture;
let uploadsDir: string;

beforeAll(async () => {
  fx = readFixture();
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxchain-uploads-"));
  const config = loadConfig({
    RPC_URL: TEST_RPC_URL,
    CONTRACT_FILE,
    DATABASE_FILE: ":memory:",
    UPLOADS_DIR: uploadsDir,
    PUBLIC_APP_URL: "http://rxchain.test",
    INDEXER_POLL_MS: "200",
  });
  ctx = createContext(config);
  await ctx.indexer.sync();
  app = createApp(ctx, { logging: false });
});

afterAll(() => {
  ctx.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe("GET /api/health", () => {
  it("reports chain and indexer status", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.chain.rpcReachable).toBe(true);
    expect(res.body.chain.contractDeployed).toBe(true);
    expect(res.body.chain.chainId).toBe(31337);
    expect(res.body.indexer.events).toBeGreaterThan(0);
  });
});

describe("GET /api/verify/:batchId", () => {
  it("returns GENUINE with batch, ordered history, tx hashes and participant names", async () => {
    const res = await request(app).get(`/api/verify/${fx.ids.genuine}`).expect(200);
    expect(res.body.verdict).toBe("GENUINE");
    expect(res.body.batch.drugName).toBe("Drug G-1");
    expect(res.body.batch.status).toBe("Delivered");
    expect(res.body.batch.docHash).toBe(fx.docHash);
    expect(res.body.batch.pendingOwner).toBeNull();
    expect(res.body.history.map((h: { eventType: string }) => h.eventType)).toEqual([
      "Created",
      "TransferInitiated",
      "TransferConfirmed",
      "TransferInitiated",
      "TransferConfirmed",
    ]);
    for (const h of res.body.history) expect(h.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(res.body.participants[fx.addresses.manufacturer].name).toBe("Test Pharma Mfg");
    expect(res.body.participants[fx.addresses.pharmacy].role).toBe("Pharmacy");
    expect(res.body.participants[fx.addresses.distributor].name).toBe("Test Distributor");
  });

  it("returns IN_SUPPLY_CHAIN for a batch held by a distributor", async () => {
    const res = await request(app).get(`/api/verify/${fx.ids.inSupplyChain}`).expect(200);
    expect(res.body.verdict).toBe("IN_SUPPLY_CHAIN");
  });

  it("returns IN_SUPPLY_CHAIN with a pending owner for a batch in transit", async () => {
    const res = await request(app).get(`/api/verify/${fx.ids.pending}`).expect(200);
    expect(res.body.verdict).toBe("IN_SUPPLY_CHAIN");
    expect(res.body.batch.status).toBe("InTransit");
    expect(res.body.batch.pendingOwner).toBe(fx.addresses.distributor);
  });

  it("returns RECALLED with the recall reason", async () => {
    const res = await request(app).get(`/api/verify/${fx.ids.recalled}`).expect(200);
    expect(res.body.verdict).toBe("RECALLED");
    expect(res.body.reason).toContain("Contamination detected in QC");
    expect(res.body.batch.recallReason).toBe("Contamination detected in QC");
  });

  it("returns EXPIRED after the expiry date", async () => {
    const res = await request(app).get(`/api/verify/${fx.ids.expired}`).expect(200);
    expect(res.body.verdict).toBe("EXPIRED");
  });

  it("returns COUNTERFEIT for an unknown well-formed ID", async () => {
    const res = await request(app)
      .get(`/api/verify/0x${"ab".repeat(32)}`)
      .expect(200);
    expect(res.body.verdict).toBe("COUNTERFEIT");
    expect(res.body.reason).toBe("Batch ID not found on chain");
    expect(res.body.batch).toBeNull();
    expect(res.body.history).toEqual([]);
  });

  it.each(["garbage", "0x1234", `0x${"zz".repeat(32)}`, `${"ab".repeat(32)}`])(
    "returns COUNTERFEIT (not 500) for malformed ID %s",
    async (id) => {
      const res = await request(app).get(`/api/verify/${id}`).expect(200);
      expect(res.body.verdict).toBe("COUNTERFEIT");
      expect(res.body.reason).toMatch(/Malformed/);
    },
  );

  it("accepts upper-case hex IDs", async () => {
    const upper = "0x" + fx.ids.genuine.slice(2).toUpperCase();
    const res = await request(app).get(`/api/verify/${upper}`).expect(200);
    expect(res.body.verdict).toBe("GENUINE");
  });
});

describe("GET /api/qr/:batchId.(png|svg)", () => {
  it("returns a PNG QR that encodes the public verify URL", async () => {
    const res = await request(app).get(`/api/qr/${fx.ids.genuine}.png`).expect(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-verify-url"]).toBe(`http://rxchain.test/verify/${fx.ids.genuine}`);
    expect((res.body as Buffer).subarray(1, 4).toString()).toBe("PNG");
  });

  it("returns an SVG QR", async () => {
    const res = await request(app).get(`/api/qr/${fx.ids.genuine}.svg`).expect(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    const svg = res.text || Buffer.from(res.body as Buffer).toString("utf8");
    expect(svg).toContain("<svg");
  });

  it("sets a download filename when ?download is passed", async () => {
    const res = await request(app).get(`/api/qr/${fx.ids.genuine}.png?download`).expect(200);
    expect(res.headers["content-disposition"]).toContain("rxchain-G-1.png");
  });

  it("404s for unknown batches and 400s for bad IDs or extensions", async () => {
    await request(app)
      .get(`/api/qr/0x${"cd".repeat(32)}.png`)
      .expect(404);
    await request(app).get(`/api/qr/nothex.png`).expect(400);
    await request(app).get(`/api/qr/${fx.ids.genuine}.gif`).expect(400);
  });
});

describe("GET /api/label/:batchId", () => {
  it("renders a printable HTML label", async () => {
    const res = await request(app).get(`/api/label/${fx.ids.genuine}`).expect(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Drug G-1");
    expect(res.text).toContain("G-1");
    expect(res.text).toContain("Test Pharma Mfg");
    expect(res.text).toContain("<svg");
    expect(res.text).toContain("window.print()");
  });

  it("404s for unknown batches", async () => {
    await request(app)
      .get(`/api/label/0x${"ef".repeat(32)}`)
      .expect(404);
  });
});

describe("documents", () => {
  it("POST /api/documents stores the file and returns its SHA-256", async () => {
    const res = await request(app)
      .post("/api/documents")
      .attach("file", TEST_DOC, { filename: "coa.txt", contentType: "text/plain" })
      .expect(201);
    expect(res.body.hash).toBe(fx.docHash);
    expect(res.body.hash).toBe(sha256Hex(TEST_DOC));
    expect(res.body.fileId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fs.readdirSync(uploadsDir)).toContain(`${fx.docHash.slice(2)}.txt`);
  });

  it("is idempotent for the same content", async () => {
    const a = await request(app).post("/api/documents").attach("file", TEST_DOC, "coa.txt");
    const b = await request(app).post("/api/documents").attach("file", TEST_DOC, "again.txt");
    expect(a.body.fileId).toBe(b.body.fileId);
  });

  it("GET /api/documents/:hash returns the original bytes", async () => {
    const res = await request(app).get(`/api/documents/${fx.docHash}`).buffer(true).expect(200);
    expect(res.headers["x-content-sha256"]).toBe(fx.docHash);
    expect(Buffer.from(res.text ?? res.body).equals(TEST_DOC)).toBe(true);
  });

  it("GET /api/documents/:hash/meta returns metadata", async () => {
    const res = await request(app).get(`/api/documents/${fx.docHash}/meta`).expect(200);
    expect(res.body.originalName).toBe("coa.txt");
    expect(res.body.size).toBe(TEST_DOC.length);
  });

  it("GET /api/documents/:hash 404s for unknown and 400s for malformed hashes", async () => {
    await request(app)
      .get(`/api/documents/0x${"11".repeat(32)}`)
      .expect(404);
    await request(app).get(`/api/documents/xyz`).expect(400);
  });

  it("POST /api/documents requires a file", async () => {
    await request(app).post("/api/documents").expect(400);
  });

  it("POST /api/documents/verify matches the untampered document", async () => {
    const res = await request(app)
      .post("/api/documents/verify")
      .field("batchId", fx.ids.genuine)
      .attach("file", TEST_DOC, "coa.txt")
      .expect(200);
    expect(res.body.match).toBe(true);
    expect(res.body.computedHash).toBe(fx.docHash);
    expect(res.body.onChainHash).toBe(fx.docHash);
  });

  it("POST /api/documents/verify detects a tampered document", async () => {
    const tampered = Buffer.from(TEST_DOC.toString().replace("99.8", "89.8"));
    const res = await request(app)
      .post("/api/documents/verify")
      .field("batchId", fx.ids.genuine)
      .attach("file", tampered, "coa.txt")
      .expect(200);
    expect(res.body.match).toBe(false);
    expect(res.body.message).toMatch(/does NOT match/);
  });

  it("POST /api/documents/verify reports batches without a doc hash", async () => {
    const res = await request(app)
      .post("/api/documents/verify")
      .field("batchId", fx.ids.inSupplyChain)
      .attach("file", TEST_DOC, "coa.txt")
      .expect(200);
    expect(res.body.match).toBe(false);
    expect(res.body.onChainHash).toBeNull();
  });

  it("POST /api/documents/verify validates input", async () => {
    await request(app)
      .post("/api/documents/verify")
      .field("batchId", "bad")
      .attach("file", TEST_DOC, "coa.txt")
      .expect(400);
    await request(app)
      .post("/api/documents/verify")
      .field("batchId", `0x${"22".repeat(32)}`)
      .attach("file", TEST_DOC, "coa.txt")
      .expect(404);
    await request(app).post("/api/documents/verify").field("batchId", fx.ids.genuine).expect(400);
  });

  it("rejects files over the size limit with 413", async () => {
    const big = Buffer.alloc(ctx.config.maxUploadBytes + 1, 1);
    await request(app).post("/api/documents").attach("file", big, "big.bin").expect(413);
  });
});

describe("GET /api/stats", () => {
  it("returns totals by status, participants by role and recent events", async () => {
    const res = await request(app).get("/api/stats").expect(200);
    expect(res.body.batches.total).toBe(5);
    expect(res.body.batches.byStatus).toEqual({
      Created: 2, // S-1 (held by distributor) and E-1 (expired, still with manufacturer)
      InTransit: 1,
      Delivered: 1,
      Recalled: 1,
    });
    expect(res.body.batches.expired).toBe(1);
    expect(res.body.participants.byRole).toEqual({
      Manufacturer: 1,
      Distributor: 2,
      Pharmacy: 1,
      Regulator: 1,
    });
    expect(res.body.participants.total).toBe(5);
    expect(res.body.paused).toBe(false);
    expect(res.body.recentEvents.length).toBeGreaterThan(0);
    expect(res.body.recentEvents[0].blockNumber).toBeGreaterThanOrEqual(
      res.body.recentEvents[res.body.recentEvents.length - 1].blockNumber,
    );
  });
});

describe("GET /api/events", () => {
  it("returns the indexed activity feed newest first", async () => {
    const res = await request(app).get("/api/events").expect(200);
    expect(res.body.count).toBeGreaterThan(10);
    const names = res.body.events.map((e: { name: string }) => e.name);
    expect(names).toContain("ParticipantRegistered");
    expect(names).toContain("BatchCreated");
    expect(names).toContain("BatchRecalled");
  });

  it("filters by batchId", async () => {
    const res = await request(app).get(`/api/events?batchId=${fx.ids.genuine}`).expect(200);
    expect(res.body.events.map((e: { name: string }) => e.name).reverse()).toEqual([
      "BatchCreated",
      "TransferInitiated",
      "TransferConfirmed",
      "TransferInitiated",
      "TransferConfirmed",
    ]);
  });

  it("filters by address (from or to)", async () => {
    const res = await request(app).get(`/api/events?address=${fx.addresses.pharmacy}`).expect(200);
    expect(res.body.count).toBeGreaterThan(0);
    for (const e of res.body.events) {
      expect(e.addresses).toContain(fx.addresses.pharmacy.toLowerCase());
    }
  });

  it("supports limit and ignores empty params", async () => {
    const res = await request(app).get(`/api/events?batchId=&address=&limit=2`).expect(200);
    expect(res.body.events).toHaveLength(2);
  });

  it("validates query params", async () => {
    await request(app).get(`/api/events?batchId=nope`).expect(400);
    await request(app).get(`/api/events?address=0x123`).expect(400);
    await request(app).get(`/api/events?limit=0`).expect(400);
  });
});

describe("misc", () => {
  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist").expect(404);
    expect(res.body.error).toMatch(/not found/);
  });

  it("sets security headers and CORS", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://example.com");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});
