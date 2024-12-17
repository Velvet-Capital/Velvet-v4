// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {IVenusPool} from "../../interfaces/IVenusPool.sol";
import {IThena} from "../../interfaces/IThena.sol";
import {IAlgebraPool} from "@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol";
import {IAlgebraFlashCallback} from "@cryptoalgebra/integral-core/contracts/interfaces/callback/IAlgebraFlashCallback.sol";
import {AbstractBorrowManager} from "./AbstractBorrowManager.sol";
import {ErrorLibrary} from "../../../library/ErrorLibrary.sol";
import {FunctionParameters} from "../../../FunctionParameters.sol";
import {IAssetHandler} from "../../interfaces/IAssetHandler.sol";
import {TransferHelper} from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/interfaces/IERC20Upgradeable.sol";

/**
 * @title BorrowManager
 * @notice This contract manages the borrowing and repayment of assets using flash loans and handles portfolio withdrawals.
 * @dev Inherits from OwnableUpgradeable, UUPSUpgradeable, AccessModifiers, and IAlgebraFlashCallback.
 */
contract BorrowManagerVenus is AbstractBorrowManager, IAlgebraFlashCallback {
  /**
   * @notice Callback function for Algebra flash loans.
   * @dev This function handles the logic after receiving the flash loan, such as repaying debt and performing swaps.
   * @param fee0 The fee for the borrowed token.
   * @param fee1 The fee for the paired token (if borrowed).
   * @param data Encoded data passed from the flash loan.
   */
  function algebraFlashCallback(
    uint256 fee0,
    uint256 fee1,
    bytes calldata data
  ) external override {
    //Ensure flash loan is active to prevent unauthorized callbacks
    if (!_isFlashLoanActive) revert ErrorLibrary.FlashLoanIsInactive();

    FunctionParameters.FlashLoanData memory flashData = abi.decode(
      data,
      (FunctionParameters.FlashLoanData)
    ); // Decode the flash loan data

    IAssetHandler assetHandler = IAssetHandler(
      _protocolConfig.assetHandlers(flashData.protocolTokens[0])
    ); // Get the asset handler for the protocol tokens
    address controller = _protocolConfig.marketControllers(
      flashData.protocolTokens[0]
    ); // Get the market controller for the protocol token

    // Get user account data, including total collateral and debt
    (
      FunctionParameters.AccountData memory accountData,
      FunctionParameters.TokenAddresses memory tokenBalances
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
        tokenBalances.lendTokens,
        accountData.totalCollateral,
        IThena(msg.sender).globalState().fee,
        flashData
      );

    // Execute each transaction in the sequence
    for (uint i; i < transactions.length; i++) {
      (bool success, ) = transactions[i].to.call(transactions[i].txData); // Execute the transaction
      if (!success) revert ErrorLibrary.CallFailed(); // Revert if the call fails
    }

    // Calculate the fee based on the token0 and fee0/fee1,using the Algebra Pool
    uint256 fee = IAlgebraPool(msg.sender).token0() == flashData.flashLoanToken
      ? fee0
      : fee1;

    // Calculate the amount owed including the fee
    uint256 amountOwed = totalFlashAmount + fee;

    // Transfer the amount owed back to the flashLoan provider
    TransferHelper.safeTransfer(
      flashData.flashLoanToken,
      msg.sender,
      amountOwed
    );

    // Transfer any remaining dust balance back to the vault
    TransferHelper.safeTransfer(
      flashData.flashLoanToken,
      _vault,
      IERC20Upgradeable(flashData.flashLoanToken).balanceOf(address(this))
    );

    //Reset the flash loan state to prevent subsequent unauthorized callbacks
    _isFlashLoanActive = false;
  }
}
