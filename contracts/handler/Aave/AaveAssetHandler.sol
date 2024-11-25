// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {IAssetHandler} from "../../core/interfaces/IAssetHandler.sol";
import {FunctionParameters} from "../../FunctionParameters.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/interfaces/IERC20Upgradeable.sol";
import {IPoolLogic} from "./IPoolLogic.sol";
import {IPoolDataProvider} from "./IPoolDataProvider.sol";

contract AaveAssetHandler is IAssetHandler {
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
   * @notice Encodes the data needed to borrow a specified amount of an asset from the Venus protocol
   * @param borrowAmount The amount of the asset to borrow.
   * @return data The encoded data for borrowing the specified amount.
   */
  function borrow(
    address,
    address asset,
    uint256 borrowAmount
  ) external pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("borrow(address,uint256,uint256,uint16,address)")),
      asset, // Encode the data to borrow the specified amount
      borrowAmount,
      2,
      0,
      msg.sender
    );
  }

  /**
   * @notice Encodes the data needed to repay a borrowed amount in the Venus protocol.
   * @param borrowAmount The amount of the borrowed asset to repay.
   * @return data The encoded data for repaying the specified amount.
   */
  function repay(
    address asset,
    uint256 borrowAmount
  ) public pure returns (bytes memory data) {
    data = abi.encodeWithSelector(
      bytes4(keccak256("repayBorrow(address,uint256,uint256,address)")),
      asset,
      borrowAmount, // Encode the data to repay the specified amount
      2,
      msg.sender
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
    address comptroller //aave pool logic address
  )
    public
    view
    returns (address[] memory lendTokens, address[] memory borrowTokens)
  {
    address[] memory assets = IPoolLogic(comptroller).getReservesList();
    uint assetsCount = assets.length; // Get the number of assets
    lendTokens = new address[](assetsCount); // Initialize the lend tokens array
    borrowTokens = new address[](assetsCount); // Initialize the borrow tokens array
    uint256 lendCount; // Counter for lent assets
    uint256 borrowCount; // Counter for borrowed assets

    for (uint i = 0; i < assetsCount; ) {
      address asset = assets[i];
      (
        uint currentATokenBalance,
        ,
        uint currentVariableDebt,
        ,
        ,
        ,
        ,
        ,

      ) = IPoolDataProvider(0x7F23D86Ee20D869112572136221e173428DD740B)
          .getUserReserveData(assets[i], account);
      if (currentATokenBalance > 0) {
        lendTokens[lendCount++] = address(asset); // Add the asset to the lend tokens if there is a balance
      }
      if (currentVariableDebt > 0) {
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
    address comptroller
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
    ) = IPoolLogic(comptroller).getUserAccountData(user);

    (
      tokenAddresses.lendTokens,
      tokenAddresses.borrowTokens
    ) = getAllProtocolAssets(user, comptroller);
  }

  function getBorrowedTokens(
    address account,
    address comptroller
  ) external view returns (address[] memory borrowedTokens) {
    address[] memory assets = IPoolLogic(comptroller).getReservesList();
    uint assetsCount = assets.length; // Get the number of assets
    borrowedTokens = new address[](assetsCount); // Initialize the borrow tokens array
    uint256 borrowCount; // Counter for borrowed assets

    for (uint i = 0; i < assetsCount; ) {
      address asset = assets[i];
      (
        uint currentATokenBalance,
        ,
        uint currentVariableDebt,
        ,
        ,
        ,
        ,
        ,

      ) = IPoolDataProvider(0x7F23D86Ee20D869112572136221e173428DD740B)
          .getUserReserveData(assets[i], account);
      if (currentVariableDebt > 0) {
        borrowedTokens[borrowCount++] = address(asset); // Add the asset to the borrow tokens if there is a balance
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
    address _controller
  ) external view returns (uint256) {
    // Get the account data for the vault
    (FunctionParameters.AccountData memory accountData, ) = getUserAccountData(
      _vault,
      _controller
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
        for (uint i = 0; i < swapTransactions.length;) {
            transactions[count].to = swapTransactions[i].to;
            transactions[count].txData = swapTransactions[i].txData;
            count++;
            unchecked { ++i; }
        }

        // Add repay transactions to the final array
        for (uint i = 0; i < repayLoanTransaction.length;) {
            transactions[count].to = repayLoanTransaction[i].to;
            transactions[count].txData = repayLoanTransaction[i].txData;
            count++;
            unchecked { ++i; }
        }

        // Add withdrawal transactions to the final array
        for (uint i = 0; i < withdrawTransaction.length;) {
            transactions[count].to = withdrawTransaction[i].to;
            transactions[count].txData = withdrawTransaction[i].txData;
            count++;
            unchecked { ++i; }
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
        returns (
            MultiTransaction[] memory transactions,
            uint256 totalFlashAmount
        )
    {
        uint256 tokenLength = flashData.debtToken.length; // Get the number of debt tokens
        transactions = new MultiTransaction[](tokenLength * 2); // Initialize the transactions array
        uint count;

        // Loop through the debt tokens to handle swaps and transfers
        for (uint i; i < tokenLength;) {
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
                    bytes4(
                        keccak256("multiTokenSwapAndTransfer(address,bytes)")
                    ),
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
            unchecked { ++i; }
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
        FunctionParameters.FlashLoanData memory flashData
    ) internal pure returns (MultiTransaction[] memory transactions) {
        uint256 tokenLength = flashData.debtToken.length; // Get the number of debt tokens
        transactions = new MultiTransaction[](tokenLength * 2); // Initialize the transactions array
        uint256 count;
        uint256 amountToRepay = flashData.isMaxRepayment
            ? type(uint256).max // If it's a max repayment, repay the max amount
            : flashData.debtRepayAmount[0]; // Otherwise, repay the debt amount
        // Loop through the debt tokens to handle repayments
        for (uint i = 0; i < tokenLength;) {
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
                repay(flashData.debtToken[i], amountToRepay)
            );
            count++;
            unchecked { ++i; }
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
        for (uint i = 0; i < amountLength;) {
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
            for (uint j = 0; j < lendingTokens.length;) {
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
                    bytes4(
                        keccak256("multiTokenSwapAndTransfer(address,bytes)")
                    ),
                    receiver,
                    flashData.secondSwapData[swapDataCount]
                );
                count++;
                swapDataCount++;
                unchecked { ++j; }
            }
            unchecked { ++i; }
        }
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
        uint256 feeUnit,//flash loan fee unit
        uint256 totalCollateral,
        uint256 bufferUnit//buffer unit for collateral amount
    ) public view returns (uint256[] memory amounts) {
        
    }
}
