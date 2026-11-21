import { Interface, type ErrorDescription } from "ethers";
import { CONTRACT_ABI } from "./config";

const iface = new Interface(CONTRACT_ABI);
const ROLE_LABEL = ["None", "Manufacturer", "Distributor", "Pharmacy", "Regulator"];

const MESSAGES: Record<string, (args: ErrorDescription["args"]) => string> = {
  ZeroAddress: () => "Address cannot be the zero address.",
  InvalidRole: () => "Please choose a valid role.",
  EmptyField: () => "A required field is empty.",
  AlreadyRegistered: (a) => `${String(a[0])} is already registered.`,
  NotRegistered: (a) => `${String(a[0])} is not a registered participant.`,
  NotActiveParticipant: () =>
    "Your account is not an active registered participant (it may be suspended).",
  BatchAlreadyExists: () => "Your company already has a batch with this batch number.",
  BatchNotFound: () => "Batch not found on chain.",
  InvalidDates: () =>
    "Invalid dates: expiry must be after the manufacturing date and in the future, and the manufacturing date cannot be in the future.",
  InvalidQuantity: () => "Quantity must be greater than zero.",
  NotCurrentOwner: () => "Only the current owner of this batch can do that.",
  NotPendingOwner: () => "Only the intended receiver can confirm or reject this transfer.",
  TransferAlreadyPending: () => "A transfer is already pending for this batch — cancel it first.",
  NoPendingTransfer: () => "There is no pending transfer for this batch.",
  BatchIsRecalled: () => "This batch has been recalled and can no longer move.",
  BatchIsExpired: () => "This batch is past its expiry date and can no longer move.",
  SelfTransfer: () => "You cannot transfer a batch to yourself.",
  ReceiverNotActive: () => "The receiver is not registered or is currently suspended.",
  InvalidTransferRoute: (a) =>
    `Transfers from ${ROLE_LABEL[Number(a[0])]} to ${ROLE_LABEL[Number(a[1])]} are not allowed. Allowed: Manufacturer → Distributor, Distributor → Distributor or Pharmacy.`,
  NotAuthorizedToRecall: () => "Only the batch's manufacturer or a regulator can recall it.",
  NotBatchManufacturer: () => "Only the manufacturer of this batch can attach documents.",
  InvalidDocHash: () => "Document hash cannot be empty.",
  AccessControlUnauthorizedAccount: () =>
    "Your account does not have the role required for this action.",
  AccessControlBadConfirmation: () => "Role renounce confirmation mismatch.",
  EnforcedPause: () => "The contract is paused by the regulator — writes are temporarily disabled.",
  ExpectedPause: () => "The contract is not paused.",
};

/** Recursively finds revert data (0x-prefixed hex with a 4-byte selector) in nested provider errors. */
function findRevertData(err: unknown, depth = 0): string | null {
  if (!err || typeof err !== "object" || depth > 6) return null;
  const o = err as Record<string, unknown>;
  for (const key of ["data", "error", "info", "cause", "payload"]) {
    const v = o[key];
    if (typeof v === "string" && /^0x[0-9a-fA-F]{8}/.test(v)) return v;
    const nested = findRevertData(v, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/** Turns any wallet/provider/contract error into a short human-readable message. */
export function decodeError(err: unknown): string {
  const e = err as {
    code?: string | number;
    revert?: { name: string; args: ErrorDescription["args"] };
    shortMessage?: string;
    message?: string;
    info?: { error?: { code?: number } };
  };
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001 || e?.info?.error?.code === 4001) {
    return "Transaction rejected in MetaMask.";
  }
  if (e?.revert?.name && MESSAGES[e.revert.name]) return MESSAGES[e.revert.name](e.revert.args);

  const data = findRevertData(err);
  if (data) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) return MESSAGES[parsed.name]?.(parsed.args) ?? `Contract error: ${parsed.name}`;
    } catch {
      /* not one of our errors */
    }
  }
  const msg = e?.shortMessage ?? e?.message ?? String(err);
  if (/nonce/i.test(msg)) {
    return "Nonce mismatch — the chain was restarted. In MetaMask: Settings → Advanced → Clear activity tab data.";
  }
  if (/could not coalesce|failed to fetch|ECONNREFUSED/i.test(msg)) {
    return "Cannot reach the blockchain node. Is `npm run chain` running?";
  }
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}
