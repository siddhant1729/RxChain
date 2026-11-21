import { fetchAllBatchIds, fetchBatches, fetchIds, fetchVerdict } from "../lib/contract";
import type { Batch, VerdictName } from "../lib/types";
import { useAsync } from "./useAsync";
import { useChainTick } from "./useChainTick";

export type BatchWithVerdict = Batch & { verdict: VerdictName; reason: string };

async function withVerdicts(batches: Batch[]): Promise<BatchWithVerdict[]> {
  const verdicts = await Promise.all(batches.map((b) => fetchVerdict(b.id)));
  return batches.map((b, i) => ({ ...b, ...verdicts[i] }));
}

type Source = "all" | "getBatchesByOwner" | "getBatchesByManufacturer" | "getPendingIncoming";

/** Batches read straight from the contract (live: refetches on every new block). */
export function useBatches(source: Source, account?: string | null) {
  const tick = useChainTick();
  return useAsync<BatchWithVerdict[]>(async () => {
    if (source !== "all" && !account) return [];
    const ids = source === "all" ? await fetchAllBatchIds() : await fetchIds(source, account!);
    return withVerdicts(await fetchBatches(ids));
  }, [source, account, tick]);
}
