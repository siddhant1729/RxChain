import { Building2, Factory, ShieldCheck, Store, Truck, UserX } from "lucide-react";
import type { RoleName, StatusName, VerdictName } from "../lib/types";
import { STATUS_STYLE, VERDICT_STYLE } from "../lib/verdict";
import { Badge } from "./ui";

const ROLE_STYLE: Record<RoleName, { cls: string; Icon: typeof Factory }> = {
  Manufacturer: { cls: "bg-violet-50 text-violet-700 ring-violet-600/20", Icon: Factory },
  Distributor: { cls: "bg-sky-50 text-sky-700 ring-sky-600/20", Icon: Truck },
  Pharmacy: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", Icon: Store },
  Regulator: { cls: "bg-amber-50 text-amber-800 ring-amber-600/20", Icon: ShieldCheck },
  None: { cls: "bg-slate-100 text-slate-600 ring-slate-500/20", Icon: UserX },
};

export function RoleBadge({ role }: { role: RoleName }) {
  const { cls, Icon } = ROLE_STYLE[role] ?? { cls: ROLE_STYLE.None.cls, Icon: Building2 };
  return (
    <Badge className={cls}>
      <Icon className="h-3 w-3" />
      {role === "None" ? "Unregistered" : role}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: StatusName }) {
  const s = STATUS_STYLE[status];
  return <Badge className={s.className}>{s.label}</Badge>;
}

export function VerdictBadge({ verdict }: { verdict: VerdictName }) {
  const s = VERDICT_STYLE[verdict];
  return <Badge className={s.badge}>{s.label}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Active</Badge>
  ) : (
    <Badge className="bg-red-50 text-red-700 ring-red-600/20">Suspended</Badge>
  );
}
