// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IPriceOracle } from "../../oracle/IPriceOracle.sol";
import { ErrorLibrary } from "../../library/ErrorLibrary.sol";

import { IPositionWrapper } from "../abstract/IPositionWrapper.sol";

import { WrapperFunctionParameters } from "../WrapperFunctionParameters.sol";

import { LiquidityAmountsCalculationsV2 } from "./LiquidityAmountsCalculationsV2.sol";

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { INonfungiblePositionManager } from "./INonfungiblePositionManager.sol";

import { IProtocolConfig } from "../../config/protocol/IProtocolConfig.sol";
/**
 * @title SwapVerificationLibrary
 * @notice Library for verifying swap operations using a price oracle
 */
library SwapVerificationLibraryAlgebraV2 {
  uint256 private constant TOTAL_WEIGHT = 10_000;

  /// @notice Minimum amount of fees in smallest token unit that must be collected before they can be reinvested.
  uint256 internal constant MIN_REINVESTMENT_AMOUNT = 1000000;

  /**
   * @dev Verifies the swap by comparing the sell and buy amounts using the price oracle.
   * @param _sellToken Address of the token being sold.
   * @param _buyToken Address of the token being bought.
   * @param _sellAmount Amount of tokens being sold.
   * @param _buyAmount Amount of tokens being bought.
   * @param _priceOracle Address of the price oracle contract.
   */
  function verifySwap(
    address _sellToken,
    address _buyToken,
    uint256 _sellAmount,
    uint256 _buyAmount,
    uint256 _slippage,
    IPriceOracle _priceOracle
  ) external view {
    if (_sellAmount > 0) {
      uint256 sellValue = _priceOracle.convertToUSD18Decimals(
        _sellToken,
        _sellAmount
      );
      uint256 buyValue = _priceOracle.convertToUSD18Decimals(
        _buyToken,
        _buyAmount
      );

      if (buyValue < getSlippage(_slippage, sellValue)) {
        revert ErrorLibrary.InvalidSwap();
      }
    }
  }

  /**
   * @dev Calculates the minimum acceptable amount after slippage.
   * @param _amount The original amount before slippage.
   * @return minAmount The minimum acceptable amount after slippage.
   */
  function getSlippage(
    uint256 _slippage,
    uint256 _amount
  ) private pure returns (uint256 minAmount) {
    minAmount = (_amount * (TOTAL_WEIGHT - _slippage)) / (TOTAL_WEIGHT);
  }

  /**
   * @dev Verifies the token balance ratios after a swap to ensure they meet specific conditions set by the pool parameters.
   * This function can apply a one-sided ratio check if the pool ratio is zero (indicating special conditions like fee collection or bootstrapping phases),
   * or a normal ratio verification against the expected pool ratio under standard operation conditions.
   * @param _positionWrapper The position wrapper associated with the Uniswap V3 position.
   * @param _tickLower Lower bound of the price tick range for the position.
   * @param _tickUpper Upper bound of the price tick range for the position.
   * @param _token0 Address of the first token in the liquidity pair.
   * @param _token1 Address of the second token in the liquidity pair.
   * @param _balanceBeforeSwap The token balance before the swap, used for one-sided ratio verification.
   * @param _balanceAfterSwap The token balance after the swap, also used for one-sided ratio verification.
   * @return balance0 Updated balance of token0 after potential verification actions.
   * @return balance1 Updated balance of token1 after potential verification actions.
   * @notice This function performs checks to ensure the post-swap token distribution adheres to expected ratios,
   * which are crucial for maintaining the integrity and stability of the liquidity pool.
   */
  function verifyRatioAfterSwap(
    IProtocolConfig _protocolConfig,
    IPositionWrapper _positionWrapper,
    address _nftManager,
    int24 _tickLower,
    int24 _tickUpper,
    address _token0,
    address _token1,
    address _tokenIn,
    uint256 _balanceBeforeSwap,
    uint256 _balanceAfterSwap
  ) external returns (uint256 balance0, uint256 balance1) {
    // Calculate the ratio after the swap and the expected pool ratio
    uint256 ratioAfterSwap;
    uint256 poolRatio;
    address tokenZeroBalance;
    (
      balance0,
      balance1,
      ratioAfterSwap,
      poolRatio,
      tokenZeroBalance
    ) = calculateRatios(
      _positionWrapper,
      _nftManager,
      _tickLower,
      _tickUpper,
      _token0,
      _token1
    );

    // If the pool ratio is zero, verify using a one-sided check, otherwise use a standard ratio check
    if (poolRatio == 0) {
      if (_tokenIn != tokenZeroBalance) revert ErrorLibrary.InvalidSwapToken();
      verifyOneSidedRatio(
        _protocolConfig,
        _balanceBeforeSwap,
        _balanceAfterSwap
      );
    } else {
      _verifyRatio(_protocolConfig, poolRatio, ratioAfterSwap);
    }
  }

  /**
   * @dev Verifies that the token ratio after a swap operation matches the expected pool ratio.
   * This function is used in scenarios where a swap should result in a balance that adheres to predefined pool conditions,
   * typically to maintain price stability or meet other strategic criteria.
   * @param _params Swap parameters including details about the position, tokens, and price ticks.
   * @notice This function calculates the current and expected ratios and checks them for consistency.
   */
  function verifyZeroSwapAmount(
    IProtocolConfig protocolConfig,
    WrapperFunctionParameters.SwapParams memory _params,
    address _nftManager
  ) public {
    (, , uint256 ratioAfterSwap, uint256 poolRatio, ) = calculateRatios(
      _params._positionWrapper,
      _nftManager,
      _params._tickLower,
      _params._tickUpper,
      _params._token0,
      _params._token1
    );

    _verifyRatio(protocolConfig, poolRatio, ratioAfterSwap);
  }

  /**
   * @dev Calculates the new token ratios after a swap and verifies them against expected pool ratios.
   * @param _positionWrapper Position wrapper containing the tokens.
   * @param _tickLower Lower price tick.
   * @param _tickUpper Upper price tick.
   * @param _token0 First token address.
   * @param _token1 Second token address.
   * @return balance0 New balance of token0.
   * @return balance1 New balance of token1.
   */
  function calculateRatios(
    IPositionWrapper _positionWrapper,
    address _nftManager,
    int24 _tickLower,
    int24 _tickUpper,
    address _token0,
    address _token1
  )
    public
    returns (
      uint256 balance0,
      uint256 balance1,
      uint256 ratioAfterSwap,
      uint256 poolRatio,
      address tokenZeroBalance
    )
  {
    balance0 = IERC20Upgradeable(_token0).balanceOf(address(this));
    balance1 = IERC20Upgradeable(_token1).balanceOf(address(this));

    ratioAfterSwap = balance0 < 1_000_000 || balance1 < 1_000_000
      ? 0
      : (balance0 * 1e18) / balance1;

    (poolRatio, tokenZeroBalance) = LiquidityAmountsCalculationsV2
      .getRatioForTicks(
        _positionWrapper,
        getFactoryAddress(_nftManager),
        _token0,
        _token1,
        _tickLower,
        _tickUpper
      );
  }

  /**
   * @dev Retrieves the factory address from the Non-Fungible Position Manager.
   * @return Address of the factory.
   */
  function getFactoryAddress(
    address _nftManager
  ) public view returns (address) {
    return INonfungiblePositionManager(_nftManager).factory();
  }

  /**
   * @dev Verifies that the resulting token ratio is within the acceptable range.
   * @param _poolRatio Expected ratio of the token pool.
   * @param _ratioAfterSwap Actual ratio after the swap.
   */
  function _verifyRatio(
    IProtocolConfig protocolConfig,
    uint256 _poolRatio,
    uint256 _ratioAfterSwap
  ) internal view {
    // allow 0.5% derivation
    uint256 allowedRatioDeviationBps = protocolConfig
      .allowedRatioDeviationBps();
    uint256 upperBound = (_poolRatio *
      (TOTAL_WEIGHT + allowedRatioDeviationBps)) / TOTAL_WEIGHT;
    uint256 lowerBound = (_poolRatio *
      (TOTAL_WEIGHT - allowedRatioDeviationBps)) / TOTAL_WEIGHT;

    if (_ratioAfterSwap > upperBound || _ratioAfterSwap < lowerBound) {
      revert ErrorLibrary.InvalidSwapAmount();
    }
  }

  /**
   * @notice Verifies the ratio for a one-sided swap
   * @dev This function checks if the balance after a swap is within an acceptable range
   * @param _protocolConfig The protocol configuration contract
   * @param _balanceBeforeSwap The balance of the tokenIn before the swap
   * @param _balanceAfterSwap The balance of the tokenIn after the swap
   * @custom:throws ErrorLibrary.InvalidSwapAmount if the balance after swap exceeds the allowed dust amount
   */
  function verifyOneSidedRatio(
    IProtocolConfig _protocolConfig,
    uint256 _balanceBeforeSwap,
    uint256 _balanceAfterSwap
  ) public view {
    uint256 allowedRatioDeviationBps = _protocolConfig
      .allowedRatioDeviationBps();
    // Calculate the maximum allowed balance after swap based on the deviation
    // This ensures that most of the tokenIn has been sold, leaving only a small dust value
    uint256 dustAllowance = (_balanceBeforeSwap *
      (TOTAL_WEIGHT - allowedRatioDeviationBps)) / TOTAL_WEIGHT;

    if (_balanceAfterSwap > dustAllowance) {
      revert ErrorLibrary.InvalidSwapAmount();
    }
  }

  /**
   * @dev Checks if the conditions are met to verify a zero swap amount based on tokens owed from fees.
   * This function is specifically used to ensure that any fees due for reinvestment don't exceed
   * certain thresholds before proceeding with a ratio verification step.
   * @param _params Swap parameters encapsulating position and token details.
   * @param _tokensOwed0 Tokens owed of type token0, typically fees that are ready for reinvestment.
   * @param _tokensOwed1 Tokens owed of type token1, similarly fees that might be reinvested.
   * @notice Only proceeds with the verification if either of the owed token amounts exceeds
   * the minimum reinvestment threshold.
   */
  function verifyZeroSwapAmountForReinvestFees(
    IProtocolConfig protocolConfig,
    WrapperFunctionParameters.SwapParams memory _params,
    address _nftManager,
    uint128 _tokensOwed0,
    uint128 _tokensOwed1
  ) external {
    if (
      _tokensOwed0 > MIN_REINVESTMENT_AMOUNT ||
      _tokensOwed1 > MIN_REINVESTMENT_AMOUNT
    ) {
      verifyZeroSwapAmount(protocolConfig, _params, _nftManager);
    }
  }
}
