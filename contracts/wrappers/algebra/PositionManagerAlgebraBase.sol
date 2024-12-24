// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { PositionManagerAbstract, IPositionWrapper, WrapperFunctionParameters, ErrorLibrary, IERC20Upgradeable, IProtocolConfig } from "../abstract/PositionManagerAbstract.sol";
import { INonfungiblePositionManager } from "./INonfungiblePositionManager.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IFactory } from "./IFactory.sol";
import { IPool } from "../interfaces/IPool.sol";
import { ISwapRouter } from "./ISwapRouter.sol";
import { IPriceOracle } from "../../oracle/IPriceOracle.sol";

/**
 * @title PositionManagerAbstractAlgebra
 * @dev Extension of PositionManagerAbstract for managing Algebra (several versions) positions with added features like custom token swapping.
 */
abstract contract PositionManagerAlgebraBase is PositionManagerAbstract {
  ISwapRouter router;

  /**
   * @dev Initializes the contract with additional protocol configuration and swap router addresses.
   * @param _nonFungiblePositionManagerAddress Address of the Algebra V3 Non-Fungible Position Manager.
   * @param _swapRouter Address of the swap router.
   * @param _protocolConfig Address of the protocol configuration.
   * @param _assetManagerConfig Address of the asset management configuration.
   * @param _accessController Address of the access controller.
   * @param _protocolId Protocol ID.
   */
  function PositionManagerAbstractAlgebra_init(
    address _externalPositionStorage,
    address _nonFungiblePositionManagerAddress,
    address _swapRouter,
    address _protocolConfig,
    address _assetManagerConfig,
    address _accessController,
    bytes32 _protocolId
  ) internal {
    PositionManagerAbstract__init(
      _externalPositionStorage,
      _nonFungiblePositionManagerAddress,
      _protocolConfig,
      _assetManagerConfig,
      _accessController,
      _protocolId
    );

    router = ISwapRouter(_swapRouter);
  }

  /**
   * @dev Executes a token swap via a router.
   * @param _params Swap parameters including input and output tokens and amounts.
   * @return balance0 New balance of token0 after swap.
   * @return balance1 New balance of token1 after swap.
   */
  function _swapTokenToToken(
    WrapperFunctionParameters.SwapParams memory _params
  ) internal override returns (uint256 balance0, uint256 balance1) {
    address tokenIn = _params._tokenIn;
    address tokenOut = _params._tokenOut;

    if (
      tokenIn == tokenOut ||
      !(tokenOut == _params._token0 || tokenOut == _params._token1) ||
      !(tokenIn == _params._token0 || tokenIn == _params._token1)
    ) {
      revert ErrorLibrary.InvalidTokenAddress();
    }

    IERC20Upgradeable(tokenIn).approve(address(router), _params._amountIn);

    uint256 balanceTokenInBeforeSwap = IERC20Upgradeable(tokenIn).balanceOf(
      address(this)
    );
    uint256 balanceTokenOutBeforeSwap = IERC20Upgradeable(tokenOut).balanceOf(
      address(this)
    );

    ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
      .ExactInputSingleParams({
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        recipient: address(this),
        deadline: block.timestamp,
        amountIn: _params._amountIn,
        amountOutMinimum: 0,
        limitSqrtPrice: 0
      });

    router.exactInputSingle(params);

    _verifySwap(
      _params._amountIn,
      balanceTokenInBeforeSwap,
      balanceTokenOutBeforeSwap,
      tokenIn,
      tokenOut,
      address(uniswapV3PositionManager)
    );

    _verifyRatioAfterSwap(
      _params,
      balanceTokenInBeforeSwap,
      tokenIn,
      address(uniswapV3PositionManager)
    );
  }

  /**
   * @dev Retrieves tokens in the correct pool order.
   * @param _token0 First token address.
   * @param _token1 Second token address.
   * @return token0 Token address that is token0 in the pool.
   * @return token1 Token address that is token1 in the pool.
   */
  function _getTokensInPoolOrder(
    address _token0,
    address _token1
  ) internal view returns (address token0, address token1) {
    IFactory factory = IFactory(
      INonfungiblePositionManager(address(uniswapV3PositionManager)).factory()
    );
    IPool pool = IPool(factory.poolByPair(_token0, _token1));

    token0 = pool.token0();
    token1 = pool.token1();
  }

  function _getTokensOwed(
    uint256
  ) internal view virtual returns (uint128, uint128);

  function _verifySwap(
    uint256 _amountIn,
    uint256 _balanceTokenInBeforeSwap,
    uint256 _balanceTokenOutBeforeSwap,
    address _tokenIn,
    address _tokenOut,
    address _uniswapV3PositionManager
  ) internal virtual;

  function _verifyRatioAfterSwap(
    WrapperFunctionParameters.SwapParams memory _params,
    uint256 _balanceTokenInBeforeSwap,
    address _tokenIn,
    address _uniswapV3PositionManager
  ) internal virtual returns (uint256 balance0, uint256 balance1);
}
