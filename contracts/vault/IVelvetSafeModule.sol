// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

interface IVelvetSafeModule {
  function transferModuleOwnership(address newOwner) external;

  /// @dev Initialize function, will be triggered when a new proxy is deployed
  /// @param initializeParams Parameters of initialization encoded
  function setUp(bytes memory initializeParams) external;

  function executeWallet(
    address handlerAddresses,
    uint256 value,
    bytes calldata encodedCalls
  ) external returns (bool, bytes memory);
}