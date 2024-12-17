// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {IAssetHandler} from "../../core/interfaces/IAssetHandler.sol";
import {FunctionParameters} from "../../FunctionParameters.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/interfaces/IERC20Upgradeable.sol";
import {IAavePool, DataTypes} from "./IAavePool.sol";
import {IPoolDataProvider} from "./IPoolDataProvider.sol";
import {IAaveToken} from "./IAaveToken.sol";
import {IAavePriceOracle} from "./IAavePriceOracle.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {IPortfolio} from "../../core/interfaces/IPortfolio.sol";
import {ISwapRouter} from "./ISwapRouter.sol";
import "hardhat/console.sol";

contract AaveAssetHandler is IAssetHandler {
  address immutable DATA_PROVIDER_ADDRESS =
    0x7F23D86Ee20D869112572136221e173428DD740B;

  address immutable PRICE_ORACLE_ADDRESS =
    0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7;

  address immutable ROUTER_ADDRESS = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

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

    for (uint i = 0; i < portfolioTokens.length; i++) {
      try IAaveToken(portfolioTokens[i]).UNDERLYING_ASSET_ADDRESS() {
        lendTokens[lendCount++] = portfolioTokens[i];
      } catch {}
    }

    for (uint i = 0; i < assetsCount; ) {
      address asset = assets[i];
      (, , uint currentVariableDebt, , , , , , ) = IPoolDataProvider(
        DATA_PROVIDER_ADDRESS
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
    address comptroller
  ) external view returns (address[] memory borrowedTokens) {
    address[] memory assets = IAavePool(comptroller).getReservesList();
    uint assetsCount = assets.length; // Get the number of assets
    borrowedTokens = new address[](assetsCount); // Initialize the borrow tokens array
    uint256 borrowCount; // Counter for borrowed assets

    for (uint i = 0; i < assetsCount; ) {
      address asset = assets[i];
      (, , uint currentVariableDebt, , , , , , ) = IPoolDataProvider(
        DATA_PROVIDER_ADDRESS
      ).getUserReserveData(assets[i], account);
      DataTypes.ReserveDataLegacy memory data = IAavePool(comptroller)
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
   * @notice Returns the investible balance of a token for a specific vault.
   * @param _token The address of the token.
   * @param _vault The address of the vault.
   * @param _controller The address of the aave pool logic address.
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

  function loanProcessingDex(
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
    ) = swapAndTransferTransactionsUsingDex(vault, executor, flashData);

    // Handle repayment transactions
    MultiTransaction[] memory repayLoanTransaction = repayTransactions(
      executor,
      vault,
      flashData
    );

    // Handle withdrawal transactions
    MultiTransaction[] memory withdrawTransaction = withdrawTransactionsUsingDex(
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
    MultiTransaction[]
      memory withdrawTransaction = withdrawTransactions(
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
  function swapAndTransferTransactionsUsingDex(
    address vault,
    address executor,
    FunctionParameters.FlashLoanData memory flashData
  )
    internal
    view
    returns (MultiTransaction[] memory transactions, uint256 totalFlashAmount)
  {
    uint256 tokenLength = flashData.debtToken.length; // Get the number of debt tokens
    transactions = new MultiTransaction[](tokenLength * 3); // Initialize the transactions array
    uint count;

    // Loop through the debt tokens to handle swaps and transfers
    for (uint i; i < tokenLength; ) {
      // Check if the flash loan token is different from the debt token
      if (flashData.flashLoanToken != flashData.debtToken[i]) {
        // Transfer the flash loan token to the vault
        transactions[count].to = flashData.flashLoanToken;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("transfer(address,uint256)")),
          vault, // recipient
          flashData.flashLoanAmount[i]
        );
        count++;

        //Vault Approves the token to dex
        transactions[count].to = executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,bytes)")),
          flashData.flashLoanToken, // recipient
          approve(ROUTER_ADDRESS, flashData.flashLoanAmount[i]) //router
        );
        count++;

        // Swap the token using the solver handler
        transactions[count].to = executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,bytes)")),
          ROUTER_ADDRESS,
          swapTokens(
            flashData.flashLoanToken,
            flashData.debtToken[i],
            vault,
            flashData.flashLoanAmount[i],
            flashData.debtRepayAmount[i],
            3000
          )
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
        approve(flashData.poolAddress, amountToRepay)
      );
      count++;

      // Repay the debt using the protocol token
      transactions[count].to = executor;
      transactions[count].txData = abi.encodeWithSelector(
        bytes4(keccak256("vaultInteraction(address,bytes)")),
        flashData.poolAddress,
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
  function withdrawTransactionsUsingDex(
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
      amountLength * 3 * lendingTokens.length
    ); // Initialize the transactions array
    uint256 count; // Count for the transactions
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
      address _user = user;
      address _receiver = receiver;
      address _executor = executor;
      // Loop through the lending tokens to process each one
      for (uint j = 0; j < lendingTokens.length; ) {
        address underlying = IAaveToken(lendingTokens[j])
          .UNDERLYING_ASSET_ADDRESS();
        console.log("sellAmounts for pull from vault", sellAmounts[j]);
        // withdraw token of vault
        transactions[count].to = _executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,bytes)")),
          flashData.poolAddress,
          withdraw(underlying, _user, sellAmounts[j])
        );
        count++;

        // Approve the collateral underlying token for the protocol
        transactions[count].to = _executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,bytes)")),
          underlying,
          approve(ROUTER_ADDRESS, sellAmounts[j])
        );
        count++;

        //Swap the token and transfer it to the receiver
        transactions[count].to = _executor;
        transactions[count].txData = abi.encodeWithSelector(
          bytes4(keccak256("vaultInteraction(address,bytes)")),
          ROUTER_ADDRESS,
          swapTokens(
            underlying,
            flashData.flashLoanToken,
            _receiver,
            sellAmounts[j],
            0,
            3000
          )
        );
        count++;
        unchecked {
          ++j;
        }
      }
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
        console.log("sellAmounts for pull from vault", sellAmounts[j]);
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
    address _protocolToken,
    address[] memory lendTokens,
    uint256 _debtRepayAmount,
    uint256 feeUnit, //flash loan fee unit
    uint256 totalCollateral,
    uint256 bufferUnit //buffer unit for collateral amount
  ) public view returns (uint256[] memory amounts) {
    //Get borrow balance for _protocolToken
    address _underlyingToken = IAaveToken(_protocolToken)
      .UNDERLYING_ASSET_ADDRESS();
    (, , uint currentVariableDebt, , , , , , ) = IPoolDataProvider(
      DATA_PROVIDER_ADDRESS
    ).getUserReserveData(_underlyingToken, _user);

    console.log("_underlyingToken in contract", _underlyingToken);
    console.log("currentVariableDebt in contract", currentVariableDebt);

    //Convert underlyingToken to 18 decimal
    uint borrowBalance = currentVariableDebt *
      10 ** (18 - IERC20MetadataUpgradeable(_underlyingToken).decimals());

    console.log("borrowBalance in contract", borrowBalance);

    //Get price for _protocolToken token
    uint _oraclePrice = IAavePriceOracle(PRICE_ORACLE_ADDRESS).getAssetPrice(
      _underlyingToken
    );

    console.log("_oraclePrice in contract", _oraclePrice);
    //Get price for borrow Balance (amount * price)
    uint _tokenPrice = (borrowBalance * _oraclePrice) / 10 ** 18;
    console.log("_tokenPrice in contract", _tokenPrice);
    //calculateDebtAndPercentage
    (, uint256 percentageToRemove) = calculateDebtAndPercentage(
      _debtRepayAmount,
      feeUnit,
      _tokenPrice,
      borrowBalance,
      totalCollateral
    );
    console.log("percentageToRemove in contract", percentageToRemove);
    // Calculate the amounts to sell for each lending token
    amounts = calculateAmountsToSell(
      _user,
      lendTokens,
      percentageToRemove,
      bufferUnit
    );
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
      console.log("balance of lend token in contract", balance);
      uint256 amountToSell = (balance * percentageToRemove);
      console.log("amountToSell in contract", amountToSell);
      amountToSell = amountToSell + ((amountToSell * bufferUnit) / 100000); // Buffer of 0.001%
      console.log("amountToSell with buffer in contract", amountToSell);
      amounts[i] = amountToSell / 10 ** 18; // Calculate the amount to sell
      console.log("amounts[i] in contract", amounts[i]);
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
  ) external override {
    uint borrowedLength = borrowedTokens.length;
    address[] memory underlying = new address[](borrowedLength); // Array to store underlying tokens of borrowed assets
    uint256[] memory tokenBalance = new uint256[](borrowedLength); // Array to store balances of borrowed tokens
    uint256 totalFlashAmount; // Variable to track total flash loan amount
    underlying = new address[](borrowedLength);
    tokenBalance = new uint256[](borrowedLength);

    for (uint256 i; i < borrowedLength; ) {
      address _underlyingToken = IAaveToken(borrowedTokens[i])
        .UNDERLYING_ASSET_ADDRESS();
      (, , uint currentVariableDebt, , , , , , ) = IPoolDataProvider(
        DATA_PROVIDER_ADDRESS
      ).getUserReserveData(_underlyingToken, _vault);
      underlying[i] = _underlyingToken; // Get the underlying asset for the borrowed token
      tokenBalance[i] =
        (currentVariableDebt * _portfolioTokenAmount) /
        _totalSupply; // Calculate the portion of the debt to repay
      totalFlashAmount += repayData._flashLoanAmount[i]; // Accumulate the total flash loan amount
      unchecked {
        ++i;
      }
    }

    // Prepare the flash loan data to be used in the flash loan callback
    FunctionParameters.FlashLoanData memory flashData = FunctionParameters
      .FlashLoanData({
        flashLoanToken: repayData._flashLoanToken,
        debtToken: underlying,
        protocolTokens: borrowedTokens,
        bufferUnit: repayData._bufferUnit,
        solverHandler: repayData._solverHandler,
        poolAddress: repayData._factory,
        flashLoanAmount: repayData._flashLoanAmount,
        debtRepayAmount: tokenBalance,
        firstSwapData: repayData.firstSwapData,
        secondSwapData: repayData.secondSwapData,
        isMaxRepayment: false
      });

    // Initiate the flash loan from the Algebra pool
    address[] memory assets = new address[](1);
    assets[0] = repayData._flashLoanToken;
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = repayData._flashLoanAmount[0];
    uint256[] memory interestRateModes = new uint256[](1);
    interestRateModes[0] = 0;

    address receiver = _receiver;

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
        poolAddress: repayData._token0, //Need to change it and use single address
        flashLoanAmount: repayData._flashLoanAmount,
        debtRepayAmount: repayData._debtRepayAmount,
        firstSwapData: repayData.firstSwapData,
        secondSwapData: repayData.secondSwapData,
        isMaxRepayment: repayData.isMaxRepayment
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
}
