import fs from "node:fs";
import { CONTRACT_FILE, FIXTURE_FILE, PID_FILE } from "./helpers";

export default async function globalTeardown() {
  if (fs.existsSync(PID_FILE)) {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8"));
    try {
      process.kill(-pid, "SIGTERM"); // whole process group (npx → hardhat)
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    fs.rmSync(PID_FILE, { force: true });
  }
  fs.rmSync(FIXTURE_FILE, { force: true });
  fs.rmSync(CONTRACT_FILE, { force: true });
}
