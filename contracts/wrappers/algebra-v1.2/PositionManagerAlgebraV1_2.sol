// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { PositionManagerAbstractAlgebraV1_2, ErrorLibrary } from "./PositionManagerAbstractAlgebraV1_2.sol";

/**
 * @title PositionManager
 * @dev Concrete implementation of the PositionManagerAbstract contract.
 * This contract inherits all functionalities from PositionManagerAbstract and serves as the final implementation.
 */
contract PositionManagerAlgebraV1_2 is PositionManagerAbstractAlgebraV1_2 {
  function init(
    address _protocolConfig,
    address _assetManagerConfig,
    address _accessController,
    address _nftManager,
    address _swapRouter
  ) external initializer {
    // Add input validation
    if (
      _protocolConfig == address(0) ||
      _assetManagerConfig == address(0) ||
      _accessController == address(0)
    ) revert ErrorLibrary.InvalidAddress();

    PositionManagerAbstractAlgebra_init(
      _nftManager,
      _swapRouter,
      _protocolConfig,
      _assetManagerConfig,
      _accessController
    );
  }
}
