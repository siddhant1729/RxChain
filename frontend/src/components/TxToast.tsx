import { CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import { useToast, type Toast } from "../hooks/useToast";
import { TxLink } from "./TxLink";

const ICON: Record<Toast["kind"], JSX.Element> = {
  pending: <Loader2 className="h-5 w-5 animate-spin text-brand-600" />,
  success: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
  error: <XCircle className="h-5 w-5 text-red-600" />,
  info: <Info className="h-5 w-5 text-blue-600" />,
};

/** Bottom-right stack of transaction toasts (pending → mined → success/error). */
export function TxToastContainer() {
  const { toasts, dismiss } = useToast();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto w-full max-w-sm animate-fade-in rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 pt-0.5">{ICON[t.kind]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{t.title}</p>
              {t.message && (
                <p className="mt-0.5 break-words text-sm text-slate-600">{t.message}</p>
              )}
              {t.txHash && (
                <p className="mt-1 text-xs text-slate-500">
                  Tx <TxLink hash={t.txHash} />
                </p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
