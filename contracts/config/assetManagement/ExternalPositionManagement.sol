// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IAccessController} from "../../access/IAccessController.sol";
import {ErrorLibrary} from "../../library/ErrorLibrary.sol";
import {IPositionManager} from "../../wrappers/abstract/IPositionManager.sol";
import {PositionWrapper} from "../../wrappers/abstract/PositionWrapper.sol";

import {AccessRoles} from "../../access/AccessRoles.sol";

import {IAssetManagementConfig} from "../../config/assetManagement/IAssetManagementConfig.sol";

/**
 * @title External Position Management
 * @dev Abstract contract for managing external Uniswap V3 positions within a broader asset management system.
 *      Provides functionality to initialize position management and enable Uniswap V3 wrappers.
 */
abstract contract ExternalPositionManagement is AccessRoles {
  IPositionManager public positionManager; // Interface to interact with the position manager.
  bool public uniswapV3WrapperEnabled; // Flag to indicate if the Uniswap V3 wrapper is enabled.

  address basePositionManager; // Address of the base implementation for position manager cloning.
  address accessControllerAddress; // Address of the access controller for role management.

  address private protocolConfig; // Address of the protocol config.

  event UniswapV3ManagerEnabled();

  error UniSwapV3WrapperAlreadyEnabled(); // Custom error for preventing re-enabling the Uniswap V3 wrapper.

  /**
   * @notice Initializes the contract with necessary configurations for external position management.
   * @param _accessControllerAddress Address of the access controller for managing permissions.
   * @param _basePositionManager Address of the base position manager for creating clones.
   * @dev Internal initializer function to set up initial state.
   */
  function ExternalPositionManagement__init(
    address _protocolConfig,
    address _accessControllerAddress,
    address _basePositionManager
  ) internal {
    accessControllerAddress = _accessControllerAddress;
    basePositionManager = _basePositionManager;

    protocolConfig = _protocolConfig;
  }

  /**
   * @notice Enables the Uniswap V3 wrapper if it is not already enabled and the caller has the asset manager role.
   * @dev Clones a new position manager from a base implementation and initializes it. This function is restricted
   *      to asset managers and can only be executed once to prevent re-initialization.
   */
  function enableUniSwapV3Manager() external {
    // Ensure the caller has the asset manager role.
    if (
      !IAccessController(accessControllerAddress).hasRole(
        ASSET_MANAGER,
        msg.sender
      )
    ) revert ErrorLibrary.CallerNotAssetManager();

    // Prevent re-enabling if the wrapper is already enabled.
    if (uniswapV3WrapperEnabled) {
      revert UniSwapV3WrapperAlreadyEnabled();
    }

    // Clone and initialize the position manager.
    positionManager = IPositionManager(Clones.clone(basePositionManager));
    positionManager.init(
      protocolConfig,
      address(this),
      accessControllerAddress
    );

    // Mark the wrapper as enabled.
    uniswapV3WrapperEnabled = true;

    emit UniswapV3ManagerEnabled();
  }
}
