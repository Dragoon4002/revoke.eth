// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AgentResolver} from "../src/AgentResolver.sol";

// New CapabilityRegistry (points at UserRegistry)
address constant CAP_REGISTRY = 0xE2867033aa5963a838c85aC2aE3A9452B715750d;

contract RedeployResolver is Script {
    function run() external {
        vm.startBroadcast();
        AgentResolver resolver = new AgentResolver(CAP_REGISTRY);
        vm.stopBroadcast();
        console.log("AgentResolver:", address(resolver));
    }
}
