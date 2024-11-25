// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/security/ReentrancyGuardUpgradeable.sol";
import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import { INonfungiblePositionManager } from "./INonfungiblePositionManager.sol";
import { TokenCalculations } from "../../core/calculations/TokenCalculations.sol";
import { ErrorLibrary } from "../../library/ErrorLibrary.sol";
import { IPositionWrapper } from "./IPositionWrapper.sol";
import { WrapperFunctionParameters } from "../WrapperFunctionParameters.sol";
import { MathUtils } from "../../core/calculations/MathUtils.sol";
import { IAssetManagementConfig } from "../../config/assetManagement/IAssetManagementConfig.sol";
import { IProtocolConfig } from "../../config/protocol/IProtocolConfig.sol";
import { IAccessController } from "../../access/IAccessController.sol";
import { AccessRoles } from "../../access/AccessRoles.sol";
import { IPriceOracle } from "../../oracle/IPriceOracle.sol";
import { IExternalPositionStorage } from "./IExternalPositionStorage.sol";

/**
 * @title PositionManagerAbstract
 * @notice Abstract contract for managing Uniswap V3 positions and representing them as ERC20 tokens.
 * It allows managing liquidity in Uniswap V3 positions through a tokenized interface.
 * @dev Abstract contract for managing Uniswap V3 positions and representing them as ERC20 tokens.
 */
