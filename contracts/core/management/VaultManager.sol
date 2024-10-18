// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/token/ERC20/IERC20Upgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/security/ReentrancyGuardUpgradeable.sol";
import {TransferHelper} from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import {IVelvetSafeModule} from "../../vault/IVelvetSafeModule.sol";
import {IAssetManagementConfig} from "../../config/assetManagement/IAssetManagementConfig.sol";
import {IPortfolio} from "../interfaces/IPortfolio.sol";

import {FeeManager} from "./FeeManager.sol";
import {VaultConfig, ErrorLibrary} from "../config/VaultConfig.sol";
import {VaultCalculations, Dependencies} from "../calculations/VaultCalculations.sol";
import {MathUtils} from "../calculations/MathUtils.sol";
import {PortfolioToken} from "../token/PortfolioToken.sol";
import {IAllowanceTransfer} from "../interfaces/IAllowanceTransfer.sol";

import {IProtocolConfig} from "../../config/protocol/IProtocolConfig.sol";
import {FunctionParameters} from "../../FunctionParameters.sol";
import {TokenBalanceLibrary} from "../calculations/TokenBalanceLibrary.sol";
import {IBorrowManager} from "../interfaces/IBorrowManager.sol";
import {IAssetHandler} from "../interfaces/IAssetHandler.sol";

/**
 * @title VaultManager
 * @dev Extends functionality for managing deposits and withdrawals in the vault.
 * Combines configurations, calculations, fee handling, and token operations.
 */
