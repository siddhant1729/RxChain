# RxChain Threat Model

Scope: `RxChain.sol`, the read-only backend, the frontend and the physical QR label. The goal is to stop **counterfeit or diverted medicines** from being presented as genuine, and to make tampering with the supply-chain record detectable.

## Assets

1. Integrity of batch records and custody history
2. The participant registry (who is licensed to act)
3. The verdict a consumer sees
4. Integrity of certificates of analysis (CoA)

## Threats and mitigations

### 1. Cloned / copied QR codes

_Attack:_ a counterfeiter photographs a genuine pack's QR and prints it on fake packs.

_Mitigations:_

- **The verdict depends on where the batch is, not just whether it exists.** A batch only reads **GENUINE** when its current custodian is an _active pharmacy_ with no pending transfer. A QR copied from stock that is still with a manufacturer or distributor reads **IN SUPPLY CHAIN**, a red flag if someone offers it to you on the street.
- **Pharmacy-endpoint check:** the chain ends at a pharmacy (pharmacies cannot transfer out), so a batch cannot be "laundered" back into the chain. Consumers are told to buy only from the pharmacy named in the custody timeline: the verify page shows _which_ pharmacy received the batch, so a clone sold elsewhere is visibly out of place.
- **Recall and expiry propagate instantly to every copy.** Once the regulator recalls a batch whose QR has been cloned at scale, every clone reads **RECALLED**.
- **QR/label endpoints refuse unknown batch IDs**, so the official service cannot be used to mint labels for invented codes. Invented codes read **COUNTERFEIT**.

_Residual risk:_ batch-level IDs mean all packs in a genuine batch share one QR, so a clone of a _delivered_ batch still reads GENUINE. See _What blockchain does not solve_.

### 2. Malicious or careless participant

| Attack                                                                   | Mitigation                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unregistered party creates "official" batches                            | `createBatch` requires `MANUFACTURER_ROLE` **and** an active registry entry (`NotActiveParticipant`, `AccessControlUnauthorizedAccount`)                                                                    |
| Manufacturer impersonates another manufacturer's batch                   | Batch ID = `keccak256(manufacturer, batchNumber)`, so the ID is bound to the creating address and `manufacturerName` is copied from the registry, not user input                                            |
| Duplicate batch numbers to confuse audits                                | `BatchAlreadyExists`                                                                                                                                                                                        |
| Manufacturer ships straight to a pharmacy (bypassing licensed wholesale) | Route matrix enforced on chain: M→D, D→D, D→P only (`InvalidTransferRoute`)                                                                                                                                 |
| Pharmacy re-sells stock back into the chain (diversion)                  | Pharmacy → anyone is forbidden                                                                                                                                                                              |
| Dumping stock on a party that never received it                          | Two-step transfer: custody moves only when the receiver signs `confirmReceipt`                                                                                                                              |
| Non-owner moves a batch                                                  | `NotCurrentOwner` / `NotPendingOwner`                                                                                                                                                                       |
| Moving recalled or expired stock                                         | `BatchIsRecalled`, `BatchIsExpired` on initiate and confirm                                                                                                                                                 |
| Rewriting history                                                        | History is append-only contract storage; there is no function that edits or deletes entries. `verifyBatch` additionally replays history and flags any inconsistency as **SUSPICIOUS**                       |
| Tampered CoA                                                             | Only the SHA-256 is on chain; `POST /api/documents/verify` and the verify page recompute it and show a mismatch. Only the batch's manufacturer can (re)attach a hash, and every attach is logged in history |
| A participant is caught misbehaving                                      | Admin calls `setParticipantActive(addr, false)`. All their writes stop immediately, and batches they manufactured or hold read **SUSPICIOUS**                                                               |

### 3. Key compromise

