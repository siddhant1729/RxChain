import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fetchAllParticipants } from "../lib/contract";
import type { Participant } from "../lib/types";
import { useAsync } from "./useAsync";
import { useChainTick } from "./useChainTick";

interface Directory {
  participants: Participant[];
  byAddress: Record<string, Participant>;
  lookup: (address: string | null | undefined) => Participant | undefined;
  loading: boolean;
  error: string | null;
}

const DirectoryContext = createContext<Directory | null>(null);

/** Live on-chain participant registry, used to show names next to addresses everywhere. */
export function DirectoryProvider({ children }: { children: ReactNode }) {
  const tick = useChainTick();
  const { data, loading, error } = useAsync(fetchAllParticipants, [tick]);
  const value = useMemo<Directory>(() => {
    const participants = data ?? [];
    const byAddress = Object.fromEntries(participants.map((p) => [p.address.toLowerCase(), p]));
    return {
      participants,
      byAddress,
      lookup: (a) => (a ? byAddress[a.toLowerCase()] : undefined),
      loading: loading && !data,
      error,
    };
  }, [data, loading, error]);
  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory(): Directory {
  const ctx = useContext(DirectoryContext);
  if (!ctx) throw new Error("useDirectory must be used inside <DirectoryProvider>");
  return ctx;
}
