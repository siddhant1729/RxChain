import { useState } from "react";
import { Check, Inbox, XCircle } from "lucide-react";
import type { BatchWithVerdict } from "../hooks/useBatches";
import { useTx } from "../hooks/useTx";
import { formatDate, formatNumber } from "../lib/format";
import { AddressChip } from "./AddressChip";
import { DataTable, type Column } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { ReasonModal } from "./ReasonModal";
import { Button, ErrorNote } from "./ui";

/** Pending incoming transfers with Confirm / Reject actions. */
export function IncomingPanel({
  rows,
  loading,
  error,
  onOpen,
}: {
  rows: BatchWithVerdict[] | undefined;
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
}) {
  const { run, busy } = useTx();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reject, setReject] = useState<BatchWithVerdict | null>(null);

  const confirm = async (b: BatchWithVerdict) => {
    setBusyId(b.id);
    await run("Confirm receipt", (c) => c.confirmReceipt(b.id), {
      success: `Received ${b.drugName} · ${b.batchNumber}`,
    });
    setBusyId(null);
  };

  const cols: Column<BatchWithVerdict>[] = [
    {
      key: "drug",
      header: "Batch",
      render: (b) => (
        <button onClick={() => onOpen(b.id)} className="text-left">
          <div className="font-medium text-slate-900 hover:text-brand-700">{b.drugName}</div>
          <div className="font-mono text-xs text-slate-500">{b.batchNumber}</div>
        </button>
      ),
    },
    {
      key: "from",
      header: "From",
      render: (b) => <AddressChip address={b.currentOwner} compact />,
    },
    { key: "qty", header: "Qty", render: (b) => formatNumber(b.quantity), hideOnMobile: true },
    { key: "exp", header: "Expiry", render: (b) => formatDate(b.expiryDate), hideOnMobile: true },
    {
      key: "act",
      header: "",
      className: "text-right",
      render: (b) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            loading={busyId === b.id}
            onClick={() => void confirm(b)}
            icon={<Check className="h-3.5 w-3.5" />}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setReject(b)}
            icon={<XCircle className="h-3.5 w-3.5" />}
          >
            Reject
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      {error && <ErrorNote>{error}</ErrorNote>}
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(b) => b.id}
        loading={loading}
        empty={
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="No incoming transfers"
            message="Consignments sent to you appear here until you confirm or reject them."
          />
        }
      />
      <ReasonModal
        open={!!reject}
        onClose={() => setReject(null)}
        title={reject ? `Reject ${reject.drugName} · ${reject.batchNumber}` : "Reject"}
        description="The batch stays with the sender. Your reason is recorded on chain."
        label="Rejection reason"
        confirmLabel="Reject transfer"
        busy={busy}
        presets={["Damaged packaging", "Quantity mismatch", "Cold chain breach", "Not ordered"]}
        onSubmit={async (reason) =>
          !!reject &&
          !!(await run("Reject transfer", (c) => c.rejectTransfer(reject.id, reason), {
            success: "Transfer rejected",
          }))
        }
      />
    </>
  );
}
