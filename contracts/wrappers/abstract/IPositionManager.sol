// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.17;

import { WrapperFunctionParameters } from "../WrapperFunctionParameters.sol";
import { IPositionWrapper } from "./IPositionWrapper.sol";

/**
 * @title IPositionManager
 * @dev Interface for a Position Manager contract that coordinates interactions
 * between Uniswap V3 positions and external systems like asset management or access control.
 * This interface facilitates the initialization of position manager instances, updating base
 * implementations for position wrappers, and querying wrapped positions.
 */
interface IPositionManager {
  /**
   * @notice Initializes the Position Manager with configuration settings.
   * @dev Sets up the position manager with necessary configurations including
   * asset management settings, access control, and a base implementation for position wrappers.
   * @param _assetManagerConfig Address of the asset management configuration contract.
   * @param _accessController Address of the access control contract.
   */
  function init(
    address _externalPositionStorage,
    address _protocolConfig,
    address _assetManagerConfig,
    address _accessController,
    address _nftManager,
    address _swapRouter,
    bytes32 _protocolId
  ) external;

  /**
   * @notice Updates the base implementation address for position wrappers.
   * @dev This allows the position manager to adapt to new wrapper implementations without disrupting existing positions.
   * Useful in upgrading the system or correcting issues in previous implementations.
   * @param _positionWrapperBaseImplementation The new base implementation address to be used for creating position wrappers.
   */
  function updatePositionWrapperBaseImplementation(
    address _positionWrapperBaseImplementation
  ) external;

  function initializePositionAndDeposit(
    address _dustReceiver,
    IPositionWrapper _positionWrapper,
    WrapperFunctionParameters.InitialMintParams memory params
  ) external;

  /**
   * @notice Increases liquidity in an existing Uniswap V3 position and mints corresponding wrapper tokens.
   * @param _params Struct containing parameters necessary for adding liquidity and minting tokens.
   * @dev Handles the transfer of tokens, adds liquidity to Uniswap V3, and mints wrapper tokens proportionate to the added liquidity.
   */
  function increaseLiquidity(
    WrapperFunctionParameters.WrapperDepositParams memory _params
  ) external;

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
    address _positionWrapper,
    uint256 _withdrawalAmount,
    uint256 _amount0Min,
    uint256 _amount1Min,
    address tokenIn,
    address tokenOut,
    uint256 amountIn
  ) external;

  /**
   * @notice Function to retrieve the asset management configuration contract address.
   * @return The address of the asset management configuration contract.
   */
  function assetManagementConfig() external view returns (address);

  /**
   * @notice Function to retrieve the protocol configuration contract address.
   * @return The address of the protocol configuration contract.
   */
  function protocolConfig() external view returns (address);

  function externalPositionStorage() external view returns (address);
}
