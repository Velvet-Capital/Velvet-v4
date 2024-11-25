// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import { IAccessController } from "../../access/IAccessController.sol";
import { ErrorLibrary } from "../../library/ErrorLibrary.sol";
import { IPositionManager } from "../../wrappers/abstract/IPositionManager.sol";
import { PositionWrapper } from "../../wrappers/abstract/PositionWrapper.sol";

import { AccessRoles } from "../../access/AccessRoles.sol";
import { IProtocolConfig } from "../../config/protocol/IProtocolConfig.sol";
import { IAssetManagementConfig } from "../../config/assetManagement/IAssetManagementConfig.sol";
import { IExternalPositionStorage } from "../../wrappers/abstract/IExternalPositionStorage.sol";

/**
 * @title External Position Management
 * @dev Abstract contract for managing external Uniswap V3 positions within a broader asset management system.
 *      Provides functionality to initialize position management and enable Uniswap V3 wrappers.
 */
abstract contract ExternalPositionManagement is AccessRoles {
  IPositionManager public positionManager; // Interface to interact with the position manager.
  address public externalPositions; // Interface to interact with external positions.
  bool public uniswapV3WrapperEnabled; // Flag to indicate if the Uniswap V3 wrapper is enabled.

  address basePositionManager; // Address of the base implementation for position manager cloning.
  address accessControllerAddress; // Address of the access controller for role management.

  address public protocolConfig; // Address of the protocol config.

  // Mapping to track whitelisted protocols
  mapping(bytes32 => bool) public whitelistedProtocols;

  mapping(bytes32 => bool) public positionManagerEnabled;

  event UniswapV3ManagerEnabled();
  event ProtocolManagerEnabled(bytes32 indexed protocolId);

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
    address _basePositionManager,
    address _baseExternalPositionStorage,
    bytes32[] calldata _witelistedProtocolIds
  ) internal {
    ERC1967Proxy externalPositionStorageProxy = new ERC1967Proxy(
      _baseExternalPositionStorage,
      abi.encodeWithSelector(
        IExternalPositionStorage.init.selector,
        _accessControllerAddress
      )
    );

    externalPositions = address(externalPositionStorageProxy);
    accessControllerAddress = _accessControllerAddress;
    basePositionManager = _basePositionManager;

    whitelistProtocols(_witelistedProtocolIds);

    protocolConfig = _protocolConfig;
  }

  function whitelistProtocols(bytes32[] calldata protocolIds) internal {
    for (uint256 i; i < protocolIds.length; i++) {
      whitelistedProtocols[protocolIds[i]] = true;
    }
  }

  /**
   * @notice Enables the Uniswap V3 wrapper if it is not already enabled and the caller has the asset manager role.
     * @param protocolId The identifier for the protocol (e.g., keccak256("UNISWAP_V3"))

   */
  function enableUniSwapV3Manager(bytes32 protocolId) external {
    // Ensure the caller has the asset manager role.
    if (
      !IAccessController(accessControllerAddress).hasRole(
        ASSET_MANAGER,
        msg.sender
      )
    ) revert ErrorLibrary.CallerNotAssetManager();

    // Prevent re-enabling if the wrapper is already enabled.
    if (positionManagerEnabled[protocolId])
      revert ErrorLibrary.ProtocolManagerAlreadyEnabled(protocolId);

    // Check if protocol is whitelisted in protocol config
    if (!IProtocolConfig(protocolConfig).isProtocolEnabled(protocolId))
      revert ErrorLibrary.ProtocolNotEnabled(protocolId);

    // Check if protocol is whitelisted for this portfolio
    if (!IAssetManagementConfig(address(this)).whitelistedProtocols(protocolId))
      revert ErrorLibrary.ProtocolNotWhitelisted(protocolId);

    // Get protocol addresses from config
    (address nftManagerAddress, address swapRouterAddress) = IProtocolConfig(
      protocolConfig
    ).getProtocolAddresses(protocolId);

    // Deploy and initialize the position manager.
    ERC1967Proxy positionManagerProxy = new ERC1967Proxy(
      basePositionManager,
      abi.encodeWithSelector(
        IPositionManager.init.selector,
        externalPositions,
        protocolConfig,
        address(this),
        accessControllerAddress,
        nftManagerAddress,
        swapRouterAddress,
        protocolId
      )
    );

    positionManager = IPositionManager(address(positionManagerProxy));

    IAccessController(accessControllerAddress).setupPositionManagerRole(
      address(positionManagerProxy)
    );

    positionManagerEnabled[protocolId] = true;

    emit UniswapV3ManagerEnabled();
  }
}
