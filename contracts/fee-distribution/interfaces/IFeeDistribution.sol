// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

interface IFeeDistribution {
    event FeeDistributed(
        address indexed feeToken,
        bytes[] transactionHashes,
        uint256[] amounts,
        address[] receivers
    );

    function distributeBatch(
        address[] calldata feeTokens,
        bytes[][] calldata transactionHashes,
        uint256[][] calldata amounts,
        address[][] calldata receivers
    ) external;

    function distribute(
        address feeToken,
        bytes[] calldata transactionHashes,
        uint256[] calldata amounts,
        address[] calldata receivers
    ) external;
}