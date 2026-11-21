import fs from "node:fs";
import { EventEmitter } from "node:events";
import { Contract, JsonRpcProvider, Network, ZeroAddress, ZeroHash, type Result } from "ethers";
import { HttpError } from "../lib/errors";
import {
  EVENT_TYPE_NAMES,
  ROLE_NAMES,
  STATUS_NAMES,
  VERDICT_NAMES,
  type BatchDTO,
  type ParticipantDTO,
  type VerdictName,
} from "../types";

export interface DeploymentFile {
  address: string;
  chainId: number;
  deployBlock: number;
  deployedAt: string;
  abi: unknown[];
}

export interface RawCustodyEvent {
  from: string | null;
  to: string | null;
  eventType: (typeof EVENT_TYPE_NAMES)[number];
  timestamp: number;
  note: string;
}

const nullIfZero = (a: string) => (a === ZeroAddress ? null : a);

function toParticipant(r: Result): ParticipantDTO {
  return {
    address: r.account as string,
    role: ROLE_NAMES[Number(r.role)],
    name: r.name as string,
    licenseId: r.licenseId as string,
    location: r.location as string,
    active: r.active as boolean,
    registeredAt: Number(r.registeredAt),
  };
}

function toBatch(r: Result): BatchDTO {
  return {
    id: r.id as string,
    drugName: r.drugName as string,
    batchNumber: r.batchNumber as string,
    manufacturerName: r.manufacturerName as string,
    mfgDate: Number(r.mfgDate),
    expiryDate: Number(r.expiryDate),
    quantity: (r.quantity as bigint).toString(),
    manufacturer: r.manufacturer as string,
    currentOwner: r.currentOwner as string,
    pendingOwner: nullIfZero(r.pendingOwner as string),
    status: STATUS_NAMES[Number(r.status)],
    docHash: r.docHash === ZeroHash ? null : (r.docHash as string),
    recallReason: r.recallReason as string,
    createdAt: Number(r.createdAt),
  };
}

/**
 * Read-only access to the RxChain contract. The backend never holds participant keys.
 * Emits "deployment" whenever the generated deployment file changes (e.g. after a redeploy).
 */
export class ChainService extends EventEmitter {
  provider: JsonRpcProvider | null = null;
  private contract: Contract | null = null;
  deployment: DeploymentFile | null = null;
  private watching = false;

  constructor(
    private readonly rpcUrl: string,
    private readonly contractFile: string,
    private readonly pollingInterval = 1000,
  ) {
    super();
  }

  /** (Re)reads the deployment file. Returns true if the deployment changed. */
  loadDeployment(): boolean {
    if (!fs.existsSync(this.contractFile)) return false;
    let next: DeploymentFile;
    try {
      next = JSON.parse(fs.readFileSync(this.contractFile, "utf8")) as DeploymentFile;
    } catch {
      return false; // partially written file; the watcher will fire again
    }
    if (!next.address || !Array.isArray(next.abi)) return false;
    const prev = this.deployment;
    const changed =
      !prev ||
      prev.address !== next.address ||
      prev.chainId !== next.chainId ||
      prev.deployedAt !== next.deployedAt;
    if (!changed) return false;

    if (!this.provider || prev?.chainId !== next.chainId) {
      this.provider?.destroy();
      this.provider = new JsonRpcProvider(this.rpcUrl, Network.from(next.chainId), {
        staticNetwork: true,
        pollingInterval: this.pollingInterval,
      });
    }
    this.deployment = next;
    this.contract = new Contract(next.address, next.abi as never[], this.provider);
    this.emit("deployment", next);
    return true;
  }

  /** Watches the deployment file so a redeploy is picked up without restarting. */
  watch(): void {
    if (this.watching) return;
    this.watching = true;
    fs.watchFile(this.contractFile, { interval: 1000 }, () => {
      if (this.loadDeployment()) {
        console.log(`[chain] deployment changed → ${this.deployment?.address}`);
      }
    });
  }

