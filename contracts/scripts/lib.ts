import fs from "node:fs";
import path from "node:path";
import { ethers, network, config } from "hardhat";
import type { HardhatNetworkHDAccountsConfig } from "hardhat/types";
import type { RxChain } from "../typechain-types";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Every location the generated `{address, abi, chainId}` file is written to. */
export const DEPLOYMENT_FILES = (
  process.env.RXCHAIN_DEPLOYMENT_FILES
    ? process.env.RXCHAIN_DEPLOYMENT_FILES.split(",")
    : [
        path.join(REPO_ROOT, "frontend", "src", "contracts", "RxChain.json"),
        path.join(REPO_ROOT, "backend", "src", "contracts", "RxChain.json"),
      ]
).map((p) => path.resolve(p));

export const Role = {
  None: 0,
  Manufacturer: 1,
  Distributor: 2,
  Pharmacy: 3,
  Regulator: 4,
} as const;
export const ROLE_NAMES = ["None", "Manufacturer", "Distributor", "Pharmacy", "Regulator"];
export const VERDICT_NAMES = [
  "Genuine",
  "Counterfeit",
  "Suspicious",
  "Recalled",
  "Expired",
  "InSupplyChain",
];
export const STATUS_NAMES = ["Created", "InTransit", "Delivered", "Recalled"];

export interface DeploymentFile {
  address: string;
  chainId: number;
  deployBlock: number;
  deployedAt: string;
  abi: unknown[];
}

/** Loads the deployment written by deploy.ts and checks it matches the connected chain. */
export async function loadContract(): Promise<{ rx: RxChain; deployment: DeploymentFile }> {
  const file = DEPLOYMENT_FILES[DEPLOYMENT_FILES.length - 1];
  if (!fs.existsSync(file)) {
    throw new Error(`Deployment file ${file} not found — run \`npm run deploy\` first.`);
  }
  const deployment = JSON.parse(fs.readFileSync(file, "utf8")) as DeploymentFile;
  const { chainId } = await ethers.provider.getNetwork();
  if (Number(chainId) !== deployment.chainId) {
    throw new Error(
      `Deployment is for chainId ${deployment.chainId} but connected to ${chainId} — redeploy.`,
    );
  }
  const code = await ethers.provider.getCode(deployment.address);
  if (code === "0x") {
    throw new Error(
      `No contract at ${deployment.address} on ${network.name} (chain restarted?) — run \`npm run deploy\`.`,
    );
  }
  const rx = (await ethers.getContractAt("RxChain", deployment.address)) as unknown as RxChain;
  return { rx, deployment };
}

/** Private key of Hardhat's default HD account `index` (only meaningful on chainId 31337). */
export function hardhatPrivateKey(index: number): string | null {
  const accounts = config.networks.hardhat.accounts as HardhatNetworkHDAccountsConfig;
  if (!accounts || typeof accounts !== "object" || !("mnemonic" in accounts)) return null;
  const wallet = ethers.HDNodeWallet.fromPhrase(
    accounts.mnemonic,
    accounts.passphrase || undefined,
    `${accounts.path}/${index}`,
  );
  return wallet.privateKey;
}

export function short(hex: string): string {
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}
