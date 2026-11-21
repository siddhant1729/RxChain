import "dotenv/config";
import { loadConfig } from "./config";
import { createContext } from "./context";
import { createApp } from "./app";

async function main() {
  const config = loadConfig();
  const ctx = createContext(config);

  const imported = ctx.documents.importDirectory(config.samplesDir);
  if (imported)
    console.log(`[docs] imported ${imported} reference document(s) from ${config.samplesDir}`);

  if (ctx.chain.deployment) {
    console.log(
      `[chain] RxChain ${ctx.chain.deployment.address} on chainId ${ctx.chain.deployment.chainId} via ${config.rpcUrl}`,
    );
  } else {
    console.warn(`[chain] ${config.contractFile} not found — waiting for \`npm run deploy\``);
  }
  ctx.chain.watch();
  ctx.indexer.start();

  const app = createApp(ctx);
  const server = app.listen(config.port, () => {
    console.log(`[api] RxChain backend listening on http://localhost:${config.port}`);
  });

  const shutdown = () => {
    server.close();
    ctx.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
