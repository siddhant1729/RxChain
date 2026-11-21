import { Link, useParams } from "react-router-dom";
import { Package, ScanLine } from "lucide-react";
import { BatchInfo } from "../components/BatchInfo";
import { VerdictBadge } from "../components/Badges";
import { CustodyTimeline } from "../components/CustodyTimeline";
import { DocumentCheck } from "../components/DocumentCheck";
import { EmptyState } from "../components/EmptyState";
import { QRDisplay } from "../components/QRDisplay";
import { SkeletonCard } from "../components/Skeleton";
import { Button, Card, ErrorNote, PageHeader } from "../components/ui";
import { useBatchDetail } from "../hooks/useBatchDetail";
import { isBatchId } from "../lib/format";

export default function BatchDetail() {
  const { id = "" } = useParams();
  const valid = isBatchId(id);
  const { data, loading, error } = useBatchDetail(valid ? id.toLowerCase() : null);

  if (!valid)
    return (
      <EmptyState
        title="Invalid batch ID"
        message="A batch ID is 0x followed by 64 hex characters."
      />
    );
  if (loading && !data) return <SkeletonCard />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data?.batch) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6" />}
        title="Batch not found on chain"
        message="This ID does not exist in the RxChain ledger. A product carrying it should be treated as counterfeit."
        action={
          <Link to={`/verify/${id}`}>
            <Button>Open verifier</Button>
          </Link>
        }
      />
    );
  }
  const b = data.batch;
  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Package className="h-6 w-6" />}
        title={`${b.drugName} · ${b.batchNumber}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={data.verdict} /> {data.reason}
          </span>
        }
        actions={
          <Link to={`/verify/${b.id}`}>
            <Button variant="secondary" icon={<ScanLine className="h-4 w-4" />}>
              Public verify page
            </Button>
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="On-chain record">
            <BatchInfo batch={b} chainTime={data.chainTime} />
          </Card>
          <Card title="Chain of custody" subtitle={`${data.history.length} events`}>
            <CustodyTimeline history={data.history} participants={data.participants} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Packaging QR">
            <QRDisplay batchId={b.id} />
          </Card>
          <Card title="Certificate of analysis">
            <DocumentCheck batchId={b.id} docHash={b.docHash} />
          </Card>
        </div>
      </div>
    </div>
  );
}
