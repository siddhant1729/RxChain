import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  FileCheck2,
  Factory,
  RotateCcw,
  Send,
  Undo2,
} from "lucide-react";
import type { CustodyEvent, EventTypeName, Participant } from "../lib/types";
import { formatDateTime } from "../lib/format";
import { useDirectory } from "../hooks/useDirectory";
import { RoleBadge } from "./Badges";
import { AddressChip } from "./AddressChip";
import { TxLink } from "./TxLink";

const META: Record<EventTypeName, { title: string; Icon: typeof Factory; dot: string }> = {
  Created: { title: "Manufactured", Icon: Factory, dot: "bg-violet-600" },
  TransferInitiated: { title: "Dispatched", Icon: Send, dot: "bg-blue-500" },
  TransferConfirmed: { title: "Received", Icon: CheckCircle2, dot: "bg-emerald-600" },
  TransferCancelled: { title: "Transfer cancelled", Icon: Undo2, dot: "bg-slate-400" },
  TransferRejected: { title: "Transfer rejected", Icon: Ban, dot: "bg-red-500" },
  Recalled: { title: "Recalled", Icon: RotateCcw, dot: "bg-orange-500" },
  DocumentAttached: { title: "Document attached", Icon: FileCheck2, dot: "bg-teal-600" },
};

function Who({
  address,
  participants,
}: {
  address: string | null;
  participants?: Record<string, Participant>;
}) {
  const { lookup } = useDirectory();
  if (!address) return null;
  const p = participants?.[address] ?? lookup(address);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <AddressChip address={address} participant={p} compact />
      {p && <RoleBadge role={p.role} />}
    </span>
  );
}

/** Vertical custody timeline: every hop with participant, role, time, note and tx link. */
export function CustodyTimeline({
  history,
  participants,
}: {
  history: CustodyEvent[];
  participants?: Record<string, Participant>;
}) {
  return (
    <ol className="relative">
      {history.map((e, i) => {
        const m = META[e.eventType];
        const last = i === history.length - 1;
        const actor =
          e.eventType === "Created" ? e.to : e.eventType === "TransferRejected" ? e.from : e.from;
        return (
          <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 bg-slate-200"
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ring-4 ring-white ${m.dot}`}
            >
              <m.Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-semibold text-slate-900">{m.title}</p>
                <time className="text-xs text-slate-500">{formatDateTime(e.timestamp)}</time>
              </div>
              <div className="mt-1.5 space-y-1 text-sm text-slate-600">
                {e.eventType === "TransferInitiated" || e.eventType === "TransferConfirmed" ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Who address={e.from} participants={participants} />
                    <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" />
                    <Who address={e.to} participants={participants} />
                  </div>
                ) : e.eventType === "TransferRejected" ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Who address={e.from} participants={participants} />
                    <span className="text-xs text-slate-500">rejected; returned to</span>
                    <Who address={e.to} participants={participants} />
                  </div>
                ) : (
                  <Who address={actor} participants={participants} />
                )}
                {e.note && e.eventType !== "DocumentAttached" && (
                  <p className="text-sm italic text-slate-500">“{e.note}”</p>
                )}
                {e.eventType === "DocumentAttached" && (
                  <p className="break-all font-mono text-xs text-slate-500">SHA-256 {e.note}</p>
                )}
                {e.txHash && (
                  <p className="text-xs text-slate-500">
                    Tx <TxLink hash={e.txHash} /> · block {e.blockNumber}
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
