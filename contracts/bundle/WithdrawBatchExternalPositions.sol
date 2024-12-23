// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import { IAllowanceTransfer } from "../core/interfaces/IAllowanceTransfer.sol";
import { ErrorLibrary } from "../library/ErrorLibrary.sol";
import { IPortfolio } from "../core/interfaces/IPortfolio.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import { MathUtils } from "../core/calculations/MathUtils.sol";

import { IPositionManager } from "../wrappers/abstract/IPositionManager.sol";
import { IAssetManagementConfig } from "../config/assetManagement/IAssetManagementConfig.sol";

import { FunctionParameters } from "../FunctionParameters.sol";

/**
 * @title WithdrawBatchExternalPositions
 * @notice A contract for performing multi-token swap and withdrawal operations.
 * @dev This contract uses Enso's swap execution logic for delegating swaps.
 */
contract WithdrawBatchExternalPositions is ReentrancyGuard {
  address constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  // The address of Solver's swap execution logic; swaps are delegated to this target.
  address immutable SWAP_TARGET;

  constructor(address _swapTarget) {
    SWAP_TARGET = _swapTarget;
  }

  /**
   * @notice Executes a multi-token swap and withdrawal process, sending the resulting tokens to the user.
   * @dev This function performs the following steps:
   * 1. Gets the list of tokens from the specified portfolio.
   * 2. Checks the balance of the user for the token to withdraw before the swap.
   * 3. Executes a multi-token withdrawal from the portfolio.
   * 4. Swaps the tokens and transfers them to the user.
   * 5. Handles any remaining token balances and transfers them back to the user.
   * @param _swapTokens An array of addresses of tokens to be swapped.
   * @param _target The address of the portfolio contract.
   * @param _tokenToWithdraw The address of the token to be withdrawn by the user.
   * @param user The address of the user initiating the withdrawal.
   * @param _expectedOutputAmount The minimum amount of tokens expected to receive after the swap and withdrawal.
   * @param _callData The calldata required for executing the swaps.
   * @param _params A struct containing parameters for external position withdrawals.
   */
  function multiTokenSwapAndWithdraw(
    address[] memory _swapTokens,
    address _target,
    address _tokenToWithdraw,
    address user,
    uint256 _expectedOutputAmount,
    bytes[] memory _callData,
    FunctionParameters.ExternalPositionWithdrawParams memory _params
  ) external nonReentrant {
    uint256 balanceOfSameToken;

    uint256 userBalanceBeforeSwap = _getTokenBalanceOfUser(
      _tokenToWithdraw,
      user
    );

    uint256 withdrawTokenBalanceBefore = _getTokenBalanceOfUser(
      _tokenToWithdraw,
      address(this)
    );

    _decreaseLiquidity(_target, _params);

    // Perform swaps and send tokens to user
    uint256 swapTokenLength = _swapTokens.length;
    for (uint256 i = 0; i < swapTokenLength; i++) {
      address _token = _swapTokens[i];
      if (_tokenToWithdraw == _token) {
        //Balance transferred to user directly
        balanceOfSameToken = _getTokenBalance(_token, address(this));
        TransferHelper.safeTransfer(_token, user, balanceOfSameToken);
      } else {
        (bool success, ) = SWAP_TARGET.delegatecall(_callData[i]);
        if (!success) revert ErrorLibrary.CallFailed();
      }
    }

    for (uint256 i = 0; i < swapTokenLength; i++) {
      address _token = _swapTokens[i];

      // Return any leftover dust to the user
      uint256 portfoliodustReturn = _getTokenBalance(_token, address(this));
      if (portfoliodustReturn > 0) {
        TransferHelper.safeTransfer(_token, user, portfoliodustReturn);
      }
    }

    // Return balance difference to the user
    uint256 withdrawTokenBalanceAfter = _getTokenBalanceOfUser(
      _tokenToWithdraw,
      address(this)
    );
    if (withdrawTokenBalanceAfter > withdrawTokenBalanceBefore) {
      _transferTokens(
        _tokenToWithdraw,
        user,
        withdrawTokenBalanceAfter - withdrawTokenBalanceBefore
      );
    }

    // Subtracting balanceIfSameToken to get the correct amount, to verify that calldata is not manipulated,
    // and to ensure the user has received their shares properly
    uint256 userBalanceAfterSwap = _getTokenBalanceOfUser(
      _tokenToWithdraw,
      user
    );

    uint256 calldataBalanceDifference = userBalanceAfterSwap -
      balanceOfSameToken;

    uint256 balanceDifference = userBalanceAfterSwap - userBalanceBeforeSwap;

    //Checking balance of user after swap, to confirm recevier is user
    if (
      balanceDifference < _expectedOutputAmount ||
      calldataBalanceDifference <= userBalanceBeforeSwap
    ) revert ErrorLibrary.InvalidBalanceDiff();
  }

  /**
   * @notice Decreases liquidity from UniswapV3 positions
   * @dev This function is called internally to reduce liquidity in UniswapV3 positions
   * @param _target The address of the target portfolio
   * @param _params A struct containing parameters for external position withdrawals
   */
  function _decreaseLiquidity(
    address _target,
    FunctionParameters.ExternalPositionWithdrawParams memory _params
  ) internal {
    IPositionManager positionManager = IPositionManager(
      IAssetManagementConfig(IPortfolio(_target).assetManagementConfig())
        .positionManager()
    );

    uint256 positionWrapperLength = _params._positionWrappers.length;
    for (uint256 i = 0; i < positionWrapperLength; i++) {
      address _positionWrapper = _params._positionWrappers[i];
      uint256 balance = IERC20(_positionWrapper).balanceOf(address(this));
      positionManager.decreaseLiquidity(
        _positionWrapper,
        MathUtils.safe128(balance),
        _params._amountsMin0[i],
        _params._amountsMin1[i],
        _params._tokenIn[i],
        _params._tokenOut[i],
        _params._amountIn[i]
      );
    }
  }

  /**
   * @notice Transfers tokens from this contract to a specified address
   * @dev Handles both ETH and ERC20 token transfers
   * @param _token Address of the token to transfer (use ETH_ADDRESS for ETH)
   * @param _to Address of the recipient
   * @param _amount Amount of tokens to transfer
   */
  function _transferTokens(
    address _token,
    address _to,
    uint256 _amount
  ) internal {
    if (_token == ETH_ADDRESS) {
      (bool success, ) = payable(_to).call{ value: _amount }("");
      if (!success) revert ErrorLibrary.TransferFailed();
    } else {
      TransferHelper.safeTransfer(_token, _to, _amount);
    }
  }

  /**
   * @notice Helper function to get balance of any token for any user.
   * @param _token Address of token to get balance.
   * @param _of Address of user to get balance of.
   * @return uint256 Balance of the specified token for the user.
   */
  function _getTokenBalance(
    address _token,
    address _of
  ) internal view returns (uint256) {
    return IERC20(_token).balanceOf(_of);
  }

  /**
   * @notice Helper function to get balance of any token for any user.
   * @param _token Address of token to get balance.
   * @param _user Address of user to get balance of.
   * @return balance Balance of the specified token for the user.
   */
  function _getTokenBalanceOfUser(
    address _token,
    address _user
  ) internal view returns (uint256 balance) {
    if (_token == ETH_ADDRESS) {
      balance = _user.balance;
    } else {
      balance = _getTokenBalance(_token, _user);
    }
  }

  // Function to receive Ether when msg.data is empty
  receive() external payable {}
}
