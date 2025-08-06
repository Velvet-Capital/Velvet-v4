// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IAssetHandler } from "../../core/interfaces/IAssetHandler.sol";
import { Ownable } from "@openzeppelin/contracts-4.8.2/access/Ownable.sol";
import { FunctionParameters } from "../../FunctionParameters.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/interfaces/IERC20Upgradeable.sol";
import {IAavePool, DataTypes, IPoolAddressesProvider} from "./IAavePool.sol";
import { IPoolDataProvider } from "./IPoolDataProvider.sol";
import { IAaveToken } from "./IAaveToken.sol";
import { IAavePriceOracle } from "./IAavePriceOracle.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { IPortfolio } from "../../core/interfaces/IPortfolio.sol";
import { ISwapRouter } from "./ISwapRouter.sol";
import { ISwapHandler } from "../../core/interfaces/ISwapHandler.sol";

contract AaveAssetHandler is IAssetHandler {
  address immutable AAVE_ADDRESS_PROVIDER =
    0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;

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
  /// @notice Parameters for flash loan processing
  /// @param vault Address of the vault holding the assets
  /// @param receiver Address receiving the withdrawn assets
  /// @param portfolioTokenAmount Amount of portfolio tokens to process
  /// @param totalSupply Total supply of portfolio tokens
  /// @param counter Counter for the flash loan
  /// @param borrowedTokens Array of borrowed token addresses
  struct FlashLoanParams {
    address vault;
    address receiver;
    uint256 portfolioTokenAmount;
    uint256 totalSupply;
    uint256 counter;
    address[] borrowedTokens;
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
   * @notice Returns the fixed decimals used in the Aave protocol (set to 18).
   * @return decimals The number of decimals.
   */
  function getDecimals() external pure override returns (uint256 decimals) {
    return 18; // Aave protocol uses 18 decimal places for calculations
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
      bytes4(keccak256("setUserUseReserveAsCollateral(address,bool)")),
      assets[0], // Encode the data to enter the market
      true
    );
  }

  /**
   * @notice Encodes the data needed to exit the market for the specified asset.
   * @param asset The address of the asset to exit the market for.
   * @return data The encoded data for exiting the market.
   */
  function exitMarket(address asset) external pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("setUserUseReserveAsCollateral(address,bool)")),
      asset, // Encode the data to exit the market
      false
    );
  }

  /**
   * @notice Encodes the data needed to borrow a specified amount of an asset from the Aave protocol
   * @dev This function constructs the calldata required to invoke the Aave `borrow` function via a low-level call.
   * @param asset The address of the asset to borrow.
   * @param onBehalfOf The address on whose behalf the borrow is being executed.
   * @param borrowAmount The amount of the asset to borrow, specified in its smallest denomination (e.g., wei for ETH).
   * @return data The encoded data for borrowing the specified amount from Aave.
   */
  function borrow(
    address,
    address asset,
    address onBehalfOf,
    uint256 borrowAmount
  ) external pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("borrow(address,uint256,uint256,uint16,address)")),
      asset, // The asset to borrow
      borrowAmount, // The amount to borrow
      2, // Interest rate mode: 2 for variable interest rate
      0, // Referral code: set to 0 (no referral)
      onBehalfOf // Address for whom the borrow is executed
    );
  }

  /**
   * @notice Encodes the data needed to repay a borrowed amount in the Venus protocol.
   * @param borrowAmount The amount of the borrowed asset to repay.
   * @return data The encoded data for repaying the specified amount.
   */
  function repay(
    address asset,
    address onBehalfOf,
    uint256 borrowAmount
  ) public pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("repay(address,uint256,uint256,address)")),
      asset,
      borrowAmount, // Encode the data to repay the specified amount
      2,
      onBehalfOf
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
    address asset,
    address to,
    uint256 amount
  ) public pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("withdraw(address,uint256,address)")),
      asset,
      amount,
      to
    );
  }

  /**
   * @notice Returns the underlying token of a Aave token.
   * @param token The address of the Aave token.
   * @return underlyingToken The address of the underlying token.
   */
  function getUnderlyingToken(address token) external pure override returns (address) {
    return IAaveToken(token).UNDERLYING_ASSET_ADDRESS();
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
    address comptroller, //aave pool logic address
    address[] memory portfolioTokens
  )
    public
    view
    returns (address[] memory lendTokens, address[] memory borrowTokens)
  {
    address[] memory assets = IAavePool(comptroller).getReservesList();
    uint assetsCount = assets.length; // Get the number of assets
    lendTokens = new address[](assetsCount); // Initialize the lend tokens array
    borrowTokens = new address[](assetsCount); // Initialize the borrow tokens array
    uint256 lendCount; // Counter for lent assets
    uint256 borrowCount; // Counter for borrowed assets

    uint256 portfolioTokensLength = portfolioTokens.length;
    for (uint i = 0; i < portfolioTokensLength; i++) {
      address token = portfolioTokens[i];
      if (isValidAaveToken(token)) {
        lendTokens[lendCount++] = token;
      }
    }
    

    for (uint i = 0; i < assetsCount; ) {
      address asset = assets[i];
      (, , uint currentVariableDebt, , , , , , ) = IPoolDataProvider(
        IPoolAddressesProvider(AAVE_ADDRESS_PROVIDER).getPoolDataProvider()
      ).getUserReserveData(assets[i], account);
      DataTypes.ReserveDataLegacy memory data = IAavePool(comptroller)
        .getReserveData(asset);
      // if (currentATokenBalance > 0) {
      //   lendTokens[lendCount++] = data.aTokenAddress; // Add the asset to the lend tokens if there is a balance
      // }
      if (currentVariableDebt > 0) {
        borrowTokens[borrowCount++] = data.aTokenAddress; // Add the asset to the borrow tokens if there is a balance
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
    address[] memory portfolioTokens
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
      accountData.currentLiquidationThreshold,
      accountData.ltv,
      accountData.healthFactor
    ) = IAavePool(comptroller).getUserAccountData(user);

    (
      tokenAddresses.lendTokens,
      tokenAddresses.borrowTokens
    ) = getAllProtocolAssets(user, comptroller, portfolioTokens);
  }

  function getBorrowedTokens(
    address account,
    address poolAddress
  ) external view returns (address[] memory borrowedTokens) {
    address[] memory assets = IAavePool(poolAddress).getReservesList();
    uint assetsCount = assets.length; // Get the number of assets
    borrowedTokens = new address[](assetsCount); // Initialize the borrow tokens array
    uint256 borrowCount; // Counter for borrowed assets

    for (uint i = 0; i < assetsCount; ) {
      address asset = assets[i];
      (, , uint currentVariableDebt, , , , , , ) = IPoolDataProvider(
        IPoolAddressesProvider(AAVE_ADDRESS_PROVIDER).getPoolDataProvider()
      ).getUserReserveData(assets[i], account);
      DataTypes.ReserveDataLegacy memory data = IAavePool(poolAddress)
        .getReserveData(asset);
      if (currentVariableDebt > 0) {
        borrowedTokens[borrowCount++] = data.aTokenAddress; // Add the asset to the borrow tokens if there is a balance
      }
      unchecked {
        ++i;
      }
    }

    // Resize the arrays to remove unused entries
    uint256 unusedBorrow = assetsCount - borrowCount;
    assembly {
      mstore(borrowedTokens, sub(mload(borrowedTokens), unusedBorrow))
    }
  }

  /**
   * @notice Checks if a token is a valid Aave token by verifying if it has an underlying asset address.
   * @param token The address of the token to check.
   * @return isValid True if the token is a valid Aave token, false otherwise.
   */
  function isValidAaveToken(address token) internal view returns (bool) {
    (bool success, bytes memory data) = token.staticcall(
        abi.encodeWithSelector(IAaveToken.UNDERLYING_ASSET_ADDRESS.selector)
    );
    if (success && data.length == 32) {
        address underlying = address(uint160(uint256(bytes32(data))));
        return underlying != address(0);
    }
    return false;
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
    // 1. Gets swap transactions and flash amount
    ProcessedSwaps memory swapResult = processSwaps(params);

    // 2 & 3. Gets repay and withdraw transactions
    ProcessedTransactions memory txResult = processRepayAndWithdraw(
      params,
      swapResult.feeCount
    );

    // 4. Combines transactions in same order
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
   * @return feeCount The count of fees array.
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
    SwapContext memory context = SwapContext({
      vault: vault,
      executor: executor,
      router: ISwapHandler(flashData.swapHandler).getRouterAddress(),
      flashLoanToken: flashData.flashLoanToken,
      swapHandler: ISwapHandler(flashData.swapHandler)
    });

    uint256 tokenLength = flashData.debtToken.length;
    transactions = new MultiTransaction[](tokenLength * 3);
    uint count;

    (transactions, count, totalFlashAmount, feeCount) = createSwapTransactions(
      context,
      flashData,
      transactions,
      count,
      feeCount
    );

    uint unusedLength = ((tokenLength * 3) - count);
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
    uint256 tokenLength = flashData.debtToken.length;

    for (uint i; i < tokenLength; ) {
      if (context.flashLoanToken != flashData.debtToken[i]) {
        // Transfer the flash loan token to the vault
        transactions[count].to = context.flashLoanToken;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("transfer(address,uint256)")),
          context.vault,
          flashData.flashLoanAmount[i]
        );
        count++;

        //Vault Approves the token to dex
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

        // Swap the token using the solver handler
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
        approve(flashData.poolAddress, amountToRepay)
      );
      count++;

      // Repay the debt using the protocol token
      transactions[count].to = executor;
      transactions[count].txData = abi.encodeWithSelector(
        bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
        flashData.poolAddress,
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
    // Create context struct with all necessary data
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
    // Same array size as original
    uint256 tokenLength = lendingTokens.length;
    transactions = new MultiTransaction[](3 * tokenLength);
    uint256 count;

    WithdrawContext memory _context = context;
    // Same collateral calculation logic as original
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
    uint unusedLength = ((tokenLength * 3) - count);
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
      address underlying = IAaveToken(lendingTokens[j])
        .UNDERLYING_ASSET_ADDRESS();

      WithdrawContext memory _context = context;
      uint256 _sellAmount = sellAmounts[j];

      // 1. Withdraw transaction
      transactions[count++] = MultiTransaction({
        to: _context.executor,
        txData: abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
          _context.poolAddress,
          0,
          withdraw(underlying, _context.user, _sellAmount)
        )
      });

      if(underlying != _context.flashloanToken){
        // 2. Approve transaction
        transactions[count++] = MultiTransaction({
          to: _context.executor,
          txData: abi.encodeWithSelector(
            bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
            underlying,
            0,
            approve(_context.router, _sellAmount)
          )
        });


        uint fee = poolFees[feeCount];

        // 3. Swap transaction
        transactions[count++] = MultiTransaction({
          to: _context.executor,
          txData: abi.encodeWithSelector(
            bytes4(keccak256("vaultInteraction(address,uint256,bytes)")),
            _context.router,
            0,
            ISwapHandler(_context.swapHandler).swapExactTokensForTokens(
              underlying,
              _context.flashloanToken,
              _context.receiver,
              _sellAmount,
              1,
              fee
            )
          )
        });
        feeCount++;
      }
      unchecked {
        ++j;
      }
    }
    return (count, feeCount);
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

  /**
   * @notice Calculates the collateral amount to sell during loan processing.
   * @param _user The address of the user account.
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
    address,
    address[] memory _protocolToken,
    address[] memory lendTokens,
    uint256[] memory _debtRepayAmount,
    uint256 feeUnit, //flash loan fee unit
    uint256 totalCollateral,
    uint256 bufferUnit //buffer unit for collateral amount
  ) public view returns (uint256[] memory amounts) {
    amounts = new uint256[](lendTokens.length);
    for (uint256 i; i < _protocolToken.length; ) {
      //Get borrow balance for _protocolToken
      address _underlyingToken = IAaveToken(_protocolToken[i])
        .UNDERLYING_ASSET_ADDRESS();
      (, , uint currentVariableDebt, , , , , , ) = IPoolDataProvider(
        IPoolAddressesProvider(AAVE_ADDRESS_PROVIDER).getPoolDataProvider()
      ).getUserReserveData(_underlyingToken, _user);

      //Convert underlyingToken to 18 decimal
      uint borrowBalance = currentVariableDebt *
        10 ** (18 - IERC20MetadataUpgradeable(_underlyingToken).decimals());

      //Get price for _protocolToken token and convert to 18 decimal
      uint _oraclePrice = IAavePriceOracle(IPoolAddressesProvider(AAVE_ADDRESS_PROVIDER).getPriceOracle()).getAssetPrice(
        _underlyingToken
      ) * 10 ** 10;


      address user = _user;
      //Get price for borrow Balance (amount * price)
      uint _tokenPrice = (borrowBalance * _oraclePrice) / 10 ** 18; // Converting to 18 decimal

      // Calculate the percentage to remove based on the debt repayment amount
      (, uint256 percentageToRemove) = calculateDebtAndPercentage(
        _debtRepayAmount[i],
        feeUnit,
        _tokenPrice / 10 ** 10, //Convert to 8 decimal
        currentVariableDebt,
        totalCollateral
      );

      // Calculate the amounts to sell for each lending token
      amounts = calculateAmountsToSell(
        user,
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

  function executeUserFlashLoan(
    address _vault,
    address _receiver,
    uint256 _portfolioTokenAmount,
    uint256 _totalSupply,
    uint256 _counter,
    address[] memory borrowedTokens,
    FunctionParameters.withdrawRepayParams calldata repayData
  ) external override {
    uint borrowedLength = borrowedTokens.length;
    address[] memory underlying = new address[](borrowedLength); // Array to store underlying tokens of borrowed assets
    uint256[] memory tokenBalance = new uint256[](borrowedLength); // Array to store balances of borrowed tokens
    uint256 totalFlashAmount; // Variable to track total flash loan amount

    FlashLoanParams memory params = FlashLoanParams({
        vault: _vault,
        receiver: _receiver,
        portfolioTokenAmount: _portfolioTokenAmount,
        totalSupply: _totalSupply,
        counter: _counter,
        borrowedTokens: borrowedTokens
    });

    for (uint256 i; i < borrowedLength; ) {
      (underlying[i], tokenBalance[i],) = processToken(params, i);
      totalFlashAmount += repayData._flashLoanAmount[_counter][i]; // Accumulate the total flash loan amount
      unchecked {
        ++i;
      }
    }

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
        poolAddress: repayData._factory,
        flashLoanAmount: repayData._flashLoanAmount[_counter],
        debtRepayAmount: tokenBalance,
        poolFees: repayData._poolFees[_counter],
        firstSwapData: repayData.firstSwapData[_counter],
        secondSwapData: repayData.secondSwapData[_counter],
        isMaxRepayment: isMaxRepayment,
        isDexRepayment: repayData.isDexRepayment
      });


    address receiver = _receiver;
    // Initiate the flash loan from the Algebra pool
    address[] memory assets = new address[](1);
    assets[0] = repayData._flashLoanToken;
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = totalFlashAmount;
    uint256[] memory interestRateModes = new uint256[](1);
    interestRateModes[0] = 0;

    IAavePool(repayData._token0).flashLoan(
      receiver,
      assets,
      amounts,
      interestRateModes,
      receiver,
      abi.encode(flashData),
      0
    );
  }

  function executeVaultFlashLoan(
    address _receiver,
    FunctionParameters.RepayParams calldata repayData
  ) external override {
    // Defining the data to be passed in the flash loan, including the amount and pool key
    FunctionParameters.FlashLoanData memory flashData = FunctionParameters
      .FlashLoanData({
        flashLoanToken: repayData._flashLoanToken,
        debtToken: repayData._debtToken,
        protocolTokens: repayData._protocolToken,
        bufferUnit: repayData._bufferUnit,
        solverHandler: repayData._solverHandler,
        swapHandler: repayData._swapHandler,
        poolAddress: repayData._token0, //Need to change it and use single address
        flashLoanAmount: repayData._flashLoanAmount,
        debtRepayAmount: repayData._debtRepayAmount,
        poolFees: repayData._poolFees,
        firstSwapData: repayData.firstSwapData,
        secondSwapData: repayData.secondSwapData,
        isMaxRepayment: repayData.isMaxRepayment,
        isDexRepayment: repayData.isDexRepayment
      });

    address[] memory assets = new address[](1);
    assets[0] = repayData._flashLoanToken;
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = repayData._flashLoanAmount[0];
    uint256[] memory interestRateModes = new uint256[](1);
    interestRateModes[0] = 0;

    IAavePool(repayData._token0).flashLoan(
      _receiver,
      assets,
      amounts,
      interestRateModes,
      _receiver,
      abi.encode(flashData),
      0
    );
  }

  function isCollateralEnabled(
    address token,
    address vault,
    address
  ) external view returns (bool) {
    try
      IPoolDataProvider(
        IPoolAddressesProvider(AAVE_ADDRESS_PROVIDER).getPoolDataProvider()
      ).getUserReserveData(
          IAaveToken(token).UNDERLYING_ASSET_ADDRESS(),
          vault
      )
    returns (
      uint256 /* aTokenBalance */,
      uint256 /* stableDebt */,
      uint256 /* variableDebt */,
      uint256 /* principalStableDebt */,
      uint256 /* scaledVariableDebt */,
      uint256 /* stableBorrowRate */,
      uint256 /* liquidityRate */,
      uint40 /* stableRateLastUpdated */,
      bool usageAsCollateralEnabled
    ) {
      return usageAsCollateralEnabled;
    } catch {
      return false;
    }
  }

  /**
   * @notice Helper function to process a token for flash loan processing.
   * @param params The parameters for the flash loan.
   * @param index The index of the token to process.
   * @return underlyingToken The underlying token address.
   * @return tokenBal The token balance.
   * @return flashAmount The flash loan amount.
   */
  function processToken(
    FlashLoanParams memory params,
    uint256 index
  ) private view returns (
    address underlyingToken,
    uint256 tokenBal,
    uint256 flashAmount
  ) {
    underlyingToken = IAaveToken(params.borrowedTokens[index]).UNDERLYING_ASSET_ADDRESS();
    
    (, , uint256 currentVariableDebt, , , , , , ) = IPoolDataProvider(
        IPoolAddressesProvider(AAVE_ADDRESS_PROVIDER).getPoolDataProvider()
    ).getUserReserveData(underlyingToken, params.vault);
    
    tokenBal = (currentVariableDebt * params.portfolioTokenAmount) / params.totalSupply;
    return (underlyingToken, tokenBal, currentVariableDebt);
  }
}
