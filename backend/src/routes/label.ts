import { Router } from "express";
import QRCode from "qrcode";
import type { AppContext } from "../lib/context";
import { asyncHandler } from "../lib/async";
import { requireBatch, verifyUrl } from "./qr";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const fmtDate = (unix: number) =>
  new Date(unix * 1000)
    .toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
    .toUpperCase();

export function labelRouter(ctx: AppContext): Router {
  const r = Router();
  r.get(
    "/label/:batchId",
    asyncHandler(async (req, res) => {
      const batch = await requireBatch(ctx, req.params.batchId);
      const url = verifyUrl(ctx, batch.id.toLowerCase());
      const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
      // The label page needs an inline script for window.print(); relax CSP for this route only.
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'",
      );
      res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Label · ${esc(batch.drugName)} · ${esc(batch.batchNumber)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;background:#f1f5f9;color:#0f172a}
  .label{width:100mm;min-height:60mm;background:#fff;border:1.5px solid #0f766e;border-radius:3mm;padding:4mm;display:flex;gap:4mm;margin:0 auto}
  .qr{width:34mm;flex-shrink:0;text-align:center} .qr svg{width:34mm;height:34mm;display:block}
  .qr small{font-size:6.5pt;color:#475569;display:block;margin-top:1mm}
  .info{flex:1;min-width:0} h1{font-size:12pt;margin:0 0 1.5mm;line-height:1.15} .mfr{font-size:8pt;color:#475569;margin-bottom:2.5mm}
  table{border-collapse:collapse;font-size:8pt;width:100%} td{padding:.6mm 0;vertical-align:top} td:first-child{color:#64748b;width:16mm}
  .brand{margin-top:2.5mm;font-size:6.5pt;color:#0f766e;font-weight:bold;letter-spacing:.04em}
  .id{font-family:monospace;font-size:5.5pt;color:#64748b;word-break:break-all;margin-top:1mm}
  .actions{text-align:center;margin-top:16px} button{background:#0f766e;color:#fff;border:0;border-radius:6px;padding:10px 18px;font-size:14px;cursor:pointer}
  @media print{body{background:#fff;padding:0}.actions{display:none}.label{margin:0}}
</style></head>
<body>
  <div class="label">
    <div class="qr">${svg}<small>Scan to verify</small></div>
    <div class="info">
      <h1>${esc(batch.drugName)}</h1>
      <div class="mfr">Mfd. by ${esc(batch.manufacturerName)}</div>
      <table>
        <tr><td>Batch No.</td><td><b>${esc(batch.batchNumber)}</b></td></tr>
        <tr><td>Mfg. Date</td><td>${fmtDate(batch.mfgDate)}</td></tr>
        <tr><td>Exp. Date</td><td><b>${fmtDate(batch.expiryDate)}</b></td></tr>
        <tr><td>Qty</td><td>${esc(batch.quantity)} units</td></tr>
      </table>
      <div class="brand">RxCHAIN VERIFIED · BLOCKCHAIN TRACEABLE</div>
      <div class="id">${esc(batch.id)}</div>
    </div>
  </div>
  <div class="actions"><button onclick="window.print()">Print label</button></div>
</body></html>`);
    }),
  );
  return r;
}
