#!/usr/bin/env node
/**
 * One-command demo: starts a Hardhat node (unless one is already running on 8545), waits for
 * it, deploys RxChain, seeds demo data, then runs the backend + frontend until Ctrl-C.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const LOG_DIR = path.join(ROOT, ".demo");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [];

async function rpcUp() {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function start(args, opts = {}) {
  const child = spawn(npm, args, { cwd: ROOT, detached: process.platform !== "win32", ...opts });
  children.push(child);
  return child;
}

function run(args) {
  const r = spawnSync(npm, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n✖ \`npm ${args.join(" ")}\` failed`);
    shutdown(1);
  }
}

function shutdown(code = 0) {
  for (const c of children) {
    try {
      if (process.platform === "win32") c.kill();
      else process.kill(-c.pid, "SIGTERM");
    } catch {
      /* already exited */
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (await rpcUp()) {
    console.log(`• A chain is already running at ${RPC} — reusing it.`);
  } else {
    const log = fs.openSync(path.join(LOG_DIR, "chain.log"), "w");
    console.log(`• Starting Hardhat node (log: .demo/chain.log)…`);
    const chain = start(["run", "chain"], { stdio: ["ignore", log, log] });
    chain.on("exit", (code) => {
      console.error(`✖ Hardhat node exited (${code}). See .demo/chain.log`);
      shutdown(1);
    });
    const deadline = Date.now() + 90_000;
    while (!(await rpcUp())) {
      if (Date.now() > deadline) {
        console.error("✖ Hardhat node did not start within 90s");
        shutdown(1);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log("✓ Chain is up");
  }

  run(["run", "deploy"]);
  run(["run", "seed"]);

  console.log("\n• Starting backend (http://localhost:4000) and frontend (http://localhost:5173)…");
  console.log("  Press Ctrl-C to stop everything.\n");
  const dev = start(["run", "dev"], { stdio: "inherit" });
  dev.on("exit", (code) => shutdown(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  shutdown(1);
});
