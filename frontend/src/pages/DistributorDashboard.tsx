import { useState } from "react";
import { Inbox, PackageOpen, Send, Truck, Undo2, Warehouse } from "lucide-react";
import { AddressChip } from "../components/AddressChip";
import { StatusBadge, VerdictBadge } from "../components/Badges";
import { BatchDrawer } from "../components/BatchDrawer";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { IncomingPanel } from "../components/IncomingPanel";
import { TransferModal } from "../components/TransferModal";
import { Button, Card, ErrorNote, PageHeader, StatCard } from "../components/ui";
import { useBatches, type BatchWithVerdict } from "../hooks/useBatches";
import { useTx } from "../hooks/useTx";
import { useWallet } from "../hooks/useWallet";
import { formatDate, formatNumber } from "../lib/format";

export default function DistributorDashboard() {
  const { account, participant } = useWallet();
  const incoming = useBatches("getPendingIncoming", account);
  const owned = useBatches("getBatchesByOwner", account);
  const { run } = useTx();
  const [forward, setForward] = useState<BatchWithVerdict | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const inventory = owned.data?.filter((b) => !b.pendingOwner);
  const outgoing = owned.data?.filter((b) => b.pendingOwner);

  const cancel = async (b: BatchWithVerdict) => {
    setBusyId(b.id);
    await run("Cancel transfer", (c) => c.cancelTransfer(b.id));
    setBusyId(null);
  };

  const batchCell = (b: BatchWithVerdict) => (
    <button onClick={() => setDrawer(b.id)} className="text-left">
      <div className="font-medium text-slate-900 hover:text-brand-700">{b.drugName}</div>
      <div className="font-mono text-xs text-slate-500">{b.batchNumber}</div>
    </button>
  );

  const invCols: Column<BatchWithVerdict>[] = [
    { key: "drug", header: "Batch", render: batchCell },
    { key: "mfr", header: "Manufacturer", render: (b) => b.manufacturerName, hideOnMobile: true },
    { key: "qty", header: "Qty", render: (b) => formatNumber(b.quantity), hideOnMobile: true },
    { key: "exp", header: "Expiry", render: (b) => formatDate(b.expiryDate), hideOnMobile: true },
    {
      key: "verdict",
      header: "State",
      render: (b) =>
        b.status === "Recalled" ? (
          <StatusBadge status={b.status} />
        ) : (
          <VerdictBadge verdict={b.verdict} />
        ),
    },
    {
      key: "act",
      header: "",
      className: "text-right",
      render: (b) =>
        b.status !== "Recalled" && b.verdict !== "EXPIRED" ? (
          <Button size="sm" onClick={() => setForward(b)} icon={<Send className="h-3.5 w-3.5" />}>
            Forward
          </Button>
        ) : (
          <span className="text-xs text-slate-400">Quarantine</span>
        ),
    },
  ];

  const outCols: Column<BatchWithVerdict>[] = [
    { key: "drug", header: "Batch", render: batchCell },
    {
      key: "to",
      header: "Awaiting",
      render: (b) => <AddressChip address={b.pendingOwner} compact showRole />,
    },
    {
      key: "act",
      header: "",
      className: "text-right",
      render: (b) => (
        <Button
          size="sm"
          variant="secondary"
          loading={busyId === b.id}
          onClick={() => void cancel(b)}
          icon={<Undo2 className="h-3.5 w-3.5" />}
        >
          Cancel
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Truck className="h-6 w-6" />}
        title={participant?.name ?? "Distributor"}
        subtitle={`Distributor · Licence ${participant?.licenseId ?? ""} · ${participant?.location ?? ""}`}
      />
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Incoming"
          value={incoming.data?.length ?? "–"}
          icon={<Inbox className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="Inventory"
          value={inventory?.length ?? "–"}
          icon={<Warehouse className="h-5 w-5" />}
        />
        <StatCard
          label="Outgoing"
          value={outgoing?.length ?? "–"}
          icon={<Send className="h-5 w-5" />}
          tone="slate"
        />
      </div>
      <Card
        title="Incoming transfers"
        subtitle="Confirm only after physically checking the consignment"
      >
        <IncomingPanel
          rows={incoming.data}
          loading={incoming.loading}
          error={incoming.error}
          onOpen={setDrawer}
        />
      </Card>
      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Inventory" subtitle="Batches you currently hold" className="xl:col-span-3">
          {owned.error && <ErrorNote>{owned.error}</ErrorNote>}
          <DataTable
            rows={inventory}
            columns={invCols}
            rowKey={(b) => b.id}
            loading={owned.loading}
            empty={
              <EmptyState icon={<PackageOpen className="h-6 w-6" />} title="Warehouse empty" />
            }
          />
        </Card>
        <Card
          title="Outgoing (pending)"
          subtitle="Waiting for the receiver to confirm"
          className="xl:col-span-2"
        >
          <DataTable
            rows={outgoing}
            columns={outCols}
            rowKey={(b) => b.id}
            loading={owned.loading}
            empty={<EmptyState icon={<Send className="h-6 w-6" />} title="Nothing in transit" />}
          />
        </Card>
      </div>
      <TransferModal
        batch={forward}
        open={!!forward}
        onClose={() => setForward(null)}
        allowedRoles={["Distributor", "Pharmacy"]}
      />
      <BatchDrawer batchId={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
