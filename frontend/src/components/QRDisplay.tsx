import { QRCodeSVG } from "qrcode.react";
import { Download, Printer } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "./ui";

/** Shows the verification QR for a batch with PNG download + printable label actions. */
export function QRDisplay({
  batchId,
  size = 168,
  actions = true,
}: {
  batchId: string;
  size?: number;
  actions?: boolean;
}) {
  // Encode the same URL the backend encodes in PNG/label QRs so a phone camera opens the verify page.
  const url = `${window.location.origin}/verify/${batchId}`;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <QRCodeSVG value={url} size={size} level="M" marginSize={0} />
      </div>
      <p className="max-w-[16rem] break-all text-center font-mono text-[10px] text-slate-500">
        {url}
      </p>
      {actions && (
        <div className="flex flex-wrap justify-center gap-2">
          <a href={api.qrPngUrl(batchId, true)} download>
            <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />}>
              Download PNG
            </Button>
          </a>
          <a href={api.labelUrl(batchId)} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />}>
              Print label
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
