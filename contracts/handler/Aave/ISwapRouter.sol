// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

interface ISwapRouter {
    /// @notice Parameters for a single-token-to-token swap
    struct ExactInputSingleParams {
        address tokenIn;         // The address of the input token
        address tokenOut;        // The address of the output token
        uint24 fee;              // Pool fee (e.g., 3000 = 0.3%)
        address recipient;       // The address that will receive the output tokens
        uint256 deadline;        // Transaction deadline as a timestamp
        uint256 amountIn;        // The amount of the input token to swap
        uint256 amountOutMinimum;// The minimum acceptable output token amount
        uint160 sqrtPriceLimitX96; // Price limit, if any (0 = no limit)
    }

    /// @notice Parameters for a multi-hop swap
    struct ExactInputParams {
        bytes path;              // Encoded path for the token swap (tokenIn -> fee -> tokenOut)
        address recipient;       // The address that will receive the output tokens
        uint256 deadline;        // Transaction deadline as a timestamp
        uint256 amountIn;        // The amount of the input token to swap
        uint256 amountOutMinimum;// The minimum acceptable output token amount
    }

    /**
     * @notice Swaps an exact amount of input tokens for as many output tokens as possible through a single pool.
     * @param params The parameters necessary for the swap, encoded as `ExactInputSingleParams`.
     * @return amountOut The amount of output tokens received.
     */
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);

    /**
     * @notice Swaps an exact amount of input tokens for as many output tokens as possible through multiple pools.
     * @param params The parameters necessary for the multi-hop swap, encoded as `ExactInputParams`.
     * @return amountOut The amount of output tokens received.
     */
    function exactInput(ExactInputParams calldata params)
        external
        payable
        returns (uint256 amountOut);

    /**
     * @notice Swaps as few input tokens as possible for an exact amount of output tokens through a single pool.
     * @param params The parameters necessary for the swap, encoded as `ExactInputSingleParams`.
     * @return amountIn The amount of input tokens used.
     */
    function exactOutputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountIn);

    /**
     * @notice Swaps as few input tokens as possible for an exact amount of output tokens through multiple pools.
     * @param params The parameters necessary for the multi-hop swap, encoded as `ExactInputParams`.
     * @return amountIn The amount of input tokens used.
     */
    function exactOutput(ExactInputParams calldata params)
        external
        payable
        returns (uint256 amountIn);
}