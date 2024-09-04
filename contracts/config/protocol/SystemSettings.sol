// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { ErrorLibrary } from "../../library/ErrorLibrary.sol";

import { OwnableCheck } from "./OwnableCheck.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/Initializable.sol";

/**
 * @title SystemSettings
 * @dev Manages system-wide settings such as fees, cooldown periods, and limits.
 */
abstract contract SystemSettings is OwnableCheck, Initializable {
  uint256 public minPortfolioTokenHoldingAmount;
  uint256 public cooldownPeriod;
  uint256 public minInitialPortfolioAmount;
  uint256 public assetLimit;
  uint256 public whitelistLimit;
  uint256 public allowedDustTolerance;

  uint256 public lastUnpausedByUser;
  uint256 public lastEmergencyPaused;

  bool public isProtocolPaused;
  bool public isProtocolEmergencyPaused;

  event ProtocolPaused(bool indexed paused);
  event MinPortfolioTokenHoldingAmountUpdated(uint256 indexed newAmount);
  event CooldownPeriodUpdated(uint256 indexed newPeriod);
  event MinInitialPortfolioAmountUpdated(uint256 indexed newAmount);
  event AllowedDustToleranceUpdated(uint256 indexed newDustTolerance);

  /**
   * @dev Sets default fee percentages and system limits.
   */
  function __SystemSettings_init() internal onlyInitializing {
    minPortfolioTokenHoldingAmount = 1e16; // 0.01 ETH or equivalent
    minInitialPortfolioAmount = 1e16; // 0.01 ETH or equivalent
    cooldownPeriod = 1 days;
    assetLimit = 15;
    whitelistLimit = 300;
    allowedDustTolerance = 10; // equivalent to 0.01%
  }

  /**
   * @notice Sets a new cooldown period for the system.
   * @param _newCooldownPeriod The new cooldown period in seconds.
   */
  function setCoolDownPeriod(
    uint256 _newCooldownPeriod
  ) external onlyProtocolOwner {
    if (_newCooldownPeriod < 1 minutes || _newCooldownPeriod > 14 days)
      revert ErrorLibrary.InvalidCooldownPeriod();
    cooldownPeriod = _newCooldownPeriod;
    emit CooldownPeriodUpdated(_newCooldownPeriod);
  }

  /**
   * @notice Sets the protocol pause state.
   * @param _paused The new pause state.
   */
  function setProtocolPause(bool _paused) public onlyProtocolOwner {
    if (isProtocolEmergencyPaused && !_paused)
      revert ErrorLibrary.ProtocolEmergencyPaused();
    isProtocolPaused = _paused;
    emit ProtocolPaused(_paused);
  }

  /**
   * @notice Allows the protocol owner to set the emergency pause state of the protocol.
   * @param _state Boolean parameter to set the pause (true) or unpause (false) state of the protocol.
   * @param _unpauseProtocol Boolean parameter to determine if the protocol should be unpaused.
   * @dev This function can be called by the protocol owner at any time, or by any user if the protocol has been
   *      paused for at least 4 weeks. Users can only unpause the protocol and are restricted from pausing it.
   *      The function includes a 5-minute cooldown between unpauses to prevent rapid toggling.
   * @dev Emits a state change to the emergency pause status of the protocol.
   */
  function setEmergencyPause(
    bool _state,
    bool _unpauseProtocol
  ) external virtual {
    bool callerIsOwner = _owner() == msg.sender;
    require(
      callerIsOwner ||
        (isProtocolEmergencyPaused &&
          block.timestamp - lastEmergencyPaused >= 4 weeks),
      "Unauthorized"
    );

    if (!callerIsOwner) {
      lastUnpausedByUser = block.timestamp;
      _unpauseProtocol = false;
    }
    if (_state) {
      if (block.timestamp - lastUnpausedByUser < 5 minutes)
        revert ErrorLibrary.TimeSinceLastUnpauseNotElapsed();
      lastEmergencyPaused = block.timestamp;
      setProtocolPause(true);
    }
    isProtocolEmergencyPaused = _state;

    if (!_state && _unpauseProtocol) {
      setProtocolPause(false);
    }
  }

  /**
   * @notice This function sets the limit for the number of assets that a fund can have
   * @param _assetLimit Maximum number of allowed assets in the fund
   */
  function setAssetLimit(uint256 _assetLimit) external onlyProtocolOwner {
    if (_assetLimit == 0) revert ErrorLibrary.InvalidAssetLimit();
    assetLimit = _assetLimit;
  }

  /**
   * @notice This function sets the limit for the number of users and token can be whitelisted at a time
   * @param _whitelistLimit Maximum number of allowed whitelist users and tokens in the fund
   */
  function setWhitelistLimit(
    uint256 _whitelistLimit
  ) external onlyProtocolOwner {
    if (_whitelistLimit == 0) revert ErrorLibrary.InvalidWhitelistLimit();
    whitelistLimit = _whitelistLimit;
  }

  /**
   * @notice This Function is to update minimum initial portfolio amount
   * @param _amount new minimum amount of portfolio
   */
  function updateMinInitialPortfolioAmount(
    uint256 _amount
  ) external virtual onlyProtocolOwner {
    if (_amount == 0) revert ErrorLibrary.InvalidMinPortfolioAmount();
    minInitialPortfolioAmount = _amount;
    emit MinInitialPortfolioAmountUpdated(_amount);
  }

  /**
   * @notice This function is to update minimum portfolio amount for assetManager to set while portfolio creation
   * @param _newAmount new minimum portfolio amount
   */
  function updateMinPortfolioTokenHoldingAmount(
    uint256 _newAmount
  ) external virtual onlyProtocolOwner {
    if (_newAmount == 0)
      revert ErrorLibrary.InvalidMinPortfolioTokenHoldingAmount();
    minPortfolioTokenHoldingAmount = _newAmount;
    emit MinPortfolioTokenHoldingAmountUpdated(_newAmount);
  }

  /**
   * @notice This function is to update the dust tolerance accepted by the protocol
   * @param _allowedDustTolerance new allowed dust tolerance
   */
  function updateAllowedDustTolerance(
    uint256 _allowedDustTolerance
  ) external onlyProtocolOwner {
    if (_allowedDustTolerance == 0 || _allowedDustTolerance > 1_000)
      revert ErrorLibrary.InvalidDustTolerance();
    allowedDustTolerance = _allowedDustTolerance;

    emit AllowedDustToleranceUpdated(_allowedDustTolerance);
  }
}
