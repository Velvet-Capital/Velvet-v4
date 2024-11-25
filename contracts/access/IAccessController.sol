// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import { FunctionParameters } from "../FunctionParameters.sol";

/**
 * @title IAccessController
 * @dev Interface for the AccessController contract to manage roles and permissions within the Portfolio platform.
 */
interface IAccessController {
  function setupRole(bytes32 _role, address _account) external;

  function setUpRoles(
    FunctionParameters.AccessSetup memory _setupData
  ) external;

  function transferSuperAdminOwnership(
    address _oldAccount,
    address _newAccount
  ) external;

  function hasRole(bytes32 role, address account) external view returns (bool);

  function setupPositionManagerRole(address _positionManager) external;
}
