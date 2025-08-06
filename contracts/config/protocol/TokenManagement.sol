// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { ErrorLibrary } from "../../library/ErrorLibrary.sol";
import { OwnableCheck } from "./OwnableCheck.sol";
import { IPriceOracle } from "../../oracle/IPriceOracle.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/Initializable.sol";

/**
 * @title TokenManagement
 * @dev This contract manages the registry of tokens that are allowed to interact with the platform.
 * It ensures that only tokens with verified price information and approved by the platform owner can be used,
 * enhancing the platform's security and reliability.
 */
abstract contract TokenManagement is OwnableCheck, Initializable {
  // Interface instance for accessing the price oracle.
  IPriceOracle private priceOracle;

  // Mapping to track the tokens that are enabled for interaction on the platform.
  mapping(address => bool) public isEnabled;

  // Event emitted when tokens are enabled.
  event TokensEnabled(address[] tokens);

  // Event emitted when a token is disabled.
  event TokenDisabled(address indexed token);

  /**
   * @notice Initializes the contract with the price oracle address.
   * @param _priceOracle Address of the price oracle contract.
   */
  function __TokenManagement_init(
    address _priceOracle
  ) internal onlyInitializing {
    if (_priceOracle == address(0)) revert ErrorLibrary.InvalidOracleAddress();
    priceOracle = IPriceOracle(_priceOracle);
  }

  /**
   * @notice Checks whether a token is enabled for interaction on the platform.
   * @param _token Address of the token to check.
   * @return True if the token is enabled, otherwise false.
   */
  function isTokenEnabled(address _token) external view returns (bool) {
    return isEnabled[_token];
  }

  /**
   * @notice Enables a list of tokens for interaction on the platform, subject to oracle price verification.
   * Can only be called by the protocol owner.
   * @param _tokens Array of token addresses to be enabled.
   */
  function enableTokens(address[] calldata _tokens) external onlyProtocolOwner {
    uint256 tokensLength = _tokens.length;
    for (uint256 i; i < tokensLength; i++) {
      address token = _tokens[i];
      if (token == address(0)) revert ErrorLibrary.InvalidTokenAddress();
      // Ensures token has a valid price in the price oracle before enabling
      if (!(priceOracle.convertToUSD18Decimals(token, 1 ether) > 0))
        revert ErrorLibrary.TokenNotInPriceOracle();

      isEnabled[token] = true;
    }
    emit TokensEnabled(_tokens);
  }

  /**
   * @notice Disables a token from interaction on the platform. Can only be called by the protocol owner.
   * @param _token Address of the token to be disabled.
   */
  function disableToken(address _token) external onlyProtocolOwner {
    if (_token == address(0)) revert ErrorLibrary.InvalidAddress();
    isEnabled[_token] = false;
    emit TokenDisabled(_token);
  }

  /**
   * @dev Internal function to add update the price oracle address.
   * @param _newOracle address of oracle to update the oracle.
   */
  function _updatePriceOracleTokenManagement(address _newOracle) internal {
    if (_newOracle == address(0)) revert ErrorLibrary.InvalidOracleAddress();
    priceOracle = IPriceOracle(_newOracle);
  }
}
