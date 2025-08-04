// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { ISwapRouter02 } from "./ISwapRouter02.sol";

import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract UniswapV3SwapHandler {
  address WETH;
  ISwapRouter02 router;

  constructor(address _router, address _weth) {
    router = ISwapRouter02(_router);
    WETH = _weth;
  }

  function swapTokenToToken(
    address tokenIn,
    address tokenOut,
    uint24 poolFee,
    uint amountIn
  ) external returns (uint amountOut) {
    TransferHelper.safeTransferFrom(
      tokenIn,
      msg.sender,
      address(this),
      amountIn
    );
    _safeApprove(tokenIn, address(router), amountIn);

    ISwapRouter02.ExactInputSingleParams memory params = ISwapRouter02
      .ExactInputSingleParams({
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        fee: poolFee,
        recipient: msg.sender,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
      });

    amountOut = router.exactInputSingle(params);
  }

  /**
   * @notice Helper function to safely approve a token for a spender.
   * @param token The address of the token to approve.
   * @param spender The address of the spender.
   * @param amount The amount to approve.
   */
  function _safeApprove(
    address token,
    address spender,
    uint256 amount
  ) internal {
    try IERC20Upgradeable(token).approve(spender, 0) {} catch {}
    TransferHelper.safeApprove(token, spender, amount);
  }
}
