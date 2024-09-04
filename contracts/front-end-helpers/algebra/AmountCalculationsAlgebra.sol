// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { LiquidityAmounts } from "./LiquidityAmounts.sol";
import { INonfungiblePositionManager } from "../../wrappers/algebra/INonfungiblePositionManager.sol";

import "@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol";

import "@cryptoalgebra/integral-core/contracts/libraries/Constants.sol";

import { IFactory } from "../../wrappers/algebra/IFactory.sol";
import { IPool } from "../../wrappers/interfaces/IPool.sol";

import { IPositionWrapper } from "../../wrappers/abstract/IPositionWrapper.sol";

import { FullMath } from "@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol";

contract AmountCalculationsAlgebra {
  INonfungiblePositionManager internal uniswapV3PositionManager =
    INonfungiblePositionManager(0xa51ADb08Cbe6Ae398046A23bec013979816B77Ab);

  uint256 constant TOTAL_WEIGHT = 10_000;

  function getUnderlyingAmounts(
    IPositionWrapper _positionWrapper
  ) public returns (uint256 amount0, uint256 amount1) {
    (
      ,
      ,
      ,
      ,
      int24 tickLower,
      int24 tickUpper,
      uint128 existingLiquidity,
      ,
      ,
      ,

    ) = uniswapV3PositionManager.positions(_positionWrapper.tokenId());

    (amount0, amount1) = _getUnderlyingAmounts(
      _positionWrapper,
      tickLower,
      tickUpper,
      existingLiquidity
    );
  }

  function _getUnderlyingAmounts(
    IPositionWrapper _positionWrapper,
    int24 _tickLower,
    int24 _tickUpper,
    uint128 _existingLiquidity
  ) internal returns (uint256 amount0, uint256 amount1) {
    IFactory factory = IFactory(uniswapV3PositionManager.factory());
    IPool pool = IPool(
      factory.poolByPair(_positionWrapper.token0(), _positionWrapper.token1())
    );

    int24 tick = pool.globalState().tick;
    uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
    uint160 sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(_tickLower);
    uint160 sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(_tickUpper);

    (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
      sqrtRatioX96,
      sqrtRatioAX96,
      sqrtRatioBX96,
      _existingLiquidity
    );
  }

  function getLiquidityAmountsForPartialWithdrawal(
    IPositionWrapper _positionWrapper,
    uint256 _percentage // wrapper balance / total supply
  ) external returns (uint256 amount0Out, uint256 amount1Out) {
    require(
      _percentage <= TOTAL_WEIGHT,
      "Percentage should be less than or equal to 10000"
    );
    (uint256 amount0, uint256 amount1) = getUnderlyingAmounts(_positionWrapper);

    amount0Out = (amount0 * _percentage) / TOTAL_WEIGHT;
    amount1Out = (amount1 * _percentage) / TOTAL_WEIGHT;
  }

  function getPercentage(
    uint256 _partially,
    uint256 _total
  ) external pure returns (uint256 percentage) {
    percentage = (_partially * TOTAL_WEIGHT) / _total;
  }

  function getRatio(
    IPositionWrapper _positionWrapper
  ) external returns (uint256 ratio) {
    (
      ,
      ,
      ,
      ,
      int24 tickLower,
      int24 tickUpper,
      ,
      ,
      ,
      ,

    ) = uniswapV3PositionManager.positions(_positionWrapper.tokenId());

    uint160 sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower);
    uint160 sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper);
    uint128 liquidity = LiquidityAmounts.getLiquidityForAmount0(
      sqrtRatioAX96,
      sqrtRatioBX96,
      1 ether
    );

    (uint256 amount0, uint256 amount1) = _getUnderlyingAmounts(
      _positionWrapper,
      tickLower,
      tickUpper,
      liquidity
    );
    ratio = (amount0 * 1 ether) / amount1;
  }

  function getRatioForTicks(
    IPositionWrapper _positionWrapper,
    int24 _tickLower,
    int24 _tickUpper
  ) external returns (uint256 ratio) {
    (uint256 amount0, uint256 amount1) = _getUnderlyingAmounts(
      _positionWrapper,
      _tickLower,
      _tickUpper,
      1 ether
    );

    ratio = amount0 == 0 ? 0 : (amount0 * 1 ether) / amount1;
  }

  function getRatioAmountsForTicks(
    IPositionWrapper _positionWrapper,
    int24 _tickLower,
    int24 _tickUpper
  ) external returns (uint256 amount0, uint256 amount1) {
    (amount0, amount1) = _getUnderlyingAmounts(
      _positionWrapper,
      _tickLower,
      _tickUpper,
      1 ether
    );
  }

  function getRatioOfPool(
    IPositionWrapper _positionWrapper
  ) external returns (uint256 ratio) {
    (
      ,
      ,
      ,
      ,
      int24 tickLower,
      int24 tickUpper,
      ,
      ,
      ,
      ,

    ) = uniswapV3PositionManager.positions(_positionWrapper.tokenId());

    (uint256 amount0, uint256 amount1) = _getUnderlyingAmounts(
      _positionWrapper,
      tickLower,
      tickUpper,
      1 ether
    );
    ratio = (amount0 * 1 ether) / amount1;
  }

  function getFeesCollected(
    uint256 _tokenId
  ) external view returns (uint128 tokensOwed0, uint128 tokensOwed1) {
    (, , , , , , , , , tokensOwed0, tokensOwed1) = uniswapV3PositionManager
      .positions(_tokenId);
  }
}
