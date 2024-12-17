// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {IAssetHandler} from "../../core/interfaces/IAssetHandler.sol";
import {IVenusPool} from "../../core/interfaces/IVenusPool.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/interfaces/IERC20Upgradeable.sol";
import {IVenusComptroller, IVAIController, IPriceOracle} from "./IVenusComptroller.sol";
import {FunctionParameters} from "../../FunctionParameters.sol";
import {IThena} from "../../core/interfaces/IThena.sol";
import {IAlgebraPool} from "@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol";
import "./ExponentialNoError.sol";

/**
 * @title VenusAssetHandler
 * @notice This contract interacts with the Venus protocol to manage user assets and liquidity positions.
 * @dev Provides functions to get balances, handle markets, and process loans within the Venus protocol.
 */
contract VenusAssetHandler is IAssetHandler, ExponentialNoError {
  /**
   * @dev Struct to hold local variables for calculating account liquidity,
   *      avoiding stack-depth limits. It contains balances, collateral, and LTV information.
   */
  struct AccountVars {
    uint totalCollateral; // Total collateral amount
    uint totalDebt; // Total debt amount
    uint availableBorrows; // Available borrowing capacity
    uint ltv; // Loan-to-value ratio
    address[] lendAssets; // Array of assets being lent
    address[] borrowedAssets; // Array of assets being borrowed
    uint lendCount; // Number of assets being lent
    uint borrowCount; // Number of assets being borrowed
  }

  /**
   * @dev Struct for holding variables during the account liquidity calculations.
   */
  struct AccountLiquidityLocalVars {
    uint totalCollateral; // Total collateral amount
    uint sumCollateral; // Summed collateral amount
    uint sumBorrowPlusEffects; // Summed borrow amount plus any effects
    uint vTokenBalance; // Balance of vTokens (collateralized assets)
    uint borrowBalance; // Balance of borrowed assets
    uint exchangeRateMantissa; // Exchange rate of vTokens
    uint oraclePriceMantissa; // Price of the asset from the oracle
    Exp collateralFactor; // Collateral factor for the asset
    Exp exchangeRate; // Exchange rate as an Exponential type
    Exp oraclePrice; // Oracle price as an Exponential type
    Exp tokensToDenom; // Conversion factor from tokens to denomination (BNB)
    Exp tokensToDenom1; // Additional conversion factor from tokens to denomination
  }

  /**
   * @dev Struct to store information about tokens.
   */
  struct TokenInfo {
    address[] tokens; // Array of token addresses
    uint count; // Number of tokens
  }

  /**
   * @notice Returns the balance of the specified asset in the given pool.
   * @param pool The address of the pool to query the balance from.
   * @param asset The address of the asset to query.
   * @return balance The balance of the asset in the specified pool.
   */

  function getBalance(
    address pool,
    address asset
  ) external view override returns (uint256 balance) {}

  /**
   * @notice Returns the fixed decimals used in the Venus protocol (set to 8).
   * @return decimals The number of decimals.
   */
  function getDecimals() external pure override returns (uint256 decimals) {
    return 8; // Venus protocol uses 8 decimal places for calculations
  }

  /**
   * @notice Encodes the data needed to enter the market for the specified asset.
   * @param assets The address of the assets to enter the market for.
   * @return data The encoded data for entering the market.
   */
  function enterMarket(
    address[] memory assets
  ) external pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("enterMarkets(address[])")),
      assets // Encode the data to enter the market
    );
  }

  /**
   * @notice Encodes the data needed to exit the market for the specified asset.
   * @param asset The address of the asset to exit the market for.
   * @return data The encoded data for exiting the market.
   */
  function exitMarket(address asset) external pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("exitMarket(address)")),
      asset // Encode the data to exit the market
    );
  }

  /**
   * @notice Encodes the data needed to borrow a specified amount of an asset from the Venus protocol.
   * @param borrowAmount The amount of the asset to borrow.
   * @return data The encoded data for borrowing the specified amount.
   */
  function borrow(
    address,
    address,
    address,
    uint256 borrowAmount
  ) external pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("borrow(uint256)")),
      borrowAmount // Encode the data to borrow the specified amount
    );
  }

  /**
   * @notice Encodes the data needed to repay a borrowed amount in the Venus protocol.
   * @param borrowAmount The amount of the borrowed asset to repay.
   * @return data The encoded data for repaying the specified amount.
   */
  function repay(
    address,
    address,
    uint256 borrowAmount
  ) public pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("repayBorrow(uint256)")),
      borrowAmount // Encode the data to repay the specified amount
    );
  }

  /**
   * @notice Encodes the data needed to approve a token transfer.
   * @param _toApprove The address to approve the token transfer for.
   * @param _amountToApprove The amount of tokens to approve.
   * @return data The encoded data for approving the token transfer.
   */
  function approve(
    address _toApprove,
    uint256 _amountToApprove
  ) public pure returns (bytes memory data) {
    data = abi.encodeCall(
      IERC20Upgradeable.approve,
      (_toApprove, _amountToApprove) // Encode the data for approving the token transfer
    );
  }

  /**
   * @notice Retrieves all protocol assets (both lent and borrowed) for a specific account.
   * @param account The address of the user account.
   * @param comptroller The address of the Venus Comptroller.
   * @return lendTokens An array of addresses representing lent assets.
   * @return borrowTokens An array of addresses representing borrowed assets.
   */
  function getAllProtocolAssets(
    address account,
    address comptroller,
    address[] memory
  )
    public
    view
    returns (address[] memory lendTokens, address[] memory borrowTokens)
  {
    address[] memory assets = IVenusComptroller(comptroller).getAssetsIn(
      account
    ); // Get the assets in the account
    uint assetsCount = assets.length; // Get the number of assets
    lendTokens = new address[](assetsCount); // Initialize the lend tokens array
    borrowTokens = new address[](assetsCount); // Initialize the borrow tokens array
    uint256 lendCount; // Counter for lent assets
    uint256 borrowCount; // Counter for borrowed assets

    // Loop through the assets to populate the arrays
    for (uint i = 0; i < assetsCount; ) {
      IVenusPool asset = IVenusPool(assets[i]); // Get the Venus pool for the asset
      (, uint vTokenBalance, uint borrowBalance, ) = asset.getAccountSnapshot(
        account
      ); // Get the account snapshot

      if (vTokenBalance > 0) {
        lendTokens[lendCount++] = address(asset); // Add the asset to the lend tokens if there is a balance
      }

      if (borrowBalance > 0) {
        borrowTokens[borrowCount++] = address(asset); // Add the asset to the borrow tokens if there is a balance
      }
      unchecked {
        ++i;
      }
    }

    // Resize the arrays to remove unused entries
    uint256 unusedLend = assetsCount - lendCount;
    uint256 unusedBorrow = assetsCount - borrowCount;
    assembly {
      mstore(lendTokens, sub(mload(lendTokens), unusedLend))
      mstore(borrowTokens, sub(mload(borrowTokens), unusedBorrow))
    }
  }

  /**
   * @notice Returns the user account data across all reserves in the Venus protocol.
   * @param user The address of the user.
   * @param comptroller The address of the Venus Comptroller.
   * @return accountData A struct containing the user's account data.
   * @return tokenAddresses A struct containing the balances of the user's lending and borrowing tokens.
   */
  function getUserAccountData(
    address user,
    address comptroller,
    address[] memory
  )
    public
    view
    returns (
      FunctionParameters.AccountData memory accountData,
      FunctionParameters.TokenAddresses memory tokenAddresses
    )
  {
    (
      accountData.totalCollateral,
      accountData.totalDebt,
      accountData.availableBorrows,
      accountData.ltv,
      tokenAddresses.lendTokens,
      tokenAddresses.borrowTokens
    ) = getAccountPosition(comptroller, user);

    accountData.totalCollateral = accountData.totalCollateral / 1e10; // change the scale from 18 to 8
    accountData.totalDebt = accountData.totalDebt / 1e10; // change the scale from 18 to 8
    accountData.availableBorrows = accountData.availableBorrows / 1e10; // change the scale from 18 to 8
    accountData.currentLiquidationThreshold = accountData.ltv; // The average liquidation threshold is same with average collateral factor in Venus
    accountData.healthFactor = accountData.totalDebt == 0
      ? type(uint).max // Set health factor to max if no debt
      : (accountData.totalCollateral * accountData.ltv) / accountData.totalDebt;
  }

  /**
   * @notice Internal function to calculate the user's account position in the Venus protocol.
   * @param comptroller The address of the Venus Comptroller.
   * @param account The address of the user account.
   * @return totalCollateral The total collateral value of the user.
   * @return totalDebt The total debt of the user.
   * @return availableBorrows The available borrowing power of the user.
   * @return ltv The loan-to-value ratio of the user's collateral.
   * @return lendTokens An array of addresses representing lent assets.
   * @return borrowTokens An array of addresses representing borrowed assets.
   */
  function getAccountPosition(
    address comptroller,
    address account
  )
    internal
    view
    returns (
      uint totalCollateral,
      uint totalDebt,
      uint availableBorrows,
      uint ltv,
      address[] memory lendTokens,
      address[] memory borrowTokens
    )
  {
    AccountLiquidityLocalVars memory vars; // Initialize the struct to hold calculation results

    address[] memory assets = IVenusComptroller(comptroller).getAssetsIn(
      account
    ); // Get all assets in the account
    uint assetsCount = assets.length; // Number of assets

    // Initialize structs to store token information
    TokenInfo memory lendInfo;
    lendInfo.tokens = new address[](assetsCount); // Initialize the array for lent assets

    TokenInfo memory borrowInfo;
    borrowInfo.tokens = new address[](assetsCount); // Initialize the array for borrowed assets

    // Process each asset to update the account position
    (vars, lendInfo, borrowInfo) = processAssets(
      comptroller,
      account,
      assets,
      assetsCount,
      vars,
      lendInfo,
      borrowInfo
    );

    // Handle VAIController logic separately
    vars.sumBorrowPlusEffects = handleVAIController(
      comptroller,
      account,
      vars.sumBorrowPlusEffects
    );

    // Resize the arrays to remove empty entries
    resizeArray(lendInfo.tokens, assetsCount - lendInfo.count);
    resizeArray(borrowInfo.tokens, assetsCount - borrowInfo.count);

    // Calculate and return the final account position
    return (
      vars.totalCollateral,
      vars.sumBorrowPlusEffects,
      vars.sumCollateral > vars.sumBorrowPlusEffects
        ? vars.sumCollateral - vars.sumBorrowPlusEffects
        : 0,
      vars.totalCollateral > 0
        ? divRound_(vars.sumCollateral * 1e4, vars.totalCollateral)
        : 0,
      lendInfo.tokens,
      borrowInfo.tokens
    );
  }

  /**
   * @notice Internal function to process assets and update account liquidity variables.
   * @param comptroller The address of the Venus Comptroller.
   * @param account The address of the user account.
   * @param assets An array of asset addresses to process.
   * @param assetsCount The number of assets to process.
   * @param vars The struct holding liquidity calculation variables.
   * @param lendInfo A struct containing information about lent assets.
   * @param borrowInfo A struct containing information about borrowed assets.
   * @return Updated vars, lendInfo, and borrowInfo structs.
   */
  function processAssets(
    address comptroller,
    address account,
    address[] memory assets,
    uint assetsCount,
    AccountLiquidityLocalVars memory vars,
    TokenInfo memory lendInfo,
    TokenInfo memory borrowInfo
  )
    internal
    view
    returns (
      AccountLiquidityLocalVars memory,
      TokenInfo memory,
      TokenInfo memory
    )
  {
    // Loop through the assets to process each one
    for (uint i = 0; i < assetsCount; ) {
      IVenusPool asset = IVenusPool(assets[i]); // Get the Venus pool for the asset

      // Handle asset snapshot and update vars
      bool shouldContinue = updateVarsWithSnapshot(asset, account, vars);
      if (shouldContinue) {
        continue; // Skip processing if there was an error
      }

      // Process the token balances and update the counters
      (lendInfo.count, borrowInfo.count) = processTokenBalances(
        asset,
        comptroller,
        vars,
        lendInfo.tokens,
        lendInfo.count,
        borrowInfo.tokens,
        borrowInfo.count
      );
      unchecked {
        ++i;
      }
    }

    // Return the updated structs
    return (vars, lendInfo, borrowInfo);
  }

  /**
   * @notice Internal function to update liquidity variables with asset snapshot data.
   * @param asset The Venus pool asset to process.
   * @param account The address of the user account.
   * @param vars The struct holding liquidity calculation variables.
   * @return shouldContinue Boolean indicating whether to continue the loop.
   */
  function updateVarsWithSnapshot(
    IVenusPool asset,
    address account,
    AccountLiquidityLocalVars memory vars
  ) internal view returns (bool shouldContinue) {
    (
      uint oErr,
      uint vTokenBalance,
      uint borrowBalance,
      uint exchangeRateMantissa
    ) = asset.getAccountSnapshot(account); // Get the snapshot of the account in the asset

    if (oErr != 0) {
      return true; // Indicate that the loop should continue and skip this asset if there was an error
    }

    // Update the variables with the snapshot data
    vars.vTokenBalance = vTokenBalance;
    vars.borrowBalance = borrowBalance;
    vars.exchangeRateMantissa = exchangeRateMantissa;

    return false; // No error, proceed with processing this asset
  }

  /**
   * @notice Internal function to process token balances and update liquidity variables.
   * @param asset The Venus pool asset to process.
   * @param comptroller The address of the Venus Comptroller.
   * @param vars The struct holding liquidity calculation variables.
   * @param lendTokens The array of addresses representing lent assets.
   * @param lendCount The number of lent assets.
   * @param borrowTokens The array of addresses representing borrowed assets.
   * @param borrowCount The number of borrowed assets.
   * @return Updated lendCount and borrowCount.
   */
  function processTokenBalances(
    IVenusPool asset,
    address comptroller,
    AccountLiquidityLocalVars memory vars,
    address[] memory lendTokens,
    uint lendCount,
    address[] memory borrowTokens,
    uint borrowCount
  ) internal view returns (uint, uint) {
    if (vars.vTokenBalance > 0) {
      lendTokens[lendCount] = address(asset); // Add the asset to the lend tokens if there is a balance
      lendCount++;
    }

    if (vars.borrowBalance > 0) {
      borrowTokens[borrowCount] = address(asset); // Add the asset to the borrow tokens if there is a balance
      borrowCount++;
    }

    // Get the collateral factor from the market
    (, uint collateralFactorMantissa, ) = IVenusComptroller(comptroller)
      .markets(address(asset));
    vars.collateralFactor = Exp({mantissa: collateralFactorMantissa});
    vars.exchangeRate = Exp({mantissa: vars.exchangeRateMantissa});

    // Get the normalized price of the asset
    vars.oraclePriceMantissa = IVenusComptroller(comptroller)
      .oracle()
      .getUnderlyingPrice(address(asset));
    if (vars.oraclePriceMantissa == 0) {
      return (lendCount, borrowCount); // Skip if the price is zero
    }
    vars.oraclePrice = Exp({mantissa: vars.oraclePriceMantissa});

    // Pre-compute a conversion factor from tokens to BNB (normalized price value)
    vars.tokensToDenom = mul_(
      mul_(vars.collateralFactor, vars.exchangeRate),
      vars.oraclePrice
    );

    // Update the sumCollateral value
    vars.sumCollateral = mul_ScalarTruncateAddUInt(
      vars.tokensToDenom,
      vars.vTokenBalance,
      vars.sumCollateral
    );

    // Update the totalCollateral value
    vars.tokensToDenom1 = mul_(vars.exchangeRate, vars.oraclePrice);
    vars.totalCollateral = mul_ScalarTruncateAddUInt(
      vars.tokensToDenom1,
      vars.vTokenBalance,
      vars.totalCollateral
    );

    // Update the sumBorrowPlusEffects value
    vars.sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(
      vars.oraclePrice,
      vars.borrowBalance,
      vars.sumBorrowPlusEffects
    );

    return (lendCount, borrowCount);
  }

  /**
   * @notice Internal function to handle VAI controller logic in the Venus protocol.
   * @param comptroller The address of the Venus Comptroller.
   * @param account The address of the user account.
   * @param sumBorrowPlusEffects The sum of borrowed amounts including effects.
   * @return Updated sumBorrowPlusEffects value.
   */
  function handleVAIController(
    address comptroller,
    address account,
    uint sumBorrowPlusEffects
  ) internal view returns (uint) {
    IVAIController vaiController = IVenusComptroller(comptroller)
      .vaiController(); // Get the VAI controller from the comptroller
    if (address(vaiController) != address(0)) {
      sumBorrowPlusEffects = add_(
        sumBorrowPlusEffects,
        vaiController.getVAIRepayAmount(account) // Add the VAI repay amount to the sum
      );
    }
    return sumBorrowPlusEffects;
  }

  /**
   * @notice Internal function to resize an array of addresses.
   * @param array The array of addresses to resize.
   * @param size The size to resize the array to.
   */
  function resizeArray(address[] memory array, uint size) internal pure {
    assembly {
      mstore(array, sub(mload(array), size)) // Resize the array by adjusting its length
    }
  }

  function getBorrowedTokens(
    address user,
    address comptroller
  ) external view returns (address[] memory borrowedTokens) {
    AccountLiquidityLocalVars memory vars; // Holds all our calculation results
    uint oErr;

    address[] memory assets = IVenusComptroller(comptroller).getAssetsIn(user);
    uint assetsCount = assets.length;
    uint256 count;
    borrowedTokens = new address[](assetsCount);
    for (uint i = 0; i < assetsCount; ) {
      IVenusPool asset = IVenusPool(assets[i]);
      // Read the balances and exchange rate from the vToken
      (
        oErr,
        vars.vTokenBalance,
        vars.borrowBalance,
        vars.exchangeRateMantissa
      ) = asset.getAccountSnapshot(user);
      if (vars.borrowBalance > 0) {
        borrowedTokens[count] = address(asset);
        count++;
      }
      unchecked {
        ++i;
      }
    }
    uint256 spaceToRemove = assetsCount - count;
    assembly {
      mstore(borrowedTokens, sub(mload(borrowedTokens), spaceToRemove))
    }
  }

  /**
   * @notice Returns the investible balance of a token for a specific vault.
   * @param _token The address of the token.
   * @param _vault The address of the vault.
   * @param _controller The address of the Venus Comptroller.
   * @return The investible balance of the token.
   */
  function getInvestibleBalance(
    address _token,
    address _vault,
    address _controller,
    address[] memory portfolioTokens
  ) external view returns (uint256) {
    // Get the account data for the vault
    (FunctionParameters.AccountData memory accountData, ) = getUserAccountData(
      _vault,
      _controller,
      portfolioTokens
    );

    // Calculate the unused collateral percentage
    uint256 unusedCollateralPercentage = accountData.totalCollateral == 0
      ? 10 ** 18
      : ((accountData.totalCollateral - accountData.totalDebt) * 10 ** 18) /
        accountData.totalCollateral;

    uint256 tokenBalance = IERC20Upgradeable(_token).balanceOf(_vault); // Get the balance of the token in the vault

    return (tokenBalance * unusedCollateralPercentage) / 10 ** 18; // Calculate and return the investible balance
  }

  /**
   * @notice Calculates the debt value and the percentage to remove based on the debt repayment amount.
   * @param _debtRepayAmount The amount of debt to repay.
   * @param feeUnit The fee unit used for calculations.
   * @param totalDebt The total debt of the user.
   * @param borrowBalance The borrow balance of the user.
   * @param totalCollateral The total collateral of the user.
   * @return debtValue The calculated debt value.
   * @return percentageToRemove The calculated percentage to remove.
   */
  function calculateDebtAndPercentage(
    uint256 _debtRepayAmount,
    uint256 feeUnit,
    uint256 totalDebt,
    uint256 borrowBalance,
    uint256 totalCollateral
  ) internal pure returns (uint256 debtValue, uint256 percentageToRemove) {
    uint256 feeAmount = (_debtRepayAmount * 10 ** 18 * feeUnit) / 10 ** 22; // Calculate the fee amount
    uint256 debtAmountWithFee = _debtRepayAmount + feeAmount; // Add the fee to the debt repayment amount
    debtValue = (debtAmountWithFee * totalDebt * 10 ** 18) / borrowBalance; // Calculate the debt value
    percentageToRemove = debtValue / totalCollateral; // Calculate the percentage to remove from collateral
  }

  /**
   * @notice Calculates the amounts of tokens to sell based on the percentage to remove.
   * @param _user The address of the user account.
   * @param lendTokens The array of addresses representing lent assets.
   * @param percentageToRemove The percentage to remove.
   * @return amounts The calculated amounts of tokens to sell.
   */
  function calculateAmountsToSell(
    address _user,
    address[] memory lendTokens,
    uint256 percentageToRemove,
    uint256 bufferUnit
  ) internal view returns (uint256[] memory amounts) {
    amounts = new uint256[](lendTokens.length); // Initialize the amounts array

    // Loop through the lent tokens to calculate the amount to sell
    for (uint256 i; i < lendTokens.length; ) {
      uint256 balance = IERC20Upgradeable(lendTokens[i]).balanceOf(_user); // Get the balance of the token

      uint256 amountToSell = (balance * percentageToRemove);
      amountToSell = amountToSell + ((amountToSell * bufferUnit) / 100000); // Buffer of 0.001%
      amounts[i] = amountToSell / 10 ** 18; // Calculate the amount to sell
      unchecked {
        ++i;
      }
    }
  }

  /**
   * @notice Processes a loan by handling swaps, transfers, repayments, and withdrawals.
   * @param vault The address of the vault.
   * @param executor The address of the executor.
   * @param controller The address of the Venus Comptroller.
   * @param receiver The address of the receiver.
   * @param lendTokens The array of addresses representing lent assets.
   * @param totalCollateral The total collateral value.
   * @param fee The fee for the transaction.
   * @param flashData A struct containing flash loan data.
   * @return transactions An array of transactions to execute.
   * @return The total amount of flash loan used.
   */
  function loanProcessing(
    address vault,
    address executor,
    address controller,
    address receiver,
    address[] memory lendTokens,
    uint256 totalCollateral,
    uint fee,
    FunctionParameters.FlashLoanData memory flashData
  ) external view returns (MultiTransaction[] memory transactions, uint256) {
    // Process swaps and transfers during the loan
    (
      MultiTransaction[] memory swapTransactions,
      uint256 totalFlashAmount
    ) = swapAndTransferTransactions(vault, flashData);

    // Handle repayment transactions
    MultiTransaction[] memory repayLoanTransaction = repayTransactions(
      executor,
      vault,
      flashData
    );

    // Handle withdrawal transactions
    MultiTransaction[] memory withdrawTransaction = withdrawTransactions(
      executor,
      vault,
      controller,
      receiver,
      lendTokens,
      totalCollateral,
      fee,
      flashData
    );

    // Combine all transactions into one array
    transactions = new MultiTransaction[](
      swapTransactions.length +
        repayLoanTransaction.length +
        withdrawTransaction.length
    );
    uint256 count;

    // Add swap transactions to the final array
    for (uint i = 0; i < swapTransactions.length; ) {
      transactions[count].to = swapTransactions[i].to;
      transactions[count].txData = swapTransactions[i].txData;
      count++;
      unchecked {
        ++i;
      }
    }

    // Add repay transactions to the final array
    for (uint i = 0; i < repayLoanTransaction.length; ) {
      transactions[count].to = repayLoanTransaction[i].to;
      transactions[count].txData = repayLoanTransaction[i].txData;
      count++;
      unchecked {
        ++i;
      }
    }

    // Add withdrawal transactions to the final array
    for (uint i = 0; i < withdrawTransaction.length; ) {
      transactions[count].to = withdrawTransaction[i].to;
      transactions[count].txData = withdrawTransaction[i].txData;
      count++;
      unchecked {
        ++i;
      }
    }

    return (transactions, totalFlashAmount); // Return the final array of transactions and total flash loan amount
  }

  /**
   * @notice Internal function to handle swaps and transfers during loan processing.
   * @param vault The address of the vault.
   * @param flashData A struct containing flash loan data.
   * @return transactions An array of transactions to execute.
   * @return totalFlashAmount The total amount of flash loan used.
   */
  function swapAndTransferTransactions(
    address vault,
    FunctionParameters.FlashLoanData memory flashData
  )
    internal
    pure
    returns (MultiTransaction[] memory transactions, uint256 totalFlashAmount)
  {
    uint256 tokenLength = flashData.debtToken.length; // Get the number of debt tokens
    transactions = new MultiTransaction[](tokenLength * 2); // Initialize the transactions array
    uint count;

    // Loop through the debt tokens to handle swaps and transfers
    for (uint i; i < tokenLength; ) {
      // Check if the flash loan token is different from the debt token
      if (flashData.flashLoanToken != flashData.debtToken[i]) {
        // Transfer the flash loan token to the solver handler
        transactions[count].to = flashData.flashLoanToken;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("transfer(address,uint256)")),
          flashData.solverHandler, // recipient
          flashData.flashLoanAmount[i]
        );
        count++;

        // Swap the token using the solver handler
        transactions[count].to = flashData.solverHandler;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("multiTokenSwapAndTransfer(address,bytes)")),
          vault,
          flashData.firstSwapData[i]
        );
        count++;
      }
      // Handle the case where the flash loan token is the same as the debt token
      else {
        // Transfer the token directly to the vault
        transactions[count].to = flashData.flashLoanToken;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("transfer(address,uint256)")),
          vault, // recipient
          flashData.flashLoanAmount[i]
        );
        count++;
      }

      totalFlashAmount += flashData.flashLoanAmount[i]; // Update the total flash loan amount
      unchecked {
        ++i;
      }
    }
    // Resize the transactions array to remove unused entries
    uint unusedLength = ((tokenLength * 2) - count);
    assembly {
      mstore(transactions, sub(mload(transactions), unusedLength))
    }
  }

  /**
   * @notice Internal function to handle repayment transactions during loan processing.
   * @param executor The address of the executor.
   * @param flashData A struct containing flash loan data.
   * @return transactions An array of transactions to execute.
   */
  function repayTransactions(
    address executor,
    address vault,
    FunctionParameters.FlashLoanData memory flashData
  ) internal pure returns (MultiTransaction[] memory transactions) {
    uint256 tokenLength = flashData.debtToken.length; // Get the number of debt tokens
    transactions = new MultiTransaction[](tokenLength * 2); // Initialize the transactions array
    uint256 count;
    uint256 amountToRepay = flashData.isMaxRepayment
      ? type(uint256).max // If it's a max repayment, repay the max amount
      : flashData.debtRepayAmount[0]; // Otherwise, repay the debt amount
    // Loop through the debt tokens to handle repayments
    for (uint i = 0; i < tokenLength; ) {
      // Approve the debt token for the protocol
      transactions[count].to = executor;
      transactions[count].txData = abi.encodeWithSelector(
        bytes4(keccak256("vaultInteraction(address,bytes)")),
        flashData.debtToken[i],
        approve(flashData.protocolTokens[i], amountToRepay)
      );
      count++;

      // Repay the debt using the protocol token
      transactions[count].to = executor;
      transactions[count].txData = abi.encodeWithSelector(
        bytes4(keccak256("vaultInteraction(address,bytes)")),
        flashData.protocolTokens[i],
        repay(flashData.debtToken[i], vault, amountToRepay)
      );
      count++;
      unchecked {
        ++i;
      }
    }
  }

  /**
   * @notice Internal function to handle withdrawal transactions during loan processing.
   * @param executor The address of the executor.
   * @param user The address of the user account.
   * @param controller The address of the Venus Comptroller.
   * @param receiver The address of the receiver.
   * @param lendingTokens The array of addresses representing lent assets.
   * @param totalCollateral The total collateral value.
   * @param fee The fee for the transaction.
   * @param flashData A struct containing flash loan data.
   * @return transactions An array of transactions to execute.
   */
  function withdrawTransactions(
    address executor,
    address user,
    address controller,
    address receiver,
    address[] memory lendingTokens,
    uint256 totalCollateral,
    uint256 fee,
    FunctionParameters.FlashLoanData memory flashData
  ) internal view returns (MultiTransaction[] memory transactions) {
    uint256 amountLength = flashData.debtRepayAmount.length; // Get the number of repayment amounts
    transactions = new MultiTransaction[](
      amountLength * 2 * lendingTokens.length
    ); // Initialize the transactions array
    uint256 count; // Count for the transactions
    uint256 swapDataCount; // Count for the swap data
    // Loop through the repayment amounts to handle withdrawals
    for (uint i = 0; i < amountLength; ) {
      // Get the amounts to sell based on the collateral
      uint256[] memory sellAmounts = getCollateralAmountToSell(
        user,
        controller,
        flashData.protocolTokens[i],
        lendingTokens,
        flashData.debtRepayAmount[i],
        fee,
        totalCollateral,
        flashData.bufferUnit
      );

      // Loop through the lending tokens to process each one
      for (uint j = 0; j < lendingTokens.length; ) {
        // Pull the token from the vault
        transactions[count].to = executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("pullFromVault(address,uint256,address)")),
          lendingTokens[j], // The address of the lending token
          sellAmounts[j], // The amount to sell
          flashData.solverHandler // The solver handler address
        );
        count++;
        // Swap the token and transfer it to the receiver
        transactions[count].to = flashData.solverHandler;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("multiTokenSwapAndTransfer(address,bytes)")),
          receiver,
          flashData.secondSwapData[swapDataCount]
        );
        count++;
        swapDataCount++;
        unchecked {
          ++j;
        }
      }
      unchecked {
        ++i;
      }
    }
  }

  function executeUserFlashLoan(
    address _vault,
    address _receiver,
    uint256 _portfolioTokenAmount,
    uint256 _totalSupply,
    address[] memory borrowedTokens,
    FunctionParameters.withdrawRepayParams calldata repayData
  ) external {
    uint borrowedLength = borrowedTokens.length;
    address[] memory underlying = new address[](borrowedLength); // Array to store underlying tokens of borrowed assets
    uint256[] memory tokenBalance = new uint256[](borrowedLength); // Array to store balances of borrowed tokens
    uint256 totalFlashAmount; // Variable to track total flash loan amount
    underlying = new address[](borrowedLength);
    tokenBalance = new uint256[](borrowedLength);

    for (uint256 i; i < borrowedLength; ) {
      address token = borrowedTokens[i];
      uint256 borrowedAmount = IVenusPool(token).borrowBalanceStored(_vault); // Get the current borrowed balance for the token
      underlying[i] = IVenusPool(token).underlying(); // Get the underlying asset for the borrowed token
      tokenBalance[i] = (borrowedAmount * _portfolioTokenAmount) / _totalSupply; // Calculate the portion of the debt to repay
      totalFlashAmount += repayData._flashLoanAmount[i]; // Accumulate the total flash loan amount
      unchecked {
        ++i;
      }
    }

    // Get the pool address for the flash loan
    address _poolAddress = IThena(repayData._factory).poolByPair(
      repayData._token0,
      repayData._token1
    );

    // Prepare the flash loan data to be used in the flash loan callback
    FunctionParameters.FlashLoanData memory flashData = FunctionParameters
      .FlashLoanData({
        flashLoanToken: repayData._flashLoanToken,
        debtToken: underlying,
        protocolTokens: borrowedTokens,
        bufferUnit: repayData._bufferUnit,
        solverHandler: repayData._solverHandler,
        poolAddress: _poolAddress,
        flashLoanAmount: repayData._flashLoanAmount,
        debtRepayAmount: tokenBalance,
        firstSwapData: repayData.firstSwapData,
        secondSwapData: repayData.secondSwapData,
        isMaxRepayment: false
      });
    // Initiate the flash loan from the Algebra pool
    IAlgebraPool(_poolAddress).flash(
      _receiver, // Recipient of the flash loan
      repayData._token0 == repayData._flashLoanToken ? totalFlashAmount : 0, // Amount of token0 to flash loan
      repayData._token1 == repayData._flashLoanToken ? totalFlashAmount : 0, // Amount of token1 to flash loan
      abi.encode(flashData) // Encode flash loan data to pass to the callback
    );
  }

  function executeVaultFlashLoan(
    address _receiver,
    FunctionParameters.RepayParams calldata repayData
  ) external {
    // Getting pool address dynamically based on the token pair
    address _poolAddress = IThena(repayData._factory).poolByPair(
      repayData._token0,
      repayData._token1
    );

    // Defining the data to be passed in the flash loan, including the amount and pool key
    FunctionParameters.FlashLoanData memory flashData = FunctionParameters
      .FlashLoanData({
        flashLoanToken: repayData._flashLoanToken,
        debtToken: repayData._debtToken,
        protocolTokens: repayData._protocolToken,
        bufferUnit: repayData._bufferUnit,
        solverHandler: repayData._solverHandler,
        poolAddress: _poolAddress,
        flashLoanAmount: repayData._flashLoanAmount,
        debtRepayAmount: repayData._debtRepayAmount,
        firstSwapData: repayData.firstSwapData,
        secondSwapData: repayData.secondSwapData,
        isMaxRepayment: repayData.isMaxRepayment
      });

    // Initiate the flash loan from the Algebra pool
    IAlgebraPool(_poolAddress).flash(
      _receiver, // Recipient of the flash loan
      repayData._token0 == repayData._flashLoanToken
        ? repayData._flashLoanAmount[0]
        : 0, // Amount of token0 to flash loan
      repayData._token1 == repayData._flashLoanToken
        ? repayData._flashLoanAmount[0]
        : 0, // Amount of token1 to flash loan
      abi.encode(flashData) // Encode flash loan data to pass to the callback
    );
  }

  /**
   * @notice Calculates the collateral amount to sell during loan processing.
   * @param _user The address of the user account.
   * @param _controller The address of the Venus Comptroller.
   * @param _protocolToken The address of the protocol token.
   * @param lendTokens The array of addresses representing lent assets.
   * @param _debtRepayAmount The amount of debt to repay.
   * @param feeUnit The fee unit used for calculations.
   * @param totalCollateral The total collateral value.
   * @param bufferUnit The buffer unit used to slightly increase the amount of collateral to sell, expressed in 0.001% (100000 = 100%)
   * @return amounts The calculated amounts of tokens to sell.
   */
  function getCollateralAmountToSell(
    address _user,
    address _controller,
    address _protocolToken,
    address[] memory lendTokens,
    uint256 _debtRepayAmount,
    uint256 feeUnit, //flash loan fee unit
    uint256 totalCollateral,
    uint256 bufferUnit //buffer unit for collateral amount
  ) public view returns (uint256[] memory amounts) {
    uint256 borrowBalance = IVenusPool(_protocolToken).borrowBalanceStored(
      _user
    ); // Get the borrow balance for the protocol token

    uint256 oraclePriceMantissa = IVenusComptroller(_controller)
      .oracle()
      .getUnderlyingPrice(_protocolToken); // Get the oracle price for the protocol token

    Exp memory oraclePrice = Exp({mantissa: oraclePriceMantissa}); // Create an Exp structure for the oracle price
    uint256 sumBorrowPlusEffects;

    // Update the sumBorrowPlusEffects value
    sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(
      oraclePrice,
      borrowBalance,
      sumBorrowPlusEffects
    );

    // Handle the VAI controller logic
    sumBorrowPlusEffects = handleVAIController(
      _controller,
      _user,
      sumBorrowPlusEffects
    );

    // Calculate the percentage to remove based on the debt repayment amount
    (, uint256 percentageToRemove) = calculateDebtAndPercentage(
      _debtRepayAmount,
      feeUnit,
      sumBorrowPlusEffects / 10 ** 10,
      borrowBalance,
      totalCollateral
    );

    // Calculate the amounts to sell for each lending token
    amounts = calculateAmountsToSell(
      _user,
      lendTokens,
      percentageToRemove,
      bufferUnit
    );
  }
}
