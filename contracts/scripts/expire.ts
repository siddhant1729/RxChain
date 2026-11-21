import { ethers, network } from "hardhat";
import { VERDICT_NAMES, loadContract } from "./lib";

/**
 * Demo helper: advances chain time just past the expiry of the seeded near-expiry batch
 * (IBU-24050 by Sun Pharma, account #1) so its verdict flips to EXPIRED.
 * Works on Hardhat and Ganache (both support evm_increaseTime / evm_mine).
 */
async function main() {
  const { rx } = await loadContract();
  const signers = await ethers.getSigners();
  const sun = signers[1];
  const batchNumber = process.env.BATCH_NUMBER ?? "IBU-24050";
  const id = await rx.computeBatchId(sun.address, batchNumber);
  const batch = await rx.getBatch(id);
  if (!batch.exists)
    throw new Error(`Batch ${batchNumber} not found — run \`npm run seed\` first.`);

  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const target = Number(batch.expiryDate) + 60;
  if (now >= target) {
    console.log(`Chain time is already past the expiry of ${batchNumber}.`);
  } else {
    const delta = target - now;
    await network.provider.send("evm_increaseTime", [delta]);
    await network.provider.send("evm_mine", []);
    console.log(`⏩ advanced chain time by ${(delta / 86400).toFixed(2)} days`);
  }
  const [verdict, reason] = await rx.verifyBatch(id);
  console.log(`${batch.drugName} (${batchNumber}) ${id}`);
  console.log(`verdict: ${VERDICT_NAMES[Number(verdict)]} — ${reason}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
