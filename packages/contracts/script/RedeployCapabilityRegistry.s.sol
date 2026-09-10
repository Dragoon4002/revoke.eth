// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";

// UserRegistry proxy — agents live here, not ETHRegistry
address constant USER_REGISTRY = 0x2fa51338abfD65f58483a5bffe4D270C6748474b;

contract RedeployCapabilityRegistry is Script {
    function run() external {
        vm.startBroadcast();
        CapabilityRegistry capReg = new CapabilityRegistry(USER_REGISTRY);
        vm.stopBroadcast();
        console.log("CapabilityRegistry:", address(capReg));
    }
}
