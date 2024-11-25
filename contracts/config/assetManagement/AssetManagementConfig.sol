// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/UUPSUpgradeable.sol";

import { TreasuryManagement } from "./TreasuryManagement.sol";
import { PortfolioSettings, AssetManagerCheck } from "./PortfolioSettings.sol";
import { TokenWhitelistManagement } from "./TokenWhitelistManagement.sol";
import { UserWhitelistManagement } from "./UserWhitelistManagement.sol";
import { FeeManagement } from "./FeeManagement.sol";

import { FunctionParameters } from "../../FunctionParameters.sol";

import { AccessRoles } from "../../access/AccessRoles.sol";

import { IAccessController } from "../../access/IAccessController.sol";

/**
 * @title MainContract
 * @dev Main contract integrating all management functionalities with access control.
 */
contract AssetManagementConfig is
  OwnableUpgradeable,
  UUPSUpgradeable,
  TreasuryManagement,
  PortfolioSettings,
  TokenWhitelistManagement,
  FeeManagement,
  UserWhitelistManagement
{
  IAccessController internal accessController;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  // Implement the OwnableUpgradeable initialization.
  function init(
    FunctionParameters.AssetManagementConfigInitData calldata initData
  ) external initializer {
    __Ownable_init();
    __UUPSUpgradeable_init();

    address protocolConfig = initData._protocolConfig;

    accessController = IAccessController(initData._accessController);

    // init parents
    __TreasuryManagement_init(initData._assetManagerTreasury);

    __PortfolioSettings_init(
      protocolConfig,
      initData._initialPortfolioAmount,
      initData._minPortfolioTokenHoldingAmount,
      initData._publicPortfolio,
      initData._transferable,
      initData._transferableToPublic
    );

    __TokenWhitelistManagement_init(
      initData._whitelistedTokens,
      address(accessController),
      initData._basePositionManager,
      initData._baseExternalPositionStorage,
      initData._whitelistTokens,
      initData._witelistedProtocolIds,
      protocolConfig
    );

    __FeeManagement_init(
      protocolConfig,
      initData._managementFee,
      initData._performanceFee,
      initData._entryFee,
      initData._exitFee,
      initData._feeModule
    );

    __UserWhitelistManagement_init(protocolConfig);
  }

  // Override the onlyOwner modifier to specify it overrides from OwnableUpgradeable.
  function _isAssetManager()
    internal
    view
    override(AssetManagerCheck)
    returns (bool)
  {
    return accessController.hasRole(ASSET_MANAGER, msg.sender);
  }

  // Override the onlyOwner modifier to specify it overrides from OwnableUpgradeable.
  function _isWhitelistManager()
    internal
    view
    override(AssetManagerCheck)
    returns (bool)
  {
    return accessController.hasRole(WHITELIST_MANAGER, msg.sender);
  }

  /**
   * @notice Authorizes upgrade for this contract
   * @param newImplementation Address of the new implementation
   */
  function _authorizeUpgrade(
    address newImplementation
  ) internal override onlyOwner {
    // Intentionally left empty as required by an abstract contract
  }
}
