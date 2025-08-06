// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMetaAggregatorSwapContract} from "./interfaces/IMetaAggregatorSwapContract.sol";
import {TransferHelper} from "./libraries/TransferHelper.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MetaAggregatorSwapContract
 * @dev Facilitates swapping between ETH and ERC20 tokens or between two ERC20 tokens using an aggregator.
 */
contract MetaAggregatorSwapContract is IMetaAggregatorSwapContract, Ownable {
    address constant nativeToken = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE; // Represent native ETH token
    address constant zeroAddress = 0x0000000000000000000000000000000000000000; // Represent zero address
    address immutable SWAP_TARGET; // Address of the swap target for delegatecall operations
    address immutable _this; // Address of this contract instance
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    // Custom error messages for efficient error handling
    error CannotSwapTokens();
    error AmountInMustBeGreaterThanZero();
    error MinAmountOutMustBeGreaterThanZero();
    error TokenInAndTokenOutCannotBeSame();
    error IncorrectEtherAmountSent();
    error CannotSwapETHToETH();
    error InvalidReceiver();
    error InvalidENSOAddress();
    error InsufficientOutputBalance();
    error InsufficientETHOutAmount();
    error InsufficientTokenOutAmount();
    error SwapFailed();
    error CannotSwapETH();
    error FeeTransferFailed();
    error TransferFailed();
    error InvalidToken();

    //   Event emitted when Tokens are swapped
    event TokenSwapped(
        address indexed sender,
        address indexed tokenIn,
        address receiver,
        address tokenOut,
        address feeReceiver,
        address aggregator,
        uint256 indexed amountIn,
        uint256 amountOut,
        uint256 minAmountOut,
        uint256 fee,
        bool isDelegate
    );

    // Event emitted when ETH is transferred to a specified address
    event EthTransferred(address indexed to, uint256 indexed amount);

    // Event emitted when ERC20 tokens are transferred to a specified address
    event ERC20Transferred(
        address indexed token,
        address indexed to,
        uint256 indexed amount
    );

    // Event emitted when multiple ERC20 tokens are transferred to a specified address
    event ERC20TransferredBatch(
        address[] tokens,
        address[] to,
        uint256[] amounts
    );

    /**
     * @dev Initializes the contract with the swap target and USDT addresses.
     * @param _ensoSwapContract The address of the swap target contract.
     */
    constructor(address _ensoSwapContract) Ownable() {
        if (_ensoSwapContract == address(0)) revert InvalidENSOAddress();
        SWAP_TARGET = _ensoSwapContract;
        _this = address(this);
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    /**
     * @dev only checks for re-entrancy when the call is not delegate.
     */
    function _nonReentrantBefore() private {
        if (address(this) == _this) {
            // On the first call to nonReentrant, _status will be _NOT_ENTERED
            require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

            // Any calls to nonReentrant after this point will fail
            _status = _ENTERED;
        }
    }

    /**
     * @dev only checks for re-entrancy when the call is not delegate.
     */
    function _nonReentrantAfter() private {
        if (address(this) == _this) {
            // By storing the original value once again, a refund is triggered (see
            // https://eips.ethereum.org/EIPS/eip-2200)
            _status = _NOT_ENTERED;
        }
    }

    /**
     * @dev Swaps ETH for an ERC20 token.
     * @param params SwapETHParams
     */
    function swapETH(
        SwapETHParams calldata params
    ) external payable nonReentrant {
        if (address(params.tokenIn) != nativeToken) {
            revert CannotSwapTokens();
        }
        (uint256 amountOut, uint256 fee) = _swapETH(params);
        emit TokenSwapped(
            address(params.sender),
            address(params.tokenIn),
            address(params.receiver),
            address(params.tokenOut),
            params.feeRecipient,
            params.aggregator,
            params.amountIn,
            amountOut,
            params.minAmountOut,
            fee,
            params.isDelegate
        );
    }

    /**
     * @dev Swaps one ERC20 token for another ERC20 token or native ETH.
     * @param params SwapERC20Params
     */
    function swapERC20(SwapERC20Params calldata params) external nonReentrant {
        (uint256 amountOut, uint256 fee) = _swapERC20(params);
        emit TokenSwapped(
            address(params.sender),
            address(params.tokenIn),
            address(params.receiver),
            address(params.tokenOut),
            params.feeRecipient,
            params.aggregator,
            params.amountIn,
            amountOut,
            params.minAmountOut,
            fee,
            params.isDelegate
        );
    }

    /**
     * @dev Transfers ETH to a specified address.This is only for emergency use. This contract is not made to hold ETH.
     * @param to The address to transfer the ETH to.
     * @param amount The amount of ETH to transfer.
     */
    function transferEth(address to, uint256 amount) external onlyOwner {
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
        emit EthTransferred(to, amount);
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
        _transferERC20(token, to, amount);
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
     * @dev Internal function to perform the swap from ETH to ERC20.
     * @param params SwapETHParams
     */
    function _swapETH(
        SwapETHParams memory params
    ) internal returns (uint256, uint256) {
        IERC20 tokenOut = params.tokenOut;
        uint256 amountIn = params.amountIn;
        uint256 minAmountOut = params.minAmountOut;
        address receiver = params.receiver;
        address feeRecipient = params.feeRecipient;
        uint256 feeBps = params.feeBps;
        _validateInputs(
            params.tokenIn,
            address(tokenOut),
            amountIn,
            minAmountOut,
            receiver
        );

        if (msg.value != amountIn) revert IncorrectEtherAmountSent();
        uint256 fee;
        if (feeRecipient != address(0) && feeBps != 0) {
            fee = (amountIn * feeBps) / 10000;
            if (fee > 0) {
                amountIn -= fee;
                (bool success, ) = payable(feeRecipient).call{value: fee}("");
                if (!success) revert FeeTransferFailed();
            }
        }

        uint256 balanceBefore = tokenOut.balanceOf(address(this));
        _executeAggregatorCall(
            params.swapData,
            params.isDelegate,
            params.aggregator,
            amountIn
        );
        uint256 amountOut = tokenOut.balanceOf(address(this)) - balanceBefore;

        if (amountOut < minAmountOut) revert InsufficientOutputBalance();
        if (receiver != address(this)) {
            TransferHelper.safeTransfer(address(tokenOut), receiver, amountOut);
        }
        return (amountOut, fee);
    }

    /**
     * @dev Internal function to swap ERC20 tokens or ERC20 to native ETH.
     * @param params SwapERC20Params
     */
    function _swapERC20(
        SwapERC20Params memory params
    ) internal returns (uint256, uint256) {
        IERC20 tokenIn = params.tokenIn;
        IERC20 tokenOut = params.tokenOut;
        address aggregator = params.aggregator;
        address receiver = params.receiver;
        address feeRecipient = params.feeRecipient;
        uint256 amountIn = params.amountIn;
        uint256 minAmountOut = params.minAmountOut;
        uint256 feeBps = params.feeBps;
        bytes memory swapData = params.swapData;
        bool isDelegate = params.isDelegate;
        _validateInputs(
            address(tokenIn),
            address(tokenOut),
            amountIn,
            minAmountOut,
            receiver
        );

        uint256 fee;
        if (feeRecipient != address(0) && feeBps != 0) {
            fee = (amountIn * feeBps) / 10000;
            if (fee > 0) {
                amountIn -= fee;
                TransferHelper.safeTransfer(
                    address(tokenIn),
                    feeRecipient,
                    fee
                );
            }
        }

        if (!isDelegate) {
            try tokenIn.approve(aggregator, 0) {} catch {}
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

        return (amountOut, fee);
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
        if (tokenIn == address(0) || tokenOut == address(0))
            revert InvalidToken();
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

    /**
     * @dev Allows the contract to receive ETH.
     */
    receive() external payable {}
}
