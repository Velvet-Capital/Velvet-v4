// SPDX-License-Identifier: BUSL-1.1

/**
 * @title PortfolioManager for a particular Portfolio
 * @author Velvet.Capital
 * @notice This contract is used for transferring funds form vault to contract and vice versa 
           and swap tokens to and fro from BNB
 * @dev This contract includes functionalities:
 *      1. Deposit tokens to vault
 *      2. Withdraw tokens from vault
 *      3. Swap BNB for tokens
 *      4. Swap tokens for BNB
 */

pragma solidity 0.8.17;

import {IUniswapV2Router02} from "../front-end-helpers/IUniswapV2Router02.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/Initializable.sol";

import {TransferHelper} from "@uniswap/lib/contracts/libraries/TransferHelper.sol";

import {ErrorLibrary} from "../library/ErrorLibrary.sol";
import {Ownable} from "@openzeppelin/contracts-4.8.2/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts-4.8.2/token/ERC20/IERC20.sol";

contract UniswapV2Handler is Initializable, Ownable {
  IUniswapV2Router02 internal uniSwapRouter;

  uint256 public constant DIVISOR_INT = 10_000;

  function init(address _router) external initializer {
    if (_router == address(0)) revert ErrorLibrary.InvalidAddress();

    uniSwapRouter = IUniswapV2Router02(_router);
  }

  function getETH() public view returns (address) {
    return uniSwapRouter.WETH();
  }

  function getSwapAddress() external view returns (address) {
    return address(uniSwapRouter);
  }

  function swapTokensToETH(
    uint256 _swapAmount,
    uint256 _slippage,
    address _t,
    address _to,
    bool isEnabled
  ) external returns (uint256 swapResult) {
    _safeApprove(_t, address(uniSwapRouter), _swapAmount);
    uint256 internalSlippage = isEnabled
      ? getSlippage(_swapAmount, _slippage, getPathForToken(_t))
      : 1;
    swapResult = uniSwapRouter.swapExactTokensForETH(
      _swapAmount,
      internalSlippage,
      getPathForToken(_t),
      _to,
      block.timestamp
    )[1];
  }

  function swapTokenToTokens(
    uint256 _swapAmount,
    uint256 _slippage,
    address _tokenIn,
    address _tokenOut,
    address _to,
    bool isEnabled
  ) external returns (uint256 swapResult) {
    _safeApprove(_tokenIn, address(uniSwapRouter), _swapAmount);
    if (isEnabled) {
      swapResult = uniSwapRouter.swapExactTokensForTokens(
        _swapAmount,
        getSlippage(
          _swapAmount,
          _slippage,
          getPathForMultiToken(_tokenIn, _tokenOut)
        ),
        getPathForMultiToken(_tokenIn, _tokenOut),
        _to,
        block.timestamp
      )[1];
    } else {
      swapResult = uniSwapRouter.swapExactTokensForTokens(
        _swapAmount,
        1,
        getPathForRewardToken(_tokenIn, _tokenOut),
        _to,
        block.timestamp
      )[2];
    }
  }

  function swapETHToTokens(
    uint256 _slippage,
    address _t,
    address _to
  ) external payable returns (uint256 swapResult) {
    swapResult = uniSwapRouter.swapExactETHForTokens{value: msg.value}(
      getSlippage(msg.value, _slippage, getPathForETH(_t)),
      getPathForETH(_t),
      _to,
      block.timestamp
    )[1];
  }

  /**
   * @notice The function sets the path (ETH, token) for a token
   * @return Path for (ETH, token)
   */
  function getPathForETH(
    address crypto
  ) public view returns (address[] memory) {
    address[] memory path = new address[](2);
    path[0] = getETH();
    path[1] = crypto;

    return path;
  }

  /**
   * @notice The function sets the path (token, ETH) for a token
   * @return Path for (token, ETH)
   */
  function getPathForToken(
    address token
  ) public view returns (address[] memory) {
    address[] memory path = new address[](2);
    path[0] = token;
    path[1] = getETH();

    return path;
  }

  /**
   * @notice The function sets the path (token, token) for a token
   * @return Path for (token, token)
   */
  function getPathForMultiToken(
    address _tokenIn,
    address _tokenOut
  ) public pure returns (address[] memory) {
    address[] memory path = new address[](2);
    path[0] = _tokenIn;
    path[1] = _tokenOut;

    return path;
  }

  /**
   * @notice The function sets the path (token, token) for a token
   * @return Path for (token, token)
   */
  function getPathForRewardToken(
    address _tokenIn,
    address _tokenOut
  ) public view returns (address[] memory) {
    address[] memory path = new address[](3);
    path[0] = _tokenIn;
    path[1] = getETH();
    path[2] = _tokenOut;

    return path;
  }

  function getSlippage(
    uint256 _amount,
    uint256 _slippage,
    address[] memory path
  ) internal view returns (uint256 minAmount) {
    minAmount = 1;
  }

  /**
   * @notice Helper function to safely approve a token for a spender.
   * @param token The address of the token to approve.
   * @param spender The address of the spender.
   * @param amount The amount to approve.
   */
  function _safeApprove(address token, address spender, uint256 amount) internal {
    try IERC20(token).approve(spender, 0) {} catch {}
    TransferHelper.safeApprove(token, spender, amount);
  }
}