abstract contract VaultManager is
  VaultConfig,
  VaultCalculations,
  FeeManager,
  PortfolioToken,
  ReentrancyGuardUpgradeable
{
  IAllowanceTransfer public immutable permit2 =
    IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);

  IProtocolConfig internal _protocolConfig;
  IBorrowManager internal _borrowManager;

  /**
   * @notice Initializes the VaultManager contract.
   * @dev This function sets up the ReentrancyGuard by calling its initializer. It's designed to be called
   *      during the contract initialization process to ensure that the non-reentrant modifier can be used
   *      safely in functions to prevent reentrancy attacks. This is a standard part of setting up contracts
   *      that handle external calls or token transfers, providing an additional layer of security.
   * @param protocolConfig The address of the protocol configuration contract.
   * @param borrowManager The address of borrowManager contract
   */
  function __VaultManager_init(
    address protocolConfig,
    address borrowManager
  ) internal onlyInitializing {
    _protocolConfig = IProtocolConfig(protocolConfig);
    _borrowManager = IBorrowManager(borrowManager);
    __ReentrancyGuard_init();
  }

  /**
   * @notice Allows the sender to deposit tokens into the fund through a multi-token deposit.
   *         The deposited tokens are added to the vault, and the user is minted portfolio tokens representing their share.
   * @param depositAmounts An array of amounts corresponding to each token the user wishes to deposit.
   * @param _minMintAmount The minimum amount of portfolio tokens the user expects to receive for their deposit, protecting against slippage.
   * @param _permit Batch permit data for token allowance.
   * @param _signature Signature corresponding to the permit batch.
   * @dev This function facilitates the process for the sender to deposit multiple tokens into the vault.
   *      It updates the vault and mints new portfolio tokens for the user.
   *      The nonReentrant modifier is used to prevent reentrancy attacks.
   */
  function multiTokenDeposit(
    uint256[] calldata depositAmounts,
    uint256 _minMintAmount,
    IAllowanceTransfer.PermitBatch calldata _permit,
    bytes calldata _signature
  ) external virtual nonReentrant {
    _multiTokenDepositWithPermit(
      msg.sender,
      depositAmounts,
      _minMintAmount,
      _permit,
      _signature
    );
  }

  /**
   * @notice Allows a specified depositor to deposit tokens into the fund through a multi-token deposit.
   *         The deposited tokens are added to the vault, and the user is minted portfolio tokens representing their share.
   * @param _depositFor The address of the user the deposit is being made for.
   * @param depositAmounts An array of amounts corresponding to each token the user wishes to deposit.
   * @param _minMintAmount The minimum amount of portfolio tokens the user expects to receive for their deposit, protecting against slippage.
   * @dev This function ensures that the depositor is making a multi-token deposit on behalf of another user.
   *      It handles the deposit process, updates the vault, and mints new portfolio tokens for the user.
   *      The nonReentrant modifier is used to prevent reentrancy attacks.
   */
  function multiTokenDepositFor(
    address _depositFor,
    uint256[] calldata depositAmounts,
    uint256 _minMintAmount
  ) external virtual nonReentrant {
    _multiTokenDeposit(_depositFor, depositAmounts, _minMintAmount);
  }

  /**
   * @notice Allows an approved user to withdraw portfolio tokens on behalf of another user.
   * @param _withdrawFor The address of the user for whom the withdrawal is being made.
   * @param _tokenReceiver The address of the user who receives the withdrawn tokens.
   * @param _portfolioTokenAmount The amount of portfolio tokens to withdraw.
   */
  function multiTokenWithdrawalFor(
    address _withdrawFor,
    address _tokenReceiver,
    uint256 _portfolioTokenAmount,
    FunctionParameters.withdrawRepayParams calldata repayData
  ) external virtual nonReentrant {
    _spendAllowance(_withdrawFor, msg.sender, _portfolioTokenAmount);
    address[] memory _emptyArray;
    _multiTokenWithdrawal(
      _withdrawFor,
      _tokenReceiver,
      _portfolioTokenAmount,
      _emptyArray,
      repayData
    );
  }

  /**
   * @notice Allows users to withdraw their deposit from the fund, receiving the underlying tokens.
   * @param _portfolioTokenAmount The amount of portfolio tokens to withdraw.
   */
  function multiTokenWithdrawal(
    uint256 _portfolioTokenAmount,
    FunctionParameters.withdrawRepayParams calldata repayData
  ) external virtual nonReentrant {
    address[] memory _emptyArray;
    _multiTokenWithdrawal(
      msg.sender,
      msg.sender,
      _portfolioTokenAmount,
      _emptyArray,
      repayData
    );
  }

  /**
   * @notice Allows users to perform an emergency withdrawal from the fund, receiving the underlying tokens.
   * @dev This function enables users to withdraw their portfolio tokens and receive the corresponding underlying tokens.
   * In the event of a transfer failure for any of the specified exemption tokens, the function will catch the error
   * and continue processing the remaining tokens, ensuring that the user can retrieve their assets even if some tokens
   * are non-transferable.
   * @param _portfolioTokenAmount The amount of portfolio tokens to withdraw.
   * @param _exemptionTokens An array of token addresses that are exempt from withdrawal if their transfer fails.
   */
  function emergencyWithdrawal(
    uint256 _portfolioTokenAmount,
    address[] memory _exemptionTokens,
    FunctionParameters.withdrawRepayParams calldata repayData
  ) external virtual nonReentrant {
    _multiTokenWithdrawal(
      msg.sender,
      msg.sender,
      _portfolioTokenAmount,
      _exemptionTokens,
      repayData
    );
  }

  /**
   * @notice Allows an authorized user to perform an emergency withdrawal on behalf of another user.
   * @dev This function enables an authorized user to withdraw portfolio tokens on behalf of another user and
   * send the corresponding underlying tokens to a specified receiver address. If the transfer of any of the
   * specified exemption tokens fails, the function will catch the error and continue processing the remaining
   * tokens, ensuring that the assets can be retrieved even if some tokens are non-transferable.
   * @param _withdrawFor The address of the user on whose behalf the withdrawal is being performed.
   * @param _tokenReceiver The address that will receive the underlying tokens.
   * @param _portfolioTokenAmount The amount of portfolio tokens to withdraw.
   * @param _exemptionTokens An array of token addresses that are exempt from withdrawal if their transfer fails.
   */

  function emergencyWithdrawalFor(
    address _withdrawFor,
    address _tokenReceiver,
    uint256 _portfolioTokenAmount,
    address[] memory _exemptionTokens,
    FunctionParameters.withdrawRepayParams calldata repayData
  ) external virtual nonReentrant {
    _spendAllowance(_withdrawFor, msg.sender, _portfolioTokenAmount);
    _multiTokenWithdrawal(
      _withdrawFor,
      _tokenReceiver,
      _portfolioTokenAmount,
      _exemptionTokens,
      repayData
    );
  }

  /**
   * @notice Allows the rebalancer contract to pull tokens from the vault.
   * @dev Executes a token transfer via the VelvetSafeModule, ensuring secure transaction execution.
   * @param _token The token to be pulled from the vault.
   * @param _amount The amount of the token to pull.
   * @param _to The destination address for the tokens.
   */
  function pullFromVault(
    address _token,
    uint256 _amount,
    address _to
  ) external onlyRebalancerContract {
    _pullFromVault(_token, _amount, _to);
  }

  /**
   * @notice Internal function to handle the withdrawal of tokens from the vault.
   * @param _token The token to be pulled from the vault.
   * @param _amount The amount of the token to pull.
   * @param _to The destination address for the tokens.
   */
  function _pullFromVault(
    address _token,
    uint256 _amount,
    address _to
  ) internal {
    // Prepare the data for ERC20 token transfer
    bytes memory inputData = abi.encodeWithSelector(
      IERC20Upgradeable.transfer.selector,
      _to,
      _amount
    );

    // Execute the transfer through the safe module and check for success
    (, bytes memory data) = IVelvetSafeModule(safeModule).executeWallet(
      _token,
      inputData
    );

    // Ensure the transfer was successful; revert if not
    if (!(data.length == 0 || abi.decode(data, (bool)))) {
      revert ErrorLibrary.TransferFailed();
    }
  }

  /**
   * @dev Claims rewards for a target address by executing a transfer through the safe module.
   * Only the rebalancer contract is allowed to call this function.
   * @param _target The address where the rewards are claimed from
   * @param _claimCalldata The calldata to be used for the claim.
   */
  function vaultInteraction(
    address _target,
    bytes memory _claimCalldata
  ) external onlyRebalancerContract {
    _vaultInteraction(_target, _claimCalldata);
  }

  /**
   * @notice Internal function to interact with the vault.
   * @dev Executes the interaction through the safe module and checks for success.
   * @param _target The address where the interaction is targeted.
   * @param _claimCalldata The calldata to be used for the interaction.
   */
  function _vaultInteraction(
    address _target,
    bytes memory _claimCalldata
  ) internal {
    // Execute the transfer through the safe module and check for success
    (bool success, ) = IVelvetSafeModule(safeModule).executeWallet(
      _target,
      _claimCalldata
    );

    if (!success) revert ErrorLibrary.CallFailed();
  }

  /**
   * @notice Internal function to handle the multi-token deposit logic.
   * @param _depositFor The address of the user the deposit is being made for.
   * @param depositAmounts An array of amounts corresponding to each token the user wishes to deposit.
   * @param _minMintAmount The minimum amount of portfolio tokens the user expects to receive for their deposit, protecting against slippage.
   * @param _permit Batch permit data for token allowance.
   * @param _signature Signature corresponding to the permit batch.
   */
  function _multiTokenDepositWithPermit(
    address _depositFor,
    uint256[] calldata depositAmounts,
    uint256 _minMintAmount,
    IAllowanceTransfer.PermitBatch calldata _permit,
    bytes calldata _signature
  ) internal virtual {
    if (_permit.spender != address(this)) revert ErrorLibrary.InvalidSpender();

    // Verify that the user is allowed to deposit and that the system is not paused.
    _beforeDepositCheck(_depositFor, tokens.length);
    // Charge any applicable fees.
    _chargeFees(_depositFor);

    // Process the multi-token deposit, adjusting for vault token ratios.
    uint256 _depositRatio = _multiTokenTransferWithPermit(
      depositAmounts,
      _permit,
      _signature,
      msg.sender
    );
    _depositAndMint(_depositFor, _minMintAmount, _depositRatio);
  }

  /**
   * @notice Internal function to handle the multi-token deposit logic.
   * @param _depositFor The address of the user the deposit is being made for.
   * @param depositAmounts An array of amounts corresponding to each token the user wishes to deposit.
   * @param _minMintAmount The minimum amount of portfolio tokens the user expects to receive for their deposit, protecting against slippage.
   */
  function _multiTokenDeposit(
    address _depositFor,
    uint256[] calldata depositAmounts,
    uint256 _minMintAmount
  ) internal virtual {
    // Verify that the user is allowed to deposit and that the system is not paused.
    _beforeDepositCheck(_depositFor, tokens.length);
    // Charge any applicable fees.
    _chargeFees(_depositFor);

    // Process the multi-token deposit, adjusting for vault token ratios.
    uint256 _depositRatio = _multiTokenTransfer(msg.sender, depositAmounts);
    _depositAndMint(_depositFor, _minMintAmount, _depositRatio);
  }

  /**
   * @notice Handles the deposit and minting process for a given user.
   * @param _depositFor The address for which the deposit is made.
   * @param _minMintAmount The minimum amount of portfolio tokens to mint for the user.
   * @param _depositRatio The ratio used to calculate the amount of tokens to mint based on the deposit.
   */
  function _depositAndMint(
    address _depositFor,
    uint256 _minMintAmount,
    uint256 _depositRatio
  ) internal {
    uint256 _totalSupply = totalSupply();

    uint256 tokenAmount;

    IAssetManagementConfig _assetManagementConfig = assetManagementConfig();
    // If the total supply is zero, this is the first deposit, and tokens are minted based on the initial amount.
    if (_totalSupply == 0) {
      tokenAmount = _assetManagementConfig.initialPortfolioAmount();
      // Reset the high watermark to zero if it's not the first deposit.
      feeModule().resetHighWaterMark();
    } else {
      // Calculate the amount of portfolio tokens to mint based on the deposit.
      tokenAmount = _getTokenAmountToMint(_depositRatio, _totalSupply,_assetManagementConfig);
    }

    // Mint the calculated portfolio tokens to the user, applying any cooldown periods.
    tokenAmount = _mintTokenAndSetCooldown(_depositFor, tokenAmount,_assetManagementConfig);

    // Ensure the minted amount meets the user's minimum expectation to mitigate slippage.
    _verifyUserMintedAmount(tokenAmount, _minMintAmount);

    // Notify listeners of the deposit event.
    emit Deposited(
      address(this),
      _depositFor,
      tokenAmount,
      balanceOf(_depositFor)
    );
  }

  /**
   * @notice Internal function to handle the multi-token withdrawal logic.
   * @param _withdrawFor The address of the user making the withdrawal.
   * @param _tokenReceiver The address to receive the withdrawn tokens.
   * @param _portfolioTokenAmount The amount of portfolio tokens to burn for withdrawal.
   * @param _exemptionTokens The array of tokens that are exempt from withdrawal if transfer fails.
   * @param repayData Struct containing data for repaying borrows.
   */
  function _multiTokenWithdrawal(
    address _withdrawFor,
    address _tokenReceiver,
    uint256 _portfolioTokenAmount,
    address[] memory _exemptionTokens,
    FunctionParameters.withdrawRepayParams calldata repayData
  ) internal virtual {
    // Retrieve the list of tokens currently in the portfolio.
    address[] memory portfolioTokens = tokens;
    uint256 portfolioTokenLength = portfolioTokens.length;

    // Perform pre-withdrawal checks, including balance and cooldown verification.
    _performWithdrawalChecks(
      _withdrawFor,
      _portfolioTokenAmount,
      portfolioTokenLength,
      _exemptionTokens
    );

    // Calculate the total supply of portfolio tokens for proportion calculations.
    uint256 totalSupplyPortfolio = totalSupply();
    // Burn the user's portfolio tokens and calculate the adjusted withdrawal amount post-fees.
    _portfolioTokenAmount = _burnWithdraw(_withdrawFor, _portfolioTokenAmount);

    // Repay any outstanding borrows
    _borrowManager.repayBorrow(
      _portfolioTokenAmount,
      totalSupplyPortfolio,
      repayData
    );

    // Process the withdrawal for each token and get the withdrawal amounts
    uint256[] memory userWithdrawalAmounts = _processTokenWithdrawals(
      _tokenReceiver,
      _portfolioTokenAmount,
      totalSupplyPortfolio,
      portfolioTokens,
      _exemptionTokens
    );

    // Notify listeners of the withdrawal event.
    emit Withdrawn(
      _withdrawFor,
      _portfolioTokenAmount,
      address(this),
      portfolioTokens,
      balanceOf(_withdrawFor),
      userWithdrawalAmounts
    );
  }

  /**
   * @notice Performs all necessary checks before withdrawal.
   * @param _withdrawFor The address of the user making the withdrawal.
   * @param _portfolioTokenAmount The amount of portfolio tokens to withdraw.
   * @param portfolioTokenLength The number of tokens in the portfolio.
   * @param _exemptionTokens The array of tokens that are exempt from withdrawal if transfer fails.
   */
  function _performWithdrawalChecks(
    address _withdrawFor,
    uint256 _portfolioTokenAmount,
    uint256 portfolioTokenLength,
    address[] memory _exemptionTokens
  ) private {
    // Perform pre-withdrawal checks, including balance and cooldown verification.
    _beforeWithdrawCheck(
      _withdrawFor,
      IPortfolio(address(this)),
      _portfolioTokenAmount,
      portfolioTokenLength,
      _exemptionTokens
    );
    // Validate the cooldown period of the user.
    _checkCoolDownPeriod(_withdrawFor);
    // Charge any applicable fees before withdrawal.
    _chargeFees(_withdrawFor);
  }

  /**
   * @notice Processes the withdrawal for all tokens in the portfolio.
   * @param _tokenReceiver The address to receive the withdrawn tokens.
   * @param _portfolioTokenAmount The amount of portfolio tokens being withdrawn.
   * @param totalSupplyPortfolio The total supply of portfolio tokens.
   * @param portfolioTokens The array of token addresses in the portfolio.
   * @param _exemptionTokens The array of tokens that are exempt from withdrawal if transfer fails.
   * @return An array of withdrawal amounts for each token.
   */
  function _processTokenWithdrawals(
    address _tokenReceiver,
    uint256 _portfolioTokenAmount,
    uint256 totalSupplyPortfolio,
    address[] memory portfolioTokens,
    address[] memory _exemptionTokens
  ) private returns (uint256[] memory) {
    uint256 portfolioTokenLength = portfolioTokens.length;
    uint256[] memory userWithdrawalAmounts = new uint256[](
      portfolioTokenLength
    );
    uint256 exemptionIndex = 0;

    // Get controllers data for the vault
    TokenBalanceLibrary.ControllerData[]
      memory controllersData = TokenBalanceLibrary.getControllersData(
        vault,
        _protocolConfig
      );

    for (uint256 i; i < portfolioTokenLength; i++) {
      (userWithdrawalAmounts[i], exemptionIndex) = _processTokenWithdrawal(
        portfolioTokens[i],
        _tokenReceiver,
        _portfolioTokenAmount,
        totalSupplyPortfolio,
        _exemptionTokens,
        exemptionIndex,
        controllersData
      );
    }

    return userWithdrawalAmounts;
  }

  /**
   * @notice Processes the withdrawal for a single token.
   * @param _token The address of the token to withdraw.
   * @param _tokenReceiver The address to receive the withdrawn tokens.
   * @param _portfolioTokenAmount The amount of portfolio tokens being withdrawn.
   * @param totalSupplyPortfolio The total supply of portfolio tokens.
   * @param _exemptionTokens The array of tokens that are exempt from withdrawal if transfer fails.
   * @param exemptionIndex The current index in the exemption tokens array.
   * @param controllersData The array of controller data for balance calculations.
   * @return The amount of tokens withdrawn and the updated exemption index.
   */
  function _processTokenWithdrawal(
    address _token,
    address _tokenReceiver,
    uint256 _portfolioTokenAmount,
    uint256 totalSupplyPortfolio,
    address[] memory _exemptionTokens,
    uint256 exemptionIndex,
    TokenBalanceLibrary.ControllerData[] memory controllersData
  ) private returns (uint256, uint256) {
    // Calculate the proportion of each token to return based on the burned portfolio tokens.
    uint256 tokenBalance = TokenBalanceLibrary._getAdjustedTokenBalance(
      _token,
      vault,
      _protocolConfig,
      controllersData
    );
    tokenBalance =
      (tokenBalance * _portfolioTokenAmount) /
      totalSupplyPortfolio;

    // Prepare the data for ERC20 token transfer
    bytes memory inputData = abi.encodeWithSelector(
      IERC20Upgradeable.transfer.selector,
      _tokenReceiver,
      tokenBalance
    );

    // Execute the transfer through the safe module and check for success
    try IVelvetSafeModule(safeModule).executeWallet(_token, inputData) {
      // Check if the token balance is zero and the current token is not an exemption token, revert with an error.
      // This check is necessary because if there is any rebase token or the protocol sets the balance to zero,
      // we need to be able to withdraw other tokens. The balance for a withdrawal should always be >0,
      // except when the user accepts to lose this token.
      if (tokenBalance == 0 && _exemptionTokens[exemptionIndex] != _token)
        revert ErrorLibrary.WithdrawalAmountIsSmall();
      return (tokenBalance, exemptionIndex);
    } catch {
      // Checking if exception token was mentioned in exceptionToken array
      if (_exemptionTokens[exemptionIndex] != _token) {
        revert ErrorLibrary.InvalidExemptionTokens();
      }
      return (0, exemptionIndex + 1);
    }
  }

  /**
   * @notice Transfers tokens from the user to the vault using permit2 transferfrom.
   * @dev Utilizes `TransferHelper` for secure token transfer from user to vault.
   * @param _token Address of the token to be transferred.
   * @param _depositAmount Amount of the token to be transferred.
   * @param _from The address from which the tokens are transferred.
   */
  function _transferToVaultWithPermit(
    address _from,
    address _token,
    uint256 _depositAmount
  ) internal {
    permit2.transferFrom(
      _from,
      vault,
      MathUtils.safe160(_depositAmount),
      _token
    );
  }

  /**
   * @notice Transfers tokens from the user to the vault.
   * @dev Utilizes `TransferHelper` for secure token transfer from user to vault.
   * @param _token Address of the token to be transferred.
   * @param _depositAmount Amount of the token to be transferred.
   */
  function _transferToVault(
    address _from,
    address _token,
    uint256 _depositAmount
  ) internal {
    TransferHelper.safeTransferFrom(_token, _from, vault, _depositAmount);
  }

  /**
   * @notice Processes multi-token deposits by calculating the minimum deposit ratio.
   * @dev Ensures that the deposited token amounts align with the current vault token ratios.
   * @param depositAmounts Array of amounts for each token the user wants to deposit.
   *  @param _permit Batch permit data for token allowance.
   * @param _signature Signature corresponding to the permit batch.
   * @param _from The address from which the tokens are transferred.
   * @return The minimum deposit ratio after deposits.
   */
  function _multiTokenTransferWithPermit(
    uint256[] calldata depositAmounts,
    IAllowanceTransfer.PermitBatch calldata _permit,
    bytes calldata _signature,
    address _from
  ) internal returns (uint256) {
    // Validate deposit amounts and get initial token balances
    (
      uint256 amountLength,
      address[] memory portfolioTokens,
      uint256[] memory tokenBalancesBefore,
      TokenBalanceLibrary.ControllerData[] memory controllersData
    ) = _validateAndGetBalances(depositAmounts);

    try permit2.permit(msg.sender, _permit, _signature) {
      // No further implementation needed if permit succeeds
    } catch {
      // Check allowance for each token in depositAmounts array
      uint256 depositAmountsLength = depositAmounts.length;
      for (uint256 i; i < depositAmountsLength; i++) {
        if (
          IERC20Upgradeable(portfolioTokens[i]).allowance(
            msg.sender,
            address(this)
          ) < depositAmounts[i]
        ) revert ErrorLibrary.InsufficientAllowance();
      }
    }

    // Handles the token transfer and minRatio calculations
    return
      _handleTokenTransfer(
        _from,
        amountLength,
        depositAmounts,
        portfolioTokens,
        tokenBalancesBefore,
        true,
        controllersData
      );
  }

  /**
   * @notice Processes multi-token deposits by calculating the minimum deposit ratio.
   * @dev Ensures that the deposited token amounts align with the current vault token ratios.
   * @param _from The address from which the tokens are transferred.
   * @param depositAmounts Array of amounts for each token the user wants to deposit.
   * @return The minimum deposit ratio after deposits.
   */
  function _multiTokenTransfer(
    address _from,
    uint256[] calldata depositAmounts
  ) internal returns (uint256) {
    // Validate deposit amounts and get initial token balances
    (
      uint256 amountLength,
      address[] memory portfolioTokens,
      uint256[] memory tokenBalancesBefore,
      TokenBalanceLibrary.ControllerData[] memory controllersData
    ) = _validateAndGetBalances(depositAmounts);

    // Handles the token transfer and minRatio calculations
    return
      _handleTokenTransfer(
        _from,
        amountLength,
        depositAmounts,
        portfolioTokens,
        tokenBalancesBefore,
        false,
        controllersData
      );
  }

  /**
   * @notice Validates deposit amounts and retrieves initial token balances.
   * @param depositAmounts Array of deposit amounts for each token.
   * @return amountLength The length of the deposit amounts array.
   * @return portfolioTokens Array of portfolio tokens.
   * @return tokenBalancesBefore Array of token balances before transfer.
   */
  function _validateAndGetBalances(
    uint256[] calldata depositAmounts
  )
    internal
    view
    returns (
      uint256,
      address[] memory,
      uint256[] memory,
      TokenBalanceLibrary.ControllerData[] memory
    )
  {
    uint256 amountLength = depositAmounts.length;
    address[] memory portfolioTokens = tokens;

    // Validate the deposit amounts match the number of tokens in the vault
    if (amountLength != portfolioTokens.length) {
      revert ErrorLibrary.InvalidDepositInputLength();
    }

    // Get current token balances in the vault for ratio calculations
    (
      uint256[] memory tokenBalancesBefore,
      TokenBalanceLibrary.ControllerData[] memory controllersData
    ) = TokenBalanceLibrary.getTokenBalancesOf(
        portfolioTokens,
        vault,
        _protocolConfig
      );

    return (
      amountLength,
      portfolioTokens,
      tokenBalancesBefore,
      controllersData
    );
  }

  /**
   * @notice Handles the token transfer and minRatio calculations.
   * @param _from Address from which tokens are transferred.
   * @param amountLength The length of the deposit amounts array.
   * @param depositAmounts Array of deposit amounts for each token.
   * @param portfolioTokens Array of portfolio tokens.
   * @param tokenBalancesBefore Array of token balances before transfer.
   * @param usePermit Boolean flag to use permit for transfer.
   * @return The minimum ratio after transfer.
   */
  function _handleTokenTransfer(
    address _from,
    uint256 amountLength,
    uint256[] calldata depositAmounts,
    address[] memory portfolioTokens,
    uint256[] memory tokenBalancesBefore,
    bool usePermit,
    TokenBalanceLibrary.ControllerData[] memory controllersData
  ) internal returns (uint256) {
    if (totalSupply() == 0) {
      return
        _handleEmptyVaultTransfer(
          _from,
          amountLength,
          depositAmounts,
          portfolioTokens,
          tokenBalancesBefore,
          usePermit
        );
    }

    uint256 _minRatio = _calculateMinRatio(
      amountLength,
      depositAmounts,
      tokenBalancesBefore
    );
    return
      _executeTransfers(
        _from,
        amountLength,
        portfolioTokens,
        tokenBalancesBefore,
        _minRatio,
        usePermit,
        controllersData
      );
  }

  /**
   * @notice Handles token transfers for an empty vault.
   * @dev This function is called when the total supply is zero, indicating an empty vault.
   * It transfers the specified amounts of each token from the user to the vault.
   * @param _from The address from which tokens are transferred.
   * @param amountLength The number of tokens to be transferred.
   * @param depositAmounts An array of amounts to be deposited for each token.
   * @param portfolioTokens An array of token addresses in the portfolio.
   * @param tokenBalancesBefore An array of token balances before the transfer.
   * @param usePermit A boolean indicating whether to use permit for transfers.
   * @return uint256 Returns 0 as there's no ratio to calculate for an empty vault.
   */
  function _handleEmptyVaultTransfer(
    address _from,
    uint256 amountLength,
    uint256[] calldata depositAmounts,
    address[] memory portfolioTokens,
    uint256[] memory tokenBalancesBefore,
    bool usePermit
  ) private returns (uint256) {
    uint256[] memory depositedAmounts = new uint256[](amountLength);

    for (uint256 i; i < amountLength; i++) {
      uint256 depositAmount = depositAmounts[i];
      if (depositAmount == 0) revert ErrorLibrary.AmountCannotBeZero();
      address token = portfolioTokens[i];
      _transferToken(_from, token, depositAmount, usePermit);

      if (
        TokenBalanceLibrary._getTokenBalanceOf(
          token,
          vault
        ) <= tokenBalancesBefore[i]
      ) {
        revert ErrorLibrary.TransferFailed();
      }
      depositedAmounts[i] = depositAmount;
    }

    emit UserDepositedAmounts(depositedAmounts, portfolioTokens);
    return 0;
  }

  /**
   * @notice Calculates the minimum ratio among all deposit amounts and their corresponding vault balances.
   * @dev This function iterates through all tokens and calculates the ratio of deposit amount to vault balance,
   * then returns the minimum ratio found.
   * @param amountLength The number of tokens to process.
   * @param depositAmounts An array of deposit amounts for each token.
   * @param tokenBalancesBefore An array of token balances in the vault before the deposit.
   * @return uint256 The minimum ratio found among all tokens.
   */
  function _calculateMinRatio(
    uint256 amountLength,
    uint256[] calldata depositAmounts,
    uint256[] memory tokenBalancesBefore
  ) private pure returns (uint256) {
    uint256 _minRatio = type(uint256).max;
    for (uint256 i = 0; i < amountLength; i++) {
      uint256 _currentRatio = _getDepositToVaultBalanceRatio(
        depositAmounts[i],
        tokenBalancesBefore[i]
      );
      _minRatio = MathUtils._min(_currentRatio, _minRatio);
    }
    return _minRatio;
  }

  /**
   * @notice Executes token transfers from the user to the vault based on the calculated minimum ratio.
   * @dev This function transfers tokens, updates balances, and calculates the new minimum ratio after transfers.
   * @param _from The address from which tokens are transferred.
   * @param amountLength The number of tokens to process.
   * @param portfolioTokens An array of token addresses in the portfolio.
   * @param tokenBalancesBefore An array of token balances before the transfer.
   * @param _minRatio The minimum ratio calculated before transfers.
   * @param usePermit A boolean indicating whether to use permit for transfers.
   * @param controllersData An array of controller data for balance calculations.
   * @return uint256 The new minimum ratio after all transfers are completed.
   */
  function _executeTransfers(
    address _from,
    uint256 amountLength,
    address[] memory portfolioTokens,
    uint256[] memory tokenBalancesBefore,
    uint256 _minRatio,
    bool usePermit,
    TokenBalanceLibrary.ControllerData[] memory controllersData
  ) private returns (uint256) {
    uint256[] memory depositedAmounts = new uint256[](amountLength);
    uint256 _minRatioAfterTransfer = type(uint256).max;

    for (uint256 i; i < amountLength; i++) {
      address token = portfolioTokens[i];
      uint256 tokenBalanceBefore = tokenBalancesBefore[i];
      uint256 transferAmount = (_minRatio * tokenBalanceBefore) /
        ONE_ETH_IN_WEI;
      depositedAmounts[i] = transferAmount;

      _transferToken(_from, token, transferAmount, usePermit);

      uint256 tokenBalanceAfter = TokenBalanceLibrary._getAdjustedTokenBalance(
        token,
        vault,
        _protocolConfig,
        controllersData
      );
      uint256 currentRatio = _getDepositToVaultBalanceRatio(
        tokenBalanceAfter - tokenBalanceBefore,
        tokenBalanceAfter
      );
      _minRatioAfterTransfer = MathUtils._min(
        currentRatio,
        _minRatioAfterTransfer
      );
    }

    emit UserDepositedAmounts(depositedAmounts, portfolioTokens);
    return _minRatioAfterTransfer;
  }

  /**
   * @notice Transfers a specified amount of tokens from a user to the vault.
   * @dev This function chooses between permit and regular transfer based on the usePermit parameter.
   * @param _from The address from which tokens are transferred.
   * @param token The address of the token to transfer.
   * @param amount The amount of tokens to transfer.
   * @param usePermit A boolean indicating whether to use permit for the transfer.
   */
  function _transferToken(
    address _from,
    address token,
    uint256 amount,
    bool usePermit
  ) private {
    if (usePermit) {
      _transferToVaultWithPermit(_from, token, amount);
    } else {
      _transferToVault(_from, token, amount);
    }
  }
}
