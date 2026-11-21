import { useCallback, useState } from "react";
import type { Contract, ContractTransactionResponse } from "ethers";
import { getContract } from "../lib/contract";
import { decodeError } from "../lib/errors";
import { useToast } from "./useToast";
import { useWallet } from "./useWallet";

/**
 * Sends a contract write through MetaMask with pending → mined → success/error toasts.
 * Returns the mined tx hash, or null if the tx failed or was rejected.
 */
export function useTx() {
  const { getSigner, refreshRole } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (
      label: string,
      send: (c: Contract) => Promise<ContractTransactionResponse>,
      opts: { success?: string } = {},
    ): Promise<string | null> => {
      setBusy(true);
      const id = toast.push({
        kind: "pending",
        title: label,
        message: "Confirm the transaction in MetaMask…",
      });
      try {
        const signer = await getSigner();
        const contract = getContract(signer);
        const tx = await send(contract);
        toast.update(id, { message: "Submitted — waiting to be mined…", txHash: tx.hash });
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error("Transaction reverted");
        toast.update(id, {
          kind: "success",
          title: opts.success ?? `${label} — confirmed`,
          message: `Mined in block ${receipt.blockNumber}`,
          txHash: tx.hash,
        });
        void refreshRole();
        return tx.hash;
      } catch (err) {
        toast.update(id, { kind: "error", title: `${label} failed`, message: decodeError(err) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [getSigner, refreshRole, toast],
  );

  return { run, busy };
}
