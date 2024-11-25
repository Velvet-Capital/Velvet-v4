// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { ErrorLibrary } from "../../library/ErrorLibrary.sol";
import { IAccessController } from "../../access/IAccessController.sol";
import { AccessRoles } from "../../access/AccessRoles.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/Initializable.sol";
contract ExternalPositionStorage is AccessRoles, Initializable {
  IAccessController accessController;
  /// @notice Mapping to check if a given address is an officially deployed wrapper position.
  /// @dev Helps in validating whether interactions are with legitimate wrappers.
  mapping(address => bool) public isWrappedPosition;

  function init(address _accessController) external initializer {
    accessController = IAccessController(_accessController);
  }

  function addWrappedPosition(address _newPostion) external {
    if (!accessController.hasRole(POSITION_MANAGER, msg.sender))
      revert ErrorLibrary.CallerNotAdmin();
    isWrappedPosition[_newPostion] = true;
  }
}
