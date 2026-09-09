// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {AgentRegistrar} from "../src/AgentRegistrar.sol";
import {AgentResolver} from "../src/AgentResolver.sol";

// ENSv2 Sepolia beta addresses
address constant ETH_REGISTRY = 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2;
address constant UNIVERSAL_RESOLVER_V2 = 0x4A1817d13E9cF196f471725176355C1234b63C70;

contract Deploy is Script {
    function run() external {
        // Use msg.sender from --private-key flag, no env read needed
        vm.startBroadcast();

        console.log("Deployer:", msg.sender);
        console.log("ETHRegistry:", ETH_REGISTRY);

        CapabilityRegistry capReg = new CapabilityRegistry(ETH_REGISTRY);
        console.log("CapabilityRegistry:", address(capReg));

        AgentResolver resolver = new AgentResolver(address(capReg));
        console.log("AgentResolver:", address(resolver));

        AgentRegistrar registrar = new AgentRegistrar(ETH_REGISTRY, address(resolver));
        console.log("AgentRegistrar:", address(registrar));

        vm.stopBroadcast();

        console.log("\n=== DEPLOYMENT ADDRESSES ===");
        console.log("{");
        console.log('  "chainId": 11155111,');
        console.log('  "CapabilityRegistry": "%s",', address(capReg));
        console.log('  "AgentResolver": "%s",', address(resolver));
        console.log('  "AgentRegistrar": "%s"', address(registrar));
        console.log("}");
    }
}

/// @notice Run after granting ROLE_REGISTRAR to AgentRegistrar on ETHRegistry.
contract RegisterDemoAgent is Script {
    function run() external {
        address registrarAddr = vm.envAddress("AGENT_REGISTRAR");
        address resolverAddr = vm.envAddress("AGENT_RESOLVER");

        AgentRegistrar registrar = AgentRegistrar(registrarAddr);

        vm.startBroadcast();

        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 tokenId = registrar.registerAgent(
            "demo-agent",
            msg.sender,
            resolverAddr,
            expiry
        );

        console.log("Demo agent registered. TokenId:", tokenId);
        console.log("Label: demo-agent");
        console.log("Expiry:", expiry);

        vm.stopBroadcast();
    }
}
