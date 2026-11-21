import { useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  Boxes,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { ActivityFeed } from "../components/ActivityFeed";
import { AddressChip } from "../components/AddressChip";
import { ActiveBadge, RoleBadge, StatusBadge, VerdictBadge } from "../components/Badges";
import { BatchDrawer } from "../components/BatchDrawer";
import { DataTable, type Column } from "../components/DataTable";
import { ReasonModal } from "../components/ReasonModal";
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useBatches, type BatchWithVerdict } from "../hooks/useBatches";
import { useChainTick } from "../hooks/useChainTick";
import { useDirectory } from "../hooks/useDirectory";
import { useTx } from "../hooks/useTx";
import { useWallet } from "../hooks/useWallet";
import { api } from "../lib/api";
import { readContract } from "../lib/contract";
import { formatDate, isAddress, isBatchId } from "../lib/format";
import {
  ROLE_ENUM,
  STATUS_NAMES,
  VERDICT_NAMES,
  type Participant,
  type RoleName,
} from "../lib/types";
import { STATUS_STYLE, VERDICT_STYLE } from "../lib/verdict";

const REGISTRABLE: RoleName[] = ["Manufacturer", "Distributor", "Pharmacy", "Regulator"];

function RegisterForm({ disabled }: { disabled: boolean }) {
  const { run, busy } = useTx();
  const { lookup } = useDirectory();
  const [form, setForm] = useState({
    address: "",
    role: "Manufacturer" as RoleName,
    name: "",
    licenseId: "",
    location: "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const addrError =
    form.address && !isAddress(form.address)
      ? "Not a valid address"
      : form.address && lookup(form.address)
        ? "Already registered"
        : null;
  const valid = isAddress(form.address) && !addrError && form.name.trim() && form.licenseId.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await run(
      "Register participant",
      (c) =>
        c.registerParticipant(
          form.address.trim(),
          ROLE_ENUM[form.role],
          form.name.trim(),
          form.licenseId.trim(),
          form.location.trim(),
        ),
      { success: `${form.name.trim()} registered` },
    );
    if (ok) setForm({ address: "", role: form.role, name: "", licenseId: "", location: "" });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Wallet address" error={addrError}>
        <Input
          value={form.address}
          onChange={set("address")}
          placeholder="0x…"
          className="font-mono"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role">
          <Select value={form.role} onChange={set("role")}>
            {REGISTRABLE.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Licence ID">
          <Input
            value={form.licenseId}
            onChange={set("licenseId")}
            placeholder="e.g. WDL-DL-2024-0001"
          />
        </Field>
      </div>
      <Field label="Organisation name">
        <Input value={form.name} onChange={set("name")} placeholder="e.g. Max Pharmacy" />
      </Field>
      <Field label="Location">
        <Input value={form.location} onChange={set("location")} placeholder="City, State" />
      </Field>
      <Button
        type="submit"
        className="w-full"
        loading={busy}
        disabled={!valid || disabled}
        icon={<UserPlus className="h-4 w-4" />}
      >
        Register participant
      </Button>
      {disabled && (
        <p className="text-xs text-slate-500">Only the admin account can register participants.</p>
      )}
    </form>
  );
}

function ParticipantsTable({ isAdmin }: { isAdmin: boolean }) {
  const { participants, loading } = useDirectory();
  const { account } = useWallet();
  const { run } = useTx();
  const [busyAddr, setBusyAddr] = useState<string | null>(null);
  const toggle = async (p: Participant) => {
    setBusyAddr(p.address);
    await run(p.active ? `Suspend ${p.name}` : `Reactivate ${p.name}`, (c) =>
      c.setParticipantActive(p.address, !p.active),
    );
    setBusyAddr(null);
  };
  const cols: Column<Participant>[] = [
    {
      key: "name",
      header: "Participant",
      render: (p) => <AddressChip address={p.address} participant={p} />,
    },
    { key: "role", header: "Role", render: (p) => <RoleBadge role={p.role} /> },
    {
      key: "lic",
      header: "Licence",
      render: (p) => <span className="font-mono text-xs">{p.licenseId}</span>,
      hideOnMobile: true,
    },
    {
      key: "loc",
      header: "Location",
      render: (p) => <span className="text-slate-600">{p.location || "—"}</span>,
      hideOnMobile: true,
    },
    {
      key: "since",
      header: "Since",
      render: (p) => <span className="text-slate-600">{formatDate(p.registeredAt)}</span>,
      hideOnMobile: true,
    },
    { key: "status", header: "Status", render: (p) => <ActiveBadge active={p.active} /> },
    {
      key: "act",
      header: "",
      className: "text-right",
      render: (p) =>
        isAdmin && p.address.toLowerCase() !== account?.toLowerCase() ? (
          <Button
            size="sm"
            variant={p.active ? "secondary" : "primary"}
            loading={busyAddr === p.address}
            onClick={() => void toggle(p)}
          >
            {p.active ? "Suspend" : "Activate"}
          </Button>
        ) : null,
    },
  ];
  return (
    <DataTable rows={participants} columns={cols} rowKey={(p) => p.address} loading={loading} />
  );
}

function RecallTool({ batches }: { batches: BatchWithVerdict[] | undefined }) {
  const { run, busy } = useTx();
  const [target, setTarget] = useState("");
  const [open, setOpen] = useState(false);
  const recallable = (batches ?? []).filter((b) => b.status !== "Recalled");
  const valid = isBatchId(target);
  return (
    <div className="space-y-3">
      <Field label="Batch" hint="Pick a batch or paste any batch ID.">
        <Select
          value={recallable.some((b) => b.id === target) ? target : ""}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">Select batch…</option>
          {recallable.map((b) => (
            <option key={b.id} value={b.id}>
              {b.drugName} · {b.batchNumber} ({b.manufacturerName})
            </option>
          ))}
        </Select>
      </Field>
      <Input
        value={target}
        onChange={(e) => setTarget(e.target.value.trim())}
        placeholder="or paste 0x… batch ID"
        className="font-mono text-xs"
      />
      <Button
        variant="warning"
        className="w-full"
        disabled={!valid}
        onClick={() => setOpen(true)}
        icon={<RotateCcw className="h-4 w-4" />}
      >
        Recall batch
      </Button>
      <ReasonModal
        open={open}
        onClose={() => setOpen(false)}
        title="Regulatory recall"
        description="A recall is irreversible. Every scan of this batch will show RECALLED with your reason."
        label="Recall reason"
        confirmLabel="Recall batch"
        variant="warning"
        busy={busy}
        presets={[
          "Failed quality test (NSQ)",
          "Spurious drug alert",
          "Licence cancelled",
          "Labelling error",
        ]}
        onSubmit={async (reason) => {
          const ok = !!(await run("Recall batch", (c) => c.recallBatch(target, reason), {
            success: "Batch recalled",
          }));
          if (ok) setTarget("");
          return ok;
        }}
      />
    </div>
  );
}

function BatchTable({
  batches,
  loading,
  onOpen,
}: {
  batches: BatchWithVerdict[] | undefined;
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [verdict, setVerdict] = useState("");
  const [mfr, setMfr] = useState("");
  const manufacturers = useMemo(
    () => [...new Map((batches ?? []).map((b) => [b.manufacturer, b.manufacturerName])).entries()],
    [batches],
  );
  const rows = useMemo(
    () =>
      (batches ?? []).filter(
        (b) =>
          (!status || b.status === status) &&
          (!verdict || b.verdict === verdict) &&
          (!mfr || b.manufacturer === mfr) &&
          (!q || `${b.drugName} ${b.batchNumber} ${b.id}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [batches, q, status, verdict, mfr],
  );
  const cols: Column<BatchWithVerdict>[] = [
    {
      key: "drug",
      header: "Drug",
      render: (b) => (
        <div>
          <div className="font-medium text-slate-900">{b.drugName}</div>
          <div className="font-mono text-xs text-slate-500">{b.batchNumber}</div>
        </div>
      ),
    },
    {
      key: "mfr",
      header: "Manufacturer",
      render: (b) => <span className="text-slate-700">{b.manufacturerName}</span>,
      hideOnMobile: true,
    },
    {
      key: "holder",
      header: "Holder",
      render: (b) => <AddressChip address={b.currentOwner} compact />,
      hideOnMobile: true,
    },
    {
      key: "exp",
      header: "Expiry",
      render: (b) => <span className="text-slate-600">{formatDate(b.expiryDate)}</span>,
      hideOnMobile: true,
    },
    { key: "status", header: "Status", render: (b) => <StatusBadge status={b.status} /> },
    { key: "verdict", header: "Verdict", render: (b) => <VerdictBadge verdict={b.verdict} /> },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search drug, batch no, ID"
            className="pl-8"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_NAMES.map((s) => (
            <option key={s} value={s}>
              {STATUS_STYLE[s].label}
            </option>
          ))}
        </Select>
        <Select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
          <option value="">All verdicts</option>
          {VERDICT_NAMES.filter((v) => v !== "COUNTERFEIT").map((v) => (
            <option key={v} value={v}>
              {VERDICT_STYLE[v].label}
            </option>
          ))}
        </Select>
        <Select value={mfr} onChange={(e) => setMfr(e.target.value)}>
          <option value="">All manufacturers</option>
          {manufacturers.map(([addr, name]) => (
            <option key={addr} value={addr}>
              {name}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(b) => b.id}
        loading={loading}
        onRowClick={(b) => onOpen(b.id)}
      />
    </div>
  );
}

export default function AdminDashboard() {
  const { isAdmin, role } = useWallet();
  const tick = useChainTick();
  const { run, busy } = useTx();
  const stats = useAsync(() => api.stats(), [tick]);
  const paused = useAsync(() => readContract.paused() as Promise<boolean>, [tick]);
  const events = useAsync(() => api.events({ limit: 60 }), [tick]);
  const batches = useBatches("all");
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const s = stats.data;
  const isRegulator = role === "Regulator";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ShieldCheck className="h-6 w-6" />}
        title="Regulator console"
        subtitle={
          isAdmin
            ? "Admin + regulator: full control of the participant registry and contract."
            : "Regulator: you can recall any batch. Registry changes need the admin account."
        }
        actions={
          paused.data !== undefined &&
          (paused.data ? (
            <Badge className="bg-red-50 text-red-700 ring-red-600/20">Contract PAUSED</Badge>
          ) : (
            <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
              Contract live
            </Badge>
          ))
        }
      />
      {stats.error && <ErrorNote>{stats.error}</ErrorNote>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Batches"
          value={s?.batches.total ?? "–"}
          icon={<Boxes className="h-5 w-5" />}
        />
        <StatCard
          label="Recalled"
          value={s?.batches.byStatus.Recalled ?? "–"}
          icon={<RotateCcw className="h-5 w-5" />}
          tone="orange"
        />
        <StatCard
          label="Participants"
          value={s ? `${s.participants.active}/${s.participants.total}` : "–"}
          icon={<Users className="h-5 w-5" />}
          tone="slate"
        />
        <StatCard
          label="Hand-offs"
          value={s?.transfers ?? "–"}
          icon={<Activity className="h-5 w-5" />}
          tone="blue"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Register participant" subtitle="Grants the on-chain role">
          <RegisterForm disabled={!isAdmin} />
        </Card>
        <Card title="Recall any batch" subtitle="Regulator power: irreversible">
          {isRegulator ? (
            <RecallTool batches={batches.data} />
          ) : (
            <p className="text-sm text-slate-500">Requires the regulator role.</p>
          )}
        </Card>
        <Card title="Emergency stop" subtitle="Pause all batch writes">
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Pausing blocks create, transfer, confirm, reject, cancel, recall and document writes
              for everyone. Verification keeps working.
            </p>
            {paused.data ? (
              <Button
                className="w-full"
                disabled={!isAdmin}
                loading={busy}
                onClick={() => void run("Unpause contract", (c) => c.unpause())}
                icon={<Play className="h-4 w-4" />}
              >
                Unpause contract
              </Button>
            ) : (
              <Button
                variant="danger"
                className="w-full"
                disabled={!isAdmin}
                loading={busy}
                onClick={() => void run("Pause contract", (c) => c.pause())}
                icon={<Pause className="h-4 w-4" />}
              >
                Pause contract
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Card
        title="Participants"
        subtitle="Suspend a participant immediately if their key is compromised or licence is revoked"
      >
        <ParticipantsTable isAdmin={isAdmin} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="All batches" className="xl:col-span-2" subtitle="Click a row for full history">
          {batches.error && <ErrorNote>{batches.error}</ErrorNote>}
          <BatchTable batches={batches.data} loading={batches.loading} onOpen={setOpenBatch} />
        </Card>
        <Card title="System activity" subtitle="Indexed contract events">
          <div className="max-h-[36rem] overflow-y-auto">
            <ActivityFeed
              events={events.data?.events}
              loading={events.loading}
              error={events.error}
            />
          </div>
        </Card>
      </div>
      <BatchDrawer batchId={openBatch} onClose={() => setOpenBatch(null)} />
    </div>
  );
}
