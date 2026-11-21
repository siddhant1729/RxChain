import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Factory,
  PackageCheck,
  QrCode,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { ActivityFeed } from "../components/ActivityFeed";
import { Button, Card, StatCard } from "../components/ui";
import { Skeleton } from "../components/Skeleton";
import { useAsync } from "../hooks/useAsync";
import { useChainTick } from "../hooks/useChainTick";
import { dashboardPath, useWallet } from "../hooks/useWallet";
import { api } from "../lib/api";

export default function Landing() {
  const tick = useChainTick();
  const stats = useAsync(() => api.stats(), [tick]);
  const w = useWallet();
  const dash = dashboardPath(w.role, w.isAdmin);
  const s = stats.data;

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-teal-600 px-6 py-12 text-white shadow-xl sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <ShieldCheck className="h-4 w-4" /> Blockchain anti-counterfeiting
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Know your medicine is real.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-teal-50">
            RxChain gives every drug batch a tamper-proof identity on a blockchain and records each
            hand-off from manufacturer to distributor to pharmacy. Scan the QR on the pack, no
            wallet needed, and see whether it is genuine.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/verify">
              <Button
                size="lg"
                className="w-full bg-white !text-brand-800 hover:bg-teal-50 sm:w-auto"
                icon={<ScanLine className="h-5 w-5" />}
              >
                Verify a Medicine
              </Button>
            </Link>
            {dash ? (
              <Link to={dash}>
                <Button
                  size="lg"
                  variant="ghost"
                  className="w-full !text-white ring-1 ring-white/40 hover:bg-white/10 sm:w-auto"
                  icon={<ArrowRight className="h-5 w-5" />}
                >
                  Open my dashboard
                </Button>
              </Link>
            ) : (
              <Button
                size="lg"
                variant="ghost"
                onClick={w.connect}
                loading={w.connecting}
                className="w-full !text-white ring-1 ring-white/40 hover:bg-white/10 sm:w-auto"
                icon={<Wallet className="h-5 w-5" />}
              >
                {w.account ? "Wallet connected" : "Connect Wallet"}
              </Button>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Live on the ledger</h2>
          {stats.error && <span className="text-xs text-red-600">{stats.error}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {s ? (
            <>
              <StatCard
                label="Batches"
                value={s.batches.total}
                icon={<Boxes className="h-5 w-5" />}
              />
              <StatCard
                label="At pharmacies"
                value={s.batches.byStatus.Delivered}
                icon={<PackageCheck className="h-5 w-5" />}
                tone="green"
              />
              <StatCard
                label="In transit"
                value={s.batches.byStatus.InTransit}
                icon={<Truck className="h-5 w-5" />}
                tone="blue"
              />
              <StatCard
                label="Recalled"
                value={s.batches.byStatus.Recalled}
                icon={<RotateCcw className="h-5 w-5" />}
                tone="orange"
              />
              <StatCard
                label="Participants"
                value={s.participants.active}
                icon={<Users className="h-5 w-5" />}
                tone="slate"
              />
              <StatCard
                label="Hand-offs"
                value={s.transfers}
                icon={<Activity className="h-5 w-5" />}
                tone="brand"
              />
            </>
          ) : (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[74px] rounded-xl" />
            ))
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-900">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                Icon: Factory,
                title: "1. Manufacture",
                text: "The manufacturer registers the batch on chain with its dates, quantity and a hash of the certificate of analysis, and prints the QR label.",
              },
              {
                Icon: Truck,
                title: "2. Hand-off",
                text: "Each custody change is a two-step transfer: the sender initiates and the receiver confirms. Only licensed, active participants can take part.",
              },
              {
                Icon: QrCode,
                title: "3. Verify",
                text: "Anyone scans the QR. The contract checks existence, recall, expiry, the custody chain and that it ended at a pharmacy.",
              },
            ].map(({ Icon, title, text }) => (
              <div
                key={title}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-card"
              >
                <Icon className="h-7 w-7 text-brand-700" />
                <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
            <h3 className="font-semibold text-slate-900">Possible verdicts</h3>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                <b>Genuine</b>: reached a licensed pharmacy
              </p>
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                <b>In supply chain</b>: not at a pharmacy yet
              </p>
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                <b>Counterfeit / Suspicious</b>: unknown or tampered
              </p>
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                <b>Recalled</b>: withdrawn for safety
              </p>
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                <b>Expired</b>: past its expiry date
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              {
                Icon: ShieldCheck,
                role: "Regulator",
                text: "Registers & suspends participants, recalls batches, can pause the system.",
              },
              {
                Icon: Factory,
                role: "Manufacturer",
                text: "Creates batches, attaches CoA hashes, ships to distributors.",
              },
              {
                Icon: Truck,
                role: "Distributor",
                text: "Confirms receipt, forwards to distributors or pharmacies.",
              },
              {
                Icon: Store,
                role: "Pharmacy",
                text: "End of the chain. Confirms receipt and verifies before dispensing.",
              },
            ].map(({ Icon, role, text }) => (
              <div key={role} className="rounded-xl bg-brand-50/60 p-4">
                <Icon className="h-5 w-5 text-brand-700" />
                <p className="mt-2 text-sm font-semibold text-slate-900">{role}</p>
                <p className="mt-1 text-xs text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
        <Card
          title="Recent activity"
          actions={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        >
          <ActivityFeed events={s?.recentEvents} loading={stats.loading} error={stats.error} />
        </Card>
      </section>
    </div>
  );
}
