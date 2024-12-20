# MetaAggregator Contracts

## Overview

The MetaAggregator Contracts are a set of Solidity smart contracts designed to facilitate the swapping of tokens through a meta aggregator. The primary contracts include `MetaAggregatorManager` and `MetaAggregatorSwapContract`, which work together to enable efficient token swaps on the Ethereum blockchain.

## Contracts

### 1. MetaAggregatorManager

- **Purpose**: Manages the swapping of tokens using the `MetaAggregatorSwapContract`.
- **Key Features**:
  - Supports swapping between ERC20 tokens and ETH.
  - Prevents reentrancy attacks using the `ReentrancyGuard` modifier.
  
#### Functions

- `constructor(address _metaAggregatorSwap)`: Initializes the contract with the address of the `MetaAggregatorSwapContract`.
- `swap(IERC20 tokenIn, IERC20 tokenOut, address aggregator, bytes calldata swapData, uint256 amountIn, uint256 minAmountOut, address receiver, bool isDelegate)`: Swaps tokens using the specified aggregator. This method is to be used by EOAs preferably.

### 2. MetaAggregatorSwapContract

- **Purpose**: Facilitates the token swaps between ETH and ERC20 tokens. For ERC20 swaps are preferably to be done by Contracts.
  - Handles both ETH and ERC20 token inputs.
  - Allows for delegate calls to external aggregators for swaps.

## Architecture

The architecture of the MetaAggregator Contracts consists of two main components:

1. **MetaAggregatorManager**:
   - This contract acts as the entry point for users to initiate token swaps. It manages the overall process of token swapping but does not handle ETH swaps directly. User need to approve this contract for token swaps.
   - **Key Responsibilities**:
     - Validate user inputs and ensure that the correct tokens are being swapped.
     - Transfer the specified amount of input tokens from the user to the `MetaAggregatorSwapContract`.
     - Call the appropriate swap function on the `MetaAggregatorSwapContract` to perform the actual token swap for ERC20 tokens For EOAs.
     - Emit events to notify listeners of successful swaps.

2. **MetaAggregatorSwapContract**:
   - This contract is responsible for executing the actual token swaps, including both ERC20 tokens and ETH. It interacts with external aggregators to facilitate the swaps.
   - **Key Responsibilities**:
     - Handle both ETH and ERC20 token inputs for swaps.For ERC20 swaps are to be done by Contracts preferably.
     - Execute the swap logic, which may involve calling external aggregators to perform the actual token swap.
     - Transfer the output tokens to the specified receiver address after the swap is completed.
     - Emit events to notify listeners of successful swaps.

#### Functions

- `swapETH(...)`: Swaps ETH for an ERC20 token.
- `swapERC20(...)`: Swaps one ERC20 token for another. Is called from the Manager contract.
- `_swap(...)`: Internal function that contains the logic for performing swaps.
- `_callAggregator(...)`: Internal function to call the aggregator for the swap.

## Interaction Between Contracts

The `MetaAggregatorManager` and `MetaAggregatorSwapContract` work together to facilitate token swaps:

1. **Initiating a Swap**:
   - The user interacts with the `MetaAggregatorManager` by calling the `swap` function, providing the necessary parameters such as the input token, output token, aggregator address, and swap data.

2. **Token Transfer**:
   - The `MetaAggregatorManager` transfers the specified amount of the input token (ERC20) from the user to the `MetaAggregatorSwapContract`. This is done using the `transferFrom` function.

3. **Executing the Swap**:
   - After transferring the tokens, the `MetaAggregatorManager` calls the `swapERC20` function on the `MetaAggregatorSwapContract`, passing along the necessary parameters for the swap.

4. **Performing the Swap**:
   - The `MetaAggregatorSwapContract` executes the swap logic, which may involve calling an external aggregator to perform the actual token swap. It handles both ETH and ERC20 tokens, depending on the input and output tokens specified.

5. **Receiving Output Tokens**:
   - Once the swap is completed, the `MetaAggregatorSwapContract` transfers the output tokens to the specified receiver address, which could be the user or another contract.


