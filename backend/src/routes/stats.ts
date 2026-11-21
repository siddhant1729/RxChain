import { Router } from "express";
import type { AppContext } from "../lib/context";
import { asyncHandler } from "../lib/async";
import { ROLE_NAMES, STATUS_NAMES } from "../types";

export function statsRouter(ctx: AppContext): Router {
  const r = Router();
  r.get(
    "/stats",
    asyncHandler(async (_req, res) => {
      const [batches, participants, chainTime, paused] = await Promise.all([
        ctx.chain.getAllBatches(),
        ctx.chain.getAllParticipants(),
        ctx.chain.chainTime(),
        ctx.chain.isPaused(),
      ]);
      const byStatus = Object.fromEntries(STATUS_NAMES.map((s) => [s, 0])) as Record<
        string,
        number
      >;
      for (const b of batches) byStatus[b.status]++;
      const expired = batches.filter(
        (b) => b.status !== "Recalled" && b.expiryDate < chainTime,
      ).length;

      const byRole = Object.fromEntries(ROLE_NAMES.slice(1).map((r) => [r, 0])) as Record<
        string,
        number
      >;
      for (const p of participants) byRole[p.role]++;

      const recentEvents = ctx.events.query({ limit: 15 });
      const addrs = new Set<string>();
      for (const e of recentEvents) for (const a of e.addresses) addrs.add(a);
      const known = Object.fromEntries(participants.map((p) => [p.address.toLowerCase(), p]));
      const names = Object.fromEntries(
        [...addrs]
          .filter((a) => known[a])
          .map((a) => [a, { name: known[a].name, role: known[a].role }]),
      );

      res.json({
        batches: { total: batches.length, byStatus, expired },
        participants: {
          total: participants.length,
          active: participants.filter((p) => p.active).length,
          byRole,
        },
        transfers: ctx.events.query({ name: "TransferConfirmed", limit: 500 }).length,
        paused,
        chainTime,
        recentEvents,
        names,
      });
    }),
  );
  return r;
}
