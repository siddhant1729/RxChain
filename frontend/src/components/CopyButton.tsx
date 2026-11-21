import { useState, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({
  value,
  label,
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API unavailable (e.g. plain http on a LAN IP) — fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${value}`}
      className={`inline-flex items-center gap-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 ${className}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {label && <span className="text-xs">{copied ? "Copied" : label}</span>}
    </button>
  );
}
