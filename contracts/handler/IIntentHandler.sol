// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { FunctionParameters } from "../FunctionParameters.sol";
import { IPositionManager } from "../wrappers/abstract/IPositionManager.sol";

/**
 * @title IIntentHandler
 * @dev Interface for IntentHandler contract to facilitate token swaps and transfers.
 */
interface IIntentHandler {
  /**
   * @notice Conducts a token swap operation via the Solver platform and transfers the output tokens
   * to a specified recipient address.
   * @param _to The address designated to receive the output tokens from the swap.
   * @param _callData Encoded bundle containing the swap operation data, structured as follows:
   *        - callDataXXX: Array of bytes representing the encoded data for each swap operation,
   *          allowing for direct interaction with the solver swap logic.
   *        - tokens: Array of token addresses involved in the swap operations.
   *        - minExpectedOutputAmounts: Array of minimum acceptable output amounts for the tokens
   *          received from each swap operation, ensuring the swap meets the user's expectations.
   * @return _swapReturns Array containing the actual amounts of tokens received from each swap operation.
   */
  function multiTokenSwapAndTransfer(
    address _to,
    bytes memory _callData
  ) external returns (address[] memory);

  function multiTokenSwapAndTransferRebalance(
    FunctionParameters.EnsoRebalanceParams memory _params
  ) external returns (address[] memory);
}
