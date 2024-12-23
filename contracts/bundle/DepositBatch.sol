// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import { IAllowanceTransfer } from "../core/interfaces/IAllowanceTransfer.sol";
import { ErrorLibrary } from "../library/ErrorLibrary.sol";
import { IPortfolio } from "../core/interfaces/IPortfolio.sol";
import { FunctionParameters } from "../FunctionParameters.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
/**
 * @title DepositBatch
 * @notice A contract for performing multi-token swap and deposit operations.
 * @dev This contract uses Enso's swap execution logic for delegating swaps.
 */
contract DepositBatch is ReentrancyGuard {
  // The address of Enso's swap execution logic; swaps are delegated to this target.
  address immutable SWAP_TARGET;

  constructor(address _swapTarget) {
    SWAP_TARGET = _swapTarget;
  }

  /**
   * @notice Performs a multi-token swap and deposit operation for the user.
   * @param data Struct containing parameters for the batch handler.
   */
  function multiTokenSwapETHAndTransfer(
    FunctionParameters.BatchHandler memory data
  ) external payable nonReentrant {
    if (msg.value == 0) {
      revert ErrorLibrary.InvalidBalance();
    }

    address user = msg.sender;

    _multiTokenSwapAndDeposit(data, user);

    (bool sent, ) = user.call{ value: address(this).balance }("");
    if (!sent) revert ErrorLibrary.TransferFailed();
  }

  /**
   * @notice Performs a multi-token swap and deposit operation for the user.
   * @param data Struct containing parameters for the batch handler.
   */
  function multiTokenSwapAndDeposit(
    FunctionParameters.BatchHandler memory data,
    address user
  ) external payable nonReentrant {
    address _depositToken = data._depositToken;

    _multiTokenSwapAndDeposit(data, user);

    // Return any leftover invested token dust to the user
    uint256 depositTokenBalance = _getTokenBalance(
      _depositToken,
      address(this)
    );
    if (depositTokenBalance > 0) {
      TransferHelper.safeTransfer(_depositToken, user, depositTokenBalance);
    }
  }

  function _multiTokenSwapAndDeposit(
    FunctionParameters.BatchHandler memory data,
    address user
  ) internal {
    address[] memory tokens = IPortfolio(data._target).getTokens();
    address _depositToken = data._depositToken;
    address target = data._target;
    uint256 tokenLength = tokens.length;
    uint256[] memory depositAmounts = new uint256[](tokenLength);

    if (data._callData.length != tokenLength)
      revert ErrorLibrary.InvalidLength();

    // Perform swaps and calculate deposit amounts for each token
    for (uint256 i; i < tokenLength; i++) {
      address _token = tokens[i];
      uint256 balance;
      if (_token == _depositToken) {
        //Sending encoded balance instead of swap calldata
        balance = abi.decode(data._callData[i], (uint256));
      } else {
        uint256 balanceBefore = _getTokenBalance(_token, address(this));
        (bool success, ) = SWAP_TARGET.delegatecall(data._callData[i]);
        if (!success) revert ErrorLibrary.CallFailed();
        uint256 balanceAfter = _getTokenBalance(_token, address(this));
        balance = balanceAfter - balanceBefore;
      }
      if (balance == 0) revert ErrorLibrary.InvalidBalanceDiff();

      TransferHelper.safeApprove(_token, target, 0);
      TransferHelper.safeApprove(_token, target, balance);

      depositAmounts[i] = balance;
    }

    IPortfolio(target).multiTokenDepositFor(
      user,
      depositAmounts,
      data._minMintAmount
    );

    //Return any leftover vault token dust to the user
    for (uint256 i; i < tokenLength; i++) {
      address _token = tokens[i];
      uint256 portfoliodustReturn = _getTokenBalance(_token, address(this));
      if (portfoliodustReturn > 0) {
        TransferHelper.safeTransfer(_token, user, portfoliodustReturn);
      }
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

  // Function to receive Ether when msg.data is empty
  receive() external payable {}
}
