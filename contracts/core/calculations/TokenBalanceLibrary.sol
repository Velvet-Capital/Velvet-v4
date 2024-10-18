// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ErrorLibrary } from "../../library/ErrorLibrary.sol";
import { IProtocolConfig } from "../../config/protocol/IProtocolConfig.sol";
import { IAssetHandler } from "../interfaces/IAssetHandler.sol";
import { FunctionParameters } from "../../FunctionParameters.sol";

/**
 * @title Token Balance Library
 * @dev Library for managing token balances within a vault. Provides utility functions to fetch individual
 * and collective token balances from a specified vault address.
 */
library TokenBalanceLibrary {
  /**
   * @dev Struct to hold controller-specific data
   * @param controller The address of the controller
   * @param unusedCollateralPercentage The percentage of unused collateral (scaled by 1e18)
   */
  struct ControllerData {
    address controller;
    uint256 unusedCollateralPercentage;
  }

  /**
   * @notice Fetches data for all supported controllers
   * @dev Iterates through all supported controllers and calculates their unused collateral percentage
   * @param vault The address of the vault to fetch data for
   * @param _protocolConfig The protocol configuration contract
   * @return controllersData An array of ControllerData structs containing controller addresses and their unused collateral percentages
   */
  function getControllersData(
    address vault,
    IProtocolConfig _protocolConfig
  ) public view returns (ControllerData[] memory controllersData) {
    address[] memory controllers = _protocolConfig.getSupportedControllers();
    controllersData = new ControllerData[](controllers.length);

    for (uint256 i; i < controllers.length;) {
      address controller = controllers[i];
      IAssetHandler assetHandler = IAssetHandler(
        _protocolConfig.assetHandlers(controller)
      );
      (FunctionParameters.AccountData memory accountData, ) = assetHandler
        .getUserAccountData(vault, controller);

      uint256 unusedCollateralPercentage;
      if (accountData.totalCollateral == 0) {
        unusedCollateralPercentage = 1e18; // 100% unused if no collateral
      } else {
        unusedCollateralPercentage =
          ((accountData.totalCollateral - accountData.totalDebt) * 1e18) /
          accountData.totalCollateral;
      }

      controllersData[i] = ControllerData({
        controller: controller,
        unusedCollateralPercentage: unusedCollateralPercentage
      });
      unchecked { ++i; }
    }
  }

  /**
   * @notice Finds the ControllerData for a specific controller
   * @dev Iterates through the controllersData array to find the matching controller
   * @param controllersData An array of ControllerData structs to search through
   * @param controller The address of the controller to find
   * @return The ControllerData struct for the specified controller
   */
  function findControllerData(
    ControllerData[] memory controllersData,
    address controller
  ) internal pure returns (ControllerData memory) {
    for (uint256 i; i < controllersData.length;) {
      if (controllersData[i].controller == controller) {
        return controllersData[i];
      }
      unchecked { ++i; }
    }
    revert ErrorLibrary.ControllerDataNotFound();
  }

  /**
   * @notice Fetches the balances of multiple tokens from a single vault.
   * @dev Iterates through an array of token addresses to retrieve each token's balance in the vault.
   * Utilizes `_getTokenBalanceOf` to fetch each individual token balance securely and efficiently.
   *
   * @param portfolioTokens Array of ERC20 token addresses whose balances are to be fetched.
   * @param _vault The vault address from which to retrieve the balances.
   * @return vaultBalances Array of balances corresponding to the list of input tokens.
   */
  function getTokenBalancesOf(
    address[] memory portfolioTokens,
    address _vault,
    IProtocolConfig _protocolConfig
  )
    public
    view
    returns (
      uint256[] memory vaultBalances,
      ControllerData[] memory controllersData
    )
  {
    uint256 portfolioLength = portfolioTokens.length;
    vaultBalances = new uint256[](portfolioLength); // Initializes the array to hold fetched balances.

    controllersData = getControllersData(_vault, _protocolConfig);

    for (uint256 i; i < portfolioLength; ) {
      vaultBalances[i] = _getAdjustedTokenBalance(
        portfolioTokens[i],
        _vault,
        _protocolConfig,
        controllersData
      ); // Fetches balance for each token.
      unchecked {
        ++i;
      }
    }
  }

  /**
   * @notice Fetches the balance of a specific token held in a given vault.
   * @dev Retrieves the token balance using the ERC20 `balanceOf` function.
   * Throws if the token or vault address is zero to prevent erroneous queries.
   *
   * @param _token The address of the token whose balance is to be retrieved.
   * @param _vault The address of the vault where the token is held.
   * @return tokenBalance The current token balance within the vault.
   */
  function _getAdjustedTokenBalance(
    address _token,
    address _vault,
    IProtocolConfig _protocolConfig,
    ControllerData[] memory controllersData
  ) public view returns (uint256 tokenBalance) {
    if (_token == address(0) || _vault == address(0))
      revert ErrorLibrary.InvalidAddress(); // Ensures neither the token nor the vault address is zero.
    if (_protocolConfig.isBorrowableToken(_token)) {
      address controller = _protocolConfig.marketControllers(_token);
      ControllerData memory controllerData = findControllerData(
        controllersData,
        controller
      );

      uint256 rawBalance = _getTokenBalanceOf(_token, _vault);
      tokenBalance =
        (rawBalance * controllerData.unusedCollateralPercentage) /
        1e18;
    } else {
      tokenBalance = _getTokenBalanceOf(_token, _vault);
    }
  }
  
  /**
   * @notice Fetches the balance of a specific token held in a given vault.
   * @dev Retrieves the token balance using the ERC20 `balanceOf` function.
   *
   * @param _token The address of the token whose balance is to be retrieved.
   * @param _vault The address of the vault where the token is held.
   * @return tokenBalance The current token balance within the vault.
   */
  function _getTokenBalanceOf(
    address _token,
    address _vault
  ) public view returns (uint256 tokenBalance) {
    tokenBalance = IERC20Upgradeable(_token).balanceOf(_vault);
  }
}
