// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IEnhancedAccessControl} from "@ensdomains/contracts-v2/access-control/interfaces/IEnhancedAccessControl.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";

interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes memory data) external returns (address proxy);
}

address constant VERIFIABLE_FACTORY = 0x118Bc31A50d559F7015a8Da26d54B3b030CdB70F;
address constant USER_REGISTRY_IMPL = 0x840Fa461059862Ea466A711E8C98c8dE732061C0;
address constant AGENT_REGISTRAR = 0x2A9caFEDFc91d55E00B6d1514E39BeB940832b5D;

contract DeployUserRegistry is Script {
    function run() external {
        vm.startBroadcast();

        address deployer = msg.sender;
        console.log("Deployer:", deployer);

        // Deployer gets admin roles so it can grant roles to AgentRegistrar
        uint256 deployerRoles =
            RegistryRolesLib.ROLE_REGISTRAR_ADMIN |
            RegistryRolesLib.ROLE_RENEW_ADMIN |
            RegistryRolesLib.ROLE_UNREGISTER_ADMIN |
            RegistryRolesLib.ROLE_REGISTRAR |
            RegistryRolesLib.ROLE_RENEW |
            RegistryRolesLib.ROLE_UNREGISTER;

        bytes memory initData = abi.encodeWithSignature(
            "initialize(address,uint256)",
            deployer,
            deployerRoles
        );

        // ponytail: salt=1, deterministic but simple — change if redeploying
        address proxy = IVerifiableFactory(VERIFIABLE_FACTORY).deployProxy(
            USER_REGISTRY_IMPL,
            1,
            initData
        );

        console.log("UserRegistry proxy:", proxy);

        // Grant AgentRegistrar ROLE_REGISTRAR | ROLE_RENEW | ROLE_UNREGISTER on ROOT_RESOURCE
        uint256 agentRegistrarRoles =
            RegistryRolesLib.ROLE_REGISTRAR |
            RegistryRolesLib.ROLE_RENEW |
            RegistryRolesLib.ROLE_UNREGISTER;

        IEnhancedAccessControl(proxy).grantRootRoles(agentRegistrarRoles, AGENT_REGISTRAR);
        console.log("Granted roles to AgentRegistrar:", AGENT_REGISTRAR);

        vm.stopBroadcast();
    }
}
