import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { useDirectory } from "../hooks/useDirectory";
import { shortAddress, shortHash, timeAgo } from "../lib/format";
import type { IndexedEvent } from "../lib/types";
import { EmptyState } from "./EmptyState";
import { SkeletonRows } from "./Skeleton";
import { TxLink } from "./TxLink";

const ROLE = ["", "Manufacturer", "Distributor", "Pharmacy", "Regulator"];
const ROLE_HASHES: Record<string, string> = {
  "0x0000000000000000000000000000000000000000000000000000000000000000": "Admin",
};

/** Human-readable sentence for an indexed contract event. */
function useDescribe() {
  const { lookup } = useDirectory();
  const n = (a: unknown) => {
    const s = String(a ?? "");
    return lookup(s)?.name ?? shortAddress(s);
  };
  return (e: IndexedEvent): { text: string; tone: string } => {
    const a = e.args;
    switch (e.name) {
      case "ParticipantRegistered":
        return { text: `${a.name} registered as ${ROLE[Number(a.role)]}`, tone: "bg-amber-500" };
      case "ParticipantStatusChanged":
        return {
          text: `${n(a.account)} ${a.active ? "reactivated" : "suspended"}`,
          tone: a.active ? "bg-emerald-500" : "bg-red-500",
        };
      case "BatchCreated":
        return {
          text: `${n(a.manufacturer)} created ${a.drugName} · ${a.batchNumber}`,
          tone: "bg-violet-500",
        };
      case "TransferInitiated":
        return { text: `${n(a.from)} dispatched to ${n(a.to)}`, tone: "bg-blue-500" };
      case "TransferConfirmed":
        return { text: `${n(a.to)} received from ${n(a.from)}`, tone: "bg-emerald-500" };
      case "TransferRejected":
        return { text: `${n(a.by)} rejected a transfer: “${a.reason}”`, tone: "bg-red-500" };
      case "TransferCancelled":
        return {
          text: `${n(a.by)} cancelled a transfer to ${n(a.receiver)}`,
          tone: "bg-slate-400",
        };
      case "BatchRecalled":
        return { text: `${n(a.by)} recalled a batch: “${a.reason}”`, tone: "bg-orange-500" };
      case "DocumentAttached":
        return { text: `${n(a.by)} attached a document`, tone: "bg-teal-500" };
      case "Paused":
        return { text: `${n(a.account)} paused the contract`, tone: "bg-red-500" };
      case "Unpaused":
        return { text: `${n(a.account)} unpaused the contract`, tone: "bg-emerald-500" };
      case "RoleGranted":
        return {
          text: `${ROLE_HASHES[String(a.role)] ?? "Role"} granted to ${n(a.account)}`,
          tone: "bg-slate-300",
        };
      case "RoleRevoked":
        return {
          text: `${ROLE_HASHES[String(a.role)] ?? "Role"} revoked from ${n(a.account)}`,
          tone: "bg-slate-300",
        };
      default:
        return { text: e.name, tone: "bg-slate-300" };
    }
  };
}

export function ActivityFeed({
  events,
  loading,
  error,
  hideRoleEvents = true,
}: {
  events: IndexedEvent[] | undefined;
  loading?: boolean;
  error?: string | null;
  hideRoleEvents?: boolean;
}) {
  const describe = useDescribe();
  if (error) return <p className="text-sm text-slate-500">Activity feed unavailable: {error}</p>;
  if (loading && !events) return <SkeletonRows rows={5} cols={2} />;
  const list = (events ?? []).filter((e) => !hideRoleEvents || !e.name.startsWith("Role"));
  if (!list.length)
    return <EmptyState icon={<Activity className="h-6 w-6" />} title="No activity yet" />;
  const now = Date.now() / 1000;
  return (
    <ul className="divide-y divide-slate-100">
      {list.map((e) => {
        const d = describe(e);
        return (
          <li key={e.id} className="flex gap-3 py-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${d.tone}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-800">{d.text}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                <span title={new Date(e.timestamp * 1000).toLocaleString()}>
                  {timeAgo(e.timestamp, Math.max(now, e.timestamp))}
                </span>
                {e.batchId && (
                  <Link
                    to={`/batch/${e.batchId}`}
                    className="font-mono text-brand-700 hover:underline"
                  >
                    {shortHash(e.batchId)}
                  </Link>
                )}
                <TxLink hash={e.txHash} />
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
