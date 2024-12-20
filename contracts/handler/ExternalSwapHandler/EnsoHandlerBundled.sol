// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import { ErrorLibrary } from "../../library/ErrorLibrary.sol";
import { IIntentHandler } from "../IIntentHandler.sol";
import { IPositionManager } from "../../wrappers/abstract/IPositionManager.sol";
import { FunctionParameters } from "../../FunctionParameters.sol";
import { ExternalPositionManagement } from "./ExternalPositionManagement.sol";

/**
 * @title EnsoHandlerBundled
 * @dev Designed to support Enso platform's feature of bundling multiple token swap and transfer
 * operations into a single transaction. This contract facilitates complex strategies that involve
 * multiple steps, such as swaps followed by transfers, by allowing them to be executed in one
 * transaction. This is particularly useful for optimizing gas costs and simplifying transaction management
 * for users. It includes functionalities for wrapping/unwrapping native tokens as part of these operations.
 */
contract EnsoHandlerBundled is IIntentHandler, ExternalPositionManagement {
  // The address of Solver's swap execution logic; swaps are delegated to this target.
  address immutable SWAP_TARGET;

  constructor(address _swapTarget) {
    SWAP_TARGET = _swapTarget;
  }

  /**
   * @notice Performs a bundled operation of token swaps and transfers the resulting tokens to a specified address.
   * This method decodes and executes a single bundled transaction that can encompass multiple swap operations.
   * @param _to Address to receive the output tokens from the swap operations.
   * @param _callData Encoded data for executing the swap, structured as follows:
   *        - callDataEnso: Byte array containing the encoded data for the bundled swap operation(s).
   *        - tokens: An array of token addresses involved in the swap(s).
   *        - minExpectedOutputAmounts: An array listing the minimum acceptable amounts of each output token.
   * @return _swapReturns Array of actual amounts of tokens received from the swap(s), corresponding to each token in the input array.
   */
  function multiTokenSwapAndTransfer(
    address _to,
    bytes memory _callData
  ) external override returns (address[] memory) {
    (
      bytes memory callDataEnso,
      address[] memory tokens,
      uint256[] memory minExpectedOutputAmounts
    ) = abi.decode(_callData, (bytes, address[], uint256[]));

    // Ensure consistency in the lengths of input arrays.
    uint256 tokensLength = tokens.length;
    if (tokensLength != minExpectedOutputAmounts.length)
      revert ErrorLibrary.InvalidLength();
    if (_to == address(0)) revert ErrorLibrary.InvalidAddress();

    // Execute the bundled swap operation via delegatecall to the SWAP_TARGET.
    (bool success, ) = SWAP_TARGET.delegatecall(callDataEnso);
    if (!success) revert ErrorLibrary.CallFailed();

    // Post-swap: verify output meets minimum expectations and transfer tokens to the recipient.
    for (uint256 i; i < tokensLength; i++) {
      address token = tokens[i]; // Cache the token address for gas optimization.
      uint256 swapReturn = IERC20Upgradeable(token).balanceOf(address(this));
      if (swapReturn == 0 || swapReturn < minExpectedOutputAmounts[i])
        revert ErrorLibrary.ReturnValueLessThenExpected();

      TransferHelper.safeTransfer(token, _to, swapReturn);
    }

    return tokens;
  }

  /**
   * @notice Conducts a rebalance operation via the Solver platform and transfers the output tokens
   * to a specified recipient address.
   * @param _params Encoded bundle containing the rebalance operation data, structured as follows:
   *        - positionManager: Address of the Enso Position Manager contract.
   *        - to: Address of the recipient for the rebalance operation.
   *        - calldata: Encoded call data for the rebalance operation.
   * @return _swapReturns Array containing the actual amounts of tokens received from each swap operation.
   */
  function multiTokenSwapAndTransferRebalance(
    FunctionParameters.EnsoRebalanceParams memory _params
  ) external returns (address[] memory) {
    (
      bytes memory callDataEnso, // Array of arrays containing encoded swap data for Enso platform
      // Two-dimensional because each external position might require multiple swaps
      bytes[] memory callDataDecreaseLiquidity, // Array of encoded data for decreasing liquidity
      // Includes token approval and liquidity removal for each position
      bytes[][] memory callDataIncreaseLiquidity, // Array of arrays with encoded data for increasing liquidity
      // Two-dimensional as each position may need multiple steps (approval, adding liquidity)
      address[][] memory increaseLiquidityTarget, // Array of arrays with target addresses for increasing liquidity
      // Two-dimensional to match the structure of callDataIncreaseLiquidity
      address[] memory underlyingTokensDecreaseLiquidity, // Array of underlying tokens for decreasing liquidity
      // One-dimensional as it's a flat list of tokens
      address[] memory tokensIn, // Array of input token addresses
      address[] memory tokensOut, // Array of output token addresses
      uint256[] memory minExpectedOutputAmounts // Array of minimum expected output amounts
    ) = abi.decode(
        _params._calldata,
        (
          bytes,
          bytes[],
          bytes[][],
          address[][],
          address[],
          address[],
          address[],
          uint256[]
        )
      );

    // Ensure consistency in the lengths of input arrays.
    uint256 tokensLength = tokensOut.length;
    uint256[] memory buyTokenBalancesBefore = new uint256[](tokensLength);
    if (tokensLength != minExpectedOutputAmounts.length)
      revert ErrorLibrary.InvalidLength();
    if (_params._to == address(0)) revert ErrorLibrary.InvalidAddress();

    for (uint256 i; i < tokensLength; i++) {
      // Handle wrapped positions for input tokens: Decreases liquidity from wrapped positions
      if (
        address(_params._positionManager) != address(0) && // PositionManager has not been initialized
        _params._positionManager.isWrappedPosition(tokensIn[i])
      ) {
        _handleWrappedPositionDecrease(
          address(_params._positionManager),
          callDataDecreaseLiquidity[i]
        );
      }

      buyTokenBalancesBefore[i] = IERC20Upgradeable(tokensOut[i]).balanceOf(
        address(this)
      );
    }

    // Execute the bundled swap operation via delegatecall to the SWAP_TARGET.
    _executeSwaps(callDataEnso);

    // Post-swap: verify output meets minimum expectations and transfer tokens to the recipient.
    for (uint256 i; i < tokensLength; i++) {
      address token = tokensOut[i]; // Cache the token address for gas optimization.

      // Handle wrapped positions for output tokens: Approves position manager to spend underlying tokens + increases liquidity
      if (
        address(_params._positionManager) != address(0) && // PositionManager has not been initialized
        _params._positionManager.isWrappedPosition(token)
      ) {
        _handleWrappedPositionIncrease(
          increaseLiquidityTarget[i],
          callDataIncreaseLiquidity[i]
        );
      }

      _transferTokensAndVerify(
        token,
        _params._to,
        buyTokenBalancesBefore[i],
        minExpectedOutputAmounts[i]
      );
    }

    _returnDust(underlyingTokensDecreaseLiquidity, _params._to);

    return tokensOut;
  }

  /**
   * @notice Executes a bundled swap operation via delegatecall to the SWAP_TARGET
   * @dev This function performs a single delegatecall with the bundled swap data
   * @param _callDataEnso Encoded swap instructions for the entire bundled operation
   * @custom:security Uses delegatecall, which can be dangerous if not properly secured
   * @custom:gas-optimization Executes all swaps in a single delegatecall, potentially saving gas
   */
  function _executeSwaps(bytes memory _callDataEnso) private {
    // Execute the bundled swap operation via delegatecall to the SWAP_TARGET.
    (bool success, ) = SWAP_TARGET.delegatecall(_callDataEnso);
    if (!success) revert ErrorLibrary.CallFailed();
  }

  // Function to receive Ether when msg.data is empty
  receive() external payable {}
}
