import fs from "node:fs";
import path from "node:path";
import { ethers, network, artifacts } from "hardhat";
import { DEPLOYMENT_FILES, type DeploymentFile } from "./lib";

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  console.log(`Deploying RxChain to ${network.name} (chainId ${chainId}) from ${deployer.address}`);

  const factory = await ethers.getContractFactory("RxChain");
  const rx = await factory.deploy(
    process.env.REGULATOR_NAME ?? "Central Drug Regulator",
    process.env.REGULATOR_LICENSE ?? "REG-IN-0001",
    process.env.REGULATOR_LOCATION ?? "New Delhi",
  );
  const receipt = await rx.deploymentTransaction()?.wait();
  const address = await rx.getAddress();
  const artifact = await artifacts.readArtifact("RxChain");

  const out: DeploymentFile = {
    address,
    chainId: Number(chainId),
    deployBlock: receipt?.blockNumber ?? 0,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  for (const file of DEPLOYMENT_FILES) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`  wrote ${path.relative(process.cwd(), file)}`);
  }
  console.log(`RxChain deployed at ${address} (block ${out.deployBlock})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
