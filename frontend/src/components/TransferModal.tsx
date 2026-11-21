import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { useDirectory } from "../hooks/useDirectory";
import { useTx } from "../hooks/useTx";
import { useWallet } from "../hooks/useWallet";
import type { Batch, RoleName } from "../lib/types";
import { Modal } from "./Modal";
import { Button, Field, Input, Select } from "./ui";

/** Initiate a custody transfer; the receiver dropdown only lists active participants of allowed roles. */
export function TransferModal({
  batch,
  open,
  onClose,
  onDone,
  allowedRoles,
}: {
  batch: Batch | null;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  allowedRoles: RoleName[];
}) {
  const { participants } = useDirectory();
  const { account } = useWallet();
  const { run, busy } = useTx();
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");

  const options = useMemo(
    () =>
      participants.filter(
        (p) =>
          p.active &&
          allowedRoles.includes(p.role) &&
          p.address.toLowerCase() !== account?.toLowerCase(),
      ),
    [participants, allowedRoles, account],
  );

  const submit = async () => {
    if (!batch || !to) return;
    const hash = await run(
      "Initiate transfer",
      (c) => c.initiateTransfer(batch.id, to, note.trim()),
      { success: "Transfer initiated" },
    );
    if (hash) {
      setTo("");
      setNote("");
      onDone?.();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={batch ? `Transfer ${batch.drugName} · ${batch.batchNumber}` : "Transfer"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={busy}
            disabled={!to}
            icon={<Send className="h-4 w-4" />}
          >
            Initiate transfer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Receiver"
          hint={`Only active ${allowedRoles.join(" / ")} accounts are listed. The receiver must confirm receipt.`}
        >
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Select receiver…</option>
            {allowedRoles.map((role) => {
              const group = options.filter((o) => o.role === role);
              return group.length ? (
                <optgroup key={role} label={`${role}s`}>
                  {group.map((p) => (
                    <option key={p.address} value={p.address}>
                      {p.name} — {p.location}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </Select>
        </Field>
        <Field label="Note (optional)" hint="Invoice / delivery challan number, carrier, etc.">
          <Input
            value={note}
            maxLength={140}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Invoice INV/2024/0091"
          />
        </Field>
      </div>
    </Modal>
  );
}
