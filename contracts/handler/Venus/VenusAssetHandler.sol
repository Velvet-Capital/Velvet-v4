// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IAssetHandler } from "../../core/interfaces/IAssetHandler.sol";
import { IVenusPool } from "../../core/interfaces/IVenusPool.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/interfaces/IERC20Upgradeable.sol";
import { IVenusComptroller, IVAIController, IPriceOracle } from "./IVenusComptroller.sol";
import { FunctionParameters } from "../../FunctionParameters.sol";
import { IThena } from "../../core/interfaces/IThena.sol";
import { IAlgebraPool } from "@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol";
import { ISwapHandler } from "../../core/interfaces/ISwapHandler.sol";
import { Ownable } from "@openzeppelin/contracts-4.8.2/access/Ownable.sol";
import "./ExponentialNoError.sol";

/**
 * @title VenusAssetHandler
 * @notice This contract interacts with the Venus protocol to manage user assets and liquidity positions.
 * @dev Provides functions to get balances, handle markets, and process loans within the Venus protocol.
 */
contract VenusAssetHandler is IAssetHandler, ExponentialNoError {
  address public immutable vBNB_Address;
  address public immutable WBNB_Address;
  
  constructor( address _vBNB_Address, address _WBNB_Address) {
    vBNB_Address = _vBNB_Address;
    WBNB_Address = _WBNB_Address;
  }

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

  /// @dev Struct to hold context data for withdrawal transactions to avoid stack too deep errors
  /// @param user Address of the user whose assets are being withdrawn
  /// @param executor Address of the contract executing the transactions
  /// @param controller Address of the Aave controller
  /// @param receiver Address receiving the swapped tokens
  /// @param poolAddress Address of the Aave pool
  /// @param flashloanToken Address of the token used for flash loan
  /// @param router Address of the DEX router
  /// @param swapHandler Address of the swap handler contract
  /// @param totalCollateral Total collateral value
  /// @param fee Fee for the transaction
  /// @param bufferUnit Buffer unit for calculations (expressed in basis points)
  struct WithdrawContext {
    address user;
    address executor;
    address controller;
    address receiver;
    address poolAddress;
    address flashloanToken;
    address router;
    address swapHandler;
    uint256 totalCollateral;
    uint256 fee;
    uint256 bufferUnit;
  }

  /// @notice Parameters required for processing a loan transaction
  /// @dev Groups all necessary parameters to avoid stack too deep errors
  /// @param vault Address of the vault holding the assets
  /// @param executor Address of the contract executing the transactions
  /// @param controller Address of the Venus controller
  /// @param receiver Address receiving the withdrawn assets
  /// @param lendTokens Array of lending token addresses
  /// @param totalCollateral Total value of collateral in the vault
  /// @param fee Fee for the transaction
  /// @param flashData Struct containing flash loan parameters and swap data
  struct LoanProcessingParams {
    address vault;
    address executor;
    address controller;
    address receiver;
    address[] lendTokens;
    uint256 totalCollateral;
    uint256 fee;
    FunctionParameters.FlashLoanData flashData;
  }

  /// @notice Results from processing swap transactions
  /// @dev Holds the generated transactions and related accounting information
  /// @param transactions Array of swap transactions to be executed
  /// @param flashAmount Total amount needed for flash loan
  /// @param feeCount Running count of fees processed
  struct ProcessedSwaps {
    MultiTransaction[] transactions;
    uint256 flashAmount;
    uint256 feeCount;
  }

  /// @notice Groups repay and withdraw transactions together
  /// @dev Separates different transaction types for better organization
  /// @param repayTx Array of transactions for repaying debt
  /// @param withdrawTx Array of transactions for withdrawing assets
  struct ProcessedTransactions {
    MultiTransaction[] repayTx;
    MultiTransaction[] withdrawTx;
  }

  /// @notice Information about a collection of tokens
  /// @dev Used to track arrays of tokens and their count
  /// @param tokens Array of token addresses
  /// @param count Number of valid tokens in the array
  struct TokenInfo {
    address[] tokens; // Array of token addresses
    uint count; // Number of tokens
  }

  /**
   * @dev Struct to hold arrays of different types of transactions during loan processing.
   * This struct helps manage transaction arrays while avoiding stack too deep errors.
   * @param swapTx Array of transactions for token swaps
   * @param repayTx Array of transactions for loan repayments
   * @param withdrawTx Array of transactions for asset withdrawals
   */
  struct TransactionArrays {
    MultiTransaction[] swapTx;
    MultiTransaction[] repayTx;
    MultiTransaction[] withdrawTx;
  }

  /// @notice Context data for swap operations
  /// @dev Groups swap-related addresses and handlers to avoid stack too deep errors
  /// @param vault Address of the vault holding the assets
  /// @param executor Address of the contract executing the transactions
  /// @param router Address of the DEX router for swaps
  /// @param flashLoanToken Address of the token used for flash loans
  /// @param swapHandler Interface for handling token swaps
  struct SwapContext {
    address vault;
    address executor;
    address router;
    address flashLoanToken;
    ISwapHandler swapHandler;
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

  function withdraw(
    address,
    address,
    uint256 amount
  ) public pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("redeem(uint256)")),
      amount
    );
  }


  /**
   * @notice Returns the underlying token of a Venus pool.
   * @param token The address of the Venus pool.
   * @return underlyingToken The address of the underlying token.
   */
  function getUnderlyingToken(address token) external view override returns (address) {
    return IVenusPool(token).underlying();
  }

  function swapTokens(
    address tokenIn,
    address tokenOut,
    address recipient,
    uint256 amountIn,
    uint256 minAmountOut,
    uint256 fee
  ) public view returns (bytes memory data) {
    bytes memory path = abi.encodePacked(
      tokenIn, // Address of the input token
      fee, // Pool fee (0.3%)
      tokenOut // Address of the output token
    );

    bytes memory encodedParams = abi.encode(
      path,
      recipient,
      block.timestamp + 15,
      amountIn,
      minAmountOut
    );

    data = abi.encodeWithSelector(
      bytes4(keccak256("exactInput((bytes,address,uint256,uint256,uint256))")),
      encodedParams
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
        unchecked { ++i; }
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
   * @notice Safely updates liquidity calculation variables with the latest available snapshot data.
   * @dev Tries to get a fresh exchange rate via staticcall to `exchangeRateCurrent()`, 
   *      and falls back to the stored rate if that fails. 
   *      Keeps the function pure `view` for compatibility.
   * @param asset The Venus vToken asset to process.
   * @param account The address of the user account.
   * @param vars The struct holding liquidity calculation variables.
   * @return shouldContinue Boolean indicating whether to skip processing this asset.
   */
  function updateVarsWithSnapshot(
    IVenusPool asset,
    address account,
    AccountLiquidityLocalVars memory vars
  ) internal returns (bool shouldContinue) {

    //Update the exchange rate
    asset.exchangeRateCurrent();

    // Get snapshot values (includes vToken balance, borrow balance, and exchangeRateStored)
    (
      uint oErr,
      uint vTokenBalance,
      uint borrowBalance,
      uint exchangeRateMantissa
    ) = asset.getAccountSnapshot(account);

    // If error from Venus, skip this asset
    if (oErr != 0) {
      return true;
    }

    // Update the vars struct with current values
    vars.vTokenBalance = vTokenBalance;
    vars.borrowBalance = borrowBalance;
    vars.exchangeRateMantissa = exchangeRateMantissa;

    return false; // All good — continue with this asset
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
    vars.collateralFactor = Exp({ mantissa: collateralFactorMantissa });
    vars.exchangeRate = Exp({ mantissa: vars.exchangeRateMantissa });

    // Get the normalized price of the asset
    vars.oraclePriceMantissa = IVenusComptroller(comptroller)
      .oracle()
      .getUnderlyingPrice(address(asset));
    if (vars.oraclePriceMantissa == 0) {
      return (lendCount, borrowCount); // Skip if the price is zero
    }
    vars.oraclePrice = Exp({ mantissa: vars.oraclePriceMantissa });

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
    uint256 feeAmount = (_debtRepayAmount * 10 ** 18 * feeUnit) / 10 ** 24; // Calculate the fee amount
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
    uint256 bufferUnit,
    uint256[] memory amounts
  ) internal view returns (uint256[] memory) {
    // Loop through the lent tokens to calculate the amount to sell
    uint256 lendTokensLength = lendTokens.length;
    for (uint256 i; i < lendTokensLength; ) {
      uint256 balance = IERC20Upgradeable(lendTokens[i]).balanceOf(_user); // Get the balance of the token

      uint256 amountToSell = (balance * percentageToRemove);
      amountToSell = amountToSell + ((amountToSell * bufferUnit) / 100000); // Buffer of 0.001%
      amounts[i] += (amountToSell / 10 ** 18); // Calculate the amount to sell
      unchecked {
        ++i;
      }
    }
    return amounts;
  }

  /// @notice Processes a loan using DEX for swaps and transfers
  /// @param vault Address of the vault holding the assets
  /// @param executor Address of the contract executing the transactions
  /// @param controller Address of the Venus controller
  /// @param receiver Address receiving the withdrawn assets
  /// @param lendTokens Array of lending token addresses
  /// @param totalCollateral Total value of collateral in the vault
  /// @param fee Fee for the transaction
  /// @param flashData Struct containing flash loan parameters and swap data
  /// @return transactions Array of transactions to execute
  /// @return uint256 Total amount of flash loan needed
  function loanProcessingDex(
    address vault,
    address executor,
    address controller,
    address receiver,
    address[] memory lendTokens,
    uint256 totalCollateral,
    uint256 fee,
    FunctionParameters.FlashLoanData memory flashData
  ) internal view returns (MultiTransaction[] memory transactions, uint256) {
    // Create params struct to pass around
    LoanProcessingParams memory params = LoanProcessingParams({
      vault: vault,
      executor: executor,
      controller: controller,
      receiver: receiver,
      lendTokens: lendTokens,
      totalCollateral: totalCollateral,
      fee: fee,
      flashData: flashData
    });

    return processLoanTransactions(params);
  }

  /// @notice Main processing function that coordinates swap, repay, and withdraw operations
  /// @param params Struct containing all parameters needed for loan processing
  /// @return transactions Array of transactions to execute
  /// @return totalFlashAmount Total amount of flash loan needed
  function processLoanTransactions(
    LoanProcessingParams memory params
  )
    internal
    view
    returns (MultiTransaction[] memory transactions, uint256 totalFlashAmount)
  {
    // 1. Gets swap transactions and flash amount - SAME
    ProcessedSwaps memory swapResult = processSwaps(params);

    // 2 & 3. Gets repay and withdraw transactions - SAME
    ProcessedTransactions memory txResult = processRepayAndWithdraw(
      params,
      swapResult.feeCount
    );

    // 4. Combines transactions in same order - SAME
    transactions = combineTransactions(
      TransactionArrays({
        swapTx: swapResult.transactions,
        repayTx: txResult.repayTx,
        withdrawTx: txResult.withdrawTx
      })
    );
    // 5. Returns same values - SAME
    return (transactions, swapResult.flashAmount);
  }

  /// @notice Processes swap transactions for the loan
  /// @param params Struct containing all parameters needed for loan processing
  /// @return result Struct containing swap transactions, flash amount, and fee count
  function processSwaps(
    LoanProcessingParams memory params
  ) internal view returns (ProcessedSwaps memory result) {
    (
      result.transactions,
      result.flashAmount,
      result.feeCount
    ) = swapAndTransferTransactionsUsingDex(
      params.vault,
      params.executor,
      params.flashData
    );
  }

  /// @notice Processes repay and withdraw transactions for the loan
  /// @param params Struct containing all parameters needed for loan processing
  /// @param feeCount Current count of fees processed
  /// @return result Struct containing repay and withdraw transactions
  function processRepayAndWithdraw(
    LoanProcessingParams memory params,
    uint256 feeCount
  ) internal view returns (ProcessedTransactions memory result) {
    result.repayTx = repayTransactions(
      params.executor,
      params.vault,
      params.flashData
    );
    result.withdrawTx = withdrawTransactionsUsingDex(
      params.executor,
      params.vault,
      params.controller,
      params.receiver,
      params.lendTokens,
      params.totalCollateral,
      params.fee,
      feeCount,
      params.flashData
    );
  }

  /// @notice Combines swap, repay, and withdraw transactions into a single array
  /// @param txArrays Struct containing arrays of different transaction types
  /// @return Combined array of all transactions in correct execution order
  function combineTransactions(
    TransactionArrays memory txArrays
  ) private pure returns (MultiTransaction[] memory) {
    // Combine all transactions into one array - keeping original array size calculation
    MultiTransaction[] memory transactions = new MultiTransaction[](
      txArrays.swapTx.length +
        txArrays.repayTx.length +
        txArrays.withdrawTx.length
    );
    uint256 count;

    // Add swap transactions to the final array
    for (uint i = 0; i < txArrays.swapTx.length; ) {
      transactions[count].to = txArrays.swapTx[i].to;
      transactions[count].txData = txArrays.swapTx[i].txData;
      count++;
      unchecked {
        ++i;
      }
    }

    // Add repay transactions to the final array
    for (uint i = 0; i < txArrays.repayTx.length; ) {
      transactions[count].to = txArrays.repayTx[i].to;
      transactions[count].txData = txArrays.repayTx[i].txData;
      count++;
      unchecked {
        ++i;
      }
    }

    // Add withdrawal transactions to the final array
    for (uint i = 0; i < txArrays.withdrawTx.length; ) {
      transactions[count].to = txArrays.withdrawTx[i].to;
      transactions[count].txData = txArrays.withdrawTx[i].txData;
      count++;
      unchecked {
        ++i;
      }
    }

    return transactions;
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
   * @return totalFlashAmount The total amount of flash loan used.
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
  )
    external
    view
    returns (MultiTransaction[] memory transactions, uint256 totalFlashAmount)
  {
    if (flashData.isDexRepayment) {
      (transactions, totalFlashAmount) = loanProcessingDex(
        vault,
        executor,
        controller,
        receiver,
        lendTokens,
        totalCollateral,
        fee,
        flashData
      );
    } else {
      // Process swaps and transfers during the loan
      (
        MultiTransaction[] memory swapTransactions,
        uint256 flashLoanAmount
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
      uint256 swapTransactionsLength = swapTransactions.length;
      for (uint i = 0; i < swapTransactionsLength; ) {
        transactions[count].to = swapTransactions[i].to;
        transactions[count].txData = swapTransactions[i].txData;
        count++;
        unchecked {
          ++i;
        }
      }

      // Add repay transactions to the final array
      uint256 repayLoanTransactionLength = repayLoanTransaction.length;
      for (uint i = 0; i < repayLoanTransactionLength; ) {
        transactions[count].to = repayLoanTransaction[i].to;
        transactions[count].txData = repayLoanTransaction[i].txData;
        count++;
        unchecked {
          ++i;
        }
      }

      // Add withdrawal transactions to the final array
      uint256 withdrawTransactionLength = withdrawTransaction.length;
      for (uint i = 0; i < withdrawTransactionLength; ) {
        transactions[count].to = withdrawTransaction[i].to;
        transactions[count].txData = withdrawTransaction[i].txData;
        count++;
        unchecked {
          ++i;
        }
      }

      return (transactions, flashLoanAmount); // Return the final array of transactions and total flash loan amount
    }
  }

  /**
   * @notice Internal function to handle swaps and transfers during loan processing.
   * @param vault The address of the vault.
   * @param flashData A struct containing flash loan data.
   * @return transactions An array of transactions to execute.
   * @return totalFlashAmount The total amount of flash loan used.
   */
  function swapAndTransferTransactionsUsingDex(
    address vault,
    address executor,
    FunctionParameters.FlashLoanData memory flashData
  )
    internal
    view
    returns (
      MultiTransaction[] memory transactions,
      uint256 totalFlashAmount,
      uint256 feeCount
    )
  {
    // Create context struct with all necessary data
    SwapContext memory context = SwapContext({
      vault: vault,
      executor: executor,
      router: ISwapHandler(flashData.swapHandler).getRouterAddress(),
      flashLoanToken: flashData.flashLoanToken,
      swapHandler: ISwapHandler(flashData.swapHandler)
    });

    uint256 tokenLength = flashData.debtToken.length;
    transactions = new MultiTransaction[](tokenLength * 3);
    uint256 count;

    // Process transactions in separate function
    (transactions, count, totalFlashAmount, feeCount) = createSwapTransactions(
      context,
      flashData,
      transactions,
      count,
      feeCount
    );
    // Resize array to remove unused entries
    uint256 unusedLength = ((tokenLength * 3) - count);
    assembly {
      mstore(transactions, sub(mload(transactions), unusedLength))
    }
  }

  function createSwapTransactions(
    SwapContext memory context,
    FunctionParameters.FlashLoanData memory flashData,
    MultiTransaction[] memory transactions,
    uint256 count,
    uint256 feeCount
  )
    internal
    view
    returns (MultiTransaction[] memory, uint256, uint256, uint256)
  {
    uint256 totalFlashAmount;

    for (uint i; i < flashData.debtToken.length; ) {
      if (context.flashLoanToken != flashData.debtToken[i]) {
        // Transfer flash loan token to vault
        transactions[count].to = context.flashLoanToken;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("transfer(address,uint256)")),
          context.vault,
          flashData.flashLoanAmount[i]
        );
        count++;

        // Vault approves token to DEX
        transactions[count].to = context.executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
          context.flashLoanToken,
          0,
          approve(context.router, flashData.flashLoanAmount[i])
        );
        count++;

        SwapContext memory _context = context;
        FunctionParameters.FlashLoanData memory _flashData = flashData;
        uint256 _feeCount = feeCount;

        // Swap tokens using swap handler
        transactions[count].to = context.executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
          _context.router,
          0,
          _context.swapHandler.swapExactTokensForTokens(
            _context.flashLoanToken,
            _flashData.debtToken[i],
            _context.vault,
            _flashData.flashLoanAmount[i],
            _flashData.debtRepayAmount[i],
            _flashData.poolFees[_feeCount]
          )
        );
        count++;
        feeCount++;
      } else {
        // Direct transfer when tokens match
        transactions[count].to = context.flashLoanToken;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("transfer(address,uint256)")),
          context.vault,
          flashData.flashLoanAmount[i]
        );
        count++;
      }

      totalFlashAmount += flashData.flashLoanAmount[i];
      unchecked {
        ++i;
      }
    }

    return (transactions, count, totalFlashAmount, feeCount);
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
    // Loop through the debt tokens to handle repayments
    for (uint i = 0; i < tokenLength; ) {
      uint256 amountToRepay = flashData.isMaxRepayment
      ? type(uint256).max // If it's a max repayment, repay the max amount
      : flashData.debtRepayAmount[i]; // Otherwise, repay the debt amount
      // Approve the debt token for the protocol
      transactions[count].to = executor;
      transactions[count].txData = abi.encodeWithSelector(
        bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
        flashData.debtToken[i],
        0,
        approve(flashData.protocolTokens[i], amountToRepay)
      );
      count++;

      // Repay the debt using the protocol token
      transactions[count].to = executor;
      transactions[count].txData = abi.encodeWithSelector(
        bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
        flashData.protocolTokens[i],
        0,
        repay(flashData.debtToken[i], vault, amountToRepay)
      );
      count++;
      unchecked {
        ++i;
      }
    }
  }

  /// @notice Main entry point for processing withdrawal transactions using DEX
  /// @param executor Address of the contract executing the transactions
  /// @param user Address of the user whose assets are being withdrawn
  /// @param controller Address of the Aave controller
  /// @param receiver Address receiving the swapped tokens
  /// @param lendingTokens Array of lending token addresses to process
  /// @param totalCollateral Total collateral value
  /// @param fee Fee for the transaction
  /// @param flashData Struct containing flash loan related data
  /// @return MultiTransaction[] Array of transactions to be executed
  function withdrawTransactionsUsingDex(
    address executor,
    address user,
    address controller,
    address receiver,
    address[] memory lendingTokens,
    uint256 totalCollateral,
    uint256 fee,
    uint256 feeCount,
    FunctionParameters.FlashLoanData memory flashData
  ) internal view returns (MultiTransaction[] memory) {
    WithdrawContext memory context = WithdrawContext({
      user: user,
      executor: executor,
      controller: controller,
      receiver: receiver,
      poolAddress: flashData.poolAddress,
      flashloanToken: flashData.flashLoanToken,
      router: ISwapHandler(flashData.swapHandler).getRouterAddress(),
      swapHandler: flashData.swapHandler,
      totalCollateral: totalCollateral,
      fee: fee,
      bufferUnit: flashData.bufferUnit
    });

    return
      processWithdrawTransactions(context, lendingTokens, flashData, feeCount);
  }

  /// @notice Processes the withdrawal transactions for all assets
  /// @param context Struct containing all context data for the withdrawal
  /// @param lendingTokens Array of lending token addresses to process
  /// @param flashData Struct containing flash loan related data
  /// @return transactions Array of transactions to be executed
  function processWithdrawTransactions(
    WithdrawContext memory context,
    address[] memory lendingTokens,
    FunctionParameters.FlashLoanData memory flashData,
    uint256 feeCount
  ) internal view returns (MultiTransaction[] memory transactions) {
    uint256 tokenLength = lendingTokens.length;
    transactions = new MultiTransaction[](4 * tokenLength);
    uint256 count;

    WithdrawContext memory _context = context;
    uint256[] memory sellAmounts = getCollateralAmountToSell(
      _context.user,
      _context.controller,
      flashData.protocolTokens,
      lendingTokens,
      flashData.debtRepayAmount,
      _context.fee,
      _context.totalCollateral,
      _context.bufferUnit
    );

    (count, feeCount) = processLendingTokenBatch(
      _context,
      lendingTokens,
      sellAmounts,
      transactions,
      count,
      feeCount,
      flashData.poolFees
    );
    // Resize the transactions array to remove unused entries
    uint unusedLength = ((tokenLength * 4) - count);
    assembly {
      mstore(transactions, sub(mload(transactions), unusedLength))
    }

    return transactions;
  }

  /// @notice Processes a batch of lending tokens to create withdrawal, approval, and swap transactions
  /// @param context Struct containing all context data for the withdrawal
  /// @param lendingTokens Array of lending token addresses to process
  /// @param sellAmounts Array of amounts to sell for each lending token
  /// @param transactions Array to store the generated transactions
  /// @param count Current count of transactions
  /// @return uint256 Updated count of transactions after processing the batch
  /// @dev For each lending token, creates three transactions:
  ///      1. Withdraw tokens from vault
  ///      2. Approve tokens for DEX
  ///      3. Swap tokens through DEX
  function processLendingTokenBatch(
    WithdrawContext memory context,
    address[] memory lendingTokens,
    uint256[] memory sellAmounts,
    MultiTransaction[] memory transactions,
    uint256 count,
    uint256 feeCount,
    uint256[] memory poolFees
  ) internal view returns (uint256, uint256) {
    for (uint j = 0; j < lendingTokens.length; ) {
      address lendingToken = lendingTokens[j];
      address underlying = (lendingToken == vBNB_Address)
        ? WBNB_Address
        : IVenusPool(lendingToken).underlying();
      WithdrawContext memory _context = context;
      uint256 _sellAmount = sellAmounts[j];

      // Withdraw transaction - exactly as original
      transactions[count].to = _context.executor;
      transactions[count].txData = abi.encodeWithSelector(
        bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
        lendingToken,
        0,
        withdraw(underlying, _context.user, _sellAmount)
      );
      count++;

      uint256 underlyingAmount = getUnderlyingAmount(
        lendingToken,
        _context.user,
        _sellAmount
      );

      if (underlying == WBNB_Address) {
        // Withdraw transaction - exactly as original
        transactions[count].to = _context.executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
          underlying, // WBNB contract address
          underlyingAmount,
          abi.encodeWithSelector(bytes4(keccak256("deposit()")))
        );
        count++;
      }
      
      if(underlying != _context.flashloanToken){
        // Approve transaction - exactly as original
        transactions[count].to = _context.executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
          underlying,
          0,
          approve(_context.router, underlyingAmount)
        );
        count++;

        uint fee = poolFees[feeCount];

        // Swap transaction - exactly as original
        transactions[count].to = _context.executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
          _context.router,
          0,
          ISwapHandler(_context.swapHandler).swapExactTokensForTokens(
            underlying,
            _context.flashloanToken,
            _context.receiver,
            underlyingAmount,
            0,
            fee
          )
        );
        count++;
        feeCount++;
      }

      unchecked {
        ++j;
      }
    }
    return (count, feeCount);
  }

  /**
   * @notice Calculates the amount of underlying tokens for a given account and vToken.
   * @param vToken The address of the vToken contract.
   * @param account The address of the account.
   * @param vTokenBalance The balance of the vToken for the account.
   * @return underlyingAmount The amount of underlying tokens corresponding to the account's vToken balance.
   */
  function getUnderlyingAmount(
    address vToken,
    address account,
    uint256 vTokenBalance
  ) internal view returns (uint underlyingAmount) {
    uint oErr;
    uint exchangeRateMantissa;

    // Get the account snapshot from the vToken contract
    (oErr, , , exchangeRateMantissa) = IVenusPool(vToken).getAccountSnapshot(
      account
    );

    // Calculate the underlying amount: underlyingAmount = vTokenBalance * exchangeRate
    // The exchange rate is scaled by 1e18, so we divide by 1e18 to normalize
    underlyingAmount = (vTokenBalance * exchangeRateMantissa) / 1e18;
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
    transactions = new MultiTransaction[](2 * lendingTokens.length); // Initialize the transactions array
    uint256 count; // Count for the transactions
    uint256 swapDataCount; // Count for the swap data
    // Get the amounts to sell based on the collateral
    uint256[] memory sellAmounts = getCollateralAmountToSell(
      user,
      controller,
      flashData.protocolTokens,
      lendingTokens,
      flashData.debtRepayAmount,
      fee,
      totalCollateral,
      flashData.bufferUnit
    );
    // Loop through the lending tokens to process each one
    uint256 lendingTokensLength = lendingTokens.length;
    for (uint j = 0; j < lendingTokensLength; ) {
      // Pull the token from the vault
      transactions[count].to = executor;
      transactions[count].txData = abi.encodeWithSelector(
        bytes4(keccak256("pullFromVault(address,uint256,uint256,address)")),
        lendingTokens[j], // The address of the lending token
        sellAmounts[j], // The amount to sell
        0,
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
  }

  function executeUserFlashLoan(
    address _vault,
    address _receiver,
    uint256 _portfolioTokenAmount,
    uint256 _totalSupply,
    uint256 _counter,
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
      totalFlashAmount += repayData._flashLoanAmount[_counter][i]; // Accumulate the total flash loan amount
      unchecked {
        ++i;
      }
    }

    // Get the pool address for the flash loan
    address _poolAddress = IThena(repayData._factory).poolByPair(
      repayData._token0,
      repayData._token1
    );

    bool isMaxRepayment = _portfolioTokenAmount == _totalSupply;

    // Prepare the flash loan data to be used in the flash loan callback
    FunctionParameters.FlashLoanData memory flashData = FunctionParameters
      .FlashLoanData({
        flashLoanToken: repayData._flashLoanToken,
        debtToken: underlying,
        protocolTokens: borrowedTokens,
        bufferUnit: repayData._bufferUnit,
        solverHandler: repayData._solverHandler,
        swapHandler: repayData._swapHandler,
        poolAddress: _poolAddress,
        flashLoanAmount: repayData._flashLoanAmount[_counter],
        debtRepayAmount: tokenBalance,
        poolFees: repayData._poolFees[_counter],
        firstSwapData: repayData.firstSwapData[_counter],
        secondSwapData: repayData.secondSwapData[_counter],
        isMaxRepayment: isMaxRepayment,
        isDexRepayment: repayData.isDexRepayment
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
        swapHandler: repayData._swapHandler,
        poolAddress: _poolAddress,
        flashLoanAmount: repayData._flashLoanAmount,
        debtRepayAmount: repayData._debtRepayAmount,
        poolFees: repayData._poolFees,
        firstSwapData: repayData.firstSwapData,
        secondSwapData: repayData.secondSwapData,
        isMaxRepayment: repayData.isMaxRepayment,
        isDexRepayment: repayData.isDexRepayment
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
    address[] memory _protocolToken,
    address[] memory lendTokens,
    uint256[] memory _debtRepayAmount,
    uint256 feeUnit, //flash loan fee unit
    uint256 totalCollateral,
    uint256 bufferUnit //buffer unit for collateral amount
  ) public view returns (uint256[] memory amounts) {
    amounts = new uint256[](lendTokens.length);
    for (uint256 i; i < _protocolToken.length; ) {
      uint256 borrowBalance = IVenusPool(_protocolToken[i]).borrowBalanceStored(
        _user
      ); // Get the borrow balance for the protocol token

      uint256 oraclePriceMantissa = IVenusComptroller(_controller)
        .oracle()
        .getUnderlyingPrice(_protocolToken[i]); // Get the oracle price for the protocol token

      Exp memory oraclePrice = Exp({ mantissa: oraclePriceMantissa }); // Create an Exp structure for the oracle price
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
        _debtRepayAmount[i],
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
        bufferUnit,
        amounts
      );
      unchecked {
        ++i;
      }
    }
  }

  function isCollateralEnabled(
    address vToken,
    address vault,
    address controller
  ) external view returns (bool) {
    // Directly use checkMembership if available.
    return IVenusComptroller(controller).checkMembership(vault, vToken);
  }
}
