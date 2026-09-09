// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAgentRegistrar} from "./interfaces/IAgentRegistrar.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";

/// @notice Registrar for agent subnames. Sits in front of ETHRegistry (Permissioned Registry).
/// @dev Registry owner must call ethRegistry.grantRootRoles(ROLE_REGISTRAR | ROLE_RENEW | ROLE_UNREGISTER, address(this))
contract AgentRegistrar is IAgentRegistrar {
    IPermissionedRegistry public immutable ethRegistry;
    address public immutable defaultResolver;
    address public owner;

    // Role bitmap granted to agent token owner: set resolver + set subregistry
    uint256 internal constant AGENT_TOKEN_ROLES =
        RegistryRolesLib.ROLE_SET_RESOLVER | RegistryRolesLib.ROLE_SET_SUBREGISTRY;

    error Unauthorized();
    error LabelNotRegistered();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _ethRegistry, address _defaultResolver) {
        ethRegistry = IPermissionedRegistry(_ethRegistry);
        defaultResolver = _defaultResolver;
        owner = msg.sender;
    }

    function registerAgent(
        string calldata label,
        address agentOwner,
        address resolver,
        uint64 expiry
    ) external override onlyOwner returns (uint256 tokenId) {
        address resolverToUse = resolver == address(0) ? defaultResolver : resolver;
        tokenId = ethRegistry.register(
            label,
            agentOwner,
            IRegistry(address(0)), // no custom subregistry
            resolverToUse,
            AGENT_TOKEN_ROLES,
            expiry
        );
        emit AgentRegistered(keccak256(bytes(label)), agentOwner, expiry, tokenId);
    }

    function revokeAgent(string calldata label) external override onlyOwner {
        uint256 lh = uint256(keccak256(bytes(label)));
        ethRegistry.unregister(lh);
        emit AgentRevoked(keccak256(bytes(label)), uint64(block.timestamp));
    }

    function renewAgent(string calldata label, uint64 newExpiry) external override onlyOwner {
        uint256 lh = uint256(keccak256(bytes(label)));
        ethRegistry.renew(lh, newExpiry);
        emit AgentRenewed(keccak256(bytes(label)), newExpiry);
    }

    function isAgentRegistered(string calldata label) external view override returns (bool) {
        uint256 lh = uint256(keccak256(bytes(label)));
        IPermissionedRegistry.State memory state = ethRegistry.getState(lh);
        return state.status == IPermissionedRegistry.Status.REGISTERED
            && state.expiry > block.timestamp;
    }

    function labelHash(string calldata label) external pure override returns (bytes32) {
        return keccak256(bytes(label));
    }
}
