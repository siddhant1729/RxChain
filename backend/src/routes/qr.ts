import { Router } from "express";
import QRCode from "qrcode";
import type { AppContext } from "../lib/context";
import { asyncHandler } from "../lib/async";
import { badRequest, notFound } from "../lib/errors";
import { isBytes32 } from "../lib/validation";

export const verifyUrl = (ctx: AppContext, id: string) => `${ctx.config.publicAppUrl}/verify/${id}`;

/** Only issue QR codes for batches that actually exist on chain. */
async function requireBatch(ctx: AppContext, id: string) {
  if (!isBytes32(id)) throw badRequest("batchId must be 0x followed by 64 hex characters");
  const batch = await ctx.chain.getBatch(id.toLowerCase());
  if (!batch) throw notFound("Batch not found on chain");
  return batch;
}

export function qrRouter(ctx: AppContext): Router {
  const r = Router();
  r.get(
    "/qr/:file",
    asyncHandler(async (req, res) => {
      const m = /^(.+)\.(png|svg)$/i.exec(req.params.file);
      if (!m) throw badRequest("Use /api/qr/<batchId>.png or /api/qr/<batchId>.svg");
      const [, rawId, ext] = m;
      const batch = await requireBatch(ctx, rawId);
      const url = verifyUrl(ctx, batch.id.toLowerCase());
      const opts = { errorCorrectionLevel: "M" as const, margin: 2 };
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("X-Verify-Url", url);
      if (ext.toLowerCase() === "png") {
        const size = Math.min(Math.max(Number(req.query.size) || 512, 128), 2048);
        const png = await QRCode.toBuffer(url, { ...opts, type: "png", width: size });
        res.type("image/png");
        if (req.query.download !== undefined) {
          res.attachment(`rxchain-${batch.batchNumber.replace(/[^\w.-]/g, "_")}.png`);
        }
        res.send(png);
      } else {
        res.type("image/svg+xml").send(await QRCode.toString(url, { ...opts, type: "svg" }));
      }
    }),
  );
  return r;
}

export { requireBatch };
