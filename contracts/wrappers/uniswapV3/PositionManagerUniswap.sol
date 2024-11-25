// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { PositionManagerAbstractUniswap, ErrorLibrary } from "./PositionManagerAbstractUniswap.sol";

/**
 * @title PositionManager
 * @dev Concrete implementation of the PositionManagerAbstract contract.
 * This contract inherits all functionalities from PositionManagerAbstract and serves as the final implementation.
 */
contract PositionManagerUniswap is PositionManagerAbstractUniswap {
  function init(
    address _externalPositionStorage,
    address _protocolConfig,
    address _assetManagerConfig,
    address _accessController,
    address _nftManager,
    address _swapRouter,
    bytes32 _protocolId
  ) external initializer {
    // Add input validation
    if (
      _protocolConfig == address(0) ||
      _assetManagerConfig == address(0) ||
      _accessController == address(0)
    ) revert ErrorLibrary.InvalidAddress();

    PositionManagerAbstractUniswap_init(
      _externalPositionStorage,
      _nftManager,
      _swapRouter,
      _protocolConfig,
      _assetManagerConfig,
      _accessController,
      _protocolId
    );
  }
}
