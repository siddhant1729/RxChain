import deployment from "../contracts/RxChain.json";

const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
const trim = (s: string) => s.replace(/\/+$/, "");

/** Backend base URL. Defaults to the current host so a phone on the LAN reaches it too. */
export const API_URL = trim(import.meta.env.VITE_API_URL || `http://${host}:4000`);
/** RPC used for read-only contract queries (no wallet needed). */
export const RPC_URL = import.meta.env.VITE_RPC_URL || `http://${host}:8545`;
/** RPC URL MetaMask is asked to add. */
export const WALLET_RPC_URL = import.meta.env.VITE_WALLET_RPC_URL || "http://127.0.0.1:8545";
export const EXPLORER_URL = trim(import.meta.env.VITE_EXPLORER_URL || "");

export const CONTRACT_ADDRESS: string = deployment.address;
export const CHAIN_ID: number = deployment.chainId;
export const CONTRACT_ABI = deployment.abi;

export const CHAIN_NAME =
  CHAIN_ID === 31337 ? "Hardhat Localhost" : CHAIN_ID === 1337 ? "Ganache" : `Chain ${CHAIN_ID}`;

export function txLink(hash: string): { href: string; external: boolean } {
  return EXPLORER_URL
    ? { href: `${EXPLORER_URL}/tx/${hash}`, external: true }
    : { href: `/tx/${hash}`, external: false };
}
