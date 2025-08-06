// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

interface IThena {
    struct GlobalState {
        uint160 price;
        int24 tick;
        uint16 lastFee;
        uint8 pluginConfig;
        uint16 communityFee;
        bool unlocked;
    }

    function poolByPair(
        address _token0,
        address _token1
    ) external view returns (address);

    function globalState() external view returns (GlobalState memory);
}
