// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IEnhancedAccessControl} from "@ensdomains/contracts-v2/access-control/interfaces/IEnhancedAccessControl.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";

address constant USER_REGISTRY    = 0x2fa51338abfD65f58483a5bffe4D270C6748474b;
address constant NEW_AGENT_REGISTRAR = 0x94CC95937aD2d1Fc8e7D46500553443732049b37;

contract GrantRegistrarRoles is Script {
    function run() external {
        vm.startBroadcast();
        uint256 roles =
            RegistryRolesLib.ROLE_REGISTRAR |
            RegistryRolesLib.ROLE_RENEW |
            RegistryRolesLib.ROLE_UNREGISTER;
        IEnhancedAccessControl(USER_REGISTRY).grantRootRoles(roles, NEW_AGENT_REGISTRAR);
        console.log("Granted roles to AgentRegistrar:", NEW_AGENT_REGISTRAR);
        vm.stopBroadcast();
    }
}
