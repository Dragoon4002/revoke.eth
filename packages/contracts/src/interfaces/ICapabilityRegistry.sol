// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Frozen interface — other sessions import this, never the implementation.
interface ICapabilityRegistry {
    struct Capability {
        address grantor;
        uint256 expiry;
        bool active;
    }

    event CapabilityGranted(
        bytes32 indexed agentENSNode,
        bytes32 indexed serviceId,
        address indexed grantor,
        uint256 expiryTimestamp,
        string metadataURI
    );

    event CapabilityRevoked(
        bytes32 indexed agentENSNode,
        bytes32 indexed serviceId,
        address indexed revoker,
        uint256 revokedAt
    );

    // Emitted by Session 3 via settlePayment()
    event PaymentSettled(
        bytes32 indexed agentENSNode,
        bytes32 indexed serviceId,
        address indexed payer,
        uint256 amount,
        bytes32 hcsReceiptHash
    );

    /// @notice Grant capability to agent for a service.
    /// @param agentNode  namehash of agent ENS name
    /// @param serviceId  keccak256 of service identifier string
    /// @param expiry     unix timestamp
    /// @param metadataURI optional IPFS URI with capability scope JSON
    function grantCapability(
        bytes32 agentNode,
        bytes32 serviceId,
        uint256 expiry,
        string calldata metadataURI
    ) external;

    /// @notice Revoke a previously granted capability.
    function revokeCapability(bytes32 agentNode, bytes32 serviceId) external;

    /// @notice Called by Session 3 after x402 settlement to record HCS receipt.
    function settlePayment(
        bytes32 agentNode,
        bytes32 serviceId,
        address payer,
        uint256 amount,
        bytes32 hcsReceiptHash
    ) external;

    /// @notice Primary authorization check — Session 3 calls this before x402.
    /// @return isValid  true if capability exists, active, and not expired
    /// @return expiry   capability expiry timestamp
    /// @return grantor  address that granted the capability
    function isCapabilityValid(bytes32 agentNode, bytes32 serviceId)
        external
        view
        returns (bool isValid, uint256 expiry, address grantor);

    /// @notice Check live ENS ownership to confirm delegation still active.
    /// @param agentNode     namehash of agent ENS name
    /// @param delegatedTo   address that should currently own the name
    function isDelegationActive(bytes32 agentNode, address delegatedTo)
        external
        view
        returns (bool);

    function getCapability(bytes32 agentNode, bytes32 serviceId)
        external
        view
        returns (Capability memory);
}
