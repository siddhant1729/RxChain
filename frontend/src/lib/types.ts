export const ROLE_NAMES = ["None", "Manufacturer", "Distributor", "Pharmacy", "Regulator"] as const;
export const STATUS_NAMES = ["Created", "InTransit", "Delivered", "Recalled"] as const;
export const EVENT_TYPE_NAMES = [
  "Created",
  "TransferInitiated",
  "TransferConfirmed",
  "TransferCancelled",
  "TransferRejected",
  "Recalled",
  "DocumentAttached",
] as const;
export const VERDICT_NAMES = [
  "GENUINE",
  "COUNTERFEIT",
  "SUSPICIOUS",
  "RECALLED",
  "EXPIRED",
  "IN_SUPPLY_CHAIN",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
export type StatusName = (typeof STATUS_NAMES)[number];
export type EventTypeName = (typeof EVENT_TYPE_NAMES)[number];
export type VerdictName = (typeof VERDICT_NAMES)[number];

export const ROLE_ENUM: Record<RoleName, number> = {
  None: 0,
  Manufacturer: 1,
  Distributor: 2,
  Pharmacy: 3,
  Regulator: 4,
};

export interface Participant {
  address: string;
  role: RoleName;
  name: string;
  licenseId: string;
  location: string;
  active: boolean;
  registeredAt: number;
}

export interface Batch {
  id: string;
  drugName: string;
  batchNumber: string;
  manufacturerName: string;
  mfgDate: number;
  expiryDate: number;
  quantity: string;
  manufacturer: string;
  currentOwner: string;
  pendingOwner: string | null;
  status: StatusName;
  docHash: string | null;
  recallReason: string;
  createdAt: number;
}

export interface CustodyEvent {
  index: number;
  from: string | null;
  to: string | null;
  eventType: EventTypeName;
  timestamp: number;
  note: string;
  txHash: string | null;
  blockNumber: number | null;
}

export interface VerifyResult {
  batchId: string;
  verdict: VerdictName;
  reason: string;
  checkedAt: number;
  chainTime: number | null;
  chainId: number | null;
  contract: string | null;
  batch: Batch | null;
  history: CustodyEvent[];
  participants: Record<string, Participant>;
}

export interface IndexedEvent {
  id: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  name: string;
  batchId: string | null;
  addresses: string[];
  args: Record<string, string | number | boolean>;
  timestamp: number;
}

export interface Stats {
  batches: { total: number; byStatus: Record<StatusName, number>; expired: number };
  participants: {
    total: number;
    active: number;
    byRole: Record<Exclude<RoleName, "None">, number>;
  };
  transfers: number;
  paused: boolean;
  chainTime: number;
  recentEvents: IndexedEvent[];
  names: Record<string, { name: string; role: RoleName }>;
}
