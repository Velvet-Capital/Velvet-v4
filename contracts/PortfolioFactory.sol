// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;
import { AccessController } from "./access/AccessController.sol";
import { IPortfolio } from "./core/interfaces/IPortfolio.sol";
import { IAssetManagementConfig } from "./config/assetManagement/IAssetManagementConfig.sol";
import { ITokenExclusionManager } from "./core/interfaces/ITokenExclusionManager.sol";
import { IRebalancing } from "./rebalance/IRebalancing.sol";
import { IAccessController } from "./access/IAccessController.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/UUPSUpgradeable.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/access/Ownable2StepUpgradeable.sol";
import { FunctionParameters } from "./FunctionParameters.sol";
import { ErrorLibrary } from "./library/ErrorLibrary.sol";
import { IProtocolConfig } from "./config/protocol/IProtocolConfig.sol";
import { IFeeModule } from "./fee/IFeeModule.sol";
import { IVelvetSafeModule } from "./vault/IVelvetSafeModule.sol";
import { VelvetSafeModule } from "./vault/VelvetSafeModule.sol";
import { GnosisDeployer } from "contracts/library/GnosisDeployer.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/security/ReentrancyGuardUpgradeable.sol";
import { IBorrowManager } from "./core/interfaces/IBorrowManager.sol";

