import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { AppContext } from "../lib/context";
import { asyncHandler } from "../lib/async";
import { badRequest, notFound } from "../lib/errors";
import { bytes32 } from "../lib/validation";
import { sha256Hex } from "../services/documents";

const VerifyBody = z.object({ batchId: bytes32 });

export function documentsRouter(ctx: AppContext): Router {
  const r = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: ctx.config.maxUploadBytes, files: 1 },
  });

  /** Store a document off-chain and return its SHA-256 for use on chain. */
  r.post(
    "/documents",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) throw badRequest("Attach the document as multipart field 'file'");
      const rec = ctx.documents.save(req.file.buffer, req.file.originalname, req.file.mimetype);
      res.status(201).json({
        hash: rec.hash,
        fileId: rec.fileId,
        originalName: rec.originalName,
        mimeType: rec.mimeType,
        size: rec.size,
        url: `/api/documents/${rec.hash}`,
      });
    }),
  );

  /** Recompute an uploaded file's hash and compare with the batch's on-chain docHash. */
  r.post(
    "/documents/verify",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) throw badRequest("Attach the document as multipart field 'file'");
      const { batchId } = VerifyBody.parse(req.body);
      const batch = await ctx.chain.getBatch(batchId.toLowerCase());
      if (!batch) throw notFound("Batch not found on chain");
      const computedHash = sha256Hex(req.file.buffer);
      const onChainHash = batch.docHash;
      const match = onChainHash !== null && onChainHash.toLowerCase() === computedHash;
      res.json({
        batchId: batch.id,
        match,
        computedHash,
        onChainHash,
        fileName: req.file.originalname,
        message:
          onChainHash === null
            ? "No document hash is recorded on chain for this batch"
            : match
              ? "Document is authentic — hash matches the on-chain record"
              : "Document does NOT match the on-chain hash — it has been altered or is not the original",
      });
    }),
  );

  /** Metadata only. */
  r.get(
    "/documents/:hash/meta",
    asyncHandler(async (req, res) => {
      const hash = bytes32.parse(req.params.hash).toLowerCase();
      const rec = ctx.documents.get(hash);
      if (!rec) throw notFound("Document not stored off-chain");
      res.json({ ...rec, storedName: undefined, url: `/api/documents/${rec.hash}` });
    }),
  );

  /** Download/view the stored file. */
  r.get(
    "/documents/:hash",
    asyncHandler(async (req, res) => {
      const hash = bytes32.parse(req.params.hash).toLowerCase();
      const rec = ctx.documents.get(hash);
      const file = rec ? ctx.documents.pathOf(rec) : null;
      if (!rec || !file || !fs.existsSync(file)) throw notFound("Document not stored off-chain");
      res.setHeader("Content-Type", rec.mimeType);
      res.setHeader("X-Content-SHA256", rec.hash);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${rec.originalName.replace(/["\\\r\n]/g, "_")}"`,
      );
      res.sendFile(file);
    }),
  );

  return r;
}
