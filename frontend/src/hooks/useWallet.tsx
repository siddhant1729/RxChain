import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BrowserProvider,
  getAddress,
  toBeHex,
  type Eip1193Provider,
  type JsonRpcSigner,
} from "ethers";
import { CHAIN_ID, CHAIN_NAME, WALLET_RPC_URL } from "../lib/config";
import { DEFAULT_ADMIN_ROLE, fetchParticipant, readContract } from "../lib/contract";
import type { Participant, RoleName } from "../lib/types";
import { useChainTick } from "./useChainTick";

interface InjectedProvider extends Eip1193Provider {
  isMetaMask?: boolean;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

export interface WalletState {
  hasProvider: boolean;
  account: string | null;
  chainId: number | null;
  correctChain: boolean;
  connecting: boolean;
  /** True while the on-chain role of the connected account is being read. */
  loadingRole: boolean;
  participant: Participant | null;
  role: RoleName | null;
  isAdmin: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
  refreshRole: () => Promise<void>;
  getSigner: () => Promise<JsonRpcSigner>;
}

const WalletContext = createContext<WalletState | null>(null);
const DISCONNECTED_KEY = "rxchain.walletDisconnected";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [loadingRole, setLoadingRole] = useState(false);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tick = useChainTick();

  // Initial silent connect (no popup) + listeners for account/chain changes.
  useEffect(() => {
    if (!eth) return;
    const onAccounts = (...args: unknown[]) => {
      const list = args[0] as string[];
      setAccount(list?.[0] ? getAddress(list[0]) : null);
    };
    const onChain = (...args: unknown[]) => setChainId(Number(args[0] as string));
    eth
      .request({ method: "eth_chainId" })
      .then((id) => setChainId(Number(id as string)))
      .catch(() => undefined);
    if (storage()?.getItem(DISCONNECTED_KEY) !== "1") {
      eth
        .request({ method: "eth_accounts" })
        .then((a) => onAccounts(a))
        .catch(() => undefined);
    }
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [eth]);

  const refreshRole = useCallback(async () => {
    if (!account) {
      setParticipant(null);
      setIsAdmin(false);
      return;
    }
    setLoadingRole(true);
    try {
      const [p, admin] = await Promise.all([
        fetchParticipant(account),
        readContract.hasRole(DEFAULT_ADMIN_ROLE, account) as Promise<boolean>,
      ]);
      setParticipant(p);
      setIsAdmin(admin);
      setError(null);
    } catch (e) {
      setError(`Could not read your role from the contract: ${(e as Error).message.split("(")[0]}`);
    } finally {
      setLoadingRole(false);
    }
  }, [account]);

  // Re-read the role when the account changes and on new blocks (e.g. after suspension).
  useEffect(() => {
    void refreshRole();
  }, [refreshRole, tick]);

  const switchChain = useCallback(async () => {
    if (!eth) return;
    const hexId = toBeHex(CHAIN_ID);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 4902 || code === -32603) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexId,
              chainName: CHAIN_NAME,
              rpcUrls: [WALLET_RPC_URL],
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            },
          ],
        });
      } else {
        throw err;
      }
    }
  }, [eth]);

  const connect = useCallback(async () => {
    if (!eth) {
      setError("MetaMask is not installed.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAccount(accounts[0] ? getAddress(accounts[0]) : null);
      storage()?.removeItem(DISCONNECTED_KEY);
      const id = Number((await eth.request({ method: "eth_chainId" })) as string);
      setChainId(id);
      if (id !== CHAIN_ID) await switchChain();
    } catch (err) {
      const code = (err as { code?: number }).code;
      setError(code === 4001 ? "Connection request rejected." : (err as Error).message);
    } finally {
      setConnecting(false);
    }
  }, [eth, switchChain]);

  const disconnect = useCallback(() => {
    storage()?.setItem(DISCONNECTED_KEY, "1");
    setAccount(null);
    setParticipant(null);
    setIsAdmin(false);
  }, []);

  const getSigner = useCallback(async () => {
    if (!eth) throw new Error("MetaMask is not installed.");
    if (chainId !== CHAIN_ID) await switchChain();
    return new BrowserProvider(eth).getSigner();
  }, [eth, chainId, switchChain]);

  const value = useMemo<WalletState>(
    () => ({
      hasProvider: !!eth,
      account,
      chainId,
      correctChain: chainId === CHAIN_ID,
      connecting,
      loadingRole,
      participant,
      role: account ? (participant?.role ?? "None") : null,
      isAdmin,
      error,
      connect,
      disconnect,
      switchChain,
      refreshRole,
      getSigner,
    }),
    [
      eth,
      account,
      chainId,
      connecting,
      loadingRole,
      participant,
      isAdmin,
      error,
      connect,
      disconnect,
      switchChain,
      refreshRole,
      getSigner,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

/** Path of the dashboard for a role. */
export function dashboardPath(role: RoleName | null, isAdmin = false): string | null {
  if (isAdmin || role === "Regulator") return "/admin";
  if (role === "Manufacturer") return "/manufacturer";
  if (role === "Distributor") return "/distributor";
  if (role === "Pharmacy") return "/pharmacy";
  return null;
}
