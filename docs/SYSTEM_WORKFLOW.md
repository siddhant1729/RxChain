# RxChain System Workflow

This diagram fills **Section 6 (System Workflow)** of the project synopsis. It shows the complete life of a drug batch from onboarding to the consumer's verdict, with the component responsible for each step.

```mermaid
flowchart TD
  %% ── Onboarding ──
  subgraph S0["① Onboarding: Regulator / Admin"]
    A0([Deploy RxChain.sol<br/>deployer = Admin + Regulator]) --> A1[Register participants<br/>registerParticipant: role, name, licence, location]
    A1 --> A2{Licence valid?}
    A2 -- revoked / key compromised --> A3[setParticipantActive false<br/>→ all writes blocked,<br/>their batches read SUSPICIOUS]
    A2 -- valid --> A4[(Participant registry<br/>on chain)]
  end

  %% ── Manufacturing ──
  subgraph S1["② Manufacturing: Manufacturer"]
    B1[Produce batch + QC] --> B2[Upload CoA to backend<br/>POST /api/documents]
    B2 --> B3[Backend stores file,<br/>returns SHA-256]
    B3 --> B4[createBatch in MetaMask<br/>drug, batch no., mfg, expiry, qty, docHash]
    B4 --> B5{Contract checks<br/>active manufacturer, dates, qty,<br/>unique keccak256 mfr+batchNo}
    B5 -- fail --> B6[Revert with custom error<br/>→ readable toast]
    B5 -- ok --> B7[(Batch record + Created event<br/>status = Created)]
    B7 --> B8[Generate QR + label<br/>GET /api/qr · /api/label<br/>QR = APP_URL/verify/batchId]
    B8 --> B9[Print label on packaging]
  end

  %% ── Distribution ──
  subgraph S2["③ Distribution: Manufacturer → Distributor(s) → Pharmacy"]
    C1[Owner: initiateTransfer to receiver] --> C2{Route allowed?<br/>M→D · D→D · D→P<br/>receiver active · not recalled/expired}
    C2 -- no --> C3[Revert: InvalidTransferRoute /<br/>ReceiverNotActive / BatchIsExpired]
    C2 -- yes --> C4[status = InTransit<br/>pendingOwner = receiver]
    C4 --> C5{Receiver inspects goods}
    C5 -- damaged / wrong --> C6[rejectTransfer reason<br/>→ back to sender, status = Created]
    C5 -- sender changes mind --> C7[cancelTransfer<br/>→ status = Created]
    C5 -- OK --> C8[confirmReceipt]
    C8 --> C9{Receiver is pharmacy?}
    C9 -- no --> C10[status = Created held by distributor] --> C1
    C9 -- yes --> C11[status = Delivered<br/>end of chain]
  end

  %% ── Exceptions ──
  subgraph S3["④ Exceptions: any time"]
    D1[Manufacturer or Regulator:<br/>recallBatch reason] --> D2[(status = Recalled<br/>irreversible, pending cleared)]
    D3[Chain time passes expiryDate] --> D4[Transfers blocked,<br/>verdict EXPIRED]
    D5[Admin: pause] --> D6[All batch writes blocked,<br/>verification continues]
  end

  %% ── Verification ──
  subgraph S4["⑤ Verification: Consumer / Pharmacist (no wallet)"]
    E1[Scan QR with phone camera<br/>or upload QR image / paste ID] --> E2[Frontend /verify/batchId]
    E2 --> E3[Backend GET /api/verify<br/>verifyBatch + getBatch + getHistory<br/>+ participant names + tx hashes]
    E3 --> E4{verifyBatch decision}
    E4 -->|not on chain / malformed| V1[🔴 COUNTERFEIT]
    E4 -->|recalled| V2[🟠 RECALLED + reason]
    E4 -->|past expiry| V3[⚪ EXPIRED]
    E4 -->|manufacturer/custodian suspended<br/>or history inconsistent| V4[🔴 SUSPICIOUS]
    E4 -->|at active pharmacy, no pending| V5[🟢 GENUINE]
    E4 -->|still with M or D / in transit| V6[🔵 IN SUPPLY CHAIN]
    V5 --> E5[Optional: upload CoA →<br/>POST /api/documents/verify<br/>hash match / mismatch]
  end

  A4 --> B1
  B9 --> C1
  B7 -.-> E3
  C11 --> E1
  D2 -.-> E4
  D4 -.-> E4
  A3 -.-> E4
```

## Step-by-step

| Step | Actor                  | Action                              | On-chain effect                         | Off-chain effect                              |
| ---- | ---------------------- | ----------------------------------- | --------------------------------------- | --------------------------------------------- |
| 1    | Admin                  | Deploy contract                     | Admin + Regulator roles, registry entry | ABI/address written to frontend & backend     |
| 2    | Admin                  | Register each organisation          | `ParticipantRegistered`, role granted   | Indexed into activity feed                    |
| 3    | Manufacturer           | Upload CoA                          | none                                    | File stored, SHA-256 returned                 |
| 4    | Manufacturer           | `createBatch`                       | Batch + `Created` history entry         | QR/label rendered on demand                   |
| 5    | Sender                 | `initiateTransfer`                  | `InTransit`, pending owner              | Receiver's dashboard shows incoming           |
| 6    | Receiver               | `confirmReceipt` / `rejectTransfer` | Custody moves / returns                 | Timeline updated                              |
| 7    | Distributor            | Forward (repeat 5–6)                | D→D or D→P                              |                                               |
| 8    | Pharmacy               | `confirmReceipt`                    | `Delivered` → verdict GENUINE           | Inventory shows "OK to dispense"              |
| 9    | Manufacturer/Regulator | `recallBatch` (if needed)           | `Recalled`, irreversible                | Every scan shows RECALLED                     |
| 10   | Consumer               | Scan QR                             | `verifyBatch` (view, free)              | Verdict banner + custody timeline + CoA check |
