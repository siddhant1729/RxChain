import { useParams } from "react-router-dom";
import { Interface, formatEther, type TransactionReceipt, type TransactionResponse } from "ethers";
import { Receipt } from "lucide-react";
import { AddressChip } from "../components/AddressChip";
import { CopyButton } from "../components/CopyButton";
import { SkeletonCard } from "../components/Skeleton";
import { Badge, Card, ErrorNote, PageHeader } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "../lib/config";
import { readProvider } from "../lib/contract";
import { formatDateTime } from "../lib/format";

const iface = new Interface(CONTRACT_ABI);

/** Minimal built-in block explorer for local chains (no Etherscan on Hardhat). */
export default function TxDetail() {
  const { hash = "" } = useParams();
  const { data, loading, error } = useAsync(async () => {
    const [tx, receipt] = await Promise.all([
      readProvider.getTransaction(hash),
      readProvider.getTransactionReceipt(hash),
    ]);
    if (!tx) return null;
    const block = receipt ? await readProvider.getBlock(receipt.blockNumber) : null;
    return { tx, receipt, timestamp: block?.timestamp ?? null };
  }, [hash]);

  if (loading && !data) return <SkeletonCard />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data)
    return (
      <ErrorNote>Transaction {hash} not found on this chain (was the node restarted?).</ErrorNote>
    );
  const { tx, receipt, timestamp } = data as {
    tx: TransactionResponse;
    receipt: TransactionReceipt | null;
    timestamp: number | null;
  };

  let call: string | null = null;
  try {
    const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
    if (parsed) call = `${parsed.name}(${parsed.args.map((a) => String(a)).join(", ")})`;
  } catch {
    call = null;
  }
  const logs = (receipt?.logs ?? [])
    .filter((l) => l.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase())
    .map((l) => {
      try {
        return iface.parseLog({ topics: [...l.topics], data: l.data });
      } catch {
        return null;
      }
    })
    .filter((l): l is NonNullable<typeof l> => !!l);

  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="grid gap-1 border-b border-slate-100 py-2.5 last:border-0 sm:grid-cols-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className="min-w-0 break-all text-sm text-slate-900 sm:col-span-3">{children}</dd>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Receipt className="h-6 w-6" />}
        title="Transaction"
        subtitle={
          <span className="flex items-center gap-1 break-all font-mono text-xs">
            {hash}
            <CopyButton value={hash} />
          </span>
        }
      />
      <Card>
        <dl>
          <Row k="Status">
            {receipt ? (
              receipt.status === 1 ? (
                <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                  Success
                </Badge>
              ) : (
                <Badge className="bg-red-50 text-red-700 ring-red-600/20">Reverted</Badge>
              )
            ) : (
              <Badge className="bg-blue-50 text-blue-700 ring-blue-600/20">Pending</Badge>
            )}
          </Row>
          <Row k="Block">{receipt?.blockNumber ?? "—"}</Row>
          <Row k="Time">{timestamp ? formatDateTime(timestamp) : "—"}</Row>
          <Row k="From">
            <AddressChip address={tx.from} showRole />
          </Row>
          <Row k="To">
            {tx.to?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()
              ? "RxChain contract"
              : (tx.to ?? "Contract creation")}{" "}
            <span className="font-mono text-xs text-slate-500">{tx.to}</span>
          </Row>
          <Row k="Function">
            <code className="font-mono text-xs">{call ?? (tx.to ? "—" : "constructor")}</code>
          </Row>
          <Row k="Gas used">{receipt ? receipt.gasUsed.toString() : "—"}</Row>
          <Row k="Fee">{receipt ? `${formatEther(receipt.fee)} ETH` : "—"}</Row>
        </dl>
      </Card>
      <Card title="Events emitted">
        {logs.length ? (
          <ul className="space-y-2">
            {logs.map((l, i) => (
              <li key={i} className="rounded-lg bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">{l.name}</p>
                <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-[auto,1fr]">
                  {l.fragment.inputs.map((inp, j) => (
                    <div key={j} className="contents">
                      <dt className="text-slate-500">{inp.name}</dt>
                      <dd className="break-all font-mono text-slate-800">{String(l.args[j])}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No RxChain events.</p>
        )}
      </Card>
    </div>
  );
}
