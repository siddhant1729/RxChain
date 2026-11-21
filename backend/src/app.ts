import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import type { AppContext } from "./lib/context";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { healthRouter } from "./routes/health";
import { verifyRouter } from "./routes/verify";
import { qrRouter } from "./routes/qr";
import { labelRouter } from "./routes/label";
import { documentsRouter } from "./routes/documents";
import { statsRouter } from "./routes/stats";
import { eventsRouter } from "./routes/events";

export function createApp(ctx: AppContext, opts: { logging?: boolean } = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      // QR images and documents are embedded by the frontend on another origin.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({ origin: ctx.config.corsOrigin, exposedHeaders: ["X-Verify-Url", "X-Content-SHA256"] }),
  );
  app.use(express.json({ limit: "100kb" }));
  if (opts.logging !== false) app.use(morgan("dev"));

  const api = express.Router();
  api.use(healthRouter(ctx));
  api.use(verifyRouter(ctx));
  api.use(qrRouter(ctx));
  api.use(labelRouter(ctx));
  api.use(documentsRouter(ctx));
  api.use(statsRouter(ctx));
  api.use(eventsRouter(ctx));
  app.use("/api", api);

  app.get("/", (_req, res) => {
    res.json({ name: "RxChain API", docs: "See README.md → API reference", health: "/api/health" });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
