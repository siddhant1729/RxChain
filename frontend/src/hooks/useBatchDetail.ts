import { api } from "../lib/api";
import { fetchBatch, fetchChainTime, fetchHistory, fetchVerdict } from "../lib/contract";
import type { VerifyResult } from "../lib/types";
import { useAsync } from "./useAsync";
import { useChainTick } from "./useChainTick";

/**
 * Full batch record + verdict + history. Uses the backend (adds tx hashes and names) and falls
 * back to reading the contract directly if the API is unreachable.
 */
export function useBatchDetail(batchId: string | null) {
  const tick = useChainTick();
  return useAsync<VerifyResult | null>(async () => {
    if (!batchId) return null;
    try {
      return await api.verify(batchId);
    } catch {
      const [batch, history, v, chainTime] = await Promise.all([
        fetchBatch(batchId),
        fetchHistory(batchId),
        fetchVerdict(batchId),
        fetchChainTime(),
      ]);
      return {
        batchId,
        ...v,
        checkedAt: Date.now() / 1000,
        chainTime,
        chainId: null,
        contract: null,
        batch,
        history,
        participants: {},
      };
    }
  }, [batchId, tick]);
}
