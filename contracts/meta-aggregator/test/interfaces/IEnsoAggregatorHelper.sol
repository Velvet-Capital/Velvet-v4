// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "@openzeppelin/contracts-5.0.2/token/ERC20/IERC20.sol";


interface IEnsoAggregatorHelper {
    function swap(
       IERC20 tokenOut,
        uint256 amountOut
    ) external;
}