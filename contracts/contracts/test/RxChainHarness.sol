// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RxChain} from "../RxChain.sol";

/// @title RxChainHarness — TEST ONLY
/// @notice Exposes a way to corrupt custody history so the integrity branch of `verifyBatch`
///         can be exercised. Never deployed by the deploy script.
contract RxChainHarness is RxChain {
    constructor() RxChain("Harness Regulator", "TEST-REG", "Test") {}

    /// @notice Overwrites the `from` field of a history entry (simulates storage corruption).
    function corruptHistoryFrom(bytes32 id, uint256 index, address from) external {
        _history[id][index].from = from;
    }

    /// @notice Inserts a bogus Created event (simulates a forged mint record).
    function injectCreatedEvent(bytes32 id, address to) external {
        _log(id, address(0), to, EventType.Created, "forged");
    }

    /// @notice Clears a batch's history entirely.
    function wipeHistory(bytes32 id) external {
        delete _history[id];
    }
}