abstract contract PositionManagerAbstract is
  UUPSUpgradeable,
  TokenCalculations,
  ReentrancyGuardUpgradeable,
  AccessRoles
{
  /// @dev Reference to the Uniswap V3 Non-Fungible Position Manager for managing liquidity positions.
  INonfungiblePositionManager internal uniswapV3PositionManager;

  IProtocolConfig public protocolConfig;

  /// @dev Contract for managing asset configurations, used to enforce rules and parameters for asset operations.
  IAssetManagementConfig assetManagementConfig;

  /// @dev Access control contract for managing permissions and roles within the ecosystem.
  IAccessController accessController;

  /// @notice Minimum amount of fees in smallest token unit that must be collected before they can be reinvested.
  uint256 internal constant MIN_REINVESTMENT_AMOUNT = 1000000;

  uint256 internal constant TOTAL_WEIGHT = 10_000;

  /// @notice List of addresses for all deployed position wrapper contracts.
  address[] public deployedPositionWrappers;

  /// @notice The identifier for the protocol that this position manager supports.
  bytes32 public protocolId;

  /// @dev Contract for managing external positions, used to track and validate wrapped positions.
  IExternalPositionStorage public externalPositionStorage;

  event NewPositionCreated(
    address indexed positionWrapper,
    address indexed token0,
    address indexed token1
  );
  event PositionInitializedAndDeposited(address indexed positionManager);
  event LiquidityIncreased(address indexed user, uint256 liquidity);
  event LiquidityDecreased(address indexed user, uint256 liquidity);
  event PriceRangeUpdated(
    address indexed positionManager,
    int24 tickLower,
    int24 tickUpper
  );

  /**
   * @dev Restricts function access to asset managers only.
   */
  modifier onlyAssetManager() {
    if (!accessController.hasRole(ASSET_MANAGER, msg.sender))
      revert ErrorLibrary.CallerNotAssetManager();
    _;
  }

  modifier notEmergencyPaused() {
    if (IProtocolConfig(protocolConfig).isProtocolEmergencyPaused())
      revert ErrorLibrary.ProtocolEmergencyPaused();
    _;
  }

  modifier notPaused() {
    if (IProtocolConfig(protocolConfig).isProtocolPaused())
      revert ErrorLibrary.ProtocolIsPaused();
    _;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice Initializes the contract with necessary configurations and addresses.
   * @param _nonFungiblePositionManagerAddress Address of the Uniswap V3 Non-Fungible Position Manager.
   * @param _assetManagerConfig Address of the asset management configuration contract.
   * @param _accessController Address of the access control contract.
   * @dev Sets up the contract with required addresses and configuration for asset management and access control.
   */
  function PositionManagerAbstract__init(
    address _externalPositionStorage,
    address _nonFungiblePositionManagerAddress,
    address _protocolConfig,
    address _assetManagerConfig,
    address _accessController,
    bytes32 _protocolId
  ) internal {
    __UUPSUpgradeable_init();

    externalPositionStorage = IExternalPositionStorage(
      _externalPositionStorage
    );

    uniswapV3PositionManager = INonfungiblePositionManager(
      _nonFungiblePositionManagerAddress
    );
    protocolConfig = IProtocolConfig(_protocolConfig);
    assetManagementConfig = IAssetManagementConfig(_assetManagerConfig);
    accessController = IAccessController(_accessController);
    protocolId = _protocolId;
  }

  /**
   * @notice Increases liquidity in an existing Uniswap V3 position and mints corresponding wrapper tokens.
   * @param _params Struct containing parameters necessary for adding liquidity and minting tokens.
   * @dev Handles the transfer of tokens, adds liquidity to Uniswap V3, and mints wrapper tokens proportionate to the added liquidity.
   */
  function increaseLiquidity(
    WrapperFunctionParameters.WrapperDepositParams memory _params
  ) external notPaused nonReentrant {
    if (
      address(_params._positionWrapper) == address(0) ||
      _params._dustReceiver == address(0)
    ) revert ErrorLibrary.InvalidAddress();

    uint256 tokenId = _params._positionWrapper.tokenId();
    address token0 = _params._positionWrapper.token0();
    address token1 = _params._positionWrapper.token1();

    // Reinvest any collected fees back into the pool before adding new liquidity.
    _collectFeesAndReinvest(
      _params._positionWrapper,
      tokenId,
      token0,
      token1,
      _params._tokenIn,
      _params._tokenOut,
      _params._amountIn
    );

    // Track token balances before the operation to calculate dust later.
    uint256 balance0Before = IERC20Upgradeable(token0).balanceOf(address(this));
    uint256 balance1Before = IERC20Upgradeable(token1).balanceOf(address(this));

    // Transfer the desired liquidity tokens from the caller to this contract.
    _transferTokensFromSender(
      token0,
      token1,
      _params._amount0Desired,
      _params._amount1Desired
    );

    uint256 balance0After = IERC20Upgradeable(token0).balanceOf(address(this));
    uint256 balance1After = IERC20Upgradeable(token1).balanceOf(address(this));

    _params._amount0Desired = balance0After - balance0Before;
    _params._amount1Desired = balance1After - balance1Before;

    // Approve the Uniswap manager to use the tokens for liquidity.
    _approveNonFungiblePositionManager(
      token0,
      token1,
      _params._amount0Desired,
      _params._amount1Desired
    );

    // Increase liquidity at the position.
    (uint128 liquidity, , ) = uniswapV3PositionManager.increaseLiquidity(
      INonfungiblePositionManager.IncreaseLiquidityParams({
        tokenId: tokenId,
        amount0Desired: _params._amount0Desired,
        amount1Desired: _params._amount1Desired,
        amount0Min: _params._amount0Min,
        amount1Min: _params._amount1Min,
        deadline: block.timestamp
      })
    );

    // Mint wrapper tokens corresponding to the liquidity added.
    _mintTokens(_params._positionWrapper, tokenId, liquidity);

    // Calculate token balances after the operation to determine any remaining dust.
    balance0After = IERC20Upgradeable(token0).balanceOf(address(this));
    balance1After = IERC20Upgradeable(token1).balanceOf(address(this));

    // Return any dust to the caller.
    _returnDust(
      _params._dustReceiver,
      token0,
      token1,
      balance0After,
      balance1After
    );

    emit LiquidityIncreased(msg.sender, liquidity);
  }

  /**
   * @notice Decreases liquidity for an existing Uniswap V3 position and burns the corresponding wrapper tokens.
   * @param _positionWrapper Address of the position wrapper contract.
   * @param _withdrawalAmount Amount of wrapper tokens representing the liquidity to be removed.
   * @param _amount0Min Minimum amount of token0 expected to prevent slippage.
   * @param _amount1Min Minimum amount of token1 expected to prevent slippage.
   * @param tokenIn The address of the token to be swapped (input).
   * @param tokenOut The address of the token to be received (output).
   * @param amountIn The amount of `tokenIn` to be swapped to `tokenOut`.
   * @dev Burns wrapper tokens and reduces liquidity in the Uniswap V3 position based on the provided parameters.
   */
  function decreaseLiquidity(
    IPositionWrapper _positionWrapper,
    uint256 _withdrawalAmount,
    uint256 _amount0Min,
    uint256 _amount1Min,
    address tokenIn,
    address tokenOut,
    uint256 amountIn
  ) external notEmergencyPaused nonReentrant {
    uint256 tokenId = _positionWrapper.tokenId();

    if (_positionWrapper == IPositionWrapper(address(0)))
      revert ErrorLibrary.InvalidAddress();

    // Ensure the withdrawal amount is greater than zero.
    if (_withdrawalAmount == 0) revert ErrorLibrary.AmountCannotBeZero();

    // Ensure the caller has sufficient wrapper tokens to cover the withdrawal amount.
    if (_withdrawalAmount > _positionWrapper.balanceOf(msg.sender))
      revert ErrorLibrary.InsufficientBalance();

    uint256 totalSupplyBeforeBurn = _positionWrapper.totalSupply();

    // Burn the wrapper tokens equivalent to the withdrawn liquidity.
    _positionWrapper.burn(msg.sender, _withdrawalAmount);

    // If there are still wrapper tokens in circulation, collect fees and reinvest them.
    if (totalSupplyBeforeBurn > 0)
      _collectFeesAndReinvest(
        _positionWrapper,
        tokenId,
        _positionWrapper.token0(),
        _positionWrapper.token1(),
        tokenIn,
        tokenOut,
        amountIn
      );

    // Calculate the proportionate amount of liquidity to decrease based on the total supply and withdrawal amount.
    uint128 liquidityToDecrease = MathUtils.safe128(
      (_getExistingLiquidity(tokenId) * _withdrawalAmount) /
        totalSupplyBeforeBurn
    );

    // Execute the decrease liquidity operation and collect the freed assets.
    _decreaseLiquidityAndCollect(
      liquidityToDecrease,
      tokenId,
      _amount0Min,
      _amount1Min,
      msg.sender
    );

    emit LiquidityDecreased(msg.sender, liquidityToDecrease);
  }

  /**
   * @notice Approves the Non-Fungible Position Manager to spend tokens on behalf of this contract.
   * @param _token0 The address of token0.
   * @param _token1 The address of token1.
   * @param _amount0 The amount of token0 to approve.
   * @param _amount1 The amount of token1 to approve.
   */
  function _approveNonFungiblePositionManager(
    address _token0,
    address _token1,
    uint256 _amount0,
    uint256 _amount1
  ) internal {
    // Reset the allowance for token0 to zero before setting it to a new value

    TransferHelper.safeApprove(_token0, address(uniswapV3PositionManager), 0);
    TransferHelper.safeApprove(_token1, address(uniswapV3PositionManager), 0);

    // Reset the allowance for token1 to zero before setting it to a new value
    TransferHelper.safeApprove(
      _token0,
      address(uniswapV3PositionManager),
      _amount0
    );
    TransferHelper.safeApprove(
      _token1,
      address(uniswapV3PositionManager),
      _amount1
    );
  }

  /**
   * @notice Transfers specified amounts of token0 and token1 from the sender to this contract.
   * @dev Uses the TransferHelper library to safely transfer tokens from the function caller to this contract.
   *      This function is typically used to prepare tokens for liquidity operations in Uniswap V3.
   * @param _token0 The contract address of the first token (token0).
   * @param _token1 The contract address of the second token (token1).
   * @param _amount0 The amount of token0 to transfer from the sender to this contract.
   * @param _amount1 The amount of token1 to transfer from the sender to this contract.
   */
  function _transferTokensFromSender(
    address _token0,
    address _token1,
    uint256 _amount0,
    uint256 _amount1
  ) internal {
    // Safely transfer token0 from the sender to this contract.

    if (_amount0 > 0) {
      TransferHelper.safeTransferFrom(
        _token0,
        msg.sender,
        address(this),
        _amount0
      );
    }

    // Safely transfer token1 from the sender to this contract.
    if (_amount1 > 0) {
      TransferHelper.safeTransferFrom(
        _token1,
        msg.sender,
        address(this),
        _amount1
      );
    }
  }

  /**
   * @notice Returns any excess tokens to the sender after operations are completed.
   * @param _token0 The address of token0.
   * @param _token1 The address of token1.
   * @param _amount0 The amount of token0 to return.
   * @param _amount1 The amount of token1 to return.
   */
  function _returnDust(
    address _dustReceiver,
    address _token0,
    address _token1,
    uint256 _amount0,
    uint256 _amount1
  ) internal {
    if (_amount0 > 0)
      TransferHelper.safeTransfer(_token0, _dustReceiver, _amount0);
    if (_amount1 > 0)
      TransferHelper.safeTransfer(_token1, _dustReceiver, _amount1);
  }

  /**
   * @notice Mints wrapper tokens corresponding to the provided liquidity in the Uniswap V3 position.
   * @dev Calculates the amount of wrapper tokens to mint based on the liquidity added.
   *      If it's the first time liquidity is added, the mint amount equals the liquidity.
   *      Otherwise, it calculates a share based on existing liquidity.
   * @param _positionWrapper The position wrapper associated with the Uniswap V3 position.
   * @param _tokenId The ID of the Uniswap V3 position token.
   * @param _liquidity The amount of liquidity that has been added to the position.
   */
  function _mintTokens(
    IPositionWrapper _positionWrapper,
    uint256 _tokenId,
    uint128 _liquidity
  ) internal {
    uint256 totalSupply = _positionWrapper.totalSupply();
    uint256 mintAmount;

    // If this is the first liquidity being added, mint tokens equal to the amount of liquidity.
    if (totalSupply == 0) {
      mintAmount = _liquidity;
    } else {
      // Calculate the proportionate amount of tokens to mint based on the added liquidity.
      uint256 userShare = (_liquidity * ONE_ETH_IN_WEI) /
        _getExistingLiquidity(_tokenId);
      mintAmount = _calculateMintAmount(userShare, totalSupply);
    }

    // Mint the calculated amount of wrapper tokens to the sender.
    _positionWrapper.mint(msg.sender, mintAmount);
  }

  /**
   * @notice Decreases liquidity and collects the tokens from a Uniswap V3 position.
   * @param _liquidityToDecrease The amount of liquidity to decrease.
   * @param _tokenId The ID of the Uniswap V3 position.
   * @param _amount0Min The minimum amount of token0 that must be returned.
   * @param _amount1Min The minimum amount of token1 that must be returned.
   * @param _recipient The address that will receive the withdrawn tokens.
   */
  function _decreaseLiquidityAndCollect(
    uint128 _liquidityToDecrease,
    uint256 _tokenId,
    uint256 _amount0Min,
    uint256 _amount1Min,
    address _recipient
  ) internal {
    // Decrease liquidity at Uniswap V3 Nonfungible Position Manager
    uniswapV3PositionManager.decreaseLiquidity(
      INonfungiblePositionManager.DecreaseLiquidityParams({
        tokenId: _tokenId,
        liquidity: _liquidityToDecrease,
        amount0Min: _amount0Min,
        amount1Min: _amount1Min,
        deadline: block.timestamp
      })
    );

    // Collect the tokens released from the decrease in liquidity
    uniswapV3PositionManager.collect(
      INonfungiblePositionManager.CollectParams({
        tokenId: _tokenId,
        recipient: _recipient,
        amount0Max: type(uint128).max,
        amount1Max: type(uint128).max
      })
    );
  }

  /**
   * @notice Collects trading fees accrued in a Uniswap V3 position and reinvests them by increasing liquidity.
   * @dev This function performs several steps: it first collects the accrued fees from the specified Uniswap V3 position.
   *      If the fees for both involved tokens exceed the predefined minimum thresholds, it will reinvest these by adding them
   *      back as liquidity to the same position. This is intended to enhance the position's value and potential fee earnings.
   * @param _positionWrapper An interface to the position wrapper that manages interactions with the Uniswap V3 positions.
   * @param _tokenId The ID of the Uniswap V3 position from which fees are to be collected.
   * @param _token0 The address of the first token in the Uniswap V3 position.
   * @param _token1 The address of the second token in the Uniswap V3 position.
   * @param tokenIn The address of the token to be swapped (input).
   * @param tokenOut The address of the token to be received (output).
   * @param amountIn The amount of `tokenIn` to be swapped to `tokenOut`.
   */
  function _collectFeesAndReinvest(
    IPositionWrapper _positionWrapper,
    uint256 _tokenId,
    address _token0,
    address _token1,
    address tokenIn,
    address tokenOut,
    uint256 amountIn
  ) internal {
    // Collect all available fees for the position to this contract
    uniswapV3PositionManager.collect(
      INonfungiblePositionManager.CollectParams({
        tokenId: _tokenId,
        recipient: address(this),
        amount0Max: type(uint128).max,
        amount1Max: type(uint128).max
      })
    );

    (int24 tickLower, int24 tickUpper) = _getTicksFromPosition(_tokenId);

    (uint256 feeCollectedT0, uint256 feeCollectedT1) = _swapTokensForAmount(
      WrapperFunctionParameters.SwapParams({
        _positionWrapper: _positionWrapper,
        _tokenId: _tokenId,
        _amountIn: amountIn,
        _token0: _token0,
        _token1: _token1,
        _tokenIn: tokenIn,
        _tokenOut: tokenOut,
        _tickLower: tickLower,
        _tickUpper: tickUpper
      })
    );

    // Reinvest fees if they exceed the minimum threshold for reinvestment
    if (
      feeCollectedT0 > MIN_REINVESTMENT_AMOUNT &&
      feeCollectedT1 > MIN_REINVESTMENT_AMOUNT
    ) {
      // Approve the Uniswap manager to use the tokens for liquidity.
      _approveNonFungiblePositionManager(
        _token0,
        _token1,
        feeCollectedT0,
        feeCollectedT1
      );

      // Increase liquidity using all collected fees
      uniswapV3PositionManager.increaseLiquidity(
        INonfungiblePositionManager.IncreaseLiquidityParams({
          tokenId: _tokenId,
          amount0Desired: feeCollectedT0,
          amount1Desired: feeCollectedT1,
          amount0Min: 1,
          amount1Min: 1,
          deadline: block.timestamp
        })
      );
    }
  }

  /**
   * @dev Handles swapping tokens to achieve a desired pool ratio.
   * @param _params Parameters including tokens and amounts for the swap.
   * @return balance0 Updated balance of token0.
   * @return balance1 Updated balance of token1.
   */
  function _swapTokensForAmount(
    WrapperFunctionParameters.SwapParams memory _params
  ) internal virtual returns (uint256, uint256);

  /**
   * @dev Handles swapping tokens to achieve a desired pool ratio.
   * @param _params Parameters including tokens and amounts for the swap.
   * @return balance0 Updated balance of token0.
   * @return balance1 Updated balance of token1.
   */
  function _swapTokensForAmountUpdateRange(
    WrapperFunctionParameters.SwapParams memory _params
  ) internal returns (uint256 balance0, uint256 balance1) {
    // Swap tokens to the token0 or token1 pool ratio
    if (_params._amountIn > 0) {
      (balance0, balance1) = _swapTokenToToken(_params);
    } else {
      _verifyZeroSwapAmount(protocolConfig, _params);
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
  ) internal virtual returns (uint256, uint256);

  function _verifyZeroSwapAmount(
    IProtocolConfig protocolConfig,
    WrapperFunctionParameters.SwapParams memory _params
  ) internal virtual;

  /**
   * @notice Retrieves the current liquidity amount for a given position.
   * @param _tokenId The ID of the position.
   * @return existingLiquidity The current amount of liquidity in the position.
   */
  function _getExistingLiquidity(
    uint256 _tokenId
  ) internal view virtual returns (uint128 existingLiquidity);

  /**
   * @dev Retrieves the tick bounds for a given position.
   * @param _tokenId Identifier of the Uniswap position.
   * @return tickLower Lower tick of the position.
   * @return tickUpper Upper tick of the position.
   */
  function _getTicksFromPosition(
    uint256 _tokenId
  ) internal view virtual returns (int24, int24);

  /**
   * @notice Authorizes upgrade for this contract
   * @param newImplementation Address of the new implementation
   */
  function _authorizeUpgrade(address newImplementation) internal override {
    // Only the owner (PortfolioFactory contract) can authorize an upgrade
    if (!(msg.sender == assetManagementConfig.owner()))
      revert ErrorLibrary.CallerNotAdmin();
    // Intentionally left empty as required by an abstract contract
  }
}
