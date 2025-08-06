// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { ErrorLibrary } from "../../library/ErrorLibrary.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";

contract ExternalPositionManagement {
  /**
   * @notice Handles the increase of liquidity for wrapped positions
   * @dev This function iterates through the provided call data and executes each call
   * @param _target An array of target addresses for the calls
   * @param _callData An array of encoded function calls to be executed
   */
  function _handleWrappedPositionIncrease(
    address[] memory _target,
    bytes[] memory _callData
  ) internal {
    uint256 callDataLength = _callData.length;
    for (uint256 j; j < callDataLength; j++) {
      (bool success, ) = _target[j].call(_callData[j]);
      if (!success) revert ErrorLibrary.IncreaseLiquidityFailed();
    }
  }
  /**
   * @notice Handles the decrease of liquidity for wrapped positions
   * @dev This function executes a single call to decrease liquidity
   * @param _target The target address for the call
   * @param _callData The encoded function call to be executed
   */

  function _handleWrappedPositionDecrease(
    address _target,
    bytes memory _callData
  ) internal {
    (bool success, ) = _target.call(_callData);
    if (!success) revert ErrorLibrary.DecreaseLiquidityFailed();
  }

  /**
   * @notice Transfers tokens to the vault and verifies the amount transferred meets minimum expectations
   * @dev This function calculates the swap return, verifies it against the minimum expected amount,
   *      and transfers the tokens to the vault
   * @param _token The address of the token to transfer
   * @param _vault The address of the vault to receive the tokens
   * @param _buyTokenBalanceBefore The balance of the token before the swap
   * @param _minAmountOut The minimum amount of tokens expected from the swap
   */

  function _transferTokensAndVerify(
    address _token,
    address _vault,
    uint256 _buyTokenBalanceBefore,
    uint256 _minAmountOut
  ) internal {
    uint256 swapReturn = IERC20Upgradeable(_token).balanceOf(address(this)) -
      _buyTokenBalanceBefore;

    if (swapReturn == 0 || swapReturn < _minAmountOut)
      revert ErrorLibrary.ReturnValueLessThenExpected();

    TransferHelper.safeTransfer(_token, _vault, swapReturn);
  }

  /**
   * @notice Transfers multiple tokens to the vault and verifies the amount transferred meets minimum expectations
   * @dev This function calculates the swap return for each token, verifies it against the minimum expected amount,
   *      and transfers the tokens to the vault
   * @param _tokens An array of token addresses to transfer
   * @param _vault The address of the vault to receive the tokens
   * @param _buyTokenBalanceBefore The balance of the token before the swap
   * @param _minAmountOut The minimum amount of tokens expected from the swap
   */
  function _transferMultipleTokensAndVerify(
    address[] memory _tokens,
    address _vault,
    uint256[] memory _buyTokenBalanceBefore,
    uint256[] memory _minAmountOut
  ) internal {
    uint256 tokensLength = _tokens.length;
    for (uint256 i; i < tokensLength; i++) {
      _transferTokensAndVerify(
        _tokens[i],
        _vault,
        _buyTokenBalanceBefore[i],
        _minAmountOut[i]
      );
    }
  }

  /**
   * @notice Returns any remaining dust tokens to the vault
   * @dev This function iterates through the provided token addresses, checks for any remaining balance,
   *      and transfers it to the vault if present
   * @param _underlyingTokensDecreaseLiquidity An array of token addresses to check for dust
   * @param _vault The address of the vault to receive any dust tokens
   */

  function _returnDust(
    address[] memory _underlyingTokensDecreaseLiquidity,
    address _vault
  ) internal {
    uint256 underlyingTokensDecreaseLiquidityLength = _underlyingTokensDecreaseLiquidity
        .length;
    for (uint256 i; i < underlyingTokensDecreaseLiquidityLength; i++) {
      address underlyingToken = _underlyingTokensDecreaseLiquidity[i];
      uint256 balance = IERC20Upgradeable(underlyingToken).balanceOf(
        address(this)
      );
      if (balance > 0)
        TransferHelper.safeTransfer(underlyingToken, _vault, balance);
    }
  }
}
