import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, PackageCheck, ScanLine, ShieldCheck, Store } from "lucide-react";
import { BatchDrawer } from "../components/BatchDrawer";
import { VerdictBadge } from "../components/Badges";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { IncomingPanel } from "../components/IncomingPanel";
import { Button, Card, ErrorNote, Input, PageHeader, StatCard } from "../components/ui";
import { useBatches, type BatchWithVerdict } from "../hooks/useBatches";
import { useWallet } from "../hooks/useWallet";
import { extractBatchId, formatDate, formatNumber } from "../lib/format";

export default function PharmacyDashboard() {
  const { account, participant } = useWallet();
  const incoming = useBatches("getPendingIncoming", account);
  const owned = useBatches("getBatchesByOwner", account);
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const dispensable = owned.data?.filter((b) => b.verdict === "GENUINE").length ?? 0;
  const blocked = owned.data?.filter((b) => b.verdict !== "GENUINE").length ?? 0;

  const quickVerify = (e: FormEvent) => {
    e.preventDefault();
    const id = extractBatchId(code);
    navigate(`/verify/${id ?? encodeURIComponent(code.trim())}`);
  };

  const cols: Column<BatchWithVerdict>[] = [
    {
      key: "drug",
      header: "Batch",
      render: (b) => (
        <button onClick={() => setDrawer(b.id)} className="text-left">
          <div className="font-medium text-slate-900 hover:text-brand-700">{b.drugName}</div>
          <div className="font-mono text-xs text-slate-500">{b.batchNumber}</div>
        </button>
      ),
    },
    { key: "mfr", header: "Manufacturer", render: (b) => b.manufacturerName, hideOnMobile: true },
    { key: "qty", header: "Qty", render: (b) => formatNumber(b.quantity), hideOnMobile: true },
    { key: "exp", header: "Expiry", render: (b) => formatDate(b.expiryDate), hideOnMobile: true },
    {
      key: "verdict",
      header: "Verdict",
      render: (b) => (
        <div>
          <VerdictBadge verdict={b.verdict} />
          {b.verdict !== "GENUINE" && (
            <div className="mt-1 max-w-[14rem] text-xs text-red-600">Do not dispense</div>
          )}
        </div>
      ),
    },
    {
      key: "act",
      header: "",
      className: "text-right",
      render: (b) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate(`/verify/${b.id}`)}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
        >
          Verify
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Store className="h-6 w-6" />}
        title={participant?.name ?? "Pharmacy"}
        subtitle={`Pharmacy · Licence ${participant?.licenseId ?? ""} · ${participant?.location ?? ""}`}
      />
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Incoming"
          value={incoming.data?.length ?? "–"}
          icon={<Inbox className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="OK to dispense"
          value={dispensable}
          icon={<PackageCheck className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          label="Blocked"
          value={blocked}
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="red"
        />
      </div>
      <Card
        title="Verify before dispensing"
        subtitle="Scan or paste the code on the pack in front of you"
      >
        <form onSubmit={quickVerify} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste batch ID / verify link"
            className="font-mono"
          />
          <Button type="submit" disabled={!code.trim()} icon={<ShieldCheck className="h-4 w-4" />}>
            Verify
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/verify")}
            icon={<ScanLine className="h-4 w-4" />}
          >
            Scan QR
          </Button>
        </form>
      </Card>
      <Card title="Incoming transfers" subtitle="Confirm when the consignment arrives">
        <IncomingPanel
          rows={incoming.data}
          loading={incoming.loading}
          error={incoming.error}
          onOpen={setDrawer}
        />
      </Card>
      <Card title="Inventory" subtitle="Stock on your shelves, with the live on-chain verdict">
        {owned.error && <ErrorNote>{owned.error}</ErrorNote>}
        <DataTable
          rows={owned.data}
          columns={cols}
          rowKey={(b) => b.id}
          loading={owned.loading}
          empty={
            <EmptyState
              icon={<PackageCheck className="h-6 w-6" />}
              title="No stock yet"
              message="Confirm an incoming transfer to add it to your inventory."
            />
          }
        />
      </Card>
      <BatchDrawer batchId={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
