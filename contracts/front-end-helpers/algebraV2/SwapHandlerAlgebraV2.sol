// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { ISwapRouter } from "../../wrappers/algebra-v1.2/ISwapRouter.sol";

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract SwapHandlerAlgebraV2 {
  address WETH;
  ISwapRouter router;

  constructor(address _router, address _weth) {
    router = ISwapRouter(_router);
    WETH = _weth;
  }

  function swapTokenToToken(
    address tokenIn,
    address tokenOut,
    uint amountIn
  ) external returns (uint amountOut) {
    IERC20Upgradeable(tokenIn).transferFrom(
      msg.sender,
      address(this),
      amountIn
    );
    IERC20Upgradeable(tokenIn).approve(address(router), amountIn);

    ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
      .ExactInputSingleParams({
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        deployer: address(0),
        recipient: msg.sender,
        deadline: block.timestamp,
        amountIn: amountIn,
        amountOutMinimum: 0,
        limitSqrtPrice: 0
      });

    amountOut = router.exactInputSingle(params);
  }
}
