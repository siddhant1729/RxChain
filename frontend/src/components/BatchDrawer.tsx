import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FilePlus2 } from "lucide-react";
import { useBatchDetail } from "../hooks/useBatchDetail";
import { useTx } from "../hooks/useTx";
import { useWallet } from "../hooks/useWallet";
import { api } from "../lib/api";
import { Drawer } from "./Modal";
import { BatchInfo } from "./BatchInfo";
import { VerdictBadge } from "./Badges";
import { CustodyTimeline } from "./CustodyTimeline";
import { QRDisplay } from "./QRDisplay";
import { SkeletonRows } from "./Skeleton";
import { Button, ErrorNote } from "./ui";

function AttachDocument({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const { run, busy } = useTx();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const attach = async () => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { hash } = await api.uploadDocument(file);
      setUploading(false);
      if (await run("Attach document", (c) => c.attachDocument(batchId, hash))) {
        setFile(null);
        onDone();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <Button
          size="sm"
          onClick={attach}
          disabled={!file}
          loading={busy || uploading}
          icon={<FilePlus2 className="h-4 w-4" />}
        >
          Upload & attach
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

/** Side drawer with the full record, QR and custody history of a batch. */
export function BatchDrawer({ batchId, onClose }: { batchId: string | null; onClose: () => void }) {
  const { data, loading, error, reload } = useBatchDetail(batchId);
  const { account } = useWallet();
  const batch = data?.batch;
  const isMfr = !!batch && batch.manufacturer.toLowerCase() === account?.toLowerCase();
  return (
    <Drawer
      open={!!batchId}
      onClose={onClose}
      title={batch ? `${batch.drugName} · ${batch.batchNumber}` : "Batch"}
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && !data && <SkeletonRows rows={6} cols={2} />}
      {data && batch && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VerdictBadge verdict={data.verdict} />
            <Link
              to={`/batch/${batch.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
            >
              Open full page <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="text-sm text-slate-600">{data.reason}</p>
          <BatchInfo batch={batch} chainTime={data.chainTime} />
          {isMfr && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-900">
                {batch.docHash ? "Replace" : "Attach"} certificate of analysis
              </h4>
              <AttachDocument batchId={batch.id} onDone={reload} />
            </div>
          )}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-slate-900">Verification QR</h4>
            <QRDisplay batchId={batch.id} />
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold text-slate-900">Custody history</h4>
            <CustodyTimeline history={data.history} participants={data.participants} />
          </div>
        </div>
      )}
    </Drawer>
  );
}
