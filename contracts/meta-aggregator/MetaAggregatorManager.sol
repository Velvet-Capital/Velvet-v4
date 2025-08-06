// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IMetaAggregatorSwapContract} from "./interfaces/IMetaAggregatorSwapContract.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMetaAggregatorManager} from "./interfaces/IMetaAggregatorManager.sol";
import {TransferHelper} from "./libraries/TransferHelper.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MetaAggregatorManager
 * @dev This contract manages the swapping of tokens through a meta aggregator.
 */
contract MetaAggregatorManager is
    ReentrancyGuard,
    Ownable,
    IMetaAggregatorManager
{
    IMetaAggregatorSwapContract immutable MetaAggregatorSwap;
    address nativeToken = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // Custom error definitions
    error CannotSwapETH();
    error InvalidMetaAggregatorAddress();
    error TransferFailed();
    error InvalidToken();
    //events
    event ERC20Transferred(
        address indexed token,
        address indexed to,
        uint256 amount
    );
    event ERC20TransferredBatch(
        address[] tokens,
        address[] to,
        uint256[] amounts
    );

    /**
     * @dev Sets the address of the MetaAggregatorSwap contract.
     * @param _metaAggregatorSwap The address of the MetaAggregatorSwap contract.
     */
    constructor(address _metaAggregatorSwap) Ownable() {
        if (_metaAggregatorSwap == address(0)) {
            revert InvalidMetaAggregatorAddress();
        }
        MetaAggregatorSwap = IMetaAggregatorSwapContract(_metaAggregatorSwap);
    }

    /**
     * @dev Swaps tokens using the MetaAggregatorSwap contract.
     * @param tokenIn The input token (ERC20).
     * @param tokenOut The output token (ERC20).
     * @param aggregator The address of the aggregator to perform the swap.
     * @param receiver The address to receive the tokenOut.
     * @param feeRecipient The address to receive the fee.
     * @param amountIn The amount of tokenIn to swap.
     * @param minAmountOut The minimum amount of tokenOut expected.
     * @param feeBps The fee basis points sent from amountIn.
     * @param swapData The data required for the swap.
     * @param isDelegate Whether to use delegatecall for the swap.
     * @notice This function is non-reentrant to prevent reentrancy attacks.
     */
    function swap(
        IERC20 tokenIn,
        IERC20 tokenOut,
        address aggregator,
        address receiver,
        address feeRecipient,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 feeBps,
        bytes calldata swapData,
        bool isDelegate
    ) external nonReentrant {
        // Check if the input token is the native token (ETH)
        if (address(tokenIn) == nativeToken) {
            revert CannotSwapETH();
        }

        TransferHelper.safeTransferFrom(
            address(tokenIn),
            msg.sender,
            address(MetaAggregatorSwap),
            amountIn
        );

        MetaAggregatorSwap.swapERC20(
            IMetaAggregatorSwapContract.SwapERC20Params(
                tokenIn,
                tokenOut,
                aggregator,
                msg.sender,
                receiver,
                feeRecipient,
                amountIn,
                minAmountOut,
                feeBps,
                swapData,
                isDelegate
            )
        );
    }

    /**
     * @dev Transfers ERC20 tokens to a specified address.This is only for emergency use. This contract is not made to hold any tokens.
     * @param token The address of the ERC20 token to transfer.
     * @param to The address to transfer the ERC20 tokens to.
     * @param amount The amount of ERC20 tokens to transfer.
     */
    function transferERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        TransferHelper.safeTransfer(token, to, amount);
        emit ERC20Transferred(token, to, amount);
    }

    /**
     * @dev Transfers multiple ERC20 tokens to a specified address.This is only for emergency use. This contract is not made to hold any tokens.
     * @param tokens The addresses of the ERC20 tokens to transfer.
     * @param to The address to transfer the ERC20 tokens to.
     * @param amounts The amounts of ERC20 tokens to transfer.
     */
    function transferERC20Batch(
        address[] memory tokens,
        address[] memory to,
        uint256[] memory amounts
    ) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) {
            _transferERC20(tokens[i], to[i], amounts[i]);
        }
        emit ERC20TransferredBatch(tokens, to, amounts);
    }

    /**
     * @dev Transfers ERC20 tokens to a specified address.
     */
    function _transferERC20(
        address token,
        address to,
        uint256 amount
    ) internal {
        if (token == address(0)) revert InvalidToken();
        TransferHelper.safeTransfer(token, to, amount);
    }
}
