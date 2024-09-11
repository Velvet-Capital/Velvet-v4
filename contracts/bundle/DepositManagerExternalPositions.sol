// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import { FunctionParameters } from "../FunctionParameters.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IDepositBatchExternalPositions } from "./IDepositBatchExternalPositions.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @title DepositManagerExternalPositions
 * @notice Manages the process of depositing tokens into the contract, and coordinates multi-token swaps and transfers through a delegated DEPOSIT_BATCH contract.
 * @dev Inherits ReentrancyGuard to prevent reentrancy attacks. This contract acts as a facade that interfaces with the underlying DEPOSIT_BATCH contract to handle complex token interactions.
 */
contract DepositManagerExternalPositions is ReentrancyGuard {
  /// @notice Reference to the DEPOSIT_BATCH contract which handles detailed logic for multi-token swaps and deposits.
  IDepositBatchExternalPositions public immutable DEPOSIT_BATCH;

  /**
   * @notice Initializes a new DepositManagerExternalPositions contract.
   * @param _depositBatch Address of the DEPOSIT_BATCH contract responsible for executing multi-token operations.
   * @dev Stores a reference to the DEPOSIT_BATCH contract which is used to delegate swap and deposit operations.
   */
  constructor(address _depositBatch) {
    DEPOSIT_BATCH = IDepositBatchExternalPositions(_depositBatch);
  }

  /**
   * @notice Facilitates the deposit of tokens and triggers a series of swaps and transfers to manage external positions.
   * @dev The function takes tokens from the user, deposits them into the DEPOSIT_BATCH contract, and initiates the multi-token swap and deposit process. Ensures that the operation is not susceptible to reentrancy attacks.
   * @param data A struct containing the details for the batch operation including the token to be deposited, the amount, and additional necessary parameters for the swap and transfer processes.
   * @param _params Parameters specific to managing external positions, including details about the positions and tokens involved in the swap.
   */
  function deposit(
    FunctionParameters.BatchHandler memory data,
    FunctionParameters.ExternalPositionDepositParams memory _params
  ) external nonReentrant {
    address _depositToken = data._depositToken;
    address user = msg.sender;

    // Ensures the deposit amount of the specified token is transferred from the user to the DEPOSIT_BATCH contract.
    TransferHelper.safeTransferFrom(
      _depositToken,
      user,
      address(DEPOSIT_BATCH),
      data._depositAmount
    );

    // Delegates to DEPOSIT_BATCH to execute complex swap and deposit operations.
    DEPOSIT_BATCH.multiTokenSwapAndDeposit(data, _params, user);
  }
}
