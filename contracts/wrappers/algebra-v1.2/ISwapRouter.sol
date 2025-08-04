// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

/// @title Router token swapping functionality
/// @notice Functions for swapping tokens via Algebra
/// @dev Credit to Uniswap Labs under GPL-2.0-or-later license:
/// https://github.com/Uniswap/v3-periphery
interface ISwapRouter {
  struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    address deployer;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 limitSqrtPrice;
  }

  function exactInputSingle(
    ExactInputSingleParams memory params
  ) external returns (uint256 amountOut);
}
