// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { PositionManagerAbstract, IPositionWrapper, WrapperFunctionParameters, INonfungiblePositionManager, ErrorLibrary, IERC20Upgradeable } from "../abstract/PositionManagerAbstract.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IFactory } from "./IFactory.sol";
import { IPool } from "../interfaces/IPool.sol";
import { ISwapRouter } from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

/**
 * @title PositionManagerAbstractUniswap
 * @dev Extension of PositionManagerAbstract for managing Uniswap V3 positions with added features like custom token swapping.
 */
abstract contract PositionManagerAbstractUniswap is PositionManagerAbstract {
  ISwapRouter router;

  /**
   * @dev Initializes the contract with additional protocol configuration and swap router addresses.
   * @param _nonFungiblePositionManagerAddress Address of the Algebra V3 Non-Fungible Position Manager.
   * @param _swapRouter Address of the swap router.
   * @param _protocolConfig Address of the protocol configuration.
   * @param _assetManagerConfig Address of the asset management configuration.
   * @param _accessController Address of the access controller.
   */
  function PositionManagerAbstractUniswap_init(
    address _nonFungiblePositionManagerAddress,
    address _swapRouter,
    address _protocolConfig,
    address _assetManagerConfig,
    address _accessController
  ) internal {
    PositionManagerAbstract__init(
      _nonFungiblePositionManagerAddress,
      _protocolConfig,
      _assetManagerConfig,
      _accessController
    );

    router = ISwapRouter(_swapRouter);
  }

  /**
   * @notice Creates a new position wrapper and initializes it with specified liquidity.
   * @param _dustReceiver Address to receive any leftover tokens after transactions.
   * @param _token0 Address of the first token in the liquidity pair.
   * @param _token1 Address of the second token in the liquidity pair.
   * @param _name Name for the new wrapper token.
   * @param _symbol Symbol for the new wrapper token.
   * @param params Parameters for initializing the liquidity position.
   * @return Address of the newly created position wrapper.
   */
  function createNewWrapperPositionAndDeposit(
    address _dustReceiver,
    address _token0,
    address _token1,
    string memory _name,
    string memory _symbol,
    WrapperFunctionParameters.PositionMintParams memory params
  ) external notPaused nonReentrant returns (address) {
    // Create and initialize a new wrapper position
    IPositionWrapper positionWrapper = createNewWrapperPosition(
      _token0,
      _token1,
      _name,
      _symbol,
      params._fee,
      params._tickLower,
      params._tickUpper
    );

    // Initialize the Uniswap V3 position with specified liquidity and mint wrapper tokens
    _initializePositionAndDeposit(_dustReceiver, positionWrapper, params);

    // Return the address of the new wrapper position
    return address(positionWrapper);
  }

  /**
   * @notice Initializes a new Uniswap V3 position with liquidity for the first time and mints wrapper tokens.
   * @notice Adjusts the price range and liquidity of an existing Algebra V3 position.
   * @param _positionWrapper The wrapper of the position to be adjusted.
   * @param params The liquidity parameters including the desired amounts of token0 and token1, and slippage protections.
   */
  function initializePositionAndDeposit(
    address _dustReceiver,
    IPositionWrapper _positionWrapper,
    WrapperFunctionParameters.InitialMintParams memory params
  ) external notPaused nonReentrant {
    // Mint the new Uniswap V3 position using the provided liquidity parameters.
    _initializePositionAndDeposit(
      _dustReceiver,
      _positionWrapper,
      WrapperFunctionParameters.PositionMintParams({
        _amount0Desired: params._amount0Desired,
        _amount1Desired: params._amount1Desired,
        _amount0Min: params._amount0Min,
        _amount1Min: params._amount1Min,
        _fee: _positionWrapper.initialFee(),
        _tickLower: _positionWrapper.initialTickLower(),
        _tickUpper: _positionWrapper.initialTickUpper()
      })
    );
  }

  /**
   * @notice Updates the range and fee tier of an existing Uniswap V3 position represented by a wrapper.
   * @dev This function removes all liquidity from an existing position, then re-establishes the position
   *      with new range and fee parameters. It is intended to adjust positions to more efficient or desirable
   *      price ranges based on market conditions or strategy changes.
   * @param _positionWrapper The wrapper contract that encapsulates the Uniswap V3 position.
   * @param _tickLower The new lower bound of the price range for the position.
   * @param _tickUpper The new upper bound of the price range for the position.
   */
  function updateRange(
    IPositionWrapper _positionWrapper,
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 _underlyingAmountOut0,
    uint256 _underlyingAmountOut1,
    uint24 _fee,
    int24 _tickLower,
    int24 _tickUpper
  ) external notPaused onlyAssetManager {
    uint256 tokenId = _positionWrapper.tokenId();

    address token0 = _positionWrapper.token0();
    address token1 = _positionWrapper.token1();

    // Retrieve existing liquidity to be removed.
    uint128 existingLiquidity = _getExistingLiquidity(tokenId);

    // Remove all liquidity and collect the underlying tokens to this contract.
    _decreaseLiquidityAndCollect(
      existingLiquidity,
      tokenId,
      _underlyingAmountOut0, // Minimal acceptable token amounts set to 1 as a formality; all liquidity is being removed.
      _underlyingAmountOut1,
      address(this)
    );

    _swapTokensForAmountUpdateRange(
      WrapperFunctionParameters.SwapParams({
        _positionWrapper: _positionWrapper,
        _tokenId: tokenId,
        _amountIn: amountIn,
        _token0: token0,
        _token1: token1,
        _tokenIn: tokenIn,
        _tokenOut: tokenOut,
        _tickLower: _tickLower,
        _tickUpper: _tickUpper
      })
    );

    // Mint a new position with the adjusted range and fee, using the tokens just collected.
    (uint256 newTokenId, ) = _mintNewUniswapPosition(
      _positionWrapper,
      WrapperFunctionParameters.PositionMintParams({
        _amount0Desired: IERC20Upgradeable(token0).balanceOf(address(this)),
        _amount1Desired: IERC20Upgradeable(token1).balanceOf(address(this)),
        _amount0Min: 0,
        _amount1Min: 0,
        _fee: _fee,
        _tickLower: _tickLower,
        _tickUpper: _tickUpper
      })
    );

    // Update the wrapper with the new token ID to reflect the repositioned state.
    _positionWrapper.updateTokenId(newTokenId);

    emit PriceRangeUpdated(address(_positionWrapper), _tickLower, _tickUpper);
  }

  /**
   * @notice Creates and initializes a new wrapper position by cloning a predefined base implementation.
   * @dev Clones an existing position wrapper contract, initializes it with specific token addresses and metadata, and registers it.
   *      This method ensures that only whitelisted tokens can be used to create new positions if whitelisting is enabled.
   * @param _token0 The address of the first token (token0) for the new position.
   * @param _token1 The address of the second token (token1) for the new position.
   * @param _name The name to assign to the new wrapper token.
   * @param _symbol The symbol to assign to the new wrapper token.
   * @return positionWrapper The newly created and initialized position wrapper instance.
   */
  function createNewWrapperPosition(
    address _token0,
    address _token1,
    string memory _name,
    string memory _symbol,
    uint24 _fee,
    int24 _tickLower,
    int24 _tickUpper
  ) public notPaused onlyAssetManager returns (IPositionWrapper) {
    // Check if both tokens are whitelisted if the token whitelisting feature is enabled.
    if (
      assetManagementConfig.tokenWhitelistingEnabled() &&
      (!assetManagementConfig.whitelistedTokens(_token0) ||
        !assetManagementConfig.whitelistedTokens(_token1))
    ) {
      revert ErrorLibrary.TokenNotWhitelisted();
    }

    (address token0, address token1) = _getTokensInPoolOrder(
      _token0,
      _token1,
      _fee
    );

    // Deploy and initialize the position wrapper.
    ERC1967Proxy positionWrapperProxy = new ERC1967Proxy(
      protocolConfig.positionWrapperBaseImplementation(),
      abi.encodeWithSelector(
        IPositionWrapper.init.selector,
        address(this),
        token0,
        token1,
        _name,
        _symbol
      )
    );

    IPositionWrapper positionWrapper = IPositionWrapper(
      address(positionWrapperProxy)
    );

    // Set init values for the position wrapper
    positionWrapper.setIntitialParameters(_fee, _tickLower, _tickUpper);

    // Register the new wrapper in the deployed position wrappers list and mark it as a valid wrapper.
    deployedPositionWrappers.push(address(positionWrapper));
    isWrappedPosition[address(positionWrapper)] = true;

    emit NewPositionCreated(address(positionWrapper), _token0, _token1);

    return positionWrapper;
  }

  /**
   * @dev Initializes the position and deposits tokens into it while taking care of dust returns.
   * @param _dustReceiver Address to send any excess tokens.
   * @param _positionWrapper Wrapper contract of the position.
   * @param params Parameters for the position including amounts and ticks.
   */
  function _initializePositionAndDeposit(
    address _dustReceiver,
    IPositionWrapper _positionWrapper,
    WrapperFunctionParameters.PositionMintParams memory params
  ) internal {
    address token0 = _positionWrapper.token0();
    address token1 = _positionWrapper.token1();

    // Record balances of token0 and token1 before the transfer to calculate dust later.
    uint256 balance0Before = IERC20Upgradeable(token0).balanceOf(address(this));
    uint256 balance1Before = IERC20Upgradeable(token1).balanceOf(address(this));

    // Transfer the specified amounts of token0 and token1 from the sender to this contract.
    _transferTokensFromSender(
      token0,
      token1,
      params._amount0Desired,
      params._amount1Desired
    );

    uint256 balance0After = IERC20Upgradeable(token0).balanceOf(address(this));
    uint256 balance1After = IERC20Upgradeable(token1).balanceOf(address(this));

    params._amount0Desired = balance0After - balance0Before;
    params._amount1Desired = balance1After - balance1Before;

    // Mint the new Uniswap V3 position using the provided liquidity parameters.
    (uint256 tokenId, uint128 liquidity) = _mintNewUniswapPosition(
      _positionWrapper,
      params
    );

    // Set the token ID of the newly minted Uniswap V3 position in the wrapper.
    _positionWrapper.setTokenId(tokenId);

    // Mint wrapper tokens equivalent to the amount of liquidity added to the Uniswap position.
    _positionWrapper.mint(msg.sender, liquidity);

    // Calculate the difference in token balances to determine dust.
    balance0After = IERC20Upgradeable(token0).balanceOf(address(this));
    balance1After = IERC20Upgradeable(token1).balanceOf(address(this));

    // Return any excess tokens (dust) that weren't used in liquidity addition back to the sender.
    _returnDust(
      _dustReceiver,
      token0,
      token1,
      balance0After - balance0Before,
      balance1After - balance1Before
    );

    emit PositionInitializedAndDeposited(address(_positionWrapper));
  }

  /**
   * @dev Mints a new Uniswap V3 position with specific liquidity parameters.
   * @param _positionWrapper Wrapper of the position.
   * @param params Liquidity parameters including token amounts and price range.
   * @return tokenId ID of the new Uniswap position.
   * @return liquidity Amount of liquidity added.
   */
  function _mintNewUniswapPosition(
    IPositionWrapper _positionWrapper,
    WrapperFunctionParameters.PositionMintParams memory params
  ) internal returns (uint256 tokenId, uint128 liquidity) {
    address token0 = _positionWrapper.token0();
    address token1 = _positionWrapper.token1();

    // Approve the Uniswap V3 Non-Fungible Position Manager to use the tokens needed for the new position.
    _approveNonFungiblePositionManager(
      token0,
      token1,
      params._amount0Desired,
      params._amount1Desired
    );

    // Mint the new position using the specified parameters and return the tokenId and liquidity amount.
    (tokenId, liquidity, , ) = uniswapV3PositionManager.mint(
      INonfungiblePositionManager.MintParams({
        token0: token0,
        token1: token1,
        fee: params._fee,
        tickLower: params._tickLower,
        tickUpper: params._tickUpper,
        amount0Desired: params._amount0Desired,
        amount1Desired: params._amount1Desired,
        amount0Min: params._amount0Min,
        amount1Min: params._amount1Min,
        recipient: address(this),
        deadline: block.timestamp
      })
    );
  }

  /**
   * @dev Handles swapping tokens to achieve a desired pool ratio.
   * @param _params Parameters including tokens and amounts for the swap.
   * @return balance0 Updated balance of token0.
   * @return balance1 Updated balance of token1.
   */
  function _swapTokensForAmount(
    WrapperFunctionParameters.SwapParams memory _params
  ) internal override returns (uint256 balance0, uint256 balance1) {
    // Swap tokens to the token0 or token1 pool ratio
    if (_params._amountIn > 0) {
      (balance0, balance1) = _swapTokenToToken(_params);
    } else {
      (uint128 tokensOwed0, uint128 tokensOwed1) = _getTokensOwed(
        _params._tokenId
      );
      _verifyZeroSwapAmountForReinvestFees(_params, tokensOwed0, tokensOwed1);
    }
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

    address token0 = _params._token0;
    address token1 = _params._token1;

    if (
      tokenIn == tokenOut ||
      !(tokenOut == token0 || tokenOut == token1) ||
      !(tokenIn == token0 || tokenIn == token1)
    ) {
      revert ErrorLibrary.InvalidTokenAddress();
    }

    IERC20Upgradeable(tokenIn).approve(address(router), _params._amountIn);

    uint256 balanceTokenInBeforeSwap = IERC20Upgradeable(tokenIn).balanceOf(
      address(this)
    );

    ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
      .ExactInputSingleParams({
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        fee: 100,
        recipient: address(this),
        deadline: block.timestamp,
        amountIn: _params._amountIn,
        amountOutMinimum: 0, // @todo add slippage control
        sqrtPriceLimitX96: 0
      });

    router.exactInputSingle(params);

    uint256 balanceTokenInAfterSwap = IERC20Upgradeable(tokenIn).balanceOf(
      address(this)
    );

    (balance0, balance1) = _verifyRatioAfterSwap(
      _params._positionWrapper,
      _params._tickLower,
      _params._tickUpper,
      token0,
      token1,
      balanceTokenInBeforeSwap,
      balanceTokenInAfterSwap
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
    address _token1,
    uint24 _fee
  ) internal view returns (address token0, address token1) {
    IFactory factory = IFactory(uniswapV3PositionManager.factory());
    IPool pool = IPool(factory.getPool(_token0, _token1, _fee));

    token0 = pool.token0();
    token1 = pool.token1();
  }

  /**
   * @dev Retrieves the tokens owed amounts for a given position.
   * @param _tokenId Identifier of the Uniswap position.
   * @return tokensOwed0 Amount of token0 owed.
   * @return tokensOwed1 Amount of token1 owed.
   */
  function _getTokensOwed(
    uint256 _tokenId
  ) internal view returns (uint128 tokensOwed0, uint128 tokensOwed1) {
    (
      ,
      ,
      ,
      ,
      ,
      ,
      ,
      ,
      ,
      ,
      tokensOwed0,
      tokensOwed1
    ) = INonfungiblePositionManager(address(uniswapV3PositionManager))
      .positions(_tokenId);
  }

  /**
   * @dev Retrieves the tick bounds for a given position.
   * @param _tokenId Identifier of the Uniswap position.
   * @return tickLower Lower tick of the position.
   * @return tickUpper Upper tick of the position.
   */
  function _getTicksFromPosition(
    uint256 _tokenId
  ) internal view override returns (int24 tickLower, int24 tickUpper) {
    (, , , , , tickLower, tickUpper, , , , , ) = uniswapV3PositionManager
      .positions(_tokenId);
  }

  /**
   * @notice Retrieves the current liquidity amount for a given position.
   * @param _tokenId The ID of the position.
   * @return existingLiquidity The current amount of liquidity in the position.
   */
  function _getExistingLiquidity(
    uint256 _tokenId
  ) internal view override returns (uint128 existingLiquidity) {
    (, , , , , , , existingLiquidity, , , , ) = uniswapV3PositionManager
      .positions(_tokenId);
  }
}
