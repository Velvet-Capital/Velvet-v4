//SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IAavePriceOracle{
    function getAssetPrice(address asset) external view returns(uint256);
}