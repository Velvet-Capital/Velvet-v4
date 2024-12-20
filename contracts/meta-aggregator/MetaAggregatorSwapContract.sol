// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IMetaAggregatorSwapContract} from "./interfaces/IMetaAggregatorSwapContract.sol";
import {TransferHelper} from "./libraries/TransferHelper.sol";

/**
 * @title MetaAggregatorSwapContract
 * @dev Facilitates swapping between ETH and ERC20 tokens or between two ERC20 tokens using an aggregator.
 */
contract MetaAggregatorSwapContract is
    ReentrancyGuard,
    IMetaAggregatorSwapContract
{
    address constant nativeToken = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE; // Represent native ETH token
    address immutable usdt; // Address of USDT token
    address immutable SWAP_TARGET; // Address of the swap target for delegatecall operations
    address immutable _this; // Address of this contract instance

    // Custom error messages for efficient error handling
    error CannotSwapTokens();
    error AmountInMustBeGreaterThanZero();
    error MinAmountOutMustBeGreaterThanZero();
    error TokenInAndTokenOutCannotBeSame();
    error IncorrectEtherAmountSent();
    error CannotSwapETHToETH();
    error InvalidReceiver();
    error InvalidENSOAddress();
    error InvalidUSDTAddress();
    error InsufficientOutputBalance();
    error InsufficientETHOutAmount();
    error InsufficientTokenOutAmount();
    error SwapFailed();
    error CannotSwapETH();

    //   Event emitted when ETH is swapped for an ERC20 token
    event ETHSwappedForToken(
        uint256 indexed amountOut,
        address indexed tokenOut,
        address indexed receiver
    );

    // Event emitted when an ERC20 token is swapped for another ERC20 token
    event ERC20Swapped(
        uint256 indexed amountOut,
        address indexed tokenIn,
        address indexed tokenOut,
        address receiver
    );

    /**
     * @dev Initializes the contract with the swap target and USDT addresses.
     * @param _ensoSwapContract The address of the swap target contract.
     * @param _usdt The address of the USDT token.
     */
    constructor(address _ensoSwapContract, address _usdt) {
        if (_ensoSwapContract == address(0)) revert InvalidENSOAddress();
        if (_usdt == address(0)) revert InvalidUSDTAddress();
        SWAP_TARGET = _ensoSwapContract;
        usdt = _usdt;
        _this = address(this);
    }

    /**
     * @dev Swaps ETH for an ERC20 token.
     * @param tokenIn must be the native token.
     * @param tokenOut The ERC20 token to swap to.
     * @param aggregator The address of the aggregator to use for the swap.
     * @param swapData The data required for the swap.
     * @param amountIn The amount of ETH to swap.
     * @param minAmountOut The minimum amount of tokenOut expected.
     * @param receiver The address to receive the tokenOut.
     * @param isDelegate Indicates if the swap is in a delegatecall context.
     */
    function swapETH(
        address tokenIn,
        IERC20 tokenOut,
        address aggregator,
        bytes calldata swapData,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver,
        bool isDelegate
    ) external payable nonReentrant {
        if (address(tokenIn) != nativeToken) revert CannotSwapTokens();
        uint256 amountOut = _swapETH(
            tokenIn,
            tokenOut,
            aggregator,
            swapData,
            amountIn,
            minAmountOut,
            receiver,
            isDelegate
        );
        emit ERC20Swapped(
            amountOut,
            address(tokenIn),
            address(tokenOut),
            receiver
        );
    }

    /**
     * @dev Swaps one ERC20 token for another ERC20 token or native ETH.
     * @param tokenIn The ERC20 token to swap from.
     * @param tokenOut The ERC20 token to swap to or native ETH.
     * @param aggregator The address of the aggregator to use for the swap.
     * @param swapData The data required for the swap.
     * @param amountIn The amount of tokenIn to swap.
     * @param minAmountOut The minimum amount of tokenOut expected.
     * @param receiver The address to receive the tokenOut.
     * @param isDelegate Indicates if the swap is in a delegatecall context.
     */
    function swapERC20(
        IERC20 tokenIn,
        IERC20 tokenOut,
        address aggregator,
        bytes calldata swapData,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver,
        bool isDelegate
    ) external nonReentrant {
        uint256 amountOut = _swapERC20(
            tokenIn,
            tokenOut,
            aggregator,
            swapData,
            amountIn,
            minAmountOut,
            receiver,
            isDelegate
        );
        emit ETHSwappedForToken(amountOut, address(tokenOut), receiver);
    }

 

    /**
     * @dev Internal function to perform the swap from ETH to ERC20.
     * @param tokenIn must be the native token.
     * @param tokenOut The ERC20 token to swap to.
     * @param aggregator The address of the aggregator to use for the swap.
     * @param swapData The data required for the swap.
     * @param amountIn The amount of ETH to swap.
     * @param minAmountOut The minimum amount of tokenOut expected.
     * @param receiver The address to receive the tokenOut.
     * @param isDelegate Indicates if the swap is in a delegatecall context.
     * @return The amount of tokenOut received.
     */
    function _swapETH(
        address tokenIn,
        IERC20 tokenOut,
        address aggregator,
        bytes calldata swapData,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver,
        bool isDelegate
    ) internal returns (uint256) {
        _validateInputs(
            tokenIn,
            address(tokenOut),
            amountIn,
            minAmountOut,
            receiver
        );
        if (msg.value != amountIn) revert IncorrectEtherAmountSent();

        uint256 balanceBefore = tokenOut.balanceOf(address(this));
        _executeAggregatorCall(swapData, isDelegate, aggregator, amountIn);
        uint256 amountOut = tokenOut.balanceOf(address(this)) - balanceBefore;

        if (amountOut < minAmountOut) revert InsufficientOutputBalance();
        if (receiver != address(this)) {
            TransferHelper.safeTransfer(address(tokenOut), receiver, amountOut);
        }
        return amountOut;
    }

    /**
     * @dev Internal function to swap ERC20 tokens or ERC20 to native ETH.
     * @param tokenIn The ERC20 token to swap from.
     * @param tokenOut The ERC20 token to swap to or native ETH.
     * @param aggregator The address of the aggregator to use for the swap.
     * @param swapData The data required for the swap.
     * @param amountIn The amount of tokenIn to swap.
     * @param minAmountOut The minimum amount of tokenOut expected.
     * @param receiver The address to receive the tokenOut.
     * @param isDelegate Indicates if the swap is in a delegatecall context.
     * @return The amount of tokenOut received.
     */
    function _swapERC20(
        IERC20 tokenIn,
        IERC20 tokenOut,
        address aggregator,
        bytes calldata swapData,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver,
        bool isDelegate
    ) internal returns (uint256) {
        _validateInputs(
            address(tokenIn),
            address(tokenOut),
            amountIn,
            minAmountOut,
            receiver
        );

        if (!isDelegate) {
            if (address(tokenIn) == usdt)
                TransferHelper.safeApprove(address(tokenIn), aggregator, 0);
            TransferHelper.safeApprove(address(tokenIn), aggregator, amountIn);
        }

        uint256 amountOut;
        if (address(tokenOut) == nativeToken) {
            uint256 balanceBefore = address(this).balance;
            _executeAggregatorCall(swapData, isDelegate, aggregator, 0);
            amountOut = address(this).balance - balanceBefore;
            if (amountOut < minAmountOut) revert InsufficientETHOutAmount();
            if (receiver != address(this)) {
                (bool success, ) = receiver.call{value: amountOut}("");
                if (!success) revert SwapFailed();
            }
        } else {
            uint256 balanceBefore = tokenOut.balanceOf(address(this));
            _executeAggregatorCall(swapData, isDelegate, aggregator, 0);
            amountOut = tokenOut.balanceOf(address(this)) - balanceBefore;
            if (amountOut < minAmountOut) revert InsufficientTokenOutAmount();

            if (receiver != address(this)) {
                TransferHelper.safeTransfer(
                    address(tokenOut),
                    receiver,
                    amountOut
                );
            }
        }

        return amountOut;
    }

    /**
     * @dev Executes a swap call via the aggregator or delegatecall context.
     * @param swapData The data required for the swap.
     * @param isDelegate Indicates if the swap is in a delegatecall context.
     * @param aggregator The address of the aggregator to use for the swap.
     * @param value The amount of ETH to send with the call (if applicable).
     */
    function _executeAggregatorCall(
        bytes memory swapData,
        bool isDelegate,
        address aggregator,
        uint256 value
    ) internal {
        (bool success, bytes memory returnData) = isDelegate
            ? SWAP_TARGET.delegatecall(swapData)
            : aggregator.call{value: value}(swapData);

        if (!success) {
            assembly {
                let size := mload(returnData)
                revert(add(32, returnData), size)
            }
        }
    }

    /**
     * @dev Validates the swap inputs for consistency and correctness.
     * @param tokenIn address of tokenIn
     * @param tokenOut address of tokenIn
     * @param amountIn The amount of tokenIn to swap.
     * @param minAmountOut The minimum amount of tokenOut expected.
     * @param receiver The address to receive the tokenOut.
     */
    function _validateInputs(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver
    ) internal pure {
        if (receiver == address(0)) revert InvalidReceiver();
        if (amountIn == 0) revert AmountInMustBeGreaterThanZero();
        if (minAmountOut == 0) revert MinAmountOutMustBeGreaterThanZero();
        if (tokenIn == tokenOut) revert TokenInAndTokenOutCannotBeSame();
    }

    /**
     * @dev Allows the contract to receive ETH.
     */
    receive() external payable {}
}
