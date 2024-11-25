// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

interface IExternalPositionStorage {
  function init(address _accessController) external;
  /**
   * @notice Checks if a given address is a recognized and valid wrapped position.
   * @dev This function is typically used to verify if a particular contract address corresponds
   * to a valid position wrapper managed by this system, ensuring that interactions are limited
   * to legitimate and tracked wrappers.
   * @return bool Returns true if the address corresponds to a wrapped position, false otherwise.
   */
  function isWrappedPosition(address) external returns (bool);

  function addWrappedPosition(address _newPostion) external;
}
