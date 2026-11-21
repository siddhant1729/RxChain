import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { readProvider } from "../lib/contract";

const TickContext = createContext(0);

/** Increments whenever a new block is mined, so views can refetch and stay live. */
export function ChainTickProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let last = -1;
    let stopped = false;
    const poll = async () => {
      try {
        const n = await readProvider.getBlockNumber();
        if (n !== last) {
          if (last !== -1) setTick((t) => t + 1);
          last = n;
        }
      } catch {
        /* node down — keep polling */
      }
      if (!stopped) timer = window.setTimeout(poll, 2000);
    };
    let timer = window.setTimeout(poll, 0);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);
  return <TickContext.Provider value={tick}>{children}</TickContext.Provider>;
}

export function useChainTick(): number {
  return useContext(TickContext);
}
