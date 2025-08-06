// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { ISwapHandler } from "../../core/interfaces/ISwapHandler.sol";
import { ISwapRouter02 } from "../../wrappers/uniswapV3/ISwapRouter02.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

contract UniswapHandler is ISwapHandler {
  address public immutable ROUTER_ADDRESS;

  constructor(address _routerAddress) {
    ROUTER_ADDRESS = _routerAddress;
  }

  function swapExactTokensForTokens(
    address tokenIn,
    address tokenOut,
    address to,
    uint amountIn,
    uint amountOut,
    uint fee
  ) public view returns (bytes memory data) {
    bytes memory path = abi.encodePacked(
      tokenIn, // Address of the input token
      SafeCast.toUint24(fee), // Pool fee (0.3%)
      tokenOut // Address of the output token
    );

    ISwapRouter02.ExactInputParams memory params = ISwapRouter02
      .ExactInputParams({
        path: path,
        recipient: to,
        amountIn: amountIn,
        amountOutMinimum: amountOut
      });

    data = abi.encodeCall(ISwapRouter02.exactInput, params);
  }

  function swapTokensForExactTokens(
    address tokenIn,
    address tokenOut,
    address to,
    uint amountIn,
    uint amountOut,
    uint fee
  ) public view returns (bytes memory data) {
    bytes memory path = abi.encodePacked(
      tokenIn, // Address of the input token
      SafeCast.toUint24(fee), // Pool fee (0.3%)
      tokenOut // Address of the output token
    );

    ISwapRouter02.ExactOutputParams memory params = ISwapRouter02
      .ExactOutputParams({
        path: path,
        recipient: to,
        amountOut: amountOut,
        amountInMaximum: amountIn
      });

    data = abi.encodeCall(ISwapRouter02.exactOutput, params);
  }

  function getRouterAddress() public view returns (address) {
    return ROUTER_ADDRESS;
  }
}
