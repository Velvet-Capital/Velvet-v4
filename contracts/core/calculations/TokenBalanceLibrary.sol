// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {ErrorLibrary} from "../../library/ErrorLibrary.sol";
import {IProtocolConfig} from "../../config/protocol/IProtocolConfig.sol";
import {IAssetHandler} from "../interfaces/IAssetHandler.sol";

/**
 * @title Token Balance Library
 * @dev Library for managing token balances within a vault. Provides utility functions to fetch individual
 * and collective token balances from a specified vault address.
 */
library TokenBalanceLibrary {
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
  ) public view returns (uint256[] memory vaultBalances) {
    uint256 portfolioLength = portfolioTokens.length;
    vaultBalances = new uint256[](portfolioLength); // Initializes the array to hold fetched balances.
    //Get unUsedCollateral ------>
    for (uint256 i; i < portfolioLength; i++) {
      address _token = portfolioTokens[i];

      vaultBalances[i] = _getTokenBalanceOf(_token, _vault, _protocolConfig); // Fetches balance for each token.
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
  function _getTokenBalanceOf(
    address _token,
    address _vault,
    IProtocolConfig _protocolConfig
  ) public view returns (uint256 tokenBalance) {
    if (_token == address(0) || _vault == address(0))
      revert ErrorLibrary.InvalidAddress(); // Ensures neither the token nor the vault address is zero.
    // Need to optimize it, so that, we don't have to getUserAccountData for all protocol tokens
    tokenBalance = _protocolConfig.isProtocolToken(_token)
      ? IAssetHandler(_protocolConfig.assetHandlers(_token))
        .getInvestibleBalance(
          _token,
          _vault,
          _protocolConfig.marketControllers(_token)
        )
      : IERC20Upgradeable(_token).balanceOf(_vault); // Actual balance fetch.
  }
}