  close(): void {
    if (this.watching) fs.unwatchFile(this.contractFile);
    this.watching = false;
    this.provider?.destroy();
    this.provider = null;
    this.contract = null;
  }

  requireContract(): Contract {
    if (!this.contract) {
      throw new HttpError(503, "Contract not deployed yet — run `npm run deploy`.");
    }
    return this.contract;
  }

  requireProvider(): JsonRpcProvider {
    if (!this.provider) throw new HttpError(503, "Chain provider not configured.");
    return this.provider;
  }

  private async call<T = Result>(fn: string, ...args: unknown[]): Promise<T> {
    const c = this.requireContract();
    try {
      return (await c.getFunction(fn).staticCall(...args)) as T;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "ECONNREFUSED" || code === "NETWORK_ERROR" || code === "TIMEOUT") {
        throw new HttpError(503, "Blockchain node unreachable", { rpc: this.rpcUrl });
      }
      if (code === "BAD_DATA" || code === "CALL_EXCEPTION") {
        throw new HttpError(503, "Contract not found at the configured address — redeploy?");
      }
      const msg = (err as Error).message ?? "";
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
        throw new HttpError(503, "Blockchain node unreachable", { rpc: this.rpcUrl });
      }
      throw err;
    }
  }

  async status() {
    const out = {
      rpcUrl: this.rpcUrl,
      rpcReachable: false,
      chainId: this.deployment?.chainId ?? null,
      blockNumber: null as number | null,
      contract: this.deployment?.address ?? null,
      contractDeployed: false,
    };
    if (!this.provider || !this.deployment) return out;
    try {
      out.blockNumber = await this.provider.getBlockNumber();
      out.rpcReachable = true;
      out.contractDeployed = (await this.provider.getCode(this.deployment.address)) !== "0x";
    } catch {
      /* unreachable node is reported via rpcReachable=false */
    }
    return out;
  }

  async chainTime(): Promise<number> {
    const block = await this.requireProvider().getBlock("latest");
    return block?.timestamp ?? Math.floor(Date.now() / 1000);
  }

  async verify(id: string): Promise<{ verdict: VerdictName; reason: string }> {
    const r = await this.call("verifyBatch", id);
    return { verdict: VERDICT_NAMES[Number(r[0])], reason: r[1] as string };
  }

  async getBatch(id: string): Promise<BatchDTO | null> {
    const r = await this.call("getBatch", id);
    return r.exists ? toBatch(r) : null;
  }

  async getHistory(id: string): Promise<RawCustodyEvent[]> {
    const list = await this.call<Result[]>("getHistory", id);
    return list.map((e) => ({
      from: nullIfZero(e.from as string),
      to: nullIfZero(e.to as string),
      eventType: EVENT_TYPE_NAMES[Number(e.eventType)],
      timestamp: Number(e.timestamp),
      note: e.note as string,
    }));
  }

  async getParticipant(address: string): Promise<ParticipantDTO | null> {
    const r = await this.call("getParticipant", address);
    return Number(r.role) === 0 ? null : toParticipant(r);
  }

  async getAllParticipants(): Promise<ParticipantDTO[]> {
    const list = await this.call<Result[]>("getAllParticipants");
    return list.map(toParticipant);
  }

  async getAllBatches(): Promise<BatchDTO[]> {
    const ids = await this.call<string[]>("getAllBatchIds");
    const batches = await Promise.all([...ids].map((id) => this.getBatch(id)));
    return batches.filter((b): b is BatchDTO => b !== null);
  }

  async isPaused(): Promise<boolean> {
    return this.call<boolean>("paused");
  }

  /** Looks up participant records for a set of addresses (unknown addresses are skipped). */
  async participantsFor(
    addresses: Iterable<string | null>,
  ): Promise<Record<string, ParticipantDTO>> {
    const unique = [...new Set([...addresses].filter((a): a is string => !!a))];
    const found = await Promise.all(unique.map((a) => this.getParticipant(a)));
    const out: Record<string, ParticipantDTO> = {};
    found.forEach((p, i) => {
      if (p) out[unique[i]] = p;
    });
    return out;
  }
}
