import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Ban, ShieldAlert, UserX, Wallet } from "lucide-react";
import { dashboardPath, useWallet } from "../hooks/useWallet";
import { CHAIN_ID, CHAIN_NAME } from "../lib/config";
import type { RoleName } from "../lib/types";
import { Button } from "./ui";
import { CopyButton } from "./CopyButton";
import { SkeletonCard } from "./Skeleton";

function Gate({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        {icon}
      </div>
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <div className="mt-3 space-y-4 text-sm text-slate-600">{children}</div>
    </div>
  );
}

/** Screen for a connected wallet that is not in the participant registry. */
export function NotRegistered({ address }: { address: string }) {
  return (
    <Gate icon={<UserX className="h-7 w-7" />} title="Not registered — ask the regulator">
      <p>
        This wallet is not a registered RxChain participant. Send your address to the regulator so
        they can register you with the right role.
      </p>
      <div className="mx-auto flex max-w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <code className="break-all font-mono text-xs text-slate-800">{address}</code>
        <CopyButton value={address} label="Copy" />
      </div>
      <p>
        Just want to check a medicine?{" "}
        <Link to="/verify" className="font-semibold text-brand-700 hover:underline">
          Verify without a wallet
        </Link>
      </p>
    </Gate>
  );
}

/**
 * Route guard: requires MetaMask, a connection, the right chain, a registered + active
 * participant, and one of `roles` (admins always pass when `allowAdmin`).
 */
export function RequireRole({
  roles,
  allowAdmin = false,
  children,
}: {
  roles: RoleName[];
  allowAdmin?: boolean;
  children: ReactNode;
}) {
  const w = useWallet();

  if (!w.hasProvider) {
    return (
      <Gate icon={<Wallet className="h-7 w-7" />} title="MetaMask required">
        <p>
          Dashboards sign transactions with MetaMask. Install it, then import one of the demo
          accounts printed by <code>npm run seed</code>.
        </p>
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          <Button>Install MetaMask</Button>
        </a>
      </Gate>
    );
  }
  if (!w.account) {
    return (
      <Gate icon={<Wallet className="h-7 w-7" />} title="Connect your wallet">
        <p>Connect the MetaMask account of your organisation to open this dashboard.</p>
        <Button onClick={w.connect} loading={w.connecting}>
          Connect Wallet
        </Button>
      </Gate>
    );
  }
  if (!w.correctChain) {
    return (
      <Gate icon={<AlertTriangle className="h-7 w-7" />} title={`Wrong network`}>
        <p>
          MetaMask is on chain {w.chainId}. RxChain runs on <b>{CHAIN_NAME}</b> (chainId {CHAIN_ID}
          ).
        </p>
        <Button onClick={() => void w.switchChain()}>Switch / add {CHAIN_NAME}</Button>
      </Gate>
    );
  }
  if (w.loadingRole && !w.participant && !w.isAdmin) return <SkeletonCard />;
  if (!w.participant && !(allowAdmin && w.isAdmin)) return <NotRegistered address={w.account} />;
  if (w.participant && !w.participant.active) {
    return (
      <Gate icon={<Ban className="h-7 w-7" />} title="Account suspended">
        <p>
          <b>{w.participant.name}</b> has been suspended by the regulator. Suspended participants
          cannot create, transfer or confirm batches. Contact the regulator to be reactivated.
        </p>
      </Gate>
    );
  }
  const allowed = (w.role && roles.includes(w.role)) || (allowAdmin && w.isAdmin);
  if (!allowed) {
    const mine = dashboardPath(w.role, w.isAdmin);
    return (
      <Gate icon={<ShieldAlert className="h-7 w-7" />} title="Not your dashboard">
        <p>
          This page is for <b>{roles.join(" / ")}</b> accounts. You are connected as{" "}
          <b>{w.participant?.name}</b> ({w.role}).
        </p>
        {mine && (
          <Link to={mine}>
            <Button>Go to my dashboard</Button>
          </Link>
        )}
      </Gate>
    );
  }
  return <>{children}</>;
}
