import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  REPO_ROOT,
  Role,
  ROLE_NAMES,
  STATUS_NAMES,
  VERDICT_NAMES,
  hardhatPrivateKey,
  loadContract,
} from "./lib";

const DAY = 24 * 60 * 60;

/** Days from "now" (chain time) to the near-term expiry of the demo batch #5. */
export const NEAR_EXPIRY_DAYS = 3;
export const NEAR_EXPIRY_BATCH = "IBU-24050";

const PARTICIPANTS = [
  {
    index: 1,
    role: Role.Manufacturer,
    name: "Sun Pharma Ltd",
    license: "MFG-MH-2011-0457",
    location: "Mumbai, Maharashtra",
  },
  {
    index: 2,
    role: Role.Manufacturer,
    name: "Cipla Ltd",
    license: "MFG-MH-1998-0112",
    location: "Mumbai, Maharashtra",
  },
  {
    index: 3,
    role: Role.Distributor,
    name: "MedLine Distributors",
    license: "WDL-DL-2019-3381",
    location: "New Delhi",
  },
  {
    index: 4,
    role: Role.Distributor,
    name: "HealthKart Logistics",
    license: "WDL-HR-2020-0921",
    location: "Gurugram, Haryana",
  },
  {
    index: 5,
    role: Role.Pharmacy,
    name: "Apollo Pharmacy Noida",
    license: "RDL-UP-2018-7782",
    location: "Sector 18, Noida, UP",
  },
  {
    index: 6,
    role: Role.Pharmacy,
    name: "City Care Chemist",
    license: "RDL-UP-2021-1290",
    location: "Sector 62, Noida, UP",
  },
] as const;

