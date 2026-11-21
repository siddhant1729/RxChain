import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  ContractFactory,
  HDNodeWallet,
  JsonRpcProvider,
  NonceManager,
  sha256,
  type Contract,
} from "ethers";
import {
  CONTRACT_FILE,
  FIXTURE_FILE,
  PID_FILE,
  TEST_DOC,
  TEST_RPC_PORT,
  TEST_RPC_URL,
  type Fixture,
} from "./helpers";

const CONTRACTS_DIR = path.resolve(__dirname, "..", "..", "contracts");
const ARTIFACT = path.join(CONTRACTS_DIR, "artifacts", "contracts", "RxChain.sol", "RxChain.json");
const MNEMONIC = "test test test test test test test test test test test junk";

async function waitForRpc(provider: JsonRpcProvider, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Hardhat node did not start on ${TEST_RPC_URL}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

/** Starts a real Hardhat node, deploys RxChain and seeds one batch per verdict. */
export default async function globalSetup() {
  execSync("npx hardhat compile --quiet", { cwd: CONTRACTS_DIR, stdio: "inherit" });

  const node = spawn("npx", ["hardhat", "node", "--port", String(TEST_RPC_PORT)], {
    cwd: CONTRACTS_DIR,
    detached: true,
    stdio: "ignore",
  });
  node.unref();
  fs.writeFileSync(PID_FILE, String(node.pid));

  const provider = new JsonRpcProvider(TEST_RPC_URL, 31337, {
    staticNetwork: true,
    pollingInterval: 200,
  });
  await waitForRpc(provider);

  const w = (i: number) =>
    new NonceManager(
      HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`).connect(provider),
    );
  const [admin, m, d, p, d2] = [0, 1, 2, 3, 4].map(w);
  const addr = (s: NonceManager) => s.getAddress();

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) as {
    abi: unknown[];
    bytecode: string;
  };
  const factory = new ContractFactory(artifact.abi as never[], artifact.bytecode, admin);
  const deployed = await factory.deploy("Test Regulator", "REG-T", "Test City");
  const receipt = await deployed.deploymentTransaction()!.wait();
  const rx = deployed as unknown as Contract;
  const as = (s: NonceManager) => rx.connect(s) as Contract;
  const send = async (tx: Promise<{ wait: () => Promise<unknown> }>) => (await tx).wait();

  await send(rx.registerParticipant(await addr(m), 1, "Test Pharma Mfg", "MFG-T", "Mumbai"));
  await send(rx.registerParticipant(await addr(d), 2, "Test Distributor", "DST-T", "Delhi"));
  await send(rx.registerParticipant(await addr(p), 3, "Test Pharmacy", "PH-T", "Noida"));
  await send(rx.registerParticipant(await addr(d2), 2, "Second Distributor", "DST-T2", "Pune"));

  const now = (await provider.getBlock("latest"))!.timestamp;
  const docHash = sha256(TEST_DOC);
  const mk = async (num: string, expiry: number, doc = "0x" + "0".repeat(64)) => {
    await send(as(m).createBatch(`Drug ${num}`, num, now - 86400, expiry, 100, doc));
    return (await rx.computeBatchId(await addr(m), num)) as string;
  };
  const year = now + 365 * 86400;

  const genuine = await mk("G-1", year, docHash);
  await send(as(m).initiateTransfer(genuine, await addr(d), "inv"));
  await send(as(d).confirmReceipt(genuine));
  await send(as(d).initiateTransfer(genuine, await addr(p), "dc"));
  await send(as(p).confirmReceipt(genuine));

  const inSupplyChain = await mk("S-1", year);
  await send(as(m).initiateTransfer(inSupplyChain, await addr(d), ""));
  await send(as(d).confirmReceipt(inSupplyChain));

  const pending = await mk("P-1", year);
  await send(as(m).initiateTransfer(pending, await addr(d), "awaiting"));

  const recalled = await mk("R-1", year);
  await send(as(m).recallBatch(recalled, "Contamination detected in QC"));

  const expired = await mk("E-1", now + 3600);
  await provider.send("evm_increaseTime", [7200]);
  await provider.send("evm_mine", []);

  fs.writeFileSync(
    CONTRACT_FILE,
    JSON.stringify({
      address: await rx.getAddress(),
      chainId: 31337,
      deployBlock: receipt!.blockNumber,
      deployedAt: new Date().toISOString(),
      abi: artifact.abi,
    }),
  );
  const fixture: Fixture = {
    ids: { genuine, inSupplyChain, pending, recalled, expired },
    addresses: {
      admin: await addr(admin),
      manufacturer: await addr(m),
      distributor: await addr(d),
      pharmacy: await addr(p),
    },
    docHash,
  };
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify(fixture));
  provider.destroy();
}
