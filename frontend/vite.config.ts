import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          ethers: ["ethers"],
          qr: ["html5-qrcode", "qrcode.react"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
