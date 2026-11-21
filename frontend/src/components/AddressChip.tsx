import { useDirectory } from "../hooks/useDirectory";
import { shortAddress } from "../lib/format";
import type { Participant } from "../lib/types";
import { RoleBadge } from "./Badges";
import { CopyButton } from "./CopyButton";

/** Shortened address with participant-name lookup and a copy button. */
export function AddressChip({
  address,
  participant,
  showRole = false,
  compact = false,
}: {
  address: string | null | undefined;
  participant?: Participant;
  showRole?: boolean;
  compact?: boolean;
}) {
  const { lookup } = useDirectory();
  if (!address) return <span className="text-slate-400">—</span>;
  const p = participant ?? lookup(address);
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 align-middle">
      {p ? (
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-900" title={p.name}>
            {p.name}
          </span>
          {!compact && (
            <span className="block font-mono text-[11px] text-slate-500">
              {shortAddress(address)}
            </span>
          )}
        </span>
      ) : (
        <span className="font-mono text-xs text-slate-700" title={address}>
          {shortAddress(address)}
        </span>
      )}
      {showRole && p && <RoleBadge role={p.role} />}
      <CopyButton value={address} />
    </span>
  );
}
