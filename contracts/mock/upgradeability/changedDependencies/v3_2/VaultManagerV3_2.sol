// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/token/ERC20/IERC20Upgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/security/ReentrancyGuardUpgradeable.sol";

import {IVelvetSafeModule} from "../../../../vault/IVelvetSafeModule.sol";

import {IPortfolio} from "../../../../core/interfaces/IPortfolio.sol";

import {FeeManager} from "../../../../core/management/FeeManager.sol";
import {VaultConfig, ErrorLibrary} from "../../../../core/config/VaultConfig.sol";
import {VaultCalculations, Dependencies} from "../../../../core/calculations/VaultCalculations.sol";
import {MathUtils} from "../../../../core/calculations/MathUtils.sol";

import {PortfolioTokenV3_2} from "./PortfolioTokenV3_2.sol";
import {IProtocolConfig} from "../../../../config/protocol/IProtocolConfig.sol";

import {IAllowanceTransfer} from "../../../../core/interfaces/IAllowanceTransfer.sol";
import {TokenBalanceLibrary} from "../../../../core/calculations/TokenBalanceLibrary.sol";
import {IBorrowManager} from "../../../../core/interfaces/IBorrowManager.sol";
import {FunctionParameters} from "../../../../FunctionParameters.sol";

/**
 * @title VaultManager
 * @dev Extends functionality for managing deposits and withdrawals in the vault.
 * Combines configurations, calculations, fee handling, and token operations.
 */
