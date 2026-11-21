import assert from "node:assert/strict";
import { ethers } from "hardhat";
import type { Signer } from "ethers";
import type { RxChain } from "../typechain-types";
import { Role, VERDICT_NAMES, hardhatPrivateKey, loadContract } from "./lib";

/**
 * End-to-end demo flow driven by real signed transactions from the seeded Hardhat keys:
 * register → create → transfer → confirm → forward → confirm → verify Genuine → recall → verify Recalled.
 * If BACKEND_URL is reachable, the verdicts are also checked through the REST API.
 */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

function wallet(index: number) {
  const pk = hardhatPrivateKey(index);
  if (!pk) throw new Error("e2e requires Hardhat's default HD accounts (chainId 31337).");
  return new ethers.NonceManager(new ethers.Wallet(pk, ethers.provider));
}

async function apiVerdict(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/verify/${id}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { verdict: string };
    return body.verdict;
  } catch {
    return null;
  }
}

async function main() {
  const { rx } = await loadContract();
  const { chainId } = await ethers.provider.getNetwork();
  assert.equal(Number(chainId), 31337, "run e2e against the Hardhat node (chainId 31337)");

  const admin = wallet(0);
  const sun = wallet(1);
  const medline = wallet(3);
  const newPharmacy = wallet(7);
  const as = (s: Signer) => rx.connect(s) as RxChain;
  const step = (n: number, msg: string) => console.log(`[${n}/9] ${msg}`);
  const verdict = async (id: string) => VERDICT_NAMES[Number((await rx.verifyBatch(id))[0])];

  // 1. register a new pharmacy (account #7)
  const pharmacyAddr = await newPharmacy.getAddress();
  const existing = await rx.getParticipant(pharmacyAddr);
  if (Number(existing.role) === Role.None) {
    await (
      await as(admin).registerParticipant(
        pharmacyAddr,
        Role.Pharmacy,
        "E2E Test Pharmacy",
        "RDL-E2E-0001",
        "Noida",
      )
    ).wait();
  }
  assert.equal(Number((await rx.getParticipant(pharmacyAddr)).role), Role.Pharmacy);
  assert.equal(await rx.isActiveParticipant(pharmacyAddr), true);
  step(1, `registered pharmacy ${pharmacyAddr}`);

  // 2. create
  const sunAddr = await sun.getAddress();
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const batchNumber = `E2E-${Date.now()}`;
  const docHash = ethers.sha256(ethers.toUtf8Bytes(`CoA for ${batchNumber}`));
  await (
    await as(sun).createBatch(
      "Pantoprazole 40mg",
      batchNumber,
      now - 86400,
      now + 400 * 86400,
      3000,
      docHash,
    )
  ).wait();
  const id = await rx.computeBatchId(sunAddr, batchNumber);
  const created = await rx.getBatch(id);
  assert.equal(created.exists, true);
  assert.equal(created.currentOwner, sunAddr);
  assert.equal(created.docHash, docHash);
  assert.equal(await verdict(id), "InSupplyChain");
  step(2, `created batch ${batchNumber} → ${id}`);

  // 3. transfer M → D
  const medlineAddr = await medline.getAddress();
  await (await as(sun).initiateTransfer(id, medlineAddr, "E2E invoice")).wait();
  assert.equal((await rx.getBatch(id)).pendingOwner, medlineAddr);
  assert.ok((await rx.getPendingIncoming(medlineAddr)).includes(id));
  step(3, "Sun Pharma → MedLine transfer initiated");

  // 4. confirm
  await (await as(medline).confirmReceipt(id)).wait();
  assert.equal((await rx.getBatch(id)).currentOwner, medlineAddr);
  assert.equal(await verdict(id), "InSupplyChain");
  step(4, "MedLine confirmed receipt");

  // 5. forward D → P
  await (await as(medline).initiateTransfer(id, pharmacyAddr, "E2E delivery challan")).wait();
  step(5, "MedLine → E2E Test Pharmacy transfer initiated");

  // 6. confirm
  await (await as(newPharmacy).confirmReceipt(id)).wait();
  const delivered = await rx.getBatch(id);
  assert.equal(delivered.currentOwner, pharmacyAddr);
  assert.equal(Number(delivered.status), 2, "status should be Delivered");
  step(6, "pharmacy confirmed receipt");

  // 7. verify Genuine
  assert.equal(await verdict(id), "Genuine");
  const api1 = await apiVerdict(id);
  if (api1 !== null) assert.equal(api1, "GENUINE");
  step(7, `verdict GENUINE ✔${api1 ? " (backend agrees)" : ""}`);

  // 8. recall by regulator
  await (await as(admin).recallBatch(id, "E2E regulatory recall")).wait();
  step(8, "regulator recalled the batch");

  // 9. verify Recalled
  assert.equal(await verdict(id), "Recalled");
  const history = await rx.getHistory(id);
  assert.equal(history.length, 6);
  const api2 = await apiVerdict(id);
  if (api2 !== null) assert.equal(api2, "RECALLED");
  step(9, `verdict RECALLED ✔${api2 ? " (backend agrees)" : ""}`);

  // illegal-flow sanity check: the recalled batch can no longer move
  await assert.rejects(as(newPharmacy).initiateTransfer(id, medlineAddr, "x"));

  console.log("\nE2E PASSED ✅");
}

main().catch((err) => {
  console.error("\nE2E FAILED ❌");
  console.error(err);
  process.exitCode = 1;
});
