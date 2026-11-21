import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { txLink } from "../lib/config";
import { shortHash } from "../lib/format";

export function TxLink({
  hash,
  label,
  className = "",
}: {
  hash: string;
  label?: string;
  className?: string;
}) {
  const { href, external } = txLink(hash);
  const cls = `inline-flex items-center gap-1 font-mono text-xs text-brand-700 hover:underline ${className}`;
  const text = label ?? shortHash(hash);
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {text}
      <ExternalLink className="h-3 w-3" />
    </a>
  ) : (
    <Link to={href} className={cls}>
      {text}
    </Link>
  );
}
