// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.17;

interface IPool {
  struct GlobalState {
    uint160 price;
    int24 tick;
    uint16 lastFee;
    uint8 pluginConfig;
    uint16 communityFee;
    bool unlocked;
  }

  function token0() external view returns (address);

  function token1() external view returns (address);

  function liquidity() external view returns (uint128);

  function globalState() external view returns (GlobalState memory);

  function totalFeeGrowth0Token() external view returns (uint256);

  function totalFeeGrowth1Token() external view returns (uint256);
}
