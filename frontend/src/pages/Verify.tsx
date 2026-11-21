import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Camera, ClipboardPaste, ImageUp, Loader2, RefreshCw, ScanLine } from "lucide-react";
import { BatchInfo } from "../components/BatchInfo";
import { CustodyTimeline } from "../components/CustodyTimeline";
import { DocumentCheck } from "../components/DocumentCheck";
import { QRScanner } from "../components/QRScanner";
import { scanQrFile } from "../lib/qr";
import { Skeleton } from "../components/Skeleton";
import { VerdictBanner } from "../components/VerdictBanner";
import { Button, Card, ErrorNote, Input } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { extractBatchId, formatDateTime } from "../lib/format";

type Mode = "camera" | "upload" | "paste";

function VerifyInput() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("paste");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);

  const go = (text: string) => {
    const id = extractBatchId(text);
    // Non-RxChain codes still go through the verifier so the user sees a COUNTERFEIT verdict.
    navigate(`/verify/${id ?? encodeURIComponent(text.trim().slice(0, 120) || "invalid")}`);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDecoding(true);
    try {
      go(await scanQrFile(file));
    } catch {
      setError("No QR code found in that image. Try a sharper, well-lit photo.");
    } finally {
      setDecoding(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) go(value);
  };

  const tabs: { id: Mode; label: string; Icon: typeof Camera }[] = [
    { id: "camera", label: "Scan", Icon: Camera },
    { id: "upload", label: "Upload QR", Icon: ImageUp },
    { id: "paste", label: "Paste ID", Icon: ClipboardPaste },
  ];

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <ScanLine className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Verify a medicine</h1>
        <p className="mt-2 text-slate-600">
          Scan the RxChain QR code on the pack. No wallet or login needed.
        </p>
      </div>
      <Card>
        <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => {
                setMode(id);
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold transition ${mode === id ? "bg-white text-brand-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        {mode === "camera" && <QRScanner onScan={go} />}
        {mode === "upload" && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-12 text-center hover:border-brand-500 hover:bg-brand-50/40">
            {decoding ? (
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            ) : (
              <ImageUp className="h-8 w-8 text-slate-400" />
            )}
            <span className="text-sm font-medium text-slate-700">
              {decoding ? "Reading QR code…" : "Choose or take a photo of the QR code"}
            </span>
            <span className="text-xs text-slate-500">
              PNG, JPG: a downloaded label QR works too
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        )}
        {mode === "paste" && (
          <form onSubmit={submit} className="space-y-3">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0x… batch ID or verify link"
              className="font-mono"
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={!value.trim()}>
              Verify
            </Button>
          </form>
        )}
        {error && (
          <div className="mt-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Card>
    </div>
  );
}

function VerifyResultView({ batchId }: { batchId: string }) {
  const { data, loading, error, reload } = useAsync(() => api.verify(batchId), [batchId]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl space-y-4 text-center">
        <ErrorNote>{error ?? "Verification failed"}</ErrorNote>
        <Button variant="secondary" onClick={reload} icon={<RefreshCw className="h-4 w-4" />}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <VerdictBanner
        verdict={data.verdict}
        reason={data.reason}
        drugName={data.batch ? `${data.batch.drugName} · ${data.batch.batchNumber}` : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          Checked {formatDateTime(data.checkedAt)} against contract{" "}
          {data.contract ? `${data.contract.slice(0, 10)}…` : "—"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={reload}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Re-check
          </Button>
          <Link to="/verify">
            <Button size="sm" icon={<ScanLine className="h-3.5 w-3.5" />}>
              Verify another
            </Button>
          </Link>
        </div>
      </div>
      {data.batch ? (
        <>
          <Card title="Batch details">
            <BatchInfo batch={data.batch} chainTime={data.chainTime} />
          </Card>
          <Card
            title="Chain of custody"
            subtitle={`${data.history.length} on-chain events, oldest first`}
          >
            <CustodyTimeline history={data.history} participants={data.participants} />
          </Card>
          <Card title="Document integrity check">
            <DocumentCheck batchId={data.batch.id} docHash={data.batch.docHash} />
          </Card>
        </>
      ) : (
        <Card title="What should I do?">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Do not consume this product.</li>
            <li>Check that you scanned the RxChain QR, not a promotional code.</li>
            <li>Return it to the pharmacy and report it to the state drug regulator.</li>
          </ul>
          <p className="mt-3 break-all font-mono text-xs text-slate-400">Code: {data.batchId}</p>
        </Card>
      )}
    </div>
  );
}

export default function Verify() {
  const { batchId } = useParams();
  return batchId ? <VerifyResultView batchId={batchId} /> : <VerifyInput />;
}
