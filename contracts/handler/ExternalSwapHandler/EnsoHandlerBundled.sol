// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import { ErrorLibrary } from "../../library/ErrorLibrary.sol";
import { IIntentHandler } from "../IIntentHandler.sol";
import { IPositionManager } from "../../wrappers/abstract/IPositionManager.sol";
import { FunctionParameters } from "../../FunctionParameters.sol";

/**
 * @title EnsoHandlerBundled
 * @dev Designed to support Enso platform's feature of bundling multiple token swap and transfer
 * operations into a single transaction. This contract facilitates complex strategies that involve
 * multiple steps, such as swaps followed by transfers, by allowing them to be executed in one
 * transaction. This is particularly useful for optimizing gas costs and simplifying transaction management
 * for users. It includes functionalities for wrapping/unwrapping native tokens as part of these operations.
 */
contract EnsoHandlerBundled is IIntentHandler {
  // Address pointing to Enso's logic for executing swap operations. This is a constant target used for delegatecalls.
  address constant SWAP_TARGET = 0x38147794FF247e5Fc179eDbAE6C37fff88f68C52;

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

  function multiTokenSwapAndTransferRebalance(
    FunctionParameters.EnsoRebalanceParams memory _params
  ) external returns (address[] memory) {}

  // Function to receive Ether when msg.data is empty
  receive() external payable {}
}
