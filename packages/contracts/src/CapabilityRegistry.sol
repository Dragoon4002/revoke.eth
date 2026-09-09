// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ICapabilityRegistry} from "./interfaces/ICapabilityRegistry.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";

/// @notice Stores capability grants. ENS ownership checked live via ETHRegistry.
contract CapabilityRegistry is ICapabilityRegistry {
    IPermissionedRegistry public immutable ethRegistry;

    // agentNode => serviceId => Capability
    mapping(bytes32 => mapping(bytes32 => Capability)) private _capabilities;

    // agentNode labelhash => owner (cached at grant time, re-checked on isCapabilityValid)
    mapping(bytes32 => address) private _grantors;

    // ponytail: settler role avoids storing Session 3's address in constructor
    address public owner;
    address public settler; // Session 3 calls settlePayment

    error Unauthorized();
    error CapabilityNotFound();
    error AlreadyExpired();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyGrantorOrOwner(bytes32 agentNode) {
        Capability storage cap = _capabilities[agentNode][bytes32(0)];
        if (msg.sender != owner && msg.sender != _grantors[agentNode]) revert Unauthorized();
        _;
    }

    constructor(address _ethRegistry) {
        ethRegistry = IPermissionedRegistry(_ethRegistry);
        owner = msg.sender;
        settler = msg.sender;
    }

    function setSettler(address _settler) external onlyOwner {
        settler = _settler;
    }

    function grantCapability(
        bytes32 agentNode,
        bytes32 serviceId,
        uint256 expiry,
        string calldata metadataURI
    ) external override {
        if (expiry <= block.timestamp) revert AlreadyExpired();

        // Grantor must own the agent's ENS name
        uint256 labelhash = uint256(agentNode);
        address nameOwner = ethRegistry.getOwner(labelhash);
        if (nameOwner != msg.sender) revert Unauthorized();

        _capabilities[agentNode][serviceId] = Capability({
            grantor: msg.sender,
            expiry: expiry,
            active: true
        });
        _grantors[agentNode] = msg.sender;

        emit CapabilityGranted(agentNode, serviceId, msg.sender, expiry, metadataURI);
    }

    function revokeCapability(bytes32 agentNode, bytes32 serviceId) external override {
        Capability storage cap = _capabilities[agentNode][serviceId];
        if (cap.grantor == address(0)) revert CapabilityNotFound();
        if (msg.sender != cap.grantor && msg.sender != owner) revert Unauthorized();

        cap.active = false;
        emit CapabilityRevoked(agentNode, serviceId, msg.sender, block.timestamp);
    }

    function settlePayment(
        bytes32 agentNode,
        bytes32 serviceId,
        address payer,
        uint256 amount,
        bytes32 hcsReceiptHash
    ) external override {
        if (msg.sender != settler) revert Unauthorized();
        emit PaymentSettled(agentNode, serviceId, payer, amount, hcsReceiptHash);
    }

    function isCapabilityValid(bytes32 agentNode, bytes32 serviceId)
        external
        view
        override
        returns (bool isValid, uint256 expiry, address grantor)
    {
        Capability storage cap = _capabilities[agentNode][serviceId];
        if (!cap.active || cap.expiry <= block.timestamp) {
            return (false, cap.expiry, cap.grantor);
        }

        // Re-check live ENS ownership — if grantor lost the name, capability is void
        uint256 labelhash = uint256(agentNode);
        address currentOwner = ethRegistry.getOwner(labelhash);
        if (currentOwner != cap.grantor) {
            return (false, cap.expiry, cap.grantor);
        }

        return (true, cap.expiry, cap.grantor);
    }

    function isDelegationActive(bytes32 agentNode, address delegatedTo)
        external
        view
        override
        returns (bool)
    {
        uint256 labelhash = uint256(agentNode);
        address currentOwner = ethRegistry.getOwner(labelhash);
        return currentOwner == delegatedTo;
    }

    function getCapability(bytes32 agentNode, bytes32 serviceId)
        external
        view
        override
        returns (Capability memory)
    {
        return _capabilities[agentNode][serviceId];
    }
}
