import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../lib/context";
import { asyncHandler } from "../lib/async";
import { address, bytes32 } from "../lib/validation";

const Query = z.object({
  batchId: bytes32.optional(),
  address: address.optional(),
  name: z
    .string()
    .regex(/^[A-Za-z]{1,40}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export function eventsRouter(ctx: AppContext): Router {
  const r = Router();
  r.get(
    "/events",
    asyncHandler(async (req, res) => {
      // Treat empty query params (?batchId=) as absent.
      const raw = Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== ""));
      const q = Query.parse(raw);
      const events = ctx.events.query(q);
      res.json({ events, lastBlock: ctx.indexer.lastBlock, count: events.length });
    }),
  );
  return r;
}
