// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IPriceOracle } from "../../oracle/IPriceOracle.sol";
import { ErrorLibrary } from "../../library/ErrorLibrary.sol";

import { OwnableCheck } from "./OwnableCheck.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/Initializable.sol";

/**
 * @title OracleManagement
 * @notice Handles updating and interacting with the price oracle for the platform.
 * Allows updating the oracle address used across the platform for price data.
 */
abstract contract OracleManagement is OwnableCheck, Initializable {
  IPriceOracle public oracle;

  event OracleUpdated(address indexed oldOracle, address indexed newOracle);

  // Initializes the oracle address. Meant to be called by inheriting contract's initializer or constructor.
  function __OracleManagement_init(address _oracle) internal onlyInitializing {
    _updatePriceOracleOracleManagement(_oracle);
  }

  /**
   * @dev Internal function to add update the price oracle address.
   * @param _newOracle address of oracle to update the oracle.
   */
  function _updatePriceOracleOracleManagement(address _newOracle) internal {
    if (_newOracle == address(0)) revert ErrorLibrary.InvalidOracleAddress();
    oracle = IPriceOracle(_newOracle);
  }
}
