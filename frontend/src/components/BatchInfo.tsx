import type { ReactNode } from "react";
import type { Batch } from "../lib/types";
import { formatDate, formatNumber } from "../lib/format";
import { api } from "../lib/api";
import { StatusBadge } from "./Badges";
import { AddressChip } from "./AddressChip";
import { CopyButton } from "./CopyButton";

function Row({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export function BatchInfo({ batch, chainTime }: { batch: Batch; chainTime?: number | null }) {
  const now = chainTime ?? Date.now() / 1000;
  const expired = batch.expiryDate < now;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <Row label="Drug">
        <span className="font-semibold">{batch.drugName}</span>
      </Row>
      <Row label="Batch number">
        <span className="font-mono">{batch.batchNumber}</span>
      </Row>
      <Row label="Manufacturer">
        <AddressChip address={batch.manufacturer} />
      </Row>
      <Row label="Status">
        <StatusBadge status={batch.status} />
      </Row>
      <Row label="Manufactured">{formatDate(batch.mfgDate)}</Row>
      <Row label="Expires">
        <span className={expired ? "font-semibold text-red-600" : ""}>
          {formatDate(batch.expiryDate)}
          {expired && " (expired)"}
        </span>
      </Row>
      <Row label="Quantity">{formatNumber(batch.quantity)} units</Row>
      <Row label="Current holder">
        <AddressChip address={batch.currentOwner} showRole />
      </Row>
      {batch.pendingOwner && (
        <Row label="In transit to">
          <AddressChip address={batch.pendingOwner} showRole />
        </Row>
      )}
      {batch.status === "Recalled" && (
        <Row label="Recall reason" full>
          <span className="font-medium text-orange-700">{batch.recallReason}</span>
        </Row>
      )}
      <Row label="Certificate of analysis (SHA-256)" full>
        {batch.docHash ? (
          <span className="flex items-start gap-1">
            <a
              href={api.documentUrl(batch.docHash)}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-xs text-brand-700 hover:underline"
            >
              {batch.docHash}
            </a>
            <CopyButton value={batch.docHash} />
          </span>
        ) : (
          <span className="text-slate-400">None attached</span>
        )}
      </Row>
      <Row label="Batch ID" full>
        <span className="flex items-start gap-1">
          <code className="break-all font-mono text-xs text-slate-700">{batch.id}</code>
          <CopyButton value={batch.id} />
        </span>
      </Row>
    </dl>
  );
}
