// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

// Importing AccessModifiers for role-based access control.
import {AccessModifiers} from "../access/AccessModifiers.sol";
// Importing ChecksAndValidations for performing various checks and validations across the system.
import {ChecksAndValidations} from "../checks/ChecksAndValidations.sol";

// Importing ErrorLibrary for custom error messages.
import {ErrorLibrary} from "../../library/ErrorLibrary.sol";

/**
 * @title VaultConfig
 * @dev Inherits AccessModifiers and ChecksAndValidations to manage vault configurations.
 * Handles initialization and updating of _tokens within the vault. Maintains a list of _tokens
 * associated with the vault and provides mechanisms to update these _tokens securely.
 */
abstract contract VaultConfig is AccessModifiers, ChecksAndValidations {
  // Array storing addresses of underlying _tokens in the vault.
  address[] internal tokens;

  // Addresses of the vault and associated safe module.
  address public vault;
  address public safeModule;

  // Mapping to track tokens provided by asset managers during updates.
  mapping(address => bool) internal _previousToken;

  // Event emitted when public swap/trade is enabled for the vault.
  event PublicSwapEnabled(address indexed portfolio);

  // Events for logging deposit and withdrawal operations.
  event Deposited(
    address indexed portfolio,
    address indexed user,
    uint256 indexed mintedAmount,
    uint256 userBalanceAfterDeposit
  );
  event Withdrawn(
    address indexed user,
    uint256 indexed burnedAmount,
    address indexed portfolio,
    address[] portfolioTokens,
    uint256 userBalanceAfterWithdrawal,
    uint256[] userWithdrawalAmounts
  );
  event UserDepositedAmounts(
    uint256[] depositedAmounts,
    address[] portfolioTokens
  );

  // Initializes the vault with addresses of the vault and safe module.
  function __VaultConfig_init(
    address _vault,
    address _safeModule
  ) internal onlyInitializing {
    if (_vault == address(0) || _safeModule == address(0))
      revert ErrorLibrary.InvalidAddress();
    vault = _vault;
    safeModule = _safeModule;
  }

  /**
   * @dev Initializes the vault with a set of _tokens.
   * @param _tokens Array of token addresses to initialize the vault.
   * Only callable by the super admin. Checks for the maximum asset limit and prevents re-initialization.
   */
  function initToken(address[] calldata _tokens) external onlySuperAdmin {
    uint256 _assetLimit = protocolConfig().assetLimit();
    uint256 tokensLength = _tokens.length;
    if (tokensLength > _assetLimit)
      revert ErrorLibrary.TokenCountOutOfLimit(_assetLimit);
    if (tokens.length != 0) {
      revert ErrorLibrary.AlreadyInitialized();
    }
    for (uint256 i; i < tokensLength; i++) {
      address _token = _tokens[i];
      _checkToken(_token);
      tokens.push(_token);
    }
    _resetPreviousTokenList(_tokens);
    emit PublicSwapEnabled(address(this));
  }

  /**
   * @dev Updates the token list of the vault.
   * Can only be called by the rebalancer contract. Checks for the maximum asset limit.
   * @param _tokens New array of token addresses for the vault.
   */
  function updateTokenList(
    address[] calldata _tokens
  ) external onlyRebalancerContract {
    uint256 _assetLimit = protocolConfig().assetLimit();
    uint256 tokenLength = _tokens.length;

    if (tokenLength > _assetLimit)
      revert ErrorLibrary.TokenCountOutOfLimit(_assetLimit);

    for (uint256 i; i < tokenLength; i++) {
      _checkToken(_tokens[i]);
    }
    _resetPreviousTokenList(_tokens);
    tokens = _tokens;
  }

  /**
   * @notice Validates a token for inclusion in the vault
   * @dev Performs initial checks and ensures the token is not already in the vault
   * @param _token The address of the token to be validated and registered.
   */
  function _checkToken(address _token) internal {
      _beforeInitCheck(_token);
      if (_previousToken[_token]) {
        revert ErrorLibrary.TokenAlreadyExist();
      }
      _previousToken[_token] = true;
  }

  /**
    @dev Resets token state to false for reuse by asset manager.
    @param _tokens Array of _tokens to reset.
  */
  function _resetPreviousTokenList(address[] calldata _tokens) internal {
    uint256 tokensLength = _tokens.length;
    for (uint256 i; i < tokensLength; i++) {
      delete _previousToken[_tokens[i]];
    }
  }

  /**
    @dev Returns the current list of _tokens in the vault.
    @return Array of token addresses.
  */
  function getTokens() external view returns (address[] memory) {
    return tokens;
  }

  // Reserved storage gap to accommodate potential future layout adjustments.
  uint256[49] private __uint256GapVaultConfig;
}
