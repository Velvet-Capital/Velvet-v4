// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IPositionWrapper } from "./abstract/IPositionWrapper.sol";

/**
 * @title WrapperFunctionParameters
 * @dev Library defining structured parameters for functions in wrapper contracts,
 * aiding in organized handling of data for position management operations.
 */
library WrapperFunctionParameters {
  /**
   * @dev Struct for parameters used during the minting of a new position in a liquidity pool.
   * It encapsulates all necessary details for position creation and initial liquidity provision.
   * @param _amount0Desired Desired amount of token0 to be added to the position.
   * @param _amount1Desired Desired amount of token1 to be added to the position.
   * @param _amount0Min Minimum acceptable amount of token0 ensuring slippage protection.
   * @param _amount1Min Minimum acceptable amount of token1 ensuring slippage protection.
   * @param _fee Fee tier of the pool, represented in basis points.
   * @param _tickLower Lower bound of the price tick range for the position.
   * @param _tickUpper Upper bound of the price tick range for the position.
   */
  struct PositionMintParams {
    uint256 _amount0Desired;
    uint256 _amount1Desired;
    uint256 _amount0Min;
    uint256 _amount1Min;
    uint24 _fee;
    int24 _tickLower;
    int24 _tickUpper;
  }

  /**
   * @dev Struct for initial parameters used when minting tokens related to a liquidity position.
   * This is typically used for first-time position setup where specific pool parameters are not yet set.
   * @param _amount0Desired Desired initial amount of token0.
   * @param _amount1Desired Desired initial amount of token1.
   * @param _amount0Min Minimum acceptable amount of token0 to mitigate slippage.
   * @param _amount1Min Minimum acceptable amount of token1 to mitigate slippage.
   */
  struct InitialMintParams {
    uint256 _amount0Desired;
    uint256 _amount1Desired;
    uint256 _amount0Min;
    uint256 _amount1Min;
    address _deployer;
  }

  /**
   * @dev Struct for initial parameters used when minting tokens related to a liquidity position.
   * This is typically used for first-time position setup where specific pool parameters are not yet set.
   * @param _amount0Desired Desired initial amount of token0.
   * @param _amount1Desired Desired initial amount of token1.
   * @param _amount0Min Minimum acceptable amount of token0 to mitigate slippage.
   * @param _amount1Min Minimum acceptable amount of token1 to mitigate slippage.
   */
  struct InitialMintParamsAlgebra {
    uint256 _amount0Desired;
    uint256 _amount1Desired;
    uint256 _amount0Min;
    uint256 _amount1Min;
    address _deployer;
  }

  /**
   * @dev Extension of PositionMintParams for specific use cases or additional functionality
   * that may require different handling or additional parameters.
   * @param _amount0Desired Desired amount of token0 for the position.
   * @param _amount1Desired Desired amount of token1 for the position.
   * @param _amount0Min Minimum amount of token0 required to avoid transaction slippage.
   * @param _amount1Min Minimum amount of token1 required to avoid transaction slippage.
   * @param _tickLower Lower tick boundary for setting the price range.
   * @param _tickUpper Upper tick boundary for setting the price range.
   */
  struct PositionMintParamsThena {
    uint256 _amount0Desired;
    uint256 _amount1Desired;
    uint256 _amount0Min;
    uint256 _amount1Min;
    int24 _tickLower;
    int24 _tickUpper;
    address _deployer;
  }

  /**
   * @dev Extension of PositionMintParams for specific use cases or additional functionality
   * that may require different handling or additional parameters.
   * @param _amount0Desired Desired amount of token0 for the position.
   * @param _amount1Desired Desired amount of token1 for the position.
   * @param _amount0Min Minimum amount of token0 required to avoid transaction slippage.
   * @param _amount1Min Minimum amount of token1 required to avoid transaction slippage.
   * @param _tickLower Lower tick boundary for setting the price range.
   * @param _tickUpper Upper tick boundary for setting the price range.
   */
  struct PositionMintParamsAlgebra {
    uint256 _amount0Desired;
    uint256 _amount1Desired;
    uint256 _amount0Min;
    uint256 _amount1Min;
    int24 _tickLower;
    int24 _tickUpper;
    address _deployer;
  }

  /**
   * @dev Parameters required for a deposit operation, typically including token amounts and address details for returning any excess tokens.
   * @param _dustReceiver Address to which any non-utilized tokens ('dust') are returned.
   * @param _positionWrapper Reference to the position wrapper contract.
   * @param _amount0Desired Desired amount of token0 to add to the position.
   * @param _amount1Desired Desired amount of token1 to add to the position.
   * @param _amount0Min Minimum amount of token0 to protect against slippage.
   * @param _amount1Min Minimum amount of token1 to protect against slippage.
   * @param _tokenIn Address of the token being input in case of a swap.
   * @param _tokenOut Address of the token being output from the swap.
   * @param _amountIn Amount of the input token to be swapped.
   */
  struct WrapperDepositParams {
    address _dustReceiver;
    IPositionWrapper _positionWrapper;
    uint256 _amount0Desired;
    uint256 _amount1Desired;
    uint256 _amount0Min;
    uint256 _amount1Min;
    address _tokenIn;
    address _tokenOut;
    uint256 _amountIn;
  }

  /**
   * @dev Struct defining parameters for a swap operation within a liquidity management context,
   * including the positions, tokens, amounts, and price ticks involved.
   * @param _positionWrapper Wrapper contract associated with the position.
   * @param _tokenId Identifier of the position token.
   * @param _amountIn Amount of the token to be swapped.
   * @param _token0 First token of the liquidity pair.
   * @param _token1 Second token of the liquidity pair.
   * @param _tokenIn Token being swapped.
   * @param _tokenOut Token to receive from the swap.
   * @param _tickLower Lower price tick for managing the position range.
   * @param _tickUpper Upper price tick for managing the position range.
   */
  struct SwapParams {
    IPositionWrapper _positionWrapper;
    uint256 _tokenId;
    uint256 _amountIn;
    address _token0;
    address _token1;
    address _tokenIn;
    address _tokenOut;
    int24 _tickLower;
    int24 _tickUpper;
  }
}
