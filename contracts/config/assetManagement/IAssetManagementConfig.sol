// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { FunctionParameters } from "../../FunctionParameters.sol";

/**
 * @title IAssetManagementConfig
 * @notice Interface for the asset management configuration contract.
 */
interface IAssetManagementConfig {
  /**
   * @notice Initializes the asset management configuration with the provided initial data.
   * @param initData The initialization data for the asset management configuration.
   */
  function init(
    FunctionParameters.AssetManagementConfigInitData calldata initData
  ) external;

  /**
   * @notice Returns the management fee.
   * @return The management fee.
   */
  function managementFee() external view returns (uint256);

  /**
   * @notice Returns the performance fee.
   * @return The performance fee.
   */
  function performanceFee() external view returns (uint256);

  /**
   * @notice Returns the entry fee.
   * @return The entry fee.
   */
  function entryFee() external view returns (uint256);

  /**
   * @notice Returns the exit fee.
   * @return The exit fee.
   */
  function exitFee() external view returns (uint256);

  /**
   * @notice Returns the initial portfolio amount.
   * @return The initial portfolio amount.
   */
  function initialPortfolioAmount() external view returns (uint256);

  /**
   * @notice Returns the minimum portfolio token holding amount.
   * @return The minimum portfolio token holding amount.
   */
  function minPortfolioTokenHoldingAmount() external view returns (uint256);

  /**
   * @notice Returns the address of the asset manager treasury.
   * @return The address of the asset manager treasury.
   */
  function assetManagerTreasury() external returns (address);

  /**
   * @notice Returns the address of the position manager.
   * @return The address of the position manager.
   */
  function positionManager() external returns (address);

  /**
   * @notice Checks if a token is whitelisted.
   * @param token The address of the token.
   * @return True if the token is whitelisted, false otherwise.
   */
  function whitelistedTokens(address token) external returns (bool);

  /**
   * @notice Checks if a user is whitelisted.
   * @param user The address of the user.
   * @return True if the user is whitelisted, false otherwise.
   */
  function whitelistedUsers(address user) external returns (bool);

  /**
   * @notice Checks if the portfolio is public.
   * @return True if the portfolio is public, false otherwise.
   */
  function publicPortfolio() external returns (bool);

  /**
   * @notice Checks if the portfolio token is transferable.
   * @return True if the portfolio token is transferable, false otherwise.
   */
  function transferable() external returns (bool);

  /**
   * @notice Checks if the portfolio token is transferable to the public.
   * @return True if the portfolio token is transferable to the public, false otherwise.
   */
  function transferableToPublic() external returns (bool);

  /**
   * @notice Checks if token whitelisting is enabled.
   * @return True if token whitelisting is enabled, false otherwise.
   */
  function tokenWhitelistingEnabled() external returns (bool);

  /**
   * @notice Updates the initial portfolio amount.
   * @param _newPrice The new initial portfolio amount.
   */
  function updateInitialPortfolioAmount(uint256 _newPrice) external;

  /**
   * @notice Updates the minimum portfolio token holding amount.
   * @param _minPortfolioTokenHoldingAmount The new minimum portfolio token holding amount.
   */
  function updateMinPortfolioTokenHoldingAmount(
    uint256 _minPortfolioTokenHoldingAmount
  ) external;

  function isTokenWhitelisted(address _token) external returns (bool);

  function owner() external view returns (address);

  /**
   * @notice Checks if a protocol is whitelisted
   * @param protocolId The identifier for the protocol
   * @return bool True if the protocol is whitelisted
   */
  function whitelistedProtocols(bytes32 protocolId) external returns (bool);
}
