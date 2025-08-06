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

  uint256 public MAX_BORROW_TOKEN_LIMIT;

  //Maximum allowed buffer unit used to slightly increase the amount of collateral to sell, expressed in 0.001% (100000 = 100%)
  uint256 public MAX_COLLATERAL_BUFFER_UNIT;

  address[] public supportedControllers;

  bool public isProtocolPaused;
  bool public isRepayPaused;
  bool public isProtocolEmergencyPaused;

  // Mapping to track the token with their respective controller address
  mapping(address => address) public marketControllers;

  // Mapping to track the token/controller address and their respective handler address
  mapping(address => address) public assetHandlers;

  // Mapping to track the supported controllers of lending protocol
  mapping(address => bool) public isSupportedControllers;

  // Mapping to track the borrowed tokens that are enabled for interaction on the platform.
  mapping(address => bool) public isBorrowableToken;

  // Mapping to track the supported factories of flashLoan provider protocol
  mapping(address => bool) public isSupportedFactory;

  // Mapping to track the supported callback callers of flashLoan provider protocol
  mapping(address => bool) public isSupportedCallbackCaller;

  event ProtocolPaused(bool indexed paused);
  event RepayPauseSet(bool indexed paused);
  event EmergencyPauseSet(bool indexed state, bool indexed unpauseProtocol);
  event MinPortfolioTokenHoldingAmountUpdated(uint256 indexed newAmount);
  event CooldownPeriodUpdated(uint256 indexed newPeriod);
  event MinInitialPortfolioAmountUpdated(uint256 indexed newAmount);
  event AllowedDustToleranceUpdated(uint256 indexed newDustTolerance);
  event MarketControllersAdded(address[] _assets, address[] _controllers);
  event MarketControllersRemoved(address[] _assets);
  event AssetHandlersAdded(address[] _assets, address[] _handlers);
  event AssetHandlersRemoved(address[] _assets);
  event SupportedControllersAdded(address[] _controllers);
  event SupportedControllersRemoved(address indexed _controller);

  /**
   * @dev Sets default fee percentages and system limits.
   */
  function __SystemSettings_init() internal onlyInitializing {
    minPortfolioTokenHoldingAmount = 1e14; // 0.0001 ETH or equivalent
    minInitialPortfolioAmount = 1e14; // 0.0001 ETH or equivalent
    cooldownPeriod = 1 days;
    assetLimit = 15;
    whitelistLimit = 300;
    allowedDustTolerance = 10; // equivalent to 0.01%
    MAX_COLLATERAL_BUFFER_UNIT = 400; // equivalent to 0.04%
    MAX_BORROW_TOKEN_LIMIT = 5;
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
   * @notice Sets the repay pause state.
   * @param _paused The new pause state.
   */
  function setRepayPause(bool _paused) public onlyProtocolOwner {
    isRepayPaused = _paused;
    emit RepayPauseSet(_paused);
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

    emit EmergencyPauseSet(_state, _unpauseProtocol);
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

  /**
   * @notice Sets the market controllers for specified assets and enable them to be borrowed.
   * @param _assets An array of asset addresses.
   * @param _controllers An array of controller addresses corresponding to the assets.
   */
  function setAssetAndMarketControllers(
    address[] memory _assets, //Lending Token Address
    address[] memory _controllers // Their respective controllers(comptrollers)
  ) external onlyProtocolOwner {
    uint256 assetLength = _assets.length;
    if (assetLength != _controllers.length) revert ErrorLibrary.InvalidLength();
    for (uint256 i; i < assetLength; i++) {
      address token = _assets[i];
      if (token == address(0)) revert ErrorLibrary.InvalidAddress();
      marketControllers[token] = _controllers[i];
      isBorrowableToken[token] = true;
    }
    emit MarketControllersAdded(_assets, _controllers);
  }

  /**
   * @notice Removes the market controllers for specified assets and disable them to be borrowed.
   * @param _assets An array of asset addresses to remove controllers for.
   */
  function removeAssetAndMarketControllers(
    address[] memory _assets
  ) external onlyProtocolOwner {
    uint256 assetsLength = _assets.length;
    for (uint256 i; i < assetsLength; i++) {
      address token = _assets[i];
      delete marketControllers[token];
      delete isBorrowableToken[token];
    }
    emit MarketControllersRemoved(_assets);
  }

  /**
   * @notice Sets the asset handlers for specified assets.
   * @param _assets An array of asset addresses.
   * @param _handlers An array of handler addresses corresponding to the assets.
   */
  function setAssetHandlers(
    address[] memory _assets, //Third-Party Token Address
    address[] memory _handlers // Their respective handlers
  ) external onlyProtocolOwner {
    if (_assets.length != _handlers.length) revert ErrorLibrary.InvalidLength();
    uint256 assetsLength = _assets.length;
    for (uint256 i; i < assetsLength; i++) {
      address token = _assets[i];
      if (token == address(0)) revert ErrorLibrary.InvalidAddress();
      assetHandlers[token] = _handlers[i];
    }
    emit AssetHandlersAdded(_assets, _handlers);
  }

  /**
   * @notice Removes the asset handlers for specified assets.
   * @param _assets An array of asset addresses to remove handlers for.
   */
  function removeAssetHandlers(
    address[] memory _assets
  ) external onlyProtocolOwner {
    uint256 assetsLength = _assets.length;
    for (uint256 i; i < assetsLength; i++) {
      delete assetHandlers[_assets[i]];
    }
    emit AssetHandlersRemoved(_assets);
  }

  /**
   * @notice Adds supported controllers to the protocol.
   * @param _controllers An array of controller addresses to add.
   */
  function setSupportedControllers(
    address[] memory _controllers
  ) external onlyProtocolOwner {
    uint256 controllersLength = _controllers.length;
    for (uint256 i; i < controllersLength; i++) {
      address controller = _controllers[i];
      if (!isSupportedControllers[controller]) {
        if (controller == address(0)) revert ErrorLibrary.InvalidAddress();
        supportedControllers.push(controller);
        isSupportedControllers[controller] = true;
      }
    }
    emit SupportedControllersAdded(_controllers);
  }

  /**
   * @notice Removes a controller from the list of supported controllers.
   * @dev This function finds the controller in the array, swaps it with the last element, and then removes the last element to avoid leaving a gap.
   * @param _controller The address of the controller to remove from the list of supported controllers.
   * @dev The function reverts if the controller is not found in the array.
   * @dev This function can only be called by the protocol owner.
   */
  function removeSupportedControllers(
    address _controller
  ) external onlyProtocolOwner {
    // Find the index of the address to remove
    uint256 indexToRemove = findAddressIndex(_controller);

    // Swap the address to remove with the last address in the array
    supportedControllers[indexToRemove] = supportedControllers[
      supportedControllers.length - 1
    ];
    delete isSupportedControllers[_controller];
    // Remove the last element (which is now a duplicate)
    supportedControllers.pop();

    emit SupportedControllersRemoved(_controller);
  }

  /**
   * @notice Finds the index of an address in the array of addresses.
   * @param _addressToFind The address to find in the array.
   * @return The index of the address in the array.
   * @dev The function reverts if the address is not found.
   */
  function findAddressIndex(
    address _addressToFind
  ) internal view returns (uint256) {
    uint256 supportedControllersLength = supportedControllers.length;
    for (uint256 i = 0; i < supportedControllersLength; i++) {
      if (supportedControllers[i] == _addressToFind) {
        return i;
      }
    }
    revert ErrorLibrary.InvalidAddress();
  }

  /**
   * @notice Returns the list of supported controllers.
   * @return An array of addresses representing the supported controllers.
   */
  function getSupportedControllers() external view returns (address[] memory) {
    return supportedControllers;
  }

  /**
   * @notice Sets Supported FlashLoan Provider Factory Contract
   * @param _factoryAddress Address of factory contract address
   */
  function setSupportedFactory(
    address _factoryAddress
  ) external onlyProtocolOwner {
    if (_factoryAddress == address(0)) revert ErrorLibrary.InvalidAddress();
    isSupportedFactory[_factoryAddress] = true;
  }

  /**
   * @notice Removes Supported FlashLoan Provider Factory Contract
   * @param _factoryAddress Address of factory contract address
   */
  function removeSupportedFactory(
    address _factoryAddress
  ) external onlyProtocolOwner {
    isSupportedFactory[_factoryAddress] = false;
  }

  /**
   * @notice Updates the maximum allowed buffer unit for collateral calculations not more then 10%
   * @dev This function can only be called by the protocol owner
   * @param _newBufferUnit The new maximum buffer unit value to set
   */
  function updateMaxCollateralBufferUnit(
    uint256 _newBufferUnit
  ) external onlyProtocolOwner {
    if (_newBufferUnit > 10000) revert ErrorLibrary.InvalidNewBufferUnit();
    MAX_COLLATERAL_BUFFER_UNIT = _newBufferUnit;
  }

  /**
   * @notice Updates the maximum number of tokens that can be borrowed simultaneously by assetManagers
   * @dev This function can only be called by the protocol owner
   * @param _newBorrowTokenLimit The new maximum limit for simultaneous token borrowing (must not exceed 20)
   * @dev Reverts with ErrorLibrary.ExceedsBorrowLimit() if the new limit is greater than 20
   */
  function updateMaxBorrowTokenLimit(
    uint256 _newBorrowTokenLimit
  ) external onlyProtocolOwner {
    if (_newBorrowTokenLimit > 20) revert ErrorLibrary.ExceedsBorrowLimit();
    MAX_BORROW_TOKEN_LIMIT = _newBorrowTokenLimit;
  }


  /**
   * @notice Adds a supported callback caller to the protocol.
   * @param _callbackCaller The address of the callback caller to add.
   */
  function addSupportedCallbackCaller(address _callbackCaller) external onlyProtocolOwner {
    if (_callbackCaller == address(0)) revert ErrorLibrary.InvalidAddress();
    isSupportedCallbackCaller[_callbackCaller] = true;
  }


  /**
   * @notice Removes a supported callback caller from the protocol.
   * @param _callbackCaller The address of the callback caller to remove.
   */
  function removeSupportedCallbackCaller(address _callbackCaller) external onlyProtocolOwner {
    delete isSupportedCallbackCaller[_callbackCaller];
  }
}
