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

/** Contract event emitted for each custody history entry type (1:1). */
export const HISTORY_EVENT_TO_LOG: Record<EventTypeName, string> = {
  Created: "BatchCreated",
  TransferInitiated: "TransferInitiated",
  TransferConfirmed: "TransferConfirmed",
  TransferCancelled: "TransferCancelled",
  TransferRejected: "TransferRejected",
  Recalled: "BatchRecalled",
  DocumentAttached: "DocumentAttached",
};

export interface ParticipantDTO {
  address: string;
  role: RoleName;
  name: string;
  licenseId: string;
  location: string;
  active: boolean;
  registeredAt: number;
}

export interface BatchDTO {
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

export interface CustodyEventDTO {
  index: number;
  from: string | null;
  to: string | null;
  eventType: EventTypeName;
  timestamp: number;
  note: string;
  txHash: string | null;
  blockNumber: number | null;
}

export interface IndexedEventDTO {
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

export interface VerifyResponse {
  batchId: string;
  verdict: VerdictName;
  reason: string;
  checkedAt: number;
  chainTime: number | null;
  chainId: number | null;
  contract: string | null;
  batch: BatchDTO | null;
  history: CustodyEventDTO[];
  participants: Record<string, ParticipantDTO>;
}
