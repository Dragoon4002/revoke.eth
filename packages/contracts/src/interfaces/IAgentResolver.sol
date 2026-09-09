// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Frozen interface — Sessions 1 and 4 import this.
/// Handles ENSIP-25 (agent verification) and ENSIP-26 (agent text records).
interface IAgentResolver {
    /// @notice Set ENSIP-26 agent-context record.
    function setAgentContext(bytes32 node, string calldata context) external;

    /// @notice Set ENSIP-26 agent-endpoint[protocol] record.
    function setAgentEndpoint(
        bytes32 node,
        string calldata protocol,
        string calldata url
    ) external;

    /// @notice Set ENSIP-25 agent-registration[registry][agentId] = "1".
    function setAgentRegistration(
        bytes32 node,
        address registry,
        string calldata agentId
    ) external;

    /// @notice Read ENSIP-26 agent-context.
    function getAgentContext(bytes32 node) external view returns (string memory);

    /// @notice Read ENSIP-26 agent-endpoint[protocol].
    function getAgentEndpoint(bytes32 node, string calldata protocol)
        external
        view
        returns (string memory);

    /// @notice Read raw capability metadata bytes (from CapabilityRegistry).
    function getCapabilityMetadata(bytes32 node, bytes32 serviceId)
        external
        view
        returns (bytes memory);

    /// @notice Standard ENS text() — resolves any text record key.
    function text(bytes32 node, string calldata key) external view returns (string memory);
}
