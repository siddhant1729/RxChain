import { Html5Qrcode } from "html5-qrcode";

/** Decodes a QR code from an uploaded image file. */
export async function scanQrFile(file: File): Promise<string> {
  const holder = document.createElement("div");
  holder.id = `qr-file-${Date.now()}`;
  holder.style.display = "none";
  document.body.appendChild(holder);
  const scanner = new Html5Qrcode(holder.id, { verbose: false });
  try {
    return await scanner.scanFile(file, false);
  } finally {
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
    holder.remove();
  }
}