- **Participant key stolen:** the regulator **suspends** the account. The suspended key can no longer create, transfer, confirm, reject, cancel, recall or attach documents, and stock it holds or manufactured verifies as SUSPICIOUS until the situation is resolved. The organisation is then registered under a new address. A stolen key cannot recall genuine stock as sabotage once suspended.
- **Admin key stolen:** this is the most powerful key (registry plus pause). Production mitigation: hold `DEFAULT_ADMIN_ROLE` in a **multisig** (e.g. Safe 2-of-3 among regulator officials) with a timelock, and use separate regulator EOAs that can only recall. The contract already separates `REGULATOR_ROLE` from `DEFAULT_ADMIN_ROLE`, so this needs no code change.
- **Emergency:** `pause()` freezes all batch writes system-wide while verification keeps working.

### 4. Reentrancy and value transfer

RxChain **never holds or sends ETH or tokens** and makes **no external calls** to untrusted contracts (only internal AccessControl checks). There is no reentrancy surface, so no `ReentrancyGuard` is needed. State changes follow checks-effects order anyway. Functions are not `payable`, so ETH sent to them reverts.

### 5. Access control

- OpenZeppelin `AccessControl` with four roles plus the default admin. Every state-changing function is gated (`onlyRole`, `onlyActive`, ownership checks) and every gate has a dedicated test, including suspended participants and revoked roles.
- Admin-only: `registerParticipant`, `setParticipantActive`, `pause`, `unpause`, plus OZ `grantRole`/`revokeRole`.
- **Custom errors** give precise, cheap revert reasons that the UI decodes into readable messages.

### 6. Off-chain components

| Threat                                      | Mitigation                                                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend compromised and lies about verdicts | The backend holds **no keys** and is not a source of truth. Anyone can call `verifyBatch` directly, and the dashboards and batch drawer read the contract themselves. A production mobile app should call the chain (or several RPCs) directly |
| Event index poisoned or stale               | The index is a cache rebuilt from `queryFilter`; it is reset when the deployment changes or a block hash mismatch (reorg/restart) is detected. Verdicts never depend on it                                                                     |
| Malicious upload                            | `multer` size limit (`MAX_UPLOAD_MB`), files stored under content hashes (no user-controlled paths), served with `Content-Disposition` and `X-Content-Type-Options: nosniff` (helmet)                                                          |
| Injection in labels                         | All batch fields are HTML-escaped in `/api/label`; the label page has a restrictive CSP                                                                                                                                                        |
| Input validation                            | zod schemas on query, body and params; malformed batch IDs yield a COUNTERFEIT verdict, never a 500                                                                                                                                            |
| Phishing site with a fake verifier          | Out of scope for the contract. Mitigate with a well-known domain, HTTPS, and printing the domain on the label                                                                                                                                  |

## What blockchain does **not** solve

- **A fake drug inside genuine packaging.** The chain proves the _identity and custody of the label/batch record_, not the chemistry inside the strip. Refilled or swapped contents in a genuine box will verify. Mitigations outside the chain: **tamper-evident seals** and holograms, spectroscopy spot-checks at pharmacies, and lab testing triggered by recalls.
- **Garbage in, garbage out.** If a licensed manufacturer registers a substandard batch, the chain faithfully records it as authentic. Regulation, audits and the CoA hash (which makes the claimed QC result non-repudiable) address this.
- **Batch-level granularity.** With one ID per batch, cloning a delivered batch's QR is undetectable by the verdict alone. Future work: **serial-level IDs** (one per unit, aggregated into cartons per GS1), _first-scan_ and scan-count tracking with geolocation anomaly detection, and dispensing events that "consume" a unit ID so a second scan reads SUSPICIOUS.
- **Off-chain collusion.** A distributor and a pharmacy can collude to confirm a transfer that never physically happened. IoT/cold-chain sensors and periodic physical audits reduce but do not eliminate this.
- **Privacy.** All custody data on a public chain is visible to competitors. Production deployments would use a permissioned chain (e.g. Hyperledger Besu with private transactions) or keep commercial details off chain.
