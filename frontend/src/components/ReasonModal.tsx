import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Button, Field, Textarea } from "./ui";

/** Modal asking for a free-text reason (reject / recall). `onSubmit` resolves true on success. */
export function ReasonModal({
  open,
  onClose,
  title,
  description,
  label,
  confirmLabel,
  variant = "danger",
  onSubmit,
  busy,
  presets = [],
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  label: string;
  confirmLabel: string;
  variant?: "danger" | "warning";
  onSubmit: (reason: string) => Promise<boolean>;
  busy?: boolean;
  presets?: string[];
}) {
  const [reason, setReason] = useState("");
  const submit = async () => {
    if (await onSubmit(reason.trim())) {
      setReason("");
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={variant} onClick={submit} loading={busy} disabled={!reason.trim()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {description && <div className="text-sm text-slate-600">{description}</div>}
        <Field label={label}>
          <Textarea
            rows={3}
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setReason(p)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
