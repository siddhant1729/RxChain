import { Router } from "express";
import type { AppContext } from "../lib/context";
import { asyncHandler } from "../lib/async";

export function healthRouter(ctx: AppContext): Router {
  const r = Router();
  r.get(
    "/health",
    asyncHandler(async (_req, res) => {
      const chain = await ctx.chain.status();
      const ok = chain.rpcReachable && chain.contractDeployed;
      res.status(ok ? 200 : 503).json({
        status: ok ? "ok" : "degraded",
        uptime: Math.round(process.uptime()),
        chain,
        indexer: {
          lastBlock: ctx.indexer.lastBlock,
          events: ctx.events.count(),
          lastError: ctx.indexer.lastError,
        },
      });
    }),
  );
  return r;
}
