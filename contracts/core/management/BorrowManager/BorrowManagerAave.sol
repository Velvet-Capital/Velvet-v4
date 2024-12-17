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
import "hardhat/console.sol";

/**
 * @title BorrowManager
 * @notice This contract manages the borrowing and repayment of assets using flash loans and handles portfolio withdrawals.
 * @dev Inherits from OwnableUpgradeable, UUPSUpgradeable, AccessModifiers, and IAlgebraFlashCallback.
 */
contract BorrowManagerAave is AbstractBorrowManager, IFlashLoanReceiver {
  // Internal variables to store the vault, protocol configuration, and portfolio addresses

  function executeOperation(
    address[] calldata assets,
    uint256[] calldata amounts,
    uint256[] calldata premiums,
    address initiator,
    bytes calldata params
  ) external returns (bool) {
    //Ensure flash loan is active to prevent unauthorized callbacks
    if (!_isFlashLoanActive) revert ErrorLibrary.FlashLoanIsInactive();
    if (initiator != address(this)) revert ErrorLibrary.InvalidLoanInitiator();

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
    for (uint i; i < transactions.length; i++) {
      (bool success, ) = transactions[i].to.call(transactions[i].txData); // Execute the transaction
      if (!success) revert ErrorLibrary.CallFailed(); // Revert if the call fails
    }

    // Calculate the amount owed including the fee
    uint256 amountOwed = totalFlashAmount + premiums[0];

    console.log("before approvee");
    console.log("amountOwed", amountOwed);
    console.log(
      "balance",
      IERC20Upgradeable(flashData.flashLoanToken).balanceOf(address(this))
    );

    TransferHelper.safeApprove(
      flashData.flashLoanToken,
      controller,
      amountOwed
    );

    console.log("after approve");

    //Reset the flash loan state to prevent subsequent unauthorized callbacks
    _isFlashLoanActive = false;
    return true;
  }
}
