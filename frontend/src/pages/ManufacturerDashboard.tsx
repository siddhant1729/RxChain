import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Boxes,
  CheckCircle2,
  Factory,
  FileUp,
  Loader2,
  PackagePlus,
  RotateCcw,
  Send,
  Truck,
  Undo2,
  X,
} from "lucide-react";
import { AddressChip } from "../components/AddressChip";
import { StatusBadge, VerdictBadge } from "../components/Badges";
import { BatchDrawer } from "../components/BatchDrawer";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { QRDisplay } from "../components/QRDisplay";
import { ReasonModal } from "../components/ReasonModal";
import { TransferModal } from "../components/TransferModal";
import { Button, Card, ErrorNote, Field, Input, PageHeader, StatCard } from "../components/ui";
import { useBatches, type BatchWithVerdict } from "../hooks/useBatches";
import { useTx } from "../hooks/useTx";
import { useWallet } from "../hooks/useWallet";
import { api } from "../lib/api";
import { computeBatchId, fetchBatch, fetchChainTime } from "../lib/contract";
import { dateInputToUnix, formatDate, formatNumber, unixToDateInput } from "../lib/format";

const ZERO_HASH = "0x" + "0".repeat(64);

function CreateBatchForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { account } = useWallet();
  const { run, busy } = useTx();
  const today = Math.floor(Date.now() / 1000);
  const [form, setForm] = useState({
    drugName: "",
    batchNumber: "",
    mfgDate: unixToDateInput(today),
    expiryDate: unixToDateInput(today + 2 * 365 * 86400),
    quantity: "1000",
  });
  const [doc, setDoc] = useState<{ name: string; hash: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const r = await api.uploadDocument(file);
      setDoc({ name: file.name, hash: r.hash });
    } catch (e) {
      setError(`Document upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setError(null);
    const mfg = dateInputToUnix(form.mfgDate);
    const exp = dateInputToUnix(form.expiryDate);
    const qty = Number(form.quantity);
    const chainNow = await fetchChainTime().catch(() => today);
    if (!form.drugName.trim() || !form.batchNumber.trim())
      return setError("Drug name and batch number are required.");
    if (exp <= mfg) return setError("Expiry date must be after the manufacturing date.");
    if (exp <= chainNow) return setError("Expiry date must be in the future.");
    if (mfg > chainNow + 86400) return setError("Manufacturing date cannot be in the future.");
    if (!Number.isInteger(qty) || qty <= 0)
      return setError("Quantity must be a positive whole number.");
    const id = computeBatchId(account, form.batchNumber.trim());
    if (await fetchBatch(id).catch(() => null))
      return setError(`Batch number ${form.batchNumber.trim()} already exists for your company.`);

    const hash = await run(
      "Create batch",
      (c) =>
        c.createBatch(
          form.drugName.trim(),
          form.batchNumber.trim(),
          mfg,
          exp,
          qty,
          doc?.hash ?? ZERO_HASH,
        ),
      { success: `Batch ${form.batchNumber.trim()} created` },
    );
    if (hash) {
      onCreated(id);
      setForm((f) => ({ ...f, drugName: "", batchNumber: "" }));
      setDoc(null);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Drug name & strength">
        <Input
          value={form.drugName}
          onChange={set("drugName")}
          placeholder="e.g. Paracetamol 650mg"
          maxLength={80}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Batch number">
          <Input
            value={form.batchNumber}
            onChange={set("batchNumber")}
            placeholder="e.g. PCM-24101"
            className="font-mono"
            maxLength={40}
          />
        </Field>
        <Field label="Quantity (units)">
          <Input type="number" min={1} step={1} value={form.quantity} onChange={set("quantity")} />
        </Field>
        <Field label="Manufacturing date">
          <Input type="date" value={form.mfgDate} onChange={set("mfgDate")} />
        </Field>
        <Field label="Expiry date">
          <Input type="date" value={form.expiryDate} onChange={set("expiryDate")} />
        </Field>
      </div>
      <Field
        label="Certificate of analysis (optional)"
        hint="Stored off-chain; only its SHA-256 goes on chain."
      >
        {doc ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{doc.name}</div>
              <div className="truncate font-mono text-[11px]">{doc.hash}</div>
            </div>
            <button
              type="button"
              onClick={() => setDoc(null)}
              className="rounded p-1 hover:bg-emerald-100"
              aria-label="Remove document"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:border-brand-500">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4 text-slate-400" />
            )}
            {uploading ? "Uploading & hashing…" : "Upload PDF / image"}
            <input
              type="file"
              className="sr-only"
              accept=".pdf,image/*,.txt"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
        )}
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button
        type="submit"
        className="w-full"
        loading={busy}
        disabled={uploading}
        icon={<PackagePlus className="h-4 w-4" />}
      >
        Create batch on chain
      </Button>
    </form>
  );
}

export default function ManufacturerDashboard() {
  const { account, participant } = useWallet();
  const { data, loading, error } = useBatches("getBatchesByManufacturer", account);
  const { run, busy } = useTx();
  const [created, setCreated] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<BatchWithVerdict | null>(null);
  const [recall, setRecall] = useState<BatchWithVerdict | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const me = account?.toLowerCase();

  const rows = data ?? [];
  const held = rows.filter(
    (b) => b.currentOwner.toLowerCase() === me && b.status !== "Recalled",
  ).length;
  const inTransit = rows.filter((b) => b.status === "InTransit").length;
  const recalled = rows.filter((b) => b.status === "Recalled").length;

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
    { key: "qty", header: "Qty", render: (b) => formatNumber(b.quantity), hideOnMobile: true },
    { key: "exp", header: "Expiry", render: (b) => formatDate(b.expiryDate), hideOnMobile: true },
    {
      key: "holder",
      header: "Holder",
      render: (b) =>
        b.pendingOwner ? (
          <span className="text-xs text-slate-500">
            → <AddressChip address={b.pendingOwner} compact />
          </span>
        ) : (
          <AddressChip address={b.currentOwner} compact />
        ),
      hideOnMobile: true,
    },
    {
      key: "status",
      header: "Status",
      render: (b) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={b.status} />
          <VerdictBadge verdict={b.verdict} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (b) => {
        const mine = b.currentOwner.toLowerCase() === me;
        const canTransfer =
          mine && !b.pendingOwner && b.status !== "Recalled" && b.verdict !== "EXPIRED";
        return (
          <div className="flex flex-wrap justify-end gap-1.5">
            {canTransfer && (
              <Button
                size="sm"
                onClick={() => setTransfer(b)}
                icon={<Send className="h-3.5 w-3.5" />}
              >
                Transfer
              </Button>
            )}
            {mine && b.pendingOwner && (
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() => void run("Cancel transfer", (c) => c.cancelTransfer(b.id))}
                icon={<Undo2 className="h-3.5 w-3.5" />}
              >
                Cancel
              </Button>
            )}
            {b.status !== "Recalled" && (
              <Button
                size="sm"
                variant="ghost"
                className="!text-orange-600"
                onClick={() => setRecall(b)}
                icon={<RotateCcw className="h-3.5 w-3.5" />}
              >
                Recall
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Factory className="h-6 w-6" />}
        title={participant?.name ?? "Manufacturer"}
        subtitle={`Manufacturer · Licence ${participant?.licenseId ?? ""} · ${participant?.location ?? ""}`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Batches created"
          value={rows.length}
          icon={<Boxes className="h-5 w-5" />}
        />
        <StatCard
          label="In my warehouse"
          value={held}
          icon={<Factory className="h-5 w-5" />}
          tone="slate"
        />
        <StatCard
          label="In transit"
          value={inTransit}
          icon={<Truck className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="Recalled"
          value={recalled}
          icon={<RotateCcw className="h-5 w-5" />}
          tone="orange"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Create batch" subtitle="Registers a new batch identity on chain">
          {created ? (
            <div className="space-y-4 text-center">
              <div className="flex items-center justify-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">Batch created on chain</span>
              </div>
              <QRDisplay batchId={created} />
              <div className="flex justify-center gap-2">
                <Link to={`/batch/${created}`}>
                  <Button size="sm" variant="secondary">
                    View batch
                  </Button>
                </Link>
                <Button
                  size="sm"
                  onClick={() => setCreated(null)}
                  icon={<PackagePlus className="h-4 w-4" />}
                >
                  Create another
                </Button>
              </div>
            </div>
          ) : (
            <CreateBatchForm onCreated={setCreated} />
          )}
        </Card>
        <Card
          title="My batches"
          className="lg:col-span-2"
          subtitle="Everything you have ever manufactured (live from the contract)"
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          <DataTable
            rows={data}
            columns={cols}
            rowKey={(b) => b.id}
            loading={loading}
            empty={
              <EmptyState
                icon={<Boxes className="h-6 w-6" />}
                title="No batches yet"
                message="Create your first batch with the form."
              />
            }
          />
        </Card>
      </div>
      <TransferModal
        batch={transfer}
        open={!!transfer}
        onClose={() => setTransfer(null)}
        allowedRoles={["Distributor"]}
      />
      <ReasonModal
        open={!!recall}
        onClose={() => setRecall(null)}
        title={recall ? `Recall ${recall.drugName} · ${recall.batchNumber}` : "Recall"}
        description="A recall is irreversible. The batch can no longer move and every scan will show RECALLED."
        label="Recall reason (shown to consumers)"
        confirmLabel="Recall batch"
        variant="warning"
        busy={busy}
        presets={[
          "Contamination detected in QC",
          "Failed dissolution test",
          "Labelling error",
          "Packaging defect",
        ]}
        onSubmit={async (reason) =>
          !!recall &&
          !!(await run("Recall batch", (c) => c.recallBatch(recall.id, reason), {
            success: "Batch recalled",
          }))
        }
      />
      <BatchDrawer batchId={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
