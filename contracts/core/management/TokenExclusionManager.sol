// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/UUPSUpgradeable.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { IProtocolConfig } from "../../config/protocol/IProtocolConfig.sol";
import { AccessController } from "../../access/AccessController.sol";
import { ErrorLibrary } from "../../library/ErrorLibrary.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/security/ReentrancyGuardUpgradeable.sol";

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { ITokenExclusionManager } from "../interfaces/ITokenExclusionManager.sol";

import { TokenRemovalVault } from "../../vault/TokenRemovalVault.sol";
import { ITokenRemovalVault } from "../../vault/ITokenRemovalVault.sol";

/**
 * @title TokenExclusionManager
 * @dev Manages the exclusion of tokens from the platform, specifically in cases where tokens are removed from indices due to various reasons, e.g., lack of liquidity.
 * This contract allows tracking of user balances and interactions over time, enabling users to claim their share of removed tokens accurately.
 */
contract TokenExclusionManager is
  OwnableUpgradeable,
  ReentrancyGuardUpgradeable,
  UUPSUpgradeable,
  ITokenExclusionManager
{
  AccessController public accessController;
  IProtocolConfig public protocolConfig;

  // Tracks the current snapshot ID, incremented each time a new snapshot is created.
  uint256 public _currentSnapshotId;

  address baseTokenRemovalVaultImplementation;

  // Stores user balance information and interaction status for each snapshot ID.
  struct UserRecordData {
    uint256 portfolioBalance;
    bool hasInteractedWithId;
  }

  struct RemovedTokenRecord {
    address token;
    address vault;
    uint256 totalSupply;
  }

  // Maps user addresses to their record data for each snapshot ID.
  mapping(address => mapping(uint256 => UserRecordData)) public userRecord;

  // Maps each user with id and boolean ot check whether user has claimed or not.
  mapping(address => mapping(uint256 => bool)) public hasUserClaimed;

  // Maps each snapshot ID to its corresponding removed token record.
  mapping(uint256 => RemovedTokenRecord) public removedToken;

  // Event emitted when a user's record is updated.
  event UserRecordUpdated(
    address indexed user,
    uint256 indexed portfolioBalance,
    uint256 indexed atSnapshotId
  );
  // Event emitted when a token's removal record is updated.
  event TokenRecordUpdated(
    address indexed token,
    uint256 indexed totalSupply,
    uint256 atSnapshotId
  );
  // Event emitted when a new snapshot is created.
  event SnapShotCreated(uint256 indexed snapshotId);

  // Event emitted when a user claims their share of removed tokens
  event UserClaimedToken(address indexed user, uint256 indexed claimedAtId);
  // Event emitted when a user claims their share of removed tokens from startId to endId
  event UserClaimedTokenAtRange(
    address indexed user,
    uint256 indexed startId,
    uint256 indexed endId
  );

  // Modifier to restrict function access to the portfolio manager only.
  modifier onlyPortfolioManager() {
    if (!_checkRole("PORTFOLIO_MANAGER_ROLE", msg.sender)) {
      revert ErrorLibrary.CallerNotPortfolioManager();
    }
    _;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice Initializes the contract with the given access controller and protocol configuration addresses.
   * @param _accessController Address of the AccessController contract.
   * @param _protocolConfig Address of the ProtocolConfig contract.
   */
  function init(
    address _accessController,
    address _protocolConfig,
    address _baseTokenRemovalVaultImplementation
  ) external override initializer {
    __Ownable_init();
    __ReentrancyGuard_init();
    __UUPSUpgradeable_init();
    if (_accessController == address(0) || _protocolConfig == address(0)) {
      revert ErrorLibrary.InvalidAddress();
    }

    accessController = AccessController(_accessController);
    protocolConfig = IProtocolConfig(_protocolConfig);
    _currentSnapshotId++;

    baseTokenRemovalVaultImplementation = _baseTokenRemovalVaultImplementation;
  }

  /**
   * @notice Creates a new snapshot and increments the snapshot ID.
   * @return The new snapshot ID.
   */
  function snapshot() external override onlyPortfolioManager returns (uint256) {
    _currentSnapshotId++;
    emit SnapShotCreated(_currentSnapshotId);
    return _currentSnapshotId;
  }

  /**
   * @notice Allows users to claim their share of tokens that have been removed from the portfolio due to certain events (e.g., lack of liquidity).
   * @dev This function iterates through snapshot IDs from the specified start ID to the till ID to calculate and distribute shares of removed tokens.
   *      It uses historical balance data and interaction flags to accurately compute each user's share.
   * @param user The address of the user claiming their share of removed tokens.
   * @param startId The starting ID from which the user wants to claim removed tokens.
   * @param endId The ending ID up to which the user wants to claim removed tokens.
   * @notice Emits a {UserClaimedTokenAtRange} event upon successful token claim.
   */
  function claimRemovedTokens(
    address user,
    uint256 startId,
    uint256 endId
  ) external nonReentrant {
    if (protocolConfig.isProtocolEmergencyPaused())
      revert ErrorLibrary.ProtocolIsPaused();

    if (user == address(0)) revert ErrorLibrary.InvalidAddress();
    // Retrieve the current snapshot ID for processing
    uint256 _currentId = _currentSnapshotId;
    // If there are less than two snapshots, no tokens have been removed
    if (_currentId < 2) revert ErrorLibrary.NoTokensRemoved();

    if (startId > endId || endId >= _currentId) revert ErrorLibrary.InvalidId();

    //Adding 1 to endId, to run loop till endId
    uint256 _lastId = endId + 1;

    for (uint256 id = startId; id < _lastId; id++) {
      _claim(user, id);
    }

    // Emit an event indicating the user has claimed their share of the removed token
    emit UserClaimedTokenAtRange(user, startId, _lastId);
  }

  /**
   * @dev Claims a removed token for a given user at a specific ID using the `_claim` function.
   * Ensures the validity of the user address and ID before proceeding with the claim.
   *
   * @param user The address of the user claiming the token.
   * @param id The ID associated with the token being claimed.
   *
   * @notice This function checks that the user address is valid and that the ID is within the
   * valid range of snapshots. It reverts if the user address is invalid, if no tokens
   * have been removed, or if the ID is invalid.
   *
   * @dev Calls the internal `_claim` function to process the claim.
   *
   * Requirements:
   * - `user` must not be the zero address.
   * - There must be at least two snapshots (`_currentSnapshotId` >= 2).
   * - `id` must be less than the current snapshot ID.
   */
  function claimTokenAtId(address user, uint256 id) external nonReentrant {
    if (protocolConfig.isProtocolEmergencyPaused())
      revert ErrorLibrary.ProtocolIsPaused();

    if (user == address(0)) revert ErrorLibrary.InvalidAddress();
    // Retrieve the current snapshot ID for processing
    uint256 _currentId = _currentSnapshotId;

    // If there are less than two snapshots, no tokens have been removed
    if (_currentId < 2) revert ErrorLibrary.NoTokensRemoved();

    if (id >= _currentId) revert ErrorLibrary.InvalidId();
    _claim(user, id);
  }

  /**
   * @notice Sets or updates user record at currentSnapshotID.
   * @param _user address of _user to set record.
   * @param _userBalance portfolio balance of user at _currentSnapShotID.
   */
  function setUserRecord(
    address _user,
    uint256 _userBalance
  ) external override onlyPortfolioManager {
    _setUserRecordAtId(_user, _userBalance, _currentSnapshotId);
    emit UserRecordUpdated(_user, _userBalance, _currentSnapshotId);
  }

  /**
   * @notice Sets token and total supply record at removal by assetManager.
   * @param _snapShotId snapshotId at which token is removed.
   * @param _tokenRemoved address of token removed at snapshot.
   * @param _vault address of vault where token is stored.
   * @param _totalSupply portfolio total supply at removal.
   */
  function setTokenAndSupplyRecord(
    uint256 _snapShotId,
    address _tokenRemoved,
    address _vault,
    uint256 _totalSupply
  ) external override onlyPortfolioManager {
    removedToken[_snapShotId].token = _tokenRemoved;
    removedToken[_snapShotId].vault = _vault;
    removedToken[_snapShotId].totalSupply = _totalSupply;

    emit TokenRecordUpdated(_tokenRemoved, _totalSupply, _snapShotId);
  }

  /**
   * @dev Retrieves the validity and balance of a user's interaction at a given ID.
   * If the user has not interacted with the specified ID, the function searches
   * backwards for the nearest valid ID and returns the balance from there.
   *
   * @param user The address of the user whose data is being retrieved.
   * @param id The ID for which the data is being retrieved.
   * @return bool Indicates whether the ID is valid (i.e., the user has not already claimed it).
   * @return uint256 The balance associated with the user at the specified or nearest valid ID.
   *
   * @notice This function checks if the user has already claimed the token at the given ID.
   * If not, it returns the user's portfolio balance at the ID. If the user has not
   * interacted with the specified ID, it looks backwards for the nearest ID where
   * the user has interacted and returns the balance from that ID.
   */
  function getDataAtId(
    address user,
    uint256 id
  ) public view override returns (bool, uint256) {
    if (hasUserClaimed[user][id]) return (false, 0);
    UserRecordData memory userData = userRecord[user][id];
    if (!userData.hasInteractedWithId) {
      for (uint256 i = id - 1; i > 0; i--) {
        UserRecordData memory _userData = userRecord[user][i];
        if (_userData.hasInteractedWithId) {
          return (true, _userData.portfolioBalance);
        }
      }
      return (false, 0);
    } else {
      return (true, userData.portfolioBalance);
    }
  }

  /**
   * @dev Internal function to claim a removed token for a particular user and ID.
   * Claims the token only if `isValid` is true and `balance` is greater than 0.
   *
   * @param user The address of the user claiming the token.
   * @param id The ID associated with the token being claimed.
   *
   * @notice This function retrieves the token data at the given ID, checks the validity and balance,
   * and then attempts to claim the removed token for the user if conditions are met.
   * Emits a {UserClaimedToken} event upon successful claim.
   */
  function _claim(address user, uint256 id) internal {
    (bool isValid, uint256 balance) = getDataAtId(user, id);
    if (isValid && balance > 0) {
      attemptClaim(user, id, balance);
      hasUserClaimed[user][id] = true;
      uint256 _nextId = id + 1;
      //Looks for nextId and set record if user has not interacted
      if (!userRecord[user][_nextId].hasInteractedWithId) {
        _setUserRecordAtId(user, balance, _nextId);
      }
      delete userRecord[user][id];
      emit UserClaimedToken(user, id);
    }
  }

  /**
   * @notice Helper function for setting user record.
   * @param _user address of _user to set record.
   * @param _userBalance portfolio balance of user at _currentSnapShotID.
   */
  function _setUserRecordAtId(
    address _user,
    uint256 _userBalance,
    uint256 _id
  ) internal {
    userRecord[_user][_id].portfolioBalance = _userBalance;
    userRecord[_user][_id].hasInteractedWithId = true;
  }

  /**
   * @notice Internal function to check for role.
   */
  function _checkRole(
    bytes memory _role,
    address user
  ) internal view returns (bool) {
    return accessController.hasRole(keccak256(_role), user);
  }

  /**
   * @notice Attempts to transfer the user's share of a removed token to them.
   * @dev Calculates the user's share based on their portfolio token balance at the time of removal and transfers it.
   * @param _user address of user to claim removed token
   * @param _snapshotId The ID of the snapshot at which the token was removed.
   * @param _portfolioTokenBalance User's balance of portfolio tokens at the last valid snapshot ID.
   */
  function attemptClaim(
    address _user,
    uint256 _snapshotId,
    uint256 _portfolioTokenBalance
  ) private {
    RemovedTokenRecord memory tokenInformation = removedToken[_snapshotId];
    // Calculate the user's share of the removed token
    uint256 totalSupply = tokenInformation.totalSupply;
    address currentRemovedToken = tokenInformation.token;

    uint256 currentVaultBalance = IERC20Upgradeable(currentRemovedToken)
      .balanceOf(tokenInformation.vault);
    uint256 balance = (currentVaultBalance * _portfolioTokenBalance) /
      totalSupply;
    // Transfer the calculated share to the user
    ITokenRemovalVault tokenRemovalVault = ITokenRemovalVault(
      tokenInformation.vault
    );
    tokenRemovalVault.withdrawTokens(currentRemovedToken, _user, balance);

    // Update the total supply record for the snapshot ID
    removedToken[_snapshotId].totalSupply =
      totalSupply -
      _portfolioTokenBalance;
  }

  /**
   * @notice Deploys a new token removal vault using the Clones library to save on deployment costs.
   * @dev This function clones the base implementation of the TokenRemovalVault contract,
   * initializes it, and then emits an event to log the deployment.
   * @return The address of the deployed token removal vault.
   */
  function deployTokenRemovalVault()
    external
    override
    onlyPortfolioManager
    returns (address)
  {
    ITokenRemovalVault tokenRemovalVault = ITokenRemovalVault(
      Clones.clone(baseTokenRemovalVaultImplementation)
    );
    tokenRemovalVault.init();

    return address(tokenRemovalVault);
  }

  /**
   * @notice Authorizes the upgrade of the contract.
   * @param newImplementation Address of the new implementation.
   */
  function _authorizeUpgrade(
    address newImplementation
  ) internal override onlyOwner {
    // Intentionally left empty as required by an abstract contract
  }
}
