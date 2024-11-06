// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { AssetManagerCheck } from "./AssetManagerCheck.sol";
import { IProtocolConfig } from "../../config/protocol/IProtocolConfig.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/Initializable.sol";
import { ExternalPositionManagement, ErrorLibrary } from "./ExternalPositionManagement.sol";

/**
 * @title TokenWhitelistManagement
 * @dev Manages the whitelisting of tokens, determining which tokens are authorized for use within the system.
 * This functionality enhances security and compliance by controlling the tokens that can participate in the platform.
 */
abstract contract TokenWhitelistManagement is
  AssetManagerCheck,
  ExternalPositionManagement,
  Initializable
{
  IProtocolConfig private protocolConfig; // Reference to the protocol configuration contract.
  mapping(address => bool) public whitelistedTokens; // Mapping to track whitelisted tokens.
  bool public tokenWhitelistingEnabled; // Flag to indicate if token whitelisting is enabled.

  event TokenWhitelisted(address[] tokens); // Event emitted when tokens are whitelisted.
  event TokensRemovedFromWhitelist(address[] tokens); // Event emitted when tokens are removed from the whitelist.

  /**
   * @notice Initializes the contract with essential configuration details and initial whitelisted tokens.
   * @param _whitelistTokens Initial list of tokens to whitelist.
   * @param _accessControllerAddress Address of the access controller.
   * @param _basePositionManager Address of the base position manager.
   * @param _tokenWhitelistingEnabled Flag indicating if token whitelisting is to be enabled.
   * @param _protocolConfig Address of the protocol configuration contract.
   * @dev The function sets initial whitelisted tokens if whitelisting is enabled and performs initial configuration of the contract.
   */
  function __TokenWhitelistManagement_init(
    address[] calldata _whitelistTokens,
    address _accessControllerAddress,
    address _basePositionManager,
    bool _tokenWhitelistingEnabled,
    bytes32[] calldata _witelistedProtocolIds,
    address _protocolConfig
  ) internal onlyInitializing {
    if (_protocolConfig == address(0)) revert ErrorLibrary.InvalidAddress();
    protocolConfig = IProtocolConfig(_protocolConfig);
    tokenWhitelistingEnabled = _tokenWhitelistingEnabled;

    if (tokenWhitelistingEnabled) {
      if (_whitelistTokens.length == 0)
        revert ErrorLibrary.InvalidTokenWhitelistLength();

      _addTokensToWhitelist(_whitelistTokens);
    }

    ExternalPositionManagement__init(
      _protocolConfig,
      _accessControllerAddress,
      _basePositionManager,
      _witelistedProtocolIds
    );
  }

  /**
   * @dev Adds tokens to the whitelist, ensuring they adhere to protocol limits and are not zero addresses.
   * @param _tokens Array of token addresses to be whitelisted.
   */
  function _addTokensToWhitelist(address[] calldata _tokens) internal {
    uint256 tokensLength = _tokens.length;
    if (tokensLength > protocolConfig.whitelistLimit()) {
      revert ErrorLibrary.InvalidWhitelistLimit();
    }

    for (uint256 i; i < tokensLength; i++) {
      address _token = _tokens[i];
      if (_token == address(0)) {
        revert ErrorLibrary.InvalidAddress();
      }
      whitelistedTokens[_token] = true;
    }
    emit TokenWhitelisted(_tokens);
  }

  /**
   * @notice Checks if a token is whitelisted for use in the platform.
   * @param _token The address of the token to check.
   * @return bool Returns true if the token is whitelisted, otherwise false.
   */
  function isTokenWhitelisted(address _token) external returns (bool) {
    return
      whitelistedTokens[_token] ||
      (address(positionManager) != address(0) &&
        positionManager.isWrappedPosition(_token));
  }
}
