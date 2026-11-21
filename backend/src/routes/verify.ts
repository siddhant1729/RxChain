import { Router } from "express";
import type { AppContext } from "../lib/context";
import { asyncHandler } from "../lib/async";
import { isBytes32 } from "../lib/validation";
import { HISTORY_EVENT_TO_LOG, type CustodyEventDTO, type VerifyResponse } from "../types";

/** Builds the public verification payload for a batch ID (never throws for bad IDs). */
export async function buildVerification(ctx: AppContext, rawId: string): Promise<VerifyResponse> {
  const base = {
    checkedAt: Math.floor(Date.now() / 1000),
    chainId: ctx.chain.deployment?.chainId ?? null,
    contract: ctx.chain.deployment?.address ?? null,
  };
  if (!isBytes32(rawId)) {
    return {
      ...base,
      batchId: rawId,
      verdict: "COUNTERFEIT",
      reason: "Malformed batch ID — not an RxChain code",
      chainTime: null,
      batch: null,
      history: [],
      participants: {},
    };
  }
  const id = rawId.toLowerCase();
  const [{ verdict, reason }, batch, rawHistory, chainTime] = await Promise.all([
    ctx.chain.verify(id),
    ctx.chain.getBatch(id),
    ctx.chain.getHistory(id),
    ctx.chain.chainTime(),
  ]);

  // Attach tx hashes from the event index: each history entry emits exactly one event.
  const logs = ctx.events.forBatch(id);
  const history: CustodyEventDTO[] = rawHistory.map((e, index) => {
    const log = logs[index];
    const matches = log && log.name === HISTORY_EVENT_TO_LOG[e.eventType];
    return {
      index,
      ...e,
      txHash: matches ? log.txHash : null,
      blockNumber: matches ? log.blockNumber : null,
    };
  });

  const addrs = [
    batch?.manufacturer ?? null,
    batch?.currentOwner ?? null,
    batch?.pendingOwner ?? null,
  ];
  for (const h of history) addrs.push(h.from, h.to);
  const participants = await ctx.chain.participantsFor(addrs);

  return { ...base, batchId: id, verdict, reason, chainTime, batch, history, participants };
}

export function verifyRouter(ctx: AppContext): Router {
  const r = Router();
  r.get(
    "/verify/:batchId",
    asyncHandler(async (req, res) => {
      res.json(await buildVerification(ctx, req.params.batchId.trim()));
    }),
  );
  return r;
}
