import { useState } from "react";
import { FileCheck2, FileWarning, Upload } from "lucide-react";
import { api } from "../lib/api";
import { Button, ErrorNote } from "./ui";

/** Upload a certificate of analysis and compare its SHA-256 with the on-chain docHash. */
export function DocumentCheck({ batchId, docHash }: { batchId: string; docHash: string | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    match: boolean;
    computedHash: string;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.verifyDocument(batchId, file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!docHash)
    return (
      <p className="text-sm text-slate-500">
        The manufacturer has not attached a certificate of analysis to this batch.
      </p>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Only the document's SHA-256 fingerprint is stored on chain. Upload the certificate you were
        given to check it has not been altered.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:border-brand-500 hover:bg-brand-50/40">
          <Upload className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{file ? file.name : "Choose a PDF / image…"}</span>
          <input
            type="file"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>
        <Button onClick={check} disabled={!file} loading={busy}>
          Check document
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {result && (
        <div
          className={`flex gap-3 rounded-lg border p-3 ${result.match ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          {result.match ? (
            <FileCheck2 className="h-5 w-5 shrink-0" />
          ) : (
            <FileWarning className="h-5 w-5 shrink-0" />
          )}
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {result.match ? "Document matches" : "Document does NOT match"}
            </p>
            <p>{result.message}</p>
            <p className="mt-1 break-all font-mono text-[11px] opacity-80">
              uploaded: {result.computedHash}
            </p>
            <p className="break-all font-mono text-[11px] opacity-80">on-chain: {docHash}</p>
          </div>
        </div>
      )}
      <a
        href={api.documentUrl(docHash)}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-xs font-medium text-brand-700 hover:underline"
      >
        View the original stored document →
      </a>
    </div>
  );
}
