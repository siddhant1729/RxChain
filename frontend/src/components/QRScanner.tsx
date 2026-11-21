import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff } from "lucide-react";
import { ErrorNote } from "./ui";

/** Live camera QR scanner (prefers the rear camera). Calls onScan once with the decoded text. */
export function QRScanner({ onScan }: { onScan: (text: string) => void }) {
  const rawId = useId();
  const elementId = `qr-reader-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const scanner = new Html5Qrcode(elementId, { verbose: false });
    let done = false;
    const started = scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (w, h) => {
            const s = Math.floor(Math.min(w, h) * 0.7);
            return { width: s, height: s };
          },
        },
        (text) => {
          if (done) return;
          done = true;
          onScanRef.current(text);
        },
        () => undefined, // per-frame "no QR found" — ignore
      )
      .then(() => setStarting(false))
      .catch((e: unknown) => {
        setStarting(false);
        const msg = String((e as Error)?.message ?? e);
        setError(
          /permission|notallowed/i.test(msg)
            ? "Camera permission denied. Allow camera access, or upload a photo of the QR code instead."
            : /secure|https/i.test(msg) || !window.isSecureContext
              ? "The camera needs HTTPS (or localhost). Upload a photo of the QR, or open the QR link with your phone's camera app."
              : `Could not start the camera: ${msg}`,
        );
      });
    return () => {
      done = true;
      started
        .then(() => (scanner.isScanning ? scanner.stop() : undefined))
        .catch(() => undefined)
        .finally(() => {
          try {
            scanner.clear();
          } catch {
            /* element already gone */
          }
        });
    };
  }, [elementId]);

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-slate-900">
        <div
          id={elementId}
          className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />
        {starting && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
            <Camera className="h-8 w-8 animate-pulse" />
            <span className="text-sm">Starting camera…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            <CameraOff className="h-10 w-10" />
          </div>
        )}
      </div>
      {error && (
        <div className="mx-auto mt-3 max-w-sm">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </div>
  );
}
