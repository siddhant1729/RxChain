import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: process.env.RPC_URL ?? "http://127.0.0.1:8545",
      chainId: 31337,
    },
    ganache: {
      url: process.env.GANACHE_URL ?? "http://127.0.0.1:7545",
      chainId: 1337,
    },
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    outputFile: process.env.GAS_REPORT_FILE,
    noColors: Boolean(process.env.GAS_REPORT_FILE),
  },
  mocha: {
    timeout: 120000,
  },
};

export default config;
