import {
  Contract,
  JsonRpcProvider,
  Network,
  ZeroAddress,
  ZeroHash,
  solidityPackedKeccak256,
  type ContractRunner,
  type Result,
} from "ethers";
import { CHAIN_ID, CONTRACT_ABI, CONTRACT_ADDRESS, RPC_URL } from "./config";
import {
  EVENT_TYPE_NAMES,
  ROLE_NAMES,
  STATUS_NAMES,
  VERDICT_NAMES,
  type Batch,
  type CustodyEvent,
  type Participant,
  type VerdictName,
} from "./types";

/** Read-only provider talking straight to the node (no wallet required). */
export const readProvider = new JsonRpcProvider(RPC_URL, Network.from(CHAIN_ID), {
  staticNetwork: true,
  pollingInterval: 2000,
});

export function getContract(runner: ContractRunner = readProvider): Contract {
  return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, runner);
}

export const readContract = getContract();

const nullIfZero = (a: string) => (a === ZeroAddress ? null : a);

export function toParticipant(r: Result): Participant {
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

export function toBatch(r: Result): Batch {
  return {
    id: (r.id as string).toLowerCase(),
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

export async function fetchParticipant(address: string): Promise<Participant | null> {
  const r = (await readContract.getParticipant(address)) as Result;
  return Number(r.role) === 0 ? null : toParticipant(r);
}

export async function fetchAllParticipants(): Promise<Participant[]> {
  const list = (await readContract.getAllParticipants()) as Result[];
  return list.map(toParticipant);
}

export async function fetchBatch(id: string): Promise<Batch | null> {
  const r = (await readContract.getBatch(id)) as Result;
  return r.exists ? toBatch(r) : null;
}

export async function fetchBatches(ids: readonly string[]): Promise<Batch[]> {
  const list = await Promise.all(ids.map(fetchBatch));
  return list.filter((b): b is Batch => b !== null).sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchIds(
  method: "getBatchesByOwner" | "getBatchesByManufacturer" | "getPendingIncoming",
  account: string,
): Promise<string[]> {
  return [...((await readContract[method](account)) as string[])];
}

export async function fetchAllBatchIds(): Promise<string[]> {
  return [...((await readContract.getAllBatchIds()) as string[])];
}

export async function fetchHistory(id: string): Promise<CustodyEvent[]> {
  const list = (await readContract.getHistory(id)) as Result[];
  return list.map((e, index) => ({
    index,
    from: nullIfZero(e.from as string),
    to: nullIfZero(e.to as string),
    eventType: EVENT_TYPE_NAMES[Number(e.eventType)],
    timestamp: Number(e.timestamp),
    note: e.note as string,
    txHash: null,
    blockNumber: null,
  }));
}

export async function fetchVerdict(id: string): Promise<{ verdict: VerdictName; reason: string }> {
  const r = (await readContract.verifyBatch(id)) as Result;
  return { verdict: VERDICT_NAMES[Number(r[0])], reason: r[1] as string };
}

export async function fetchChainTime(): Promise<number> {
  const b = await readProvider.getBlock("latest");
  return b?.timestamp ?? Math.floor(Date.now() / 1000);
}

export function computeBatchId(manufacturer: string, batchNumber: string): string {
  return solidityPackedKeccak256(["address", "string"], [manufacturer, batchNumber]).toLowerCase();
}

export const DEFAULT_ADMIN_ROLE = ZeroHash;
