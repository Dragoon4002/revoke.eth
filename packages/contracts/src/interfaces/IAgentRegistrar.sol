// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Frozen interface — Session 1 (delegation) imports this.
interface IAgentRegistrar {
    event AgentRegistered(
        bytes32 indexed labelHash,
        address indexed owner,
        uint64 expiry,
        uint256 tokenId
    );

    event AgentRevoked(bytes32 indexed labelHash, uint64 revokedAt);

    event AgentRenewed(bytes32 indexed labelHash, uint64 newExpiry);

    /// @notice Register an agent subname under the parent .eth name.
    /// @param label      subdomain label (e.g. "agent-7f3a")
    /// @param agentOwner address that will own the subname token
    /// @param resolver   resolver contract for this agent
    /// @param expiry     unix timestamp when delegation expires
    /// @return tokenId   ERC1155Singleton token ID
    function registerAgent(
        string calldata label,
        address agentOwner,
        address resolver,
        uint64 expiry
    ) external returns (uint256 tokenId);

    /// @notice Revoke an agent's subname immediately.
    function revokeAgent(string calldata label) external;

    /// @notice Extend an agent's subname expiry.
    function renewAgent(string calldata label, uint64 newExpiry) external;

    /// @notice Check if an agent label is currently registered and not expired.
    function isAgentRegistered(string calldata label) external view returns (bool);

    /// @notice Get the labelhash for a label string.
    function labelHash(string calldata label) external pure returns (bytes32);
}
