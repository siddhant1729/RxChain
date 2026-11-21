import { AlertTriangle, CheckCircle2, Clock, RotateCcw, Truck, XOctagon } from "lucide-react";
import type { VerdictName } from "../lib/types";
import { VERDICT_ADVICE, VERDICT_STYLE } from "../lib/verdict";

const ICONS = {
  check: CheckCircle2,
  x: XOctagon,
  alert: AlertTriangle,
  recall: RotateCcw,
  clock: Clock,
  truck: Truck,
};

export function VerdictBanner({
  verdict,
  reason,
  drugName,
}: {
  verdict: VerdictName;
  reason: string;
  drugName?: string;
}) {
  const s = VERDICT_STYLE[verdict];
  const Icon = ICONS[s.icon];
  return (
    <div
      className={`overflow-hidden rounded-2xl shadow-lg ${s.banner}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 px-6 py-8 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left">
        <Icon className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" strokeWidth={1.75} />
        <div className="min-w-0">
          {drugName && (
            <p className="text-sm font-medium uppercase tracking-wider opacity-90">{drugName}</p>
          )}
          <p className="text-3xl font-extrabold tracking-tight sm:text-4xl">{s.headline}</p>
          <p className="mt-1 text-base font-medium opacity-95">{reason}</p>
        </div>
      </div>
      <div className="bg-black/10 px-6 py-3 text-sm leading-relaxed">{VERDICT_ADVICE[verdict]}</div>
    </div>
  );
}
