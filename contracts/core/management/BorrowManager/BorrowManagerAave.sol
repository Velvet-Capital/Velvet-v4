// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {TransferHelper} from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import {FunctionParameters} from "../../../FunctionParameters.sol";
import {IAssetHandler} from "../../interfaces/IAssetHandler.sol";
import {ErrorLibrary} from "../../../library/ErrorLibrary.sol";
import {IFlashLoanReceiver} from "../../../handler/Aave/IFlashLoanReceiver.sol";
import {IAavePool} from "../../../handler/Aave/IAavePool.sol";
import {AbstractBorrowManager} from "./AbstractBorrowManager.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/interfaces/IERC20Upgradeable.sol";

/**
 * @title BorrowManager
 * @notice This contract manages the borrowing and repayment of assets using flash loans and handles portfolio withdrawals.
 * @dev Inherits from OwnableUpgradeable, UUPSUpgradeable, AccessModifiers, and IAlgebraFlashCallback.
 */
contract BorrowManagerAave is AbstractBorrowManager, IFlashLoanReceiver {
  // Internal variables to store the vault, protocol configuration, and portfolio addresses

  function executeOperation(
    address[] calldata ,
    uint256[] calldata ,
    uint256[] calldata premiums,
    address initiator,
    bytes calldata params
  ) external returns (bool) {
    //Ensure flash loan is active to prevent unauthorized callbacks
    if (!_isFlashLoanActive) revert ErrorLibrary.FlashLoanIsInactive();
    if (initiator != address(this)) revert ErrorLibrary.InvalidLoanInitiator();

    if (!_protocolConfig.isSupportedCallbackCaller(msg.sender)) revert ErrorLibrary.UnsupportedCallbackCaller();

    FunctionParameters.FlashLoanData memory flashData = abi.decode(
      params,
      (FunctionParameters.FlashLoanData)
    ); // Decode the flash loan data

    IAssetHandler assetHandler = IAssetHandler(
      _protocolConfig.assetHandlers(flashData.protocolTokens[0])
    ); // Get the asset handler for the protocol tokens
    address controller = _protocolConfig.marketControllers( //This will be pool address
      flashData.protocolTokens[0]
    ); // Get the market controller for the protocol token

    (
      FunctionParameters.AccountData memory accountData,
      FunctionParameters.TokenAddresses memory tokenAddresses
    ) = assetHandler.getUserAccountData(
        _vault,
        controller,
        _portfolio.getTokens()
      );

    // Process the loan to generate the transactions needed for repayment and swaps
    (
      IAssetHandler.MultiTransaction[] memory transactions,
      uint256 totalFlashAmount
    ) = assetHandler.loanProcessing(
        _vault,
        address(_portfolio),
        controller,
        address(this),
        tokenAddresses.lendTokens,
        accountData.totalCollateral,
        IAavePool(controller).FLASHLOAN_PREMIUM_TOTAL(),
        flashData
      );

    // Execute each transaction in the sequence
    uint256 transactionsLength = transactions.length;
    for (uint256 i; i < transactionsLength; i++) {
      (bool success, ) = transactions[i].to.call(transactions[i].txData); // Execute the transaction
      if (!success) revert ErrorLibrary.FlashLoanOperationFailed(); // Revert if the call fails
    }

    // Calculate the amount owed including the fee
    uint256 amountOwed = totalFlashAmount + premiums[0];

    _safeApprove(
      flashData.flashLoanToken,
      controller,
      amountOwed
    );

    //Reset the flash loan state to prevent subsequent unauthorized callbacks
    _isFlashLoanActive = false;
    return true;
  }

  /**
   * @notice Helper function to safely approve a token for a spender.
   * @param token The address of the token to approve.
   * @param spender The address of the spender.
   * @param amount The amount to approve.
   */
  function _safeApprove(address token, address spender, uint256 amount) internal {
    try IERC20Upgradeable(token).approve(spender, 0) {} catch {}
    TransferHelper.safeApprove(token, spender, amount);
  }
}
