import { EventLog, type Log } from "ethers";
import type { ChainService, DeploymentFile } from "./chain";
import type { EventStore, NewEvent } from "./eventStore";

const CHUNK = 2000;

/**
 * Backfills every RxChain event into SQLite (via contract.queryFilter) and then follows new
 * blocks. Detects redeploys (deployment key change) and chain resets (cursor block hash no
 * longer matches) and re-indexes from the deploy block in both cases.
 */
export class EventIndexer {
  private timer: NodeJS.Timeout | null = null;
  private syncing: Promise<void> | null = null;
  private stopped = true;
  private blockTimes = new Map<number, number>();
  lastError: string | null = null;

  constructor(
    private readonly chain: ChainService,
    private readonly store: EventStore,
    private readonly pollMs = 1000,
  ) {}

  static keyFor(d: DeploymentFile): string {
    return `${d.chainId}:${d.address.toLowerCase()}:${d.deployedAt}`;
  }

  start(): void {
    this.stopped = false;
    this.chain.on("deployment", this.onDeployment);
    const loop = async () => {
      if (this.stopped) return;
      await this.sync();
      if (!this.stopped) this.timer = setTimeout(loop, this.pollMs);
    };
    void loop();
  }

  stop(): void {
    this.stopped = true;
    this.chain.off("deployment", this.onDeployment);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private onDeployment = () => {
    this.blockTimes.clear();
  };

  get lastBlock(): number {
    return Number(this.store.getMeta("lastBlock") ?? -1);
  }

  /** Runs one sync pass (concurrent callers share the same pass). */
  sync(): Promise<void> {
    if (!this.syncing) {
      this.syncing = this.doSync()
        .then(() => {
          this.lastError = null;
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg !== this.lastError) console.warn(`[indexer] ${msg.split("\n")[0]}`);
          this.lastError = msg;
        })
        .finally(() => {
          this.syncing = null;
        });
    }
    return this.syncing;
  }

  private async doSync(): Promise<void> {
    const d = this.chain.deployment;
    const provider = this.chain.provider;
    if (!d || !provider) return;
    const contract = this.chain.requireContract();

    const key = EventIndexer.keyFor(d);
    if (this.store.getMeta("contractKey") !== key) {
      this.store.reset(key, d.deployBlock);
      this.blockTimes.clear();
    }

    const latest = await provider.getBlockNumber();
    let cursor = this.lastBlock;
    const cursorHash = this.store.getMeta("lastBlockHash");

    // Chain reset / reorg detection: cursor ahead of head, or cursor block hash changed.
    if (
      cursor > latest ||
      (cursorHash && cursor >= 0 && (await provider.getBlock(cursor))?.hash !== cursorHash)
    ) {
      console.warn("[indexer] chain reset detected — re-indexing from deploy block");
      this.store.reset(key, d.deployBlock);
      this.blockTimes.clear();
      cursor = d.deployBlock - 1;
    }
    if ((await provider.getCode(d.address)) === "0x") return; // not deployed on this chain (yet)

    while (cursor < latest) {
      const from = cursor + 1;
      const to = Math.min(latest, from + CHUNK - 1);
      const logs = await contract.queryFilter("*", from, to);
      const events: NewEvent[] = [];
      for (const log of logs) {
        const ev = await this.parse(log);
        if (ev) events.push(ev);
      }
      const toBlock = await provider.getBlock(to);
      this.store.insertBatch(events, to, toBlock?.hash ?? "");
      cursor = to;
    }
  }

  private async timestampOf(blockNumber: number): Promise<number> {
    const cached = this.blockTimes.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await this.chain.requireProvider().getBlock(blockNumber);
    const ts = block?.timestamp ?? 0;
    this.blockTimes.set(blockNumber, ts);
    return ts;
  }

  private async parse(log: Log | EventLog): Promise<NewEvent | null> {
    if (!(log instanceof EventLog)) return null; // not an RxChain ABI event
    const args: NewEvent["args"] = {};
    const addresses: string[] = [];
    log.fragment.inputs.forEach((input, i) => {
      const v: unknown = log.args[i];
      let out: string | number | boolean;
      if (typeof v === "bigint") out = input.type === "uint8" ? Number(v) : v.toString();
      else if (typeof v === "boolean" || typeof v === "number") out = v;
      else out = String(v);
      args[input.name || `arg${i}`] = out;
      if (input.type === "address") addresses.push(String(v));
    });
    const batchId = log.fragment.inputs.some((i) => i.name === "id" && i.type === "bytes32")
      ? String(args.id)
      : null;
    return {
      blockNumber: log.blockNumber,
      logIndex: log.index,
      txHash: log.transactionHash,
      name: log.eventName,
      batchId,
      addresses,
      args,
      timestamp: await this.timestampOf(log.blockNumber),
    };
  }
}
