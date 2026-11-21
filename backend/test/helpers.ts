import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const TEST_RPC_PORT = Number(process.env.TEST_RPC_PORT ?? 8555);
export const TEST_RPC_URL = `http://127.0.0.1:${TEST_RPC_PORT}`;
export const FIXTURE_FILE = path.join(os.tmpdir(), `rxchain-backend-fixture-${TEST_RPC_PORT}.json`);
export const CONTRACT_FILE = path.join(
  os.tmpdir(),
  `rxchain-backend-contract-${TEST_RPC_PORT}.json`,
);
export const PID_FILE = path.join(os.tmpdir(), `rxchain-backend-node-${TEST_RPC_PORT}.pid`);
export const TEST_DOC = Buffer.from("RxChain test certificate of analysis — assay 99.8%");

export interface Fixture {
  ids: {
    genuine: string;
    inSupplyChain: string;
    pending: string;
    recalled: string;
    expired: string;
  };
  addresses: { admin: string; manufacturer: string; distributor: string; pharmacy: string };
  docHash: string;
}

export function readFixture(): Fixture {
  return JSON.parse(fs.readFileSync(FIXTURE_FILE, "utf8")) as Fixture;
}
