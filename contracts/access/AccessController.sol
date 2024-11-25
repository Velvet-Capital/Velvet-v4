// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ErrorLibrary } from "../library/ErrorLibrary.sol";
import { FunctionParameters } from "../FunctionParameters.sol";
import { AccessRoles } from "./AccessRoles.sol";
import { IAccessController } from "./IAccessController.sol";
import { IPortfolio } from "../core/interfaces/IPortfolio.sol";

/**
 * @title AccessController
 * @dev Manages roles and permissions within the Portfolio platform.
 * Utilizes OpenZeppelin's AccessControl for robust role management.
 */
contract AccessController is AccessControl, AccessRoles, IAccessController {
  error CallerNotAssetManagementConfig();
  /**
   * @dev Sets up the default admin role to the deployer.
   */
  constructor() {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
  }

  /**
   * @dev Ensures that only users with the admin role can call the modified function.
   */
  modifier onlyAdmin() {
    if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
      revert ErrorLibrary.CallerNotAdmin();
    }
    _;
  }

  /**
   * @notice Assigns a role to an account. Can only be called by an account with admin privileges.
   * @param _role The role to assign.
   * @param _account The account to assign the role to.
   */
  function setupRole(
    bytes32 _role,
    address _account
  ) external override onlyAdmin {
    _grantRole(_role, _account);
  }

  /**
   * @notice Configures roles for new fund components, intended to be called at fund creation.
   * @param _setupData Data structure containing role setup information.
   */
  function setUpRoles(
    FunctionParameters.AccessSetup memory _setupData
  ) external override onlyAdmin {
    _grantRole(PORTFOLIO_MANAGER_ROLE, _setupData._portfolio);

    _grantRole(SUPER_ADMIN, _setupData._portfolioCreator);

    _setRoleAdmin(WHITELIST_MANAGER_ADMIN, SUPER_ADMIN);
    _setRoleAdmin(ASSET_MANAGER_ADMIN, SUPER_ADMIN);
    _setRoleAdmin(ASSET_MANAGER, ASSET_MANAGER_ADMIN);
    _setRoleAdmin(WHITELIST_MANAGER, WHITELIST_MANAGER_ADMIN);

    _grantRole(WHITELIST_MANAGER_ADMIN, _setupData._portfolioCreator);
    _grantRole(WHITELIST_MANAGER, _setupData._portfolioCreator);
    _grantRole(ASSET_MANAGER_ADMIN, _setupData._portfolioCreator);
    _grantRole(ASSET_MANAGER, _setupData._portfolioCreator);

    _grantRole(PORTFOLIO_MANAGER_ROLE, _setupData._rebalancing);
    _grantRole(REBALANCER_CONTRACT, _setupData._rebalancing);
    _grantRole(REBALANCER_CONTRACT, _setupData._borrowManager);

    _grantRole(MINTER_ROLE, _setupData._feeModule);

    _grantRole(
      ASSET_MANAGER_CONFIG,
      IPortfolio(_setupData._portfolio).assetManagementConfig()
    );
  }

  /**
   * @notice Transfers the SUPER_ADMIN role from one account to another.
   * @param _oldAccount The current holder of the SUPER_ADMIN role.
   * @param _newAccount The new recipient of the SUPER_ADMIN role.
   */
  function transferSuperAdminOwnership(
    address _oldAccount,
    address _newAccount
  ) external override onlyAdmin {
    _grantRole(SUPER_ADMIN, _newAccount);
    revokeRole(SUPER_ADMIN, _oldAccount);
  }

  function setupPositionManagerRole(address _positionManager) external {
    if (!hasRole(ASSET_MANAGER_CONFIG, msg.sender))
      revert CallerNotAssetManagementConfig();

    _grantRole(POSITION_MANAGER, _positionManager);
  }

  /**
   * @notice Checks if an account has a specific role.
   * @param role The role to check.
   * @param account The account to check.
   * @return True if the account has the specified role, otherwise false.
   */
  function hasRole(
    bytes32 role,
    address account
  ) public view override(AccessControl, IAccessController) returns (bool) {
    return super.hasRole(role, account);
  }
}
