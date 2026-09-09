// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {ICapabilityRegistry} from "../src/interfaces/ICapabilityRegistry.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";

// Sepolia ETHRegistry — fork tests only
address constant ETH_REGISTRY_SEPOLIA = 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2;

contract CapabilityRegistryTest is Test {
    CapabilityRegistry public capReg;

    address public grantor = makeAddr("grantor");
    address public agent = makeAddr("agent");
    address public attacker = makeAddr("attacker");

    bytes32 public constant AGENT_NODE = keccak256("test-agent");
    bytes32 public constant SERVICE_ID = keccak256("data-query");

    // Mock registry that always returns grantor as owner
    MockRegistry public mockRegistry;

    function setUp() public {
        mockRegistry = new MockRegistry(grantor);
        capReg = new CapabilityRegistry(address(mockRegistry));
        capReg.setSettler(address(this));
    }

    function test_grantCapability() public {
        vm.prank(grantor);
        capReg.grantCapability(AGENT_NODE, SERVICE_ID, block.timestamp + 1 days, "ipfs://test");

        (bool isValid, uint256 expiry, address g) = capReg.isCapabilityValid(AGENT_NODE, SERVICE_ID);
        assertTrue(isValid);
        assertEq(g, grantor);
        assertGt(expiry, block.timestamp);
    }

    function test_revokeCapability() public {
        vm.prank(grantor);
        capReg.grantCapability(AGENT_NODE, SERVICE_ID, block.timestamp + 1 days, "");

        vm.prank(grantor);
        capReg.revokeCapability(AGENT_NODE, SERVICE_ID);

        (bool isValid,,) = capReg.isCapabilityValid(AGENT_NODE, SERVICE_ID);
        assertFalse(isValid);
    }

    function test_expiredCapabilityInvalid() public {
        vm.prank(grantor);
        capReg.grantCapability(AGENT_NODE, SERVICE_ID, block.timestamp + 1 hours, "");

        vm.warp(block.timestamp + 2 hours);

        (bool isValid,,) = capReg.isCapabilityValid(AGENT_NODE, SERVICE_ID);
        assertFalse(isValid);
    }

    function test_attackerCannotRevoke() public {
        vm.prank(grantor);
        capReg.grantCapability(AGENT_NODE, SERVICE_ID, block.timestamp + 1 days, "");

        vm.prank(attacker);
        vm.expectRevert(CapabilityRegistry.Unauthorized.selector);
        capReg.revokeCapability(AGENT_NODE, SERVICE_ID);
    }

    function test_attackerCannotGrant() public {
        // mockRegistry returns grantor as owner, attacker is not grantor
        vm.prank(attacker);
        vm.expectRevert(CapabilityRegistry.Unauthorized.selector);
        capReg.grantCapability(AGENT_NODE, SERVICE_ID, block.timestamp + 1 days, "");
    }

    function test_settlePaymentEmitsEvent() public {
        bytes32 hcsHash = keccak256("hcs-receipt-1");
        vm.expectEmit(true, true, true, true);
        emit ICapabilityRegistry.PaymentSettled(AGENT_NODE, SERVICE_ID, agent, 100e6, hcsHash);
        capReg.settlePayment(AGENT_NODE, SERVICE_ID, agent, 100e6, hcsHash);
    }

    function test_isDelegationActive() public {
        assertTrue(capReg.isDelegationActive(AGENT_NODE, grantor));
        assertFalse(capReg.isDelegationActive(AGENT_NODE, attacker));
    }

    function test_ownerLostNameInvalidatesCapability() public {
        vm.prank(grantor);
        capReg.grantCapability(AGENT_NODE, SERVICE_ID, block.timestamp + 1 days, "");

        // Simulate grantor losing the ENS name
        mockRegistry.setOwner(attacker);

        (bool isValid,,) = capReg.isCapabilityValid(AGENT_NODE, SERVICE_ID);
        assertFalse(isValid);
    }
}

/// @dev Minimal mock for IPermissionedRegistry — returns configurable owner.
contract MockRegistry {
    address private _owner;

    constructor(address initialOwner) {
        _owner = initialOwner;
    }

    function setOwner(address newOwner) external {
        _owner = newOwner;
    }

    function getOwner(uint256) external view returns (address) {
        return _owner;
    }

    // Satisfy interface — unused in tests
    function getState(uint256) external pure returns (IPermissionedRegistry.State memory) {
        return IPermissionedRegistry.State({
            status: IPermissionedRegistry.Status.REGISTERED,
            expiry: type(uint64).max,
            latestOwner: address(0),
            tokenId: 0,
            resource: 0
        });
    }
}
