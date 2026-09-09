// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAgentResolver} from "./interfaces/IAgentResolver.sol";
import {ICapabilityRegistry} from "./interfaces/ICapabilityRegistry.sol";

/// @notice Resolver with ENSIP-25 and ENSIP-26 agent record support.
/// Stores records as text entries; key format follows the ENSIPs.
contract AgentResolver is IAgentResolver {
    ICapabilityRegistry public immutable capabilityRegistry;

    // node => key => value (standard ENS text record storage)
    mapping(bytes32 => mapping(string => string)) private _records;

    // node => authorized writer (set resolver role holder)
    mapping(bytes32 => address) private _writers;

    address public owner;

    error Unauthorized();

    event TextChanged(bytes32 indexed node, string indexed key, string value);

    modifier onlyWriterOrOwner(bytes32 node) {
        if (msg.sender != owner && msg.sender != _writers[node]) revert Unauthorized();
        _;
    }

    constructor(address _capabilityRegistry) {
        capabilityRegistry = ICapabilityRegistry(_capabilityRegistry);
        owner = msg.sender;
    }

    /// @notice Authorize an address to write records for a specific node.
    function authorizeWriter(bytes32 node, address writer) external {
        if (msg.sender != owner) revert Unauthorized();
        _writers[node] = writer;
    }

    // -------------------------------------------------------------------------
    // ENSIP-26: Agent text records
    // -------------------------------------------------------------------------

    function setAgentContext(bytes32 node, string calldata context)
        external
        override
        onlyWriterOrOwner(node)
    {
        _setText(node, "agent-context", context);
    }

    function setAgentEndpoint(
        bytes32 node,
        string calldata protocol,
        string calldata url
    ) external override onlyWriterOrOwner(node) {
        string memory key = string(abi.encodePacked("agent-endpoint[", protocol, "]"));
        _setText(node, key, url);
    }

    // -------------------------------------------------------------------------
    // ENSIP-25: Agent registry verification
    // -------------------------------------------------------------------------

    function setAgentRegistration(
        bytes32 node,
        address registry,
        string calldata agentId
    ) external override onlyWriterOrOwner(node) {
        string memory key = string(
            abi.encodePacked(
                "agent-registration[",
                _toHexString(registry),
                "][",
                agentId,
                "]"
            )
        );
        _setText(node, key, "1");
    }

    // -------------------------------------------------------------------------
    // Read methods
    // -------------------------------------------------------------------------

    function text(bytes32 node, string calldata key)
        external
        view
        override
        returns (string memory)
    {
        return _records[node][key];
    }

    function getAgentContext(bytes32 node) external view override returns (string memory) {
        return _records[node]["agent-context"];
    }

    function getAgentEndpoint(bytes32 node, string calldata protocol)
        external
        view
        override
        returns (string memory)
    {
        string memory key = string(abi.encodePacked("agent-endpoint[", protocol, "]"));
        return _records[node][key];
    }

    function getCapabilityMetadata(bytes32 node, bytes32 serviceId)
        external
        view
        override
        returns (bytes memory)
    {
        (bool isValid, uint256 expiry, address grantor) =
            capabilityRegistry.isCapabilityValid(node, serviceId);
        return abi.encode(isValid, expiry, grantor);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _setText(bytes32 node, string memory key, string memory value) internal {
        _records[node][key] = value;
        emit TextChanged(node, key, value);
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        bytes memory alphabet = "0123456789abcdef";
        uint160 value = uint160(addr);
        for (uint256 i = 41; i > 1; i--) {
            buffer[i] = alphabet[value & 0xf];
            value >>= 4;
        }
        return string(buffer);
    }
}