abstract contract VaultManagerV3_2 is
    VaultConfig,
    VaultCalculations,
    FeeManager,
    PortfolioTokenV3_2,
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
     * @notice Allows a specified depositor to deposit tokens into the fund through a multi-token deposit.
     *         The deposited tokens are added to the vault, and the user is minted portfolio tokens representing their share.
     * @param _depositor The address of the user making the deposit.
     * @param _depositFor The address of the user the deposit is being made for.
     * @param depositAmounts An array of amounts corresponding to each token the user wishes to deposit.
     * @param _minMintAmount The minimum amount of portfolio tokens the user expects to receive for their deposit, protecting against slippage.
     * @param _permit Batch permit data for token allowance.
     * @param _signature Signature corresponding to the permit batch.
     */
    function multiTokenDepositFor(
        address _depositor,
        address _depositFor,
        uint256[] calldata depositAmounts,
        uint256 _minMintAmount,
        IAllowanceTransfer.PermitBatch calldata _permit,
        bytes calldata _signature
    ) external virtual nonReentrant {
        _multiTokenDeposit(
            _depositor,
            _depositFor,
            depositAmounts,
            _minMintAmount,
            _permit,
            _signature
        );
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
        _multiTokenDeposit(
            msg.sender,
            msg.sender,
            depositAmounts,
            _minMintAmount,
            _permit,
            _signature
        );
    }

    /**
     * @notice Internal function to handle the multi-token deposit logic.
     * @param _depositor The address of the user making the deposit.
     * @param _depositFor The address of the user the deposit is being made for.
     * @param depositAmounts An array of amounts corresponding to each token the user wishes to deposit.
     * @param _minMintAmount The minimum amount of portfolio tokens the user expects to receive for their deposit, protecting against slippage.
     * @param _permit Batch permit data for token allowance.
     * @param _signature Signature corresponding to the permit batch.
     */
    function _multiTokenDeposit(
        address _depositor,
        address _depositFor,
        uint256[] calldata depositAmounts,
        uint256 _minMintAmount,
        IAllowanceTransfer.PermitBatch calldata _permit,
        bytes calldata _signature
    ) internal virtual {
        if (_permit.spender != address(this))
            revert ErrorLibrary.InvalidSpender();

        // Verify that the user is allowed to deposit and that the system is not paused.
        _beforeDepositCheck(_depositFor, tokens.length);
        // Charge any applicable fees.
        _chargeFees(_depositFor);

        permit2.permit(_depositor, _permit, _signature);

        // Process the multi-token deposit, adjusting for vault token ratios.
        uint256 _depositRatio = _multiTokenTransfer(_depositor, depositAmounts);
        uint256 _totalSupply = totalSupply();

        uint256 tokenAmount;

        // If the total supply is zero, this is the first deposit, and tokens are minted based on the initial amount.
        if (_totalSupply == 0) {
            tokenAmount = assetManagementConfig().initialPortfolioAmount();
            // Reset the high watermark to zero if it's not the first deposit.
            feeModule().resetHighWaterMark();
        } else {
            // Calculate the amount of portfolio tokens to mint based on the deposit.
            tokenAmount = _getTokenAmountToMint(_depositRatio, _totalSupply,assetManagementConfig());
        }

        // Mint the calculated portfolio tokens to the user, applying any cooldown periods.
        tokenAmount = _mintTokenAndSetCooldown(_depositFor, tokenAmount);

        // Ensure the minted amount meets the user's minimum expectation to mitigate slippage.
        _verifyUserMintedAmount(tokenAmount, _minMintAmount);

        uint256 userBalanceAfterDeposit = balanceOf(_depositFor);
        // Notify listeners of the deposit event.
        emit Deposited(
            address(this),
            _depositFor,
            tokenAmount,
            userBalanceAfterDeposit
        );
    }

    /**
     * @notice Allows users to withdraw their deposit from the fund, receiving the underlying tokens
     *         in proportion to their portfolio token burn. This can involve converting to a single asset or
     *         withdrawing as a basket of assets.
     * @param _portfolioTokenAmount The amount of portfolio tokens the user wishes to burn for withdrawal.
     * @dev Validates the withdrawal request, burns the portfolio tokens, and transfers the underlying
     *      tokens back to the user.
     */
    function multiTokenWithdrawal(
        uint256 _portfolioTokenAmount,
        FunctionParameters.withdrawRepayParams calldata repayData
    ) external virtual nonReentrant {
        // Retrieve the list of tokens currently in the portfolio.
        address[] memory portfolioTokens = tokens;

        address[] memory emptyArray;

        uint256 portfolioTokenLength = portfolioTokens.length;

        // Perform pre-withdrawal checks, including balance and cooldown verification.
        _beforeWithdrawCheck(
            msg.sender,
            IPortfolio(address(this)),
            _portfolioTokenAmount,
            portfolioTokenLength,
            emptyArray
        );
        // Validate the cooldown period of the user.
        _checkCoolDownPeriod(msg.sender);
        // Charge any applicable fees before withdrawal.
        _chargeFees(msg.sender);

        // Calculate the total supply of portfolio tokens for proportion calculations.
        uint256 totalSupplyPortfolio = totalSupply();
        // Burn the user's portfolio tokens and calculate the adjusted withdrawal amount post-fees.
        _portfolioTokenAmount = _burnWithdraw(
            msg.sender,
            _portfolioTokenAmount
        );

        uint256[] memory userWithdrawalAmounts = new uint256[](
            portfolioTokenLength
        );

        //Get controllers data for the vault
        TokenBalanceLibrary.ControllerData[] memory controllersData = TokenBalanceLibrary.getControllersData(vault, _protocolConfig);

        for (uint256 i; i < portfolioTokenLength; i++) {
            address _token = portfolioTokens[i];
            // Calculate the proportion of each token to return based on the burned portfolio tokens.
            uint256 tokenBalance = TokenBalanceLibrary._getAdjustedTokenBalance(
                portfolioTokens[i],
                vault,
                _protocolConfig,
                controllersData
            );
            userWithdrawalAmounts[i] = tokenBalance;
            tokenBalance =
                (tokenBalance * _portfolioTokenAmount) /
                totalSupplyPortfolio;
            // Transfer each token's proportional amount from the vault to the user.
            _pullFromVault(_token, tokenBalance, msg.sender);
        }

        uint256 userBalanceAfterWithdrawal = balanceOf(msg.sender);

        // Notify listeners of the withdrawal event.
        emit Withdrawn(
            msg.sender,
            _portfolioTokenAmount,
            address(this),
            portfolioTokens,
            userBalanceAfterWithdrawal,
            userWithdrawalAmounts
        );
    }

    /**
     * @notice Transfers specified token amount from the vault to a given address.
     * @dev Executes a token transfer via the VelvetSafeModule, ensuring secure transaction execution.
     * @param _token The token address to transfer.
     * @param _amount The amount of tokens to transfer.
     * @param _to The recipient address of the tokens.
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
     * @notice Allows the rebalancer contract to pull tokens from the vault.
     * @dev Wrapper function for `_pullFromVault` ensuring only the rebalancer contract can call it.
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
        permit2.transferFrom(_from, vault, uint160(_depositAmount), _token);
    }

    /**
     * @notice Processes multi-token deposits by calculating the minimum deposit ratio.
     * @dev Ensures that the deposited token amounts align with the current vault token ratios.
     * @param depositAmounts Array of amounts for each token the user wants to deposit.
     * @return The minimum deposit ratio after deposits.
     */
    function _multiTokenTransfer(
        address _from,
        uint256[] calldata depositAmounts
    ) internal returns (uint256) {
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

        // If the vault is empty, accept the deposits and return zero as the initial ratio
        if (totalSupply() == 0) {
            for (uint256 i; i < amountLength; i++) {
                _transferToVault(_from, portfolioTokens[i], depositAmounts[i]);
            }
            return 0;
        }

        // Calculate the minimum ratio to maintain proportional token balances in the vault
        uint256 _minRatio = type(uint).max;
        for (uint256 i; i < amountLength; i++) {
            uint256 _currentRatio = _getDepositToVaultBalanceRatio(
                depositAmounts[i],
                tokenBalancesBefore[i]
            );
            _minRatio = MathUtils._min(_currentRatio, _minRatio);
        }

        uint256 transferAmount;
        uint256 _minRatioAfterTransfer = type(uint256).max;
        // Adjust token deposits to match the minimum ratio and update the vault balances
        for (uint256 i; i < amountLength; i++) {
            address token = portfolioTokens[i];
            uint256 tokenBalanceBefore = tokenBalancesBefore[i];
            transferAmount = (_minRatio * tokenBalanceBefore) / ONE_ETH_IN_WEI;
            _transferToVault(_from, token, transferAmount);

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
        return _minRatioAfterTransfer;
    }
}