contract PortfolioFactory is
  Ownable2StepUpgradeable,
  ReentrancyGuardUpgradeable,
  UUPSUpgradeable
{
  address internal basePortfolioAddress;
  address internal baseTokenExclusionManagerAddress;
  address internal baseRebalancingAddress;
  address internal baseAssetManagementConfigAddress;
  address internal feeModuleImplementationAddress;
  address internal baseVelvetGnosisSafeModuleAddress;
  address internal baseTokenRemovalVaultAddress;
  address internal basePositionManager;
  address internal baseBorrowManager;
  address internal baseExternalPositionStorage;

  address public protocolConfig;
  bool internal portfolioCreationPause;

  //Gnosis Helper Contracts
  address public gnosisSingleton;
  address public gnosisFallbackLibrary;
  address public gnosisMultisendLibrary;
  address public gnosisSafeProxyFactory;

  address public nftManagerAddress;
  address public swapRouterV3Address;

  uint256 public portfolioId;

  // The mapping is used to track the deployed portfolio addresses.
  mapping(address => bool) public whitelistedPortfolioAddress;

  struct PortfoliolInfo {
    address portfolio;
    address tokenExclusionManager;
    address rebalancing;
    address owner;
    address borrowManager;
    address assetManagementConfig;
    address feeModule;
    address vaultAddress;
    address gnosisModule;
  }

  PortfoliolInfo[] public PortfolioInfolList;
  //Events
  event PortfolioInfo(
    PortfoliolInfo portfolioData,
    uint256 indexed portfolioId,
    string _name,
    string _symbol,
    address indexed _owner,
    address indexed _accessController,
    bool isPublicPortfolio
  );
  event PortfolioCreationState(bool indexed state);
  event UpgradePortfolio(address indexed newImplementation);
  event UpgradeAssetManagerConfig(address indexed newImplementation);
  event UpgradeFeeModule(address indexed newImplementation);
  event UpgradeTokenRemovalVaultBaseAddress(address indexed newImplementation);
  event UpgradeRebalance(address indexed newImplementation);
  event UpdateGnosisAddresses(
    address indexed newGnosisSingleton,
    address indexed newGnosisFallbackLibrary,
    address indexed newGnosisMultisendLibrary,
    address newGnosisSafeProxyFactory
  );
  event UpgradeTokenExclusionManager(address indexed newImplementation);
  event UpgradeBorrowManager(address indexed newImplementation);

  event TransferSuperAdminOwnership(address indexed newOwner);

  event UpgradePositionManager(address indexed newImplementation);

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice This function is used to initialise the PortfolioFactory while deployment
   */
  function initialize(
    FunctionParameters.PortfolioFactoryInitData memory initData
  ) external initializer {
    __Ownable2Step_init();
    __ReentrancyGuard_init();
    __UUPSUpgradeable_init();
    if (
      initData._basePortfolioAddress == address(0) ||
      initData._baseTokenExclusionManagerAddress == address(0) ||
      initData._baseRebalancingAddres == address(0) ||
      initData._baseAssetManagementConfigAddress == address(0) ||
      initData._feeModuleImplementationAddress == address(0) ||
      initData._baseVelvetGnosisSafeModuleAddress == address(0) ||
      initData._basePositionManager == address(0) ||
      initData._baseExternalPositionStorage == address(0) ||
      initData._gnosisSingleton == address(0) ||
      initData._gnosisFallbackLibrary == address(0) ||
      initData._gnosisMultisendLibrary == address(0) ||
      initData._gnosisSafeProxyFactory == address(0) ||
      initData._protocolConfig == address(0) ||
      initData._baseTokenRemovalVaultImplementation == address(0) ||
      initData._baseBorrowManager == address(0)
    ) revert ErrorLibrary.InvalidAddress();
    _setBasePortfolioAddress(initData._basePortfolioAddress);
    _setBaseRebalancingAddress(initData._baseRebalancingAddres);
    _setBaseTokenExclusionManagerAddress(
      initData._baseTokenExclusionManagerAddress
    );
    _setBaseAssetManagementConfigAddress(
      initData._baseAssetManagementConfigAddress
    );
    _setFeeModuleImplementationAddress(
      initData._feeModuleImplementationAddress
    );

    setTokenRemovalVaultImplementationAddress(
      initData._baseTokenRemovalVaultImplementation
    );
    _setBaseBorrowManager(initData._baseBorrowManager);
    setPositionManagerImplementationAddress(initData._basePositionManager);
    baseExternalPositionStorage = initData._baseExternalPositionStorage;

    baseVelvetGnosisSafeModuleAddress = initData
      ._baseVelvetGnosisSafeModuleAddress;
    protocolConfig = initData._protocolConfig;
    gnosisSingleton = initData._gnosisSingleton;
    gnosisFallbackLibrary = initData._gnosisFallbackLibrary;
    gnosisMultisendLibrary = initData._gnosisMultisendLibrary;
    gnosisSafeProxyFactory = initData._gnosisSafeProxyFactory;
  }

  /**
   * @notice Sets the addresses for NFT manager and swap router used by position managers
   * @dev Can only be called by contract owner
   * @param _nftManager Address of the Uniswap V3 NFT position manager contract
   * @param _swapRouterV3 Address of the Uniswap V3 swap router contract
   */
  function setPositionManagerAddresses(
    address _nftManager,
    address _swapRouterV3
  ) external onlyOwner {
    nftManagerAddress = _nftManager;
    swapRouterV3Address = _swapRouterV3;
  }

  /**
   * @notice This function enables to create a new non custodial portfolio
   * @param initData Accepts the input data from the user
   */
  function createPortfolioNonCustodial(
    FunctionParameters.PortfolioCreationInitData memory initData
  ) external virtual nonReentrant {
    address[] memory _owner = new address[](1);
    _owner[0] = address(0x0000000000000000000000000000000000000000);
    _createPortfolio(initData, false, _owner, 1);
  }

  /**
   * @notice This function enables to create a new custodial portfolio
   * @param initData Accepts the input data from the user
   * @param _owners Array list of owners for gnosis safe
   * @param _threshold Threshold for the gnosis safe(min number of transaction required)
   */
  function createPortfolioCustodial(
    FunctionParameters.PortfolioCreationInitData memory initData,
    address[] memory _owners,
    uint256 _threshold
  ) external virtual nonReentrant {
    if (_owners.length == 0) revert ErrorLibrary.NoOwnerPassed();
    if (_threshold > _owners.length || _threshold == 0)
      revert ErrorLibrary.InvalidThresholdLength();

    _createPortfolio(initData, true, _owners, _threshold);
  }

  /**
   * @notice This internal function enables to create a new portfolio according to given inputs
   * @param initData Input params passed as a struct
   * @param _custodial Boolean param as to whether the fund is custodial or non-custodial
   * @param _owner Address of the owner of the fund
   * @param _threshold Number of signers required for the multi-sig fund creation
   */
  function _createPortfolio(
    FunctionParameters.PortfolioCreationInitData memory initData,
    bool _custodial,
    address[] memory _owner,
    uint256 _threshold
  ) internal virtual {
    if (portfolioCreationPause) revert ErrorLibrary.PortfolioCreationIsPause();

    if (initData._assetManagerTreasury == address(0))
      revert ErrorLibrary.InvalidAddress();

    if (IProtocolConfig(protocolConfig).isProtocolPaused())
      revert ErrorLibrary.ProtocolIsPaused();

    ERC1967Proxy _tokenExclusionManager = new ERC1967Proxy(
      baseTokenExclusionManagerAddress,
      bytes("")
    );

    ERC1967Proxy _feeModule = new ERC1967Proxy(
      feeModuleImplementationAddress,
      bytes("")
    );

    // Access Controller
    AccessController accessController = new AccessController();
    ERC1967Proxy _assetManagementConfig = new ERC1967Proxy(
      baseAssetManagementConfigAddress,
      abi.encodeWithSelector(
        IAssetManagementConfig.init.selector,
        FunctionParameters.AssetManagementConfigInitData({
          _managementFee: initData._managementFee,
          _performanceFee: initData._performanceFee,
          _entryFee: initData._entryFee,
          _exitFee: initData._exitFee,
          _initialPortfolioAmount: initData._initialPortfolioAmount,
          _minPortfolioTokenHoldingAmount: initData
            ._minPortfolioTokenHoldingAmount,
          _protocolConfig: protocolConfig,
          _accessController: address(accessController),
          _feeModule: address(_feeModule),
          _assetManagerTreasury: initData._assetManagerTreasury,
          _basePositionManager: basePositionManager,
          _baseExternalPositionStorage: baseExternalPositionStorage,
          _whitelistedTokens: initData._whitelistedTokens,
          _publicPortfolio: initData._public,
          _transferable: initData._transferable,
          _transferableToPublic: initData._transferableToPublic,
          _whitelistTokens: initData._whitelistTokens,
          _witelistedProtocolIds: initData._witelistedProtocolIds
        })
      )
    );

    ERC1967Proxy portfolio = new ERC1967Proxy(basePortfolioAddress, bytes(""));

    whitelistedPortfolioAddress[address(portfolio)] = true;

    // Vault creation
    address vaultAddress;
    address module;
    if (!_custodial) {
      _owner[0] = address(portfolio);
      _threshold = 1;
    }

    (vaultAddress, module) = GnosisDeployer._deployGnosisSafeAndModule(
      FunctionParameters.SafeAndModuleDeploymentParams({
        _gnosisSingleton: gnosisSingleton,
        _gnosisSafeProxyFactory: gnosisSafeProxyFactory,
        _gnosisMultisendLibrary: gnosisMultisendLibrary,
        _gnosisFallbackLibrary: gnosisFallbackLibrary,
        _baseGnosisModule: baseVelvetGnosisSafeModuleAddress,
        _owners: _owner,
        _threshold: _threshold
      })
    );

    //BorrowManager
    ERC1967Proxy borrowManager = new ERC1967Proxy(
      baseBorrowManager,
      abi.encodeWithSelector(
        IBorrowManager.init.selector,
        vaultAddress,
        protocolConfig,
        address(portfolio),
        address(accessController)
      )
    );

    IPortfolio(address(portfolio)).init(
      FunctionParameters.PortfolioInitData({
        _name: initData._name,
        _symbol: initData._symbol,
        _vault: vaultAddress,
        _module: module,
        _tokenExclusionManager: address(_tokenExclusionManager),
        _borrowManager: address(borrowManager),
        _accessController: address(accessController),
        _protocolConfig: protocolConfig,
        _assetManagementConfig: address(_assetManagementConfig),
        _feeModule: address(_feeModule)
      })
    );

    bool isPublic = initData._public;
    string memory _name = initData._name;
    string memory _symbol = initData._symbol;

    ITokenExclusionManager(address(_tokenExclusionManager)).init(
      address(accessController),
      protocolConfig,
      baseTokenRemovalVaultAddress
    );

    IVelvetSafeModule(address(module)).setUp(
      abi.encode(
        vaultAddress,
        address(portfolio), // new owner of module to pull from vault
        address(gnosisMultisendLibrary)
      )
    );

    // Rebalancing
    ERC1967Proxy rebalancing = new ERC1967Proxy(
      baseRebalancingAddress,
      abi.encodeWithSelector(
        IRebalancing.init.selector,
        IPortfolio(address(portfolio)),
        address(accessController),
        address(borrowManager)
      )
    );

    PortfolioInfolList.push(
      PortfoliolInfo(
        address(portfolio),
        address(_tokenExclusionManager),
        address(rebalancing),
        address(borrowManager),
        msg.sender,
        address(_assetManagementConfig),
        address(_feeModule),
        address(vaultAddress),
        address(module)
      )
    );

    accessController.setUpRoles(
      FunctionParameters.AccessSetup({
        _portfolio: address(portfolio),
        _portfolioCreator: msg.sender,
        _rebalancing: address(rebalancing),
        _feeModule: address(_feeModule),
        _borrowManager: address(borrowManager)
      })
    );

    IFeeModule(address(_feeModule)).init(
      address(portfolio),
      address(_assetManagementConfig),
      protocolConfig,
      address(accessController)
    );

    emit PortfolioInfo(
      PortfolioInfolList[portfolioId],
      portfolioId,
      _name,
      _symbol,
      msg.sender,
      address(accessController),
      isPublic
    );
    portfolioId = portfolioId + 1;
  }

  /**
   * @notice This function returns the Portfolio address at the given portfolio id
   * @param portfoliofundId Integral id of the portfolio fund whose Portfolio address is to be retrieved
   * @return Return the Portfolio address of the fund
   */
  function getPortfolioList(
    uint256 portfoliofundId
  ) external view virtual returns (address) {
    return address(PortfolioInfolList[portfoliofundId].portfolio);
  }

  /**
   * @notice This function is used to upgrade the Token Exclusion Manager contract
   * @param _proxy Proxy address
   * @param _newImpl New implementation address
   */
  function upgradeTokenExclusionManager(
    address[] calldata _proxy,
    address _newImpl
  ) external virtual onlyOwner {
    _setBaseTokenExclusionManagerAddress(_newImpl);
    _upgrade(_proxy, _newImpl);
    emit UpgradeTokenExclusionManager(_newImpl);
  }

  /**
   * @notice This function is used to set the base borrowManager address
   * @param _baseManager Address of the borrowManager module to set as base
   */
  function _setBaseBorrowManager(address _baseManager) internal {
    baseBorrowManager = _baseManager;
  }

  /**
   * @notice This function is used to upgrade the Borrow Manager contract
   * @param _proxy Proxy address
   * @param _newImpl New implementation address
   */
  function upgradeBorrowManager(
    address[] calldata _proxy,
    address _newImpl
  ) external virtual onlyOwner {
    _setBaseBorrowManager(_newImpl);
    _upgrade(_proxy, _newImpl);
    emit UpgradeBorrowManager(_newImpl);
  }

  /**
   * @notice This function is used to upgrade the Portfolio contract
   * @param _proxy Proxy address
   * @param _newImpl New implementation address
   */
  function upgradePortfolio(
    address[] calldata _proxy,
    address _newImpl
  ) external virtual onlyOwner {
    _setBasePortfolioAddress(_newImpl);
    _upgrade(_proxy, _newImpl);
    emit UpgradePortfolio(_newImpl);
  }

  /**
   * @notice This function is used to upgrade the AssetManagementConfig contract
   * @param _proxy Proxy address
   * @param _newImpl New implementation address
   */
  function upgradeAssetManagerConfig(
    address[] calldata _proxy,
    address _newImpl
  ) external virtual onlyOwner {
    _setBaseAssetManagementConfigAddress(_newImpl);
    _upgrade(_proxy, _newImpl);
    emit UpgradeAssetManagerConfig(_newImpl);
  }

  /**
   * @notice This function is used to upgrade the FeeModule contract
   * @param _proxy Proxy address
   * @param _newImpl New implementation address
   */
  function upgradeFeeModule(
    address[] calldata _proxy,
    address _newImpl
  ) external virtual onlyOwner {
    _setFeeModuleImplementationAddress(_newImpl);
    _upgrade(_proxy, _newImpl);
    emit UpgradeFeeModule(_newImpl);
  }

  /**
   * @notice This function is used to upgrade the Rebalance contract
   * @param _proxy Proxy address for the rebalancing contract
   * @param _newImpl New implementation address
   */
  function upgradeRebalance(
    address[] calldata _proxy,
    address _newImpl
  ) external virtual onlyOwner {
    _setBaseRebalancingAddress(_newImpl);
    _upgrade(_proxy, _newImpl);
    emit UpgradeRebalance(_newImpl);
  }

  /**
   * @notice This function is used to upgrade the Token Exclusion Manager contract
   * @param _proxy Proxy address
   * @param _newImpl New implementation address
   */
  function upgradePositionManager(
    address[] calldata _proxy,
    address _newImpl
  ) external virtual onlyOwner {
    setPositionManagerImplementationAddress(_newImpl);
    _upgrade(_proxy, _newImpl);
    emit UpgradePositionManager(_newImpl);
  }

  /**
   * @notice This function is the base UUPS upgrade function used to make all the upgrades happen
   * @param _proxy Address of the upgrade proxy contract
   * @param _newImpl Address of the new implementation that is the module to be upgraded to
   */
  function _upgrade(
    address[] calldata _proxy,
    address _newImpl
  ) internal virtual onlyOwner {
    if (!IProtocolConfig(protocolConfig).isProtocolPaused()) {
      revert ErrorLibrary.ProtocolNotPaused();
    }
    if (_newImpl == address(0)) {
      revert ErrorLibrary.InvalidAddress();
    }
    uint256 proxyLength = _proxy.length;
    for (uint256 i; i < proxyLength; i++) {
      address proxyAddress = _proxy[i];
      if (proxyAddress == address(0)) revert ErrorLibrary.InvalidAddress();
      UUPSUpgradeable(_proxy[i]).upgradeTo(_newImpl);
    }
  }

  /**
   * @notice This function allows us to pause or unpause the portfolio creation state
   * @param _state Boolean parameter to set the portfolio creation state of the factory
   */
  function setPortfolioCreationState(bool _state) external virtual onlyOwner {
    portfolioCreationPause = _state;
    emit PortfolioCreationState(_state);
  }

  /**
   * @notice This function is used to set the base portfolio address
   * @param _portfolio Address of the Portfolio module to set as base
   */
  function _setBasePortfolioAddress(address _portfolio) internal {
    basePortfolioAddress = _portfolio;
  }

  /**
   * @notice This function is used to set the base tokenExclusionManager address
   * @param _tokenExclusionManager Address of the tokenExclusionManager module to set as base
   */
  function _setBaseTokenExclusionManagerAddress(
    address _tokenExclusionManager
  ) internal {
    baseTokenExclusionManagerAddress = _tokenExclusionManager;
  }

  /**
   * @notice This function is used to set the base asset manager config address
   * @param _config Address of the AssetManager Config to set as base
   */
  function _setBaseAssetManagementConfigAddress(address _config) internal {
    baseAssetManagementConfigAddress = _config;
  }

  /**
   * @notice This function is used to set the fee module implementation address
   * @param _feeModule Address of the fee module address to set as base
   */
  function _setFeeModuleImplementationAddress(address _feeModule) internal {
    feeModuleImplementationAddress = _feeModule;
  }

  /**
   * @notice This function is used to set the base rebalancing address
   * @param _rebalance Address of the rebalance module address to set as base
   */
  function _setBaseRebalancingAddress(address _rebalance) internal {
    baseRebalancingAddress = _rebalance;
  }

  /**
   * @notice This function is used to set the token removal vault implementation address
   * @param _baseTokenRemovalVault Address of the token removal vault to set as base
   */
  function setTokenRemovalVaultImplementationAddress(
    address _baseTokenRemovalVault
  ) internal {
    baseTokenRemovalVaultAddress = _baseTokenRemovalVault;
  }

  /**
   * @notice This function is used to set the position manager implementation address
   * @param _basePositionManager Address of the position manager to set as base
   */
  function setPositionManagerImplementationAddress(
    address _basePositionManager
  ) internal {
    basePositionManager = _basePositionManager;
  }

  /**
   * @notice This function is used to set the Token Removal Vault implementation address
   * @param _newImpl New implementation address
   */
  function setTokenRemovalVaultModule(
    address _newImpl
  ) external virtual onlyOwner {
    setTokenRemovalVaultImplementationAddress(_newImpl);
    emit UpgradeTokenRemovalVaultBaseAddress(_newImpl);
  }

  function updateBaseExternalPositionStorageAddress(
    address _newBaseAddress
  ) external onlyOwner {
    baseExternalPositionStorage = _newBaseAddress;
  }

  /**
   * @notice This function allows us to update gnosis deployment addresses
   * @param _newGnosisSingleton New address of GnosisSingleton
   * @param _newGnosisFallbackLibrary New address of GnosisFallbackLibrary
   * @param _newGnosisMultisendLibrary New address of GnosisMultisendLibrary
   * @param _newGnosisSafeProxyFactory New address of GnosisSafeProxyFactory
   */
  function updateGnosisAddresses(
    address _newGnosisSingleton,
    address _newGnosisFallbackLibrary,
    address _newGnosisMultisendLibrary,
    address _newGnosisSafeProxyFactory
  ) external virtual onlyOwner {
    if (
      _newGnosisSingleton == address(0) ||
      _newGnosisFallbackLibrary == address(0) ||
      _newGnosisMultisendLibrary == address(0) ||
      _newGnosisSafeProxyFactory == address(0)
    ) revert ErrorLibrary.InvalidAddress();
    gnosisSingleton = _newGnosisSingleton;
    gnosisFallbackLibrary = _newGnosisFallbackLibrary;
    gnosisMultisendLibrary = _newGnosisMultisendLibrary;
    gnosisSafeProxyFactory = _newGnosisSafeProxyFactory;

    emit UpdateGnosisAddresses(
      _newGnosisSingleton,
      _newGnosisFallbackLibrary,
      _newGnosisMultisendLibrary,
      _newGnosisSafeProxyFactory
    );
  }

  /**
   * @notice This function allows super admin of particular portfolio/portfolio to transfer ownership
   * @param _accessController address of accesscontroller of portfolio/portfolio
   * @param _account address of account to transfer ownership
   */
  function transferSuperAdminOwnership(
    address _accessController,
    address _account
  ) external {
    if (_accessController == address(0) || _account == address(0))
      revert ErrorLibrary.InvalidAddress();
    bytes32 SUPER_ADMIN = keccak256("SUPER_ADMIN");
    IAccessController accessController = IAccessController(_accessController);
    if (!accessController.hasRole(SUPER_ADMIN, msg.sender))
      revert ErrorLibrary.CallerNotSuperAdmin();
    accessController.transferSuperAdminOwnership(msg.sender, _account);

    emit TransferSuperAdminOwnership(_account);
  }

  /**
   * @notice Authorizes upgrade for this contract
   * @param newImplementation Address of the new implementation
   */
  function _authorizeUpgrade(
    address newImplementation
  ) internal override onlyOwner {
    // Intentionally left empty as required by an abstract contract
  }
}
