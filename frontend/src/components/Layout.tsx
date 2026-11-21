import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { AlertTriangle, LogOut, Menu, ScanLine, Wallet, X } from "lucide-react";
import { dashboardPath, useWallet } from "../hooks/useWallet";
import { CHAIN_NAME } from "../lib/config";
import { shortAddress } from "../lib/format";
import { RoleBadge } from "./Badges";
import { Button } from "./ui";
import { TxToastContainer } from "./TxToast";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-lg font-bold tracking-tight text-slate-900">
        Rx<span className="text-brand-700">Chain</span>
      </span>
    </Link>
  );
}

function WalletButton() {
  const w = useWallet();
  if (!w.hasProvider) {
    return (
      <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
        <Button variant="secondary" size="sm" icon={<Wallet className="h-4 w-4" />}>
          Install MetaMask
        </Button>
      </a>
    );
  }
  if (!w.account) {
    return (
      <Button
        size="sm"
        onClick={w.connect}
        loading={w.connecting}
        icon={<Wallet className="h-4 w-4" />}
      >
        Connect Wallet
      </Button>
    );
  }
  if (!w.correctChain) {
    return (
      <Button
        size="sm"
        variant="warning"
        onClick={() => void w.switchChain()}
        icon={<AlertTriangle className="h-4 w-4" />}
      >
        Switch to {CHAIN_NAME}
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <div className="max-w-[12rem] truncate text-sm font-semibold text-slate-900">
          {w.participant?.name ?? "Unregistered wallet"}
        </div>
        <div className="font-mono text-[11px] text-slate-500">{shortAddress(w.account)}</div>
      </div>
      {w.role && <RoleBadge role={w.isAdmin && w.role === "Regulator" ? "Regulator" : w.role} />}
      <button
        onClick={w.disconnect}
        title="Disconnect"
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function NavItem({
  to,
  children,
  onClick,
}: {
  to: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`
      }
    >
      {children}
    </NavLink>
  );
}

export function Layout() {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const dash = dashboardPath(w.role, w.isAdmin);
  const links = (close?: () => void) => (
    <>
      <NavItem to="/verify" onClick={close}>
        <span className="inline-flex items-center gap-1.5">
          <ScanLine className="h-4 w-4" /> Verify
        </span>
      </NavItem>
      {dash && (
        <NavItem to={dash} onClick={close}>
          Dashboard
        </NavItem>
      )}
      {w.isAdmin && dash !== "/admin" && (
        <NavItem to="/admin" onClick={close}>
          Admin
        </NavItem>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-1 md:flex">{links()}</nav>
          </div>
          <div className="flex items-center gap-2">
            <WalletButton />
            <button
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 md:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-label="Menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t border-slate-100 px-4 py-2 md:hidden">
            {links(() => setOpen(false))}
          </nav>
        )}
      </header>
      {w.error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-700">
          {w.error}
        </div>
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:px-6">
          <span>RxChain · Blockchain drug supply-chain tracking & anti-counterfeiting</span>
          <span>JIIT · Fundamentals of Blockchain Technology (PBL)</span>
        </div>
      </footer>
      <TxToastContainer />
    </div>
  );
}
