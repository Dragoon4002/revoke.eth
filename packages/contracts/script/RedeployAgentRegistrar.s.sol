// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistrar} from "../src/AgentRegistrar.sol";

address constant USER_REGISTRY   = 0x2fa51338abfD65f58483a5bffe4D270C6748474b;
address constant AGENT_RESOLVER  = 0x9cB3881E62B5C9e55DAde607d5FC93F6bB719150;

contract RedeployAgentRegistrar is Script {
    function run() external {
        vm.startBroadcast();
        AgentRegistrar registrar = new AgentRegistrar(USER_REGISTRY, AGENT_RESOLVER);
        vm.stopBroadcast();
        console.log("AgentRegistrar:", address(registrar));
    }
}
