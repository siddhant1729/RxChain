// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title RxChain — drug batch supply-chain tracking and anti-counterfeiting
/// @notice Gives every drug batch a tamper-proof on-chain identity, records its full chain of
///         custody (Manufacturer → Distributor(s) → Pharmacy) and exposes a public verdict that
///         anyone can query by scanning the QR code on the packaging.
/// @dev Only hashes of off-chain documents are stored on chain. No ETH is ever held or sent.
contract RxChain is AccessControl, Pausable {
    // ─────────────────────────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Role allowed to recall any batch.
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    /// @notice Role allowed to create batches.
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    /// @notice Role allowed to receive from manufacturers/distributors and forward.
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    /// @notice Role that terminates the supply chain (dispensing point).
    bytes32 public constant PHARMACY_ROLE = keccak256("PHARMACY_ROLE");

    // ─────────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────────

    enum Role {
        None,
        Manufacturer,
        Distributor,
        Pharmacy,
        Regulator
    }

    enum BatchStatus {
        Created,
        InTransit,
        Delivered,
        Recalled
    }

    enum EventType {
        Created,
        TransferInitiated,
        TransferConfirmed,
        TransferCancelled,
        TransferRejected,
        Recalled,
        DocumentAttached
    }

    enum Verdict {
        Genuine,
        Counterfeit,
        Suspicious,
        Recalled,
        Expired,
        InSupplyChain
    }

    struct Participant {
        address account;
        Role role;
        string name;
        string licenseId;
        string location;
        bool active;
        uint64 registeredAt;
    }

    struct Batch {
        bytes32 id;
        string drugName;
        string batchNumber;
        string manufacturerName;
        uint64 mfgDate;
        uint64 expiryDate;
        uint256 quantity;
        address manufacturer;
        address currentOwner;
        address pendingOwner;
        BatchStatus status;
        bytes32 docHash;
        string recallReason;
        uint64 createdAt;
        bool exists;
    }

    struct CustodyEvent {
        address from;
        address to;
        EventType eventType;
        uint64 timestamp;
        string note;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────────

    /// @dev Tolerance for a manufacturing date slightly ahead of block time (clock skew/timezones).
    uint64 public constant MFG_DATE_TOLERANCE = 1 days;

    mapping(address => Participant) internal _participants;
    address[] internal _participantList;

    mapping(bytes32 => Batch) internal _batches;
    bytes32[] internal _batchIds;
    mapping(bytes32 => CustodyEvent[]) internal _history;

    mapping(address => bytes32[]) internal _byManufacturer;

    /// @dev Set of batch IDs currently owned by an address (swap-and-pop, index stored +1).
    mapping(address => bytes32[]) internal _owned;
    mapping(bytes32 => uint256) internal _ownedIndex;

    /// @dev Set of batch IDs awaiting confirmation by an address (swap-and-pop, index stored +1).
    mapping(address => bytes32[]) internal _incoming;
    mapping(bytes32 => uint256) internal _incomingIndex;

    // ─────────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────────

    event ParticipantRegistered(
        address indexed account,
        Role role,
        string name,
        string licenseId,
        string location
    );
    event ParticipantStatusChanged(address indexed account, bool active);
    event BatchCreated(
        bytes32 indexed id,
        address indexed manufacturer,
        string drugName,
        string batchNumber,
        uint64 expiryDate,
        uint256 quantity,
        bytes32 docHash
    );
    event TransferInitiated(
        bytes32 indexed id,
        address indexed from,
        address indexed to,
        string note
    );
    event TransferConfirmed(bytes32 indexed id, address indexed from, address indexed to);
    event TransferRejected(
        bytes32 indexed id,
        address indexed by,
        address indexed owner,
        string reason
    );
    event TransferCancelled(bytes32 indexed id, address indexed by, address indexed receiver);
    event BatchRecalled(bytes32 indexed id, address indexed by, string reason);
    event DocumentAttached(bytes32 indexed id, address indexed by, bytes32 docHash);

    // ─────────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error InvalidRole();
    error EmptyField();
    error AlreadyRegistered(address account);
    error NotRegistered(address account);
    error NotActiveParticipant(address account);
    error BatchAlreadyExists(bytes32 id);
    error BatchNotFound(bytes32 id);
    error InvalidDates();
    error InvalidQuantity();
    error NotCurrentOwner(address caller);
    error NotPendingOwner(address caller);
    error TransferAlreadyPending(bytes32 id);
    error NoPendingTransfer(bytes32 id);
    error BatchIsRecalled(bytes32 id);
    error BatchIsExpired(bytes32 id);
    error SelfTransfer();
    error ReceiverNotActive(address receiver);
    error InvalidTransferRoute(Role fromRole, Role toRole);
    error NotAuthorizedToRecall(address caller);
    error NotBatchManufacturer(address caller);
    error InvalidDocHash();

    // ─────────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────────

    modifier batchExists(bytes32 id) {
        if (!_batches[id].exists) revert BatchNotFound(id);
        _;
    }

    modifier onlyActive() {
        if (!_isActive(msg.sender)) revert NotActiveParticipant(msg.sender);
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Deploys RxChain; the deployer becomes admin and a registered, active regulator.
    /// @param regulatorName Display name of the deploying regulator.
    /// @param regulatorLicenseId Licence/authority identifier of the regulator.
    /// @param regulatorLocation Location of the regulator.
    constructor(
        string memory regulatorName,
        string memory regulatorLicenseId,
        string memory regulatorLocation
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _register(msg.sender, Role.Regulator, regulatorName, regulatorLicenseId, regulatorLocation);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Registers a supply-chain participant and grants the matching AccessControl role.
    /// @param account Wallet address of the participant.
    /// @param role Manufacturer, Distributor, Pharmacy or Regulator.
    /// @param name Legal/display name.
    /// @param licenseId Drug licence number (e.g. state drug licence).
    /// @param location City/state of operation.
    function registerParticipant(
        address account,
        Role role,
        string calldata name,
        string calldata licenseId,
        string calldata location
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _register(account, role, name, licenseId, location);
    }

    /// @notice Suspends or reactivates a participant. Suspended participants cannot create,
    ///         transfer, confirm, reject, cancel, recall or attach documents.
    /// @param account Participant address.
    /// @param active New active flag.
    function setParticipantActive(
        address account,
        bool active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Participant storage p = _participants[account];
        if (p.role == Role.None) revert NotRegistered(account);
        p.active = active;
        emit ParticipantStatusChanged(account, active);
    }

    /// @notice Pauses all state-changing batch functions (emergency stop).
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Resumes all state-changing batch functions.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Batch lifecycle
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Creates a new drug batch owned by the calling manufacturer.
    /// @dev Batch ID = keccak256(abi.encodePacked(manufacturer, batchNumber)).
    /// @param drugName Drug name and strength, e.g. "Paracetamol 500mg".
    /// @param batchNumber Manufacturer batch/lot number (unique per manufacturer).
    /// @param mfgDate Manufacturing date (unix seconds).
    /// @param expiryDate Expiry date (unix seconds), must be after mfgDate and in the future.
    /// @param quantity Number of units in the batch, must be > 0.
    /// @param docHash Optional SHA-256 hash of the certificate of analysis (0 if none).
    /// @return id The new batch ID.
    function createBatch(
        string calldata drugName,
        string calldata batchNumber,
        uint64 mfgDate,
        uint64 expiryDate,
        uint256 quantity,
        bytes32 docHash
    ) external whenNotPaused onlyActive returns (bytes32 id) {
        if (!hasRole(MANUFACTURER_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, MANUFACTURER_ROLE);
        }
        if (bytes(drugName).length == 0 || bytes(batchNumber).length == 0) revert EmptyField();
        if (
            expiryDate <= mfgDate ||
            expiryDate <= block.timestamp ||
            mfgDate > block.timestamp + MFG_DATE_TOLERANCE
        ) revert InvalidDates();
        if (quantity == 0) revert InvalidQuantity();

        id = keccak256(abi.encodePacked(msg.sender, batchNumber));
        if (_batches[id].exists) revert BatchAlreadyExists(id);

        Batch storage b = _batches[id];
        b.id = id;
        b.drugName = drugName;
        b.batchNumber = batchNumber;
        b.manufacturerName = _participants[msg.sender].name;
        b.mfgDate = mfgDate;
        b.expiryDate = expiryDate;
        b.quantity = quantity;
        b.manufacturer = msg.sender;
        b.currentOwner = msg.sender;
        b.status = BatchStatus.Created;
        b.docHash = docHash;
        b.createdAt = uint64(block.timestamp);
        b.exists = true;

        _batchIds.push(id);
        _byManufacturer[msg.sender].push(id);
        _addOwned(msg.sender, id);
        _log(id, address(0), msg.sender, EventType.Created, "Batch manufactured");

        emit BatchCreated(id, msg.sender, drugName, batchNumber, expiryDate, quantity, docHash);
    }

    /// @notice Starts a custody transfer. Allowed routes: Manufacturer → Distributor,
    ///         Distributor → Distributor | Pharmacy. Pharmacies are the end of the chain.
    /// @param id Batch ID.
    /// @param to Receiving participant (must be registered and active).
    /// @param note Free-text note (e.g. invoice / consignment number).
    function initiateTransfer(
        bytes32 id,
        address to,
        string calldata note
    ) external whenNotPaused batchExists(id) onlyActive {
        Batch storage b = _batches[id];
        if (b.currentOwner != msg.sender) revert NotCurrentOwner(msg.sender);
        if (b.status == BatchStatus.Recalled) revert BatchIsRecalled(id);
        if (b.pendingOwner != address(0)) revert TransferAlreadyPending(id);
        if (block.timestamp > b.expiryDate) revert BatchIsExpired(id);
        if (to == address(0)) revert ZeroAddress();
        if (to == msg.sender) revert SelfTransfer();
        if (!_isActive(to)) revert ReceiverNotActive(to);

        Role fromRole = _participants[msg.sender].role;
        Role toRole = _participants[to].role;
        bool allowed = (fromRole == Role.Manufacturer && toRole == Role.Distributor) ||
            (fromRole == Role.Distributor &&
                (toRole == Role.Distributor || toRole == Role.Pharmacy));
        if (!allowed) revert InvalidTransferRoute(fromRole, toRole);

        b.pendingOwner = to;
        b.status = BatchStatus.InTransit;
        _addIncoming(to, id);
        _log(id, msg.sender, to, EventType.TransferInitiated, note);

        emit TransferInitiated(id, msg.sender, to, note);
    }

    /// @notice Confirms receipt of a batch; custody moves to the caller.
    /// @dev Status becomes Delivered when the receiver is a pharmacy, otherwise Created ("held").
    /// @param id Batch ID.
    function confirmReceipt(bytes32 id) external whenNotPaused batchExists(id) onlyActive {
        Batch storage b = _batches[id];
        if (b.pendingOwner == address(0)) revert NoPendingTransfer(id);
        if (b.pendingOwner != msg.sender) revert NotPendingOwner(msg.sender);
        if (block.timestamp > b.expiryDate) revert BatchIsExpired(id);

        address from = b.currentOwner;
        _removeIncoming(msg.sender, id);
        _removeOwned(from, id);
        _addOwned(msg.sender, id);

        b.currentOwner = msg.sender;
        b.pendingOwner = address(0);
        b.status = _participants[msg.sender].role == Role.Pharmacy
            ? BatchStatus.Delivered
            : BatchStatus.Created;
        _log(id, from, msg.sender, EventType.TransferConfirmed, "Receipt confirmed");

        emit TransferConfirmed(id, from, msg.sender);
    }

    /// @notice Rejects an incoming transfer; the batch stays with the sender.
    /// @param id Batch ID.
    /// @param reason Why the consignment was rejected (damaged, wrong quantity, ...).
    function rejectTransfer(
        bytes32 id,
        string calldata reason
    ) external whenNotPaused batchExists(id) onlyActive {
        Batch storage b = _batches[id];
        if (b.pendingOwner == address(0)) revert NoPendingTransfer(id);
        if (b.pendingOwner != msg.sender) revert NotPendingOwner(msg.sender);

        _removeIncoming(msg.sender, id);
        b.pendingOwner = address(0);
        b.status = BatchStatus.Created;
        _log(id, msg.sender, b.currentOwner, EventType.TransferRejected, reason);

        emit TransferRejected(id, msg.sender, b.currentOwner, reason);
    }

    /// @notice Cancels an outgoing transfer that has not been confirmed yet.
    /// @param id Batch ID.
    function cancelTransfer(bytes32 id) external whenNotPaused batchExists(id) onlyActive {
        Batch storage b = _batches[id];
        if (b.currentOwner != msg.sender) revert NotCurrentOwner(msg.sender);
        address receiver = b.pendingOwner;
        if (receiver == address(0)) revert NoPendingTransfer(id);

        _removeIncoming(receiver, id);
        b.pendingOwner = address(0);
        b.status = BatchStatus.Created;
        _log(id, msg.sender, receiver, EventType.TransferCancelled, "Transfer cancelled by sender");

        emit TransferCancelled(id, msg.sender, receiver);
    }

    /// @notice Irreversibly recalls a batch. Callable by the batch's manufacturer or a regulator.
    /// @param id Batch ID.
    /// @param reason Recall reason shown to consumers.
    function recallBatch(
        bytes32 id,
        string calldata reason
    ) external whenNotPaused batchExists(id) onlyActive {
        Batch storage b = _batches[id];
        if (b.manufacturer != msg.sender && !hasRole(REGULATOR_ROLE, msg.sender)) {
            revert NotAuthorizedToRecall(msg.sender);
        }
        if (b.status == BatchStatus.Recalled) revert BatchIsRecalled(id);
        if (bytes(reason).length == 0) revert EmptyField();

        address pending = b.pendingOwner;
        if (pending != address(0)) {
            _removeIncoming(pending, id);
            b.pendingOwner = address(0);
        }
        b.status = BatchStatus.Recalled;
        b.recallReason = reason;
        _log(id, msg.sender, b.currentOwner, EventType.Recalled, reason);

        emit BatchRecalled(id, msg.sender, reason);
    }

    /// @notice Attaches (or replaces) the SHA-256 hash of a certificate of analysis.
    /// @param id Batch ID.
    /// @param docHash SHA-256 digest of the document as bytes32 (must be non-zero).
    function attachDocument(
        bytes32 id,
        bytes32 docHash
    ) external whenNotPaused batchExists(id) onlyActive {
        Batch storage b = _batches[id];
        if (b.manufacturer != msg.sender) revert NotBatchManufacturer(msg.sender);
        if (docHash == bytes32(0)) revert InvalidDocHash();

        b.docHash = docHash;
        _log(
            id,
            msg.sender,
            b.currentOwner,
            EventType.DocumentAttached,
            Strings.toHexString(uint256(docHash), 32)
        );

        emit DocumentAttached(id, msg.sender, docHash);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Returns a participant record (role None if the address is not registered).
    /// @param account Address to look up.
    /// @return The participant struct.
    function getParticipant(address account) external view returns (Participant memory) {
        return _participants[account];
    }

    /// @notice Returns every registered participant, in registration order.
    /// @return list Array of participant structs.
    function getAllParticipants() external view returns (Participant[] memory list) {
        uint256 n = _participantList.length;
        list = new Participant[](n);
        for (uint256 i = 0; i < n; i++) {
            list[i] = _participants[_participantList[i]];
        }
    }

    /// @notice Returns true if the account is registered, active and still holds its role.
    /// @param account Address to check.
    /// @return Whether the account may act in the supply chain.
    function isActiveParticipant(address account) external view returns (bool) {
        return _isActive(account);
    }

    /// @notice Returns a batch record (exists = false if unknown).
    /// @param id Batch ID.
    /// @return The batch struct.
    function getBatch(bytes32 id) external view returns (Batch memory) {
        return _batches[id];
    }

    /// @notice Returns the full custody history of a batch, oldest first.
    /// @param id Batch ID.
    /// @return Array of custody events.
    function getHistory(bytes32 id) external view returns (CustodyEvent[] memory) {
        return _history[id];
    }

    /// @notice Returns IDs of batches currently owned by an address.
    /// @param owner Owner address.
    /// @return Batch IDs.
    function getBatchesByOwner(address owner) external view returns (bytes32[] memory) {
        return _owned[owner];
    }

    /// @notice Returns IDs of all batches ever created by a manufacturer.
    /// @param manufacturer Manufacturer address.
    /// @return Batch IDs.
    function getBatchesByManufacturer(
        address manufacturer
    ) external view returns (bytes32[] memory) {
        return _byManufacturer[manufacturer];
    }

    /// @notice Returns IDs of batches awaiting confirmation by an address.
    /// @param account Receiver address.
    /// @return Batch IDs.
    function getPendingIncoming(address account) external view returns (bytes32[] memory) {
        return _incoming[account];
    }

    /// @notice Returns all batch IDs in creation order.
    /// @return Batch IDs.
    function getAllBatchIds() external view returns (bytes32[] memory) {
        return _batchIds;
    }

    /// @notice Returns the number of batches ever created.
    /// @return Count of batches.
    function totalBatches() external view returns (uint256) {
        return _batchIds.length;
    }

    /// @notice Computes the batch ID for a manufacturer and batch number.
    /// @param manufacturer Manufacturer address.
    /// @param batchNumber Batch/lot number.
    /// @return The batch ID.
    function computeBatchId(
        address manufacturer,
        string calldata batchNumber
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(manufacturer, batchNumber));
    }

    /// @notice Core anti-counterfeit check used by the public verify page.
    /// @param id Batch ID read from the QR code.
    /// @return verdict Genuine, Counterfeit, Suspicious, Recalled, Expired or InSupplyChain.
    /// @return reason Human-readable explanation.
    function verifyBatch(bytes32 id) external view returns (Verdict verdict, string memory reason) {
        Batch storage b = _batches[id];
        if (!b.exists) return (Verdict.Counterfeit, "Batch ID not found on chain");
        if (b.status == BatchStatus.Recalled) {
            return (Verdict.Recalled, string.concat("Batch recalled: ", b.recallReason));
        }
        if (block.timestamp > b.expiryDate) {
            return (Verdict.Expired, "Batch is past its expiry date - do not consume");
        }
        if (!hasRole(MANUFACTURER_ROLE, b.manufacturer) || !_participants[b.manufacturer].active) {
            return (
                Verdict.Suspicious,
                "Manufacturer is no longer an authorised, active participant"
            );
        }
        if (!_historyIsConsistent(id, b.currentOwner)) {
            return (Verdict.Suspicious, "Custody history is inconsistent with the current owner");
        }
        if (!_isActive(b.currentOwner)) {
            return (Verdict.Suspicious, "Current custodian is suspended or no longer authorised");
        }
        if (_participants[b.currentOwner].role == Role.Pharmacy && b.pendingOwner == address(0)) {
            return (
                Verdict.Genuine,
                "Authentic batch with a complete custody chain ending at a licensed pharmacy"
            );
        }
        return (
            Verdict.InSupplyChain,
            "Authentic batch, still moving through the supply chain - not yet at a pharmacy"
        );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────────

    function _register(
        address account,
        Role role,
        string memory name,
        string memory licenseId,
        string memory location
    ) internal {
        if (account == address(0)) revert ZeroAddress();
        if (role == Role.None) revert InvalidRole();
        if (bytes(name).length == 0 || bytes(licenseId).length == 0) revert EmptyField();
        if (_participants[account].role != Role.None) revert AlreadyRegistered(account);

        _participants[account] = Participant({
            account: account,
            role: role,
            name: name,
            licenseId: licenseId,
            location: location,
            active: true,
            registeredAt: uint64(block.timestamp)
        });
        _participantList.push(account);
        _grantRole(_roleHash(role), account);

        emit ParticipantRegistered(account, role, name, licenseId, location);
    }

    function _roleHash(Role role) internal pure returns (bytes32) {
        if (role == Role.Manufacturer) return MANUFACTURER_ROLE;
        if (role == Role.Distributor) return DISTRIBUTOR_ROLE;
        if (role == Role.Pharmacy) return PHARMACY_ROLE;
        return REGULATOR_ROLE;
    }

    /// @dev Active = registered, not suspended and still holding the AccessControl role.
    function _isActive(address account) internal view returns (bool) {
        Participant storage p = _participants[account];
        return p.role != Role.None && p.active && hasRole(_roleHash(p.role), account);
    }

    /// @dev Replays custody: every TransferConfirmed must start at the previous owner and the
    ///      final owner must equal `currentOwner`.
    function _historyIsConsistent(bytes32 id, address currentOwner) internal view returns (bool) {
        CustodyEvent[] storage events = _history[id];
        address owner = address(0);
        uint256 n = events.length;
        for (uint256 i = 0; i < n; i++) {
            CustodyEvent storage e = events[i];
            if (e.eventType == EventType.Created) {
                if (i != 0) return false;
                owner = e.to;
            } else if (e.eventType == EventType.TransferConfirmed) {
                if (e.from != owner) return false;
                owner = e.to;
            }
        }
        return owner != address(0) && owner == currentOwner;
    }

    function _log(
        bytes32 id,
        address from,
        address to,
        EventType eventType,
        string memory note
    ) internal {
        _history[id].push(
            CustodyEvent({
                from: from,
                to: to,
                eventType: eventType,
                timestamp: uint64(block.timestamp),
                note: note
            })
        );
    }

    function _addOwned(address owner, bytes32 id) internal {
        _owned[owner].push(id);
        _ownedIndex[id] = _owned[owner].length;
    }

    function _removeOwned(address owner, bytes32 id) internal {
        _removeFromSet(_owned[owner], _ownedIndex, id);
    }

    function _addIncoming(address account, bytes32 id) internal {
        _incoming[account].push(id);
        _incomingIndex[id] = _incoming[account].length;
    }

    function _removeIncoming(address account, bytes32 id) internal {
        _removeFromSet(_incoming[account], _incomingIndex, id);
    }

    function _removeFromSet(
        bytes32[] storage set,
        mapping(bytes32 => uint256) storage index,
        bytes32 id
    ) internal {
        uint256 i = index[id] - 1;
        uint256 last = set.length - 1;
        if (i != last) {
            bytes32 moved = set[last];
            set[i] = moved;
            index[moved] = i + 1;
        }
        set.pop();
        delete index[id];
    }
}
