//SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IPriceOracle{
    function getAssetPrice(address asset) external view returns(uint256);
}