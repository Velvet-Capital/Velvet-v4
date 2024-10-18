// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/token/ERC20/IERC20Upgradeable.sol";
import {IPriceOracle} from "../../oracle/IPriceOracle.sol";
import {ErrorLibrary} from "../../library/ErrorLibrary.sol";
import {Dependencies} from "../config/Dependencies.sol";
import {TokenCalculations} from "./TokenCalculations.sol";
import {MathUtils} from "./MathUtils.sol";
import {IAssetManagementConfig} from "../../config/assetManagement/IAssetManagementConfig.sol";


/**
 * @title VaultCalculations
 * @dev Extends the Dependencies and TokenCalculations contracts to provide additional calculation functionalities for vault operations.
 * Includes functions for determining mint amounts based on deposits, calculating token balances, and evaluating vault value in USD.
 */
abstract contract VaultCalculations is Dependencies, TokenCalculations {
  /**
   * @notice Calculates the amount of portfolio tokens to mint based on the deposit ratio and the total supply of portfolio tokens.
   * @param _depositRatio The ratio of the user's deposit to the total value of the vault.
   * @param _totalSupply The current total supply of portfolio tokens.
   * @return The amount of portfolio tokens to mint for the given deposit.
   */
  function _getTokenAmountToMint(
    uint256 _depositRatio,
    uint256 _totalSupply,
    IAssetManagementConfig _assetManagementConfig
  ) internal view returns (uint256) {
    uint256 mintAmount = _calculateMintAmount(_depositRatio, _totalSupply);
    if (mintAmount < _assetManagementConfig.minPortfolioTokenHoldingAmount()) {
      revert ErrorLibrary.MintedAmountIsNotAccepted();
    }
    return mintAmount;
  }

  /**
   * @notice Calculates the total USD value of the vault by converting the balance of each token in the vault to USD.
   * @param _oracle The address of the price oracle contract.
   * @param _tokens The list of token addresses in the vault.
   * @param _totalSupply The current total supply of the vault's portfolio token.
   * @param _vault The address of the vault.
   * @return vaultValue The total USD value of the vault.
   */
  function getVaultValueInUSD(
    IPriceOracle _oracle,
    address[] memory _tokens,
    uint256 _totalSupply,
    address _vault
  ) external view returns (uint256 vaultValue) {
    if (_totalSupply == 0) return 0;

    uint256 _tokenBalanceInUSD;
    uint256 tokensLength = _tokens.length;
    for (uint256 i; i < tokensLength; i++) {
      address _token = _tokens[i];
      if (!protocolConfig().isTokenEnabled(_token))
        revert ErrorLibrary.TokenNotEnabled();
      _tokenBalanceInUSD = _oracle.convertToUSD18Decimals(
        _token,
        IERC20Upgradeable(_token).balanceOf(_vault)
      );

      vaultValue += _tokenBalanceInUSD;
    }
  }
}
