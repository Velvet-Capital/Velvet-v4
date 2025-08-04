// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { ISwapHandler } from "../../core/interfaces/ISwapHandler.sol";
import { ISwapRouter } from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";


contract PancakeSwapHandler is ISwapHandler {

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

    ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
        path: path,
        recipient: to,
        deadline: block.timestamp + 15,
        amountIn: amountIn,
        amountOutMinimum: amountOut
    });

    data = abi.encodeCall(
      ISwapRouter.exactInput,
      params
    );
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

    ISwapRouter.ExactOutputParams memory params = ISwapRouter.ExactOutputParams({
        path: path,
        recipient: to,
        deadline: block.timestamp + 15,
        amountOut: amountOut,
        amountInMaximum: amountIn
    });

    data = abi.encodeCall(
      ISwapRouter.exactOutput,
      params
    );
  }

  function getRouterAddress() public view returns (address) {
    return ROUTER_ADDRESS;
  }
}
