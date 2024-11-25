// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

/**
 * @title AccessRoles
 * @dev Defines roles for access control in the system.
 * This contract stores constants for role identifiers used across the system to manage permissions and access.
 * Roles are used in conjunction with an AccessControl mechanism to secure functions and actions.
 */
contract AccessRoles {
  // Role for managing indices, including creating, updating, and deleting them.
  bytes32 internal constant PORTFOLIO_MANAGER_ROLE =
    keccak256("PORTFOLIO_MANAGER_ROLE");

  // Role for the highest level of administrative access, capable of managing roles and critical system settings.
  bytes32 internal constant SUPER_ADMIN = keccak256("SUPER_ADMIN");

  // Admin role for managing the whitelist, specifically capable of adding or removing addresses from the whitelist.
  bytes32 internal constant WHITELIST_MANAGER_ADMIN =
    keccak256("WHITELIST_MANAGER_ADMIN");

  // Role for managing assets, including tasks such as adjusting asset allocations and managing asset listings.
  bytes32 internal constant ASSET_MANAGER = keccak256("ASSET_MANAGER");

  // Role for managing the whitelist, typically including adding or removing addresses to/from a whitelist for access control.
  bytes32 internal constant WHITELIST_MANAGER = keccak256("WHITELIST_MANAGER");

  // Admin role for asset managers, capable of assigning or revoking the ASSET_MANAGER to other addresses.
  bytes32 internal constant ASSET_MANAGER_ADMIN =
    keccak256("ASSET_MANAGER_ADMIN");

  // Specialized role for the rebalancing contract.
  bytes32 internal constant REBALANCER_CONTRACT =
    keccak256("REBALANCER_CONTRACT");

  // Role for addresses authorized to mint tokens, typically used in token generation events or for reward distributions.
  bytes32 internal constant MINTER_ROLE = keccak256("MINTER_ROLE");

  // Role for managing external positions.
  // This role is also granted permission to write to external position storage.
  bytes32 internal constant POSITION_MANAGER = keccak256("POSITION_MANAGER");

  // Role for managing asset configurations
  // This role is also granted permission to assign the position manager role.
  bytes32 internal constant ASSET_MANAGER_CONFIG =
    keccak256("ASSET_MANAGER_CONFIG");
}
