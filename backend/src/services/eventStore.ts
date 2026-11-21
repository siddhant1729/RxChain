import type { DB } from "./db";
import type { IndexedEventDTO } from "../types";

export interface NewEvent {
  blockNumber: number;
  logIndex: number;
  txHash: string;
  name: string;
  batchId: string | null;
  addresses: string[];
  args: Record<string, string | number | boolean>;
  timestamp: number;
}

interface EventRow {
  id: number;
  block_number: number;
  log_index: number;
  tx_hash: string;
  name: string;
  batch_id: string | null;
  addr1: string | null;
  addr2: string | null;
  args: string;
  timestamp: number;
}

function toDTO(r: EventRow): IndexedEventDTO {
  return {
    id: r.id,
    blockNumber: r.block_number,
    logIndex: r.log_index,
    txHash: r.tx_hash,
    name: r.name,
    batchId: r.batch_id,
    addresses: [r.addr1, r.addr2].filter((a): a is string => !!a),
    args: JSON.parse(r.args) as IndexedEventDTO["args"],
    timestamp: r.timestamp,
  };
}

/** SQLite-backed store of indexed contract events plus indexer metadata. */
export class EventStore {
  constructor(private readonly db: DB) {}

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  /** Inserts events and advances the sync cursor atomically. */
  insertBatch(events: NewEvent[], lastBlock: number, lastBlockHash: string): void {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO events
        (block_number, log_index, tx_hash, name, batch_id, addr1, addr2, args, timestamp)
       VALUES (@blockNumber, @logIndex, @txHash, @name, @batchId, @addr1, @addr2, @args, @timestamp)`,
    );
    const tx = this.db.transaction(() => {
      for (const e of events) {
        insert.run({
          blockNumber: e.blockNumber,
          logIndex: e.logIndex,
          txHash: e.txHash,
          name: e.name,
          batchId: e.batchId?.toLowerCase() ?? null,
          addr1: e.addresses[0]?.toLowerCase() ?? null,
          addr2: e.addresses[1]?.toLowerCase() ?? null,
          args: JSON.stringify(e.args),
          timestamp: e.timestamp,
        });
      }
      this.setMeta("lastBlock", String(lastBlock));
      this.setMeta("lastBlockHash", lastBlockHash);
    });
    tx();
  }

  reset(contractKey: string, startBlock: number): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM events").run();
      this.setMeta("contractKey", contractKey);
      this.setMeta("lastBlock", String(startBlock - 1));
      this.setMeta("lastBlockHash", "");
    });
    tx();
  }

  query(opts: {
    batchId?: string;
    address?: string;
    name?: string;
    limit?: number;
  }): IndexedEventDTO[] {
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    if (opts.batchId) {
      where.push("batch_id = @batchId");
      params.batchId = opts.batchId.toLowerCase();
    }
    if (opts.address) {
      where.push("(addr1 = @address OR addr2 = @address)");
      params.address = opts.address.toLowerCase();
    }
    if (opts.name) {
      where.push("name = @name");
      params.name = opts.name;
    }
    params.limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    const sql = `SELECT * FROM events ${where.length ? "WHERE " + where.join(" AND ") : ""}
                 ORDER BY block_number DESC, log_index DESC LIMIT @limit`;
    return (this.db.prepare(sql).all(params) as EventRow[]).map(toDTO);
  }

  /** All events of one batch in chronological order. */
  forBatch(batchId: string): IndexedEventDTO[] {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE batch_id = ? ORDER BY block_number ASC, log_index ASC")
      .all(batchId.toLowerCase()) as EventRow[];
    return rows.map(toDTO);
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
  }
}