function sha256File(file: string): string {
  return "0x" + createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function main() {
  const { rx } = await loadContract();
  const signers = await ethers.getSigners();
  if (signers.length < 7)
    throw new Error("Need at least 7 unlocked accounts (Hardhat node provides 20).");
  const [admin, sun, cipla, medline, healthkart, apollo, citycare] = signers;

  // ── Participants ──────────────────────────────────────────────────────────
  for (const p of PARTICIPANTS) {
    const account = signers[p.index].address;
    const existing = await rx.getParticipant(account);
    if (Number(existing.role) !== Role.None) {
      console.log(`• ${p.name} already registered`);
      continue;
    }
    await (
      await rx.connect(admin).registerParticipant(account, p.role, p.name, p.license, p.location)
    ).wait();
    console.log(`✓ registered ${ROLE_NAMES[p.role]} ${p.name}`);
  }

  // ── Batches ───────────────────────────────────────────────────────────────
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const coa = path.join(REPO_ROOT, "samples", "CoA-PCM-24001.pdf");
  const coaHash = fs.existsSync(coa) ? sha256File(coa) : ethers.ZeroHash;

  type Step = (id: string) => Promise<unknown>;
  const send = async (p: Promise<{ wait: () => Promise<unknown> }>) => (await p).wait();
  const transfer =
    (from: HardhatEthersSigner, to: HardhatEthersSigner, note: string): Step =>
    (id) =>
      send(rx.connect(from).initiateTransfer(id, to.address, note));
  const confirm =
    (by: HardhatEthersSigner): Step =>
    (id) =>
      send(rx.connect(by).confirmReceipt(id));

  const batches: {
    maker: HardhatEthersSigner;
    drug: string;
    number: string;
    mfgDaysAgo: number;
    expiryDays: number;
    qty: number;
    docHash?: string;
    steps: Step[];
    label: string;
  }[] = [
    {
      label: "1. Fully delivered (M → D → P)",
      maker: sun,
      drug: "Paracetamol 500mg",
      number: "PCM-24001",
      mfgDaysAgo: 30,
      expiryDays: 730,
      qty: 10000,
      docHash: coaHash,
      steps: [
        transfer(sun, medline, "Invoice SUN/INV/8812"),
        confirm(medline),
        transfer(medline, apollo, "DC MDL/DC/4410"),
        confirm(apollo),
      ],
    },
    {
      label: "2. Held by a distributor",
      maker: cipla,
      drug: "Amoxicillin 250mg",
      number: "AMX-24017",
      mfgDaysAgo: 20,
      expiryDays: 540,
      qty: 5000,
      steps: [transfer(cipla, healthkart, "Invoice CIP/INV/2231"), confirm(healthkart)],
    },
    {
      label: "3. Transfer pending (awaiting MedLine)",
      maker: sun,
      drug: "Azithromycin 500mg",
      number: "AZI-24033",
      mfgDaysAgo: 10,
      expiryDays: 365,
      qty: 2400,
      steps: [transfer(sun, medline, "Invoice SUN/INV/8840")],
    },
    {
      label: "4. Recalled",
      maker: cipla,
      drug: "Cetirizine 10mg",
      number: "CTZ-24008",
      mfgDaysAgo: 45,
      expiryDays: 700,
      qty: 8000,
      steps: [
        transfer(cipla, medline, "Invoice CIP/INV/2199"),
        confirm(medline),
        (id) => send(rx.connect(cipla).recallBatch(id, "Contamination detected in QC")),
      ],
    },
    {
      label: `5. Near-term expiry (run \`npm run expire\`)`,
      maker: sun,
      drug: "Ibuprofen 400mg",
      number: NEAR_EXPIRY_BATCH,
      mfgDaysAgo: 700,
      expiryDays: NEAR_EXPIRY_DAYS,
      qty: 1200,
      steps: [
        transfer(sun, medline, "Clearance stock"),
        confirm(medline),
        transfer(medline, citycare, "DC MDL/DC/4502"),
        confirm(citycare),
      ],
    },
    {
      label: "6. D → D → P path",
      maker: cipla,
      drug: "Metformin 500mg",
      number: "MET-24021",
      mfgDaysAgo: 15,
      expiryDays: 720,
      qty: 6000,
      steps: [
        transfer(cipla, medline, "Invoice CIP/INV/2240"),
        confirm(medline),
        transfer(medline, healthkart, "Inter-hub transfer"),
        confirm(healthkart),
        transfer(healthkart, citycare, "DC HKL/DC/0981"),
        confirm(citycare),
      ],
    },
  ];

  const created: { label: string; id: string; drug: string }[] = [];
  for (const b of batches) {
    const id = await rx.computeBatchId(b.maker.address, b.number);
    const existing = await rx.getBatch(id);
    if (existing.exists) {
      console.log(`• ${b.drug} (${b.number}) already exists`);
    } else {
      await send(
        rx
          .connect(b.maker)
          .createBatch(
            b.drug,
            b.number,
            now - b.mfgDaysAgo * DAY,
            now + b.expiryDays * DAY,
            b.qty,
            b.docHash ?? ethers.ZeroHash,
          ),
      );
      for (const step of b.steps) await step(id);
      console.log(`✓ ${b.drug} (${b.number})`);
    }
    created.push({ label: b.label, id, drug: `${b.drug} · ${b.number}` });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const { chainId } = await ethers.provider.getNetwork();
  const names = ["Central Drug Regulator (admin)", ...PARTICIPANTS.map((p) => p.name)];
  console.log("\n══════════════════════════ DEMO ACCOUNTS ══════════════════════════");
  console.table(
    [admin, sun, cipla, medline, healthkart, apollo, citycare].map((s, i) => ({
      "#": i,
      name: names[i],
      role: i === 0 ? "Admin / Regulator" : ROLE_NAMES[PARTICIPANTS[i - 1].role],
      address: s.address,
      privateKey:
        Number(chainId) === 31337 ? hardhatPrivateKey(i) : "(see your node's account list)",
    })),
  );

  console.log("\n══════════════════════════ DEMO BATCHES ═══════════════════════════");
  const rows = [];
  for (const c of created) {
    const [verdict, reason] = await rx.verifyBatch(c.id);
    const b = await rx.getBatch(c.id);
    rows.push({
      scenario: c.label,
      drug: c.drug,
      status: STATUS_NAMES[Number(b.status)],
      verdict: VERDICT_NAMES[Number(verdict)],
      batchId: c.id,
      reason,
    });
  }
  console.table(rows.map(({ reason: _reason, ...r }) => r));
  const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:5173";
  console.log("\nVerify links:");
  for (const r of rows) console.log(`  ${r.verdict.padEnd(14)} ${appUrl}/verify/${r.batchId}`);
  console.log(
    `  Counterfeit    ${appUrl}/verify/${ethers.keccak256(ethers.toUtf8Bytes("fake-batch"))}`,
  );
  console.log(`\nSample CoA for document check: samples/CoA-PCM-24001.pdf (hash ${coaHash})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
