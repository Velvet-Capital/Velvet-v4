// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IPositionManager } from "./wrappers/abstract/IPositionManager.sol";

/**
 * @title FunctionParameters
 * @notice A library for defining structured data passed across functions in DeFi protocols.
 * @dev This library encapsulates various structures used for initializing, configuring, and managing on-chain financial products.
 */
library FunctionParameters {
  /**
   * @notice Struct for initializing a new PortfolioFactory
   * @dev Encapsulates data necessary for deploying an PortfolioFactory and associated components.
   * @param _basePortfolioAddress Base Portfolio contract address for cloning
   * @param _baseTokenExclusionManagerAddress Base Token Exclusion address for cloning
   * @param _baseRebalancingAddress Base Rebalancing module address for cloning
   * @param _baseAssetManagementConfigAddress Base AssetManagement Config address for cloning
   * @param _feeModuleImplementationAddress Fee Module implementation contract address
   * @param  _baseTokenRemovalVaultImplementation Token Removal Vault implementation contract address
   * @param  _basePositionManager Position manager implementation contract address
   * @param _baseVelvetGnosisSafeModuleAddress Base Gnosis-Safe module address for cloning
   * @param  _basePositionManager Position manager implementation contract address
   * @param _gnosisSingleton Gnosis Singleton contract address
   * @param _gnosisFallbackLibrary Gnosis Fallback Library address
   * @param _gnosisMultisendLibrary Gnosis Multisend Library address
   * @param _gnosisSafeProxyFactory Gnosis Safe Proxy Factory address
   * @param _protocolConfig Protocol configuration contract address
   * @param _velvetProtocolFee Protocol fee percentage (in basis points)
   */
  struct PortfolioFactoryInitData {
    address _basePortfolioAddress;
    address _baseTokenExclusionManagerAddress;
    address _baseRebalancingAddres;
    address _baseAssetManagementConfigAddress;
    address _feeModuleImplementationAddress;
    address _baseTokenRemovalVaultImplementation;
    address _baseVelvetGnosisSafeModuleAddress;
    address _basePositionManager;
    address _baseExternalPositionStorage;
    address _baseBorrowManager;
    address _gnosisSingleton;
    address _gnosisFallbackLibrary;
    address _gnosisMultisendLibrary;
    address _gnosisSafeProxyFactory;
    address _protocolConfig;
  }

  /**
   * @notice Data for initializing the Portfolio module
   * @dev Used when setting up a new Portfolio instance.
   * @param _name Name of the Portfolio Fund
   * @param _symbol Symbol of the Portfolio Fund
   * @param _vault Vault address associated with the Portfolio Fund
   * @param _module Safe module address associated with the Portfolio Fund
   * @param _accessController Access Controller address for managing roles
   * @param _protocolConfig Protocol configuration contract address
   * @param _assetManagementConfig Asset Management configuration contract address
   * @param _feeModule Fee Module contract address
   */
  struct PortfolioInitData {
    string _name;
    string _symbol;
    address _vault;
    address _module;
    address _tokenExclusionManager;
    address _borrowManager;
    address _accessController;
    address _protocolConfig;
    address _assetManagementConfig;
    address _feeModule;
  }

  /**
   * @notice Data for initializing a new Portfolio Fund via the Factory
   * @dev Encapsulates settings and configurations for a newly created Portfolio Fund.
   * @param _assetManagerTreasury Treasury address for asset manager fee accumulation
   * @param _whitelistedTokens Array of token addresses permitted in the Portfolio Fund
   * @param _managementFee Management fee (annual, in basis points)
   * @param _performanceFee Performance fee (upon profit, in basis points)
   * @param _entryFee Fee for entering the fund (in basis points)
   * @param _exitFee Fee for exiting the fund (in basis points)
   * @param _initialPortfolioAmount Initial amount of the portfolio token
   * @param _minPortfolioTokenHoldingAmount Minimum amount of portfolio tokens that can be held and can be minted
   * @param _public Indicates if the fund is open to the public
   * @param _transferable Indicates if the fund's tokens are transferable
   * @param _transferableToPublic Indicates if the fund's tokens are transferable to the public
   * @param _whitelistTokens Indicates if only whitelisted tokens can be included in the fund
   * @param _name Name of the Portfolio Fund
   * @param _symbol Symbol of the Portfolio Fund
   */
  struct PortfolioCreationInitData {
    address _assetManagerTreasury;
    address[] _whitelistedTokens;
    uint256 _managementFee;
    uint256 _performanceFee;
    uint256 _entryFee;
    uint256 _exitFee;
    uint256 _initialPortfolioAmount;
    uint256 _minPortfolioTokenHoldingAmount;
    bool _public;
    bool _transferable;
    bool _transferableToPublic;
    bool _whitelistTokens;
    bytes32[] _witelistedProtocolIds;
    string _name;
    string _symbol;
  }

  /**
   * @notice Data for initializing the Asset Manager Config
   * @dev Used for setting up asset management configurations for an Portfolio Fund.
   * @param _managementFee Annual management fee (in basis points)
   * @param _performanceFee Performance fee (upon profit, in basis points)
   * @param _entryFee Entry fee (in basis points)
   * @param _exitFee Exit fee (in basis points)
   * @param _initialPortfolioAmount Initial amount of the portfolio token
   * @param _minPortfolioTokenHoldingAmount Minimum amount of portfolio tokens that can be held and can be minted
   * @param _protocolConfig Protocol configuration contract address
   * @param _accessController Access Controller contract address
   * @param _assetManagerTreasury Treasury address for asset manager fee accumulation
   * @param _whitelistedTokens Array of token addresses permitted in the Portfolio Fund
   * @param _publicPortfolio Indicates if the portfolio is open to public deposits
   * @param _transferable Indicates if the portfolio's tokens are transferable
   * @param _transferableToPublic Indicates if the portfolio's tokens are transferable to the public
   * @param _whitelistTokens Indicates if only whitelisted tokens can be included in the portfolio
   */
  struct AssetManagementConfigInitData {
    uint256 _managementFee;
    uint256 _performanceFee;
    uint256 _entryFee;
    uint256 _exitFee;
    uint256 _initialPortfolioAmount;
    uint256 _minPortfolioTokenHoldingAmount;
    address _protocolConfig;
    address _accessController;
    address _feeModule;
    address _assetManagerTreasury;
    address _basePositionManager;
    address _baseExternalPositionStorage;
    address[] _whitelistedTokens;
    bool _publicPortfolio;
    bool _transferable;
    bool _transferableToPublic;
    bool _whitelistTokens;
    bytes32[] _witelistedProtocolIds;
  }

  /**
   * @notice Data structure for setting up roles during Portfolio Fund creation
   * @dev Used for assigning roles to various components of the Portfolio Fund ecosystem.
   * @param _portfolio Portfolio contract address
   * @param _protocolConfig Protocol configuration contract address
   * @param _portfolioCreator Address of the portfolio creator
   * @param _rebalancing Rebalancing module contract address
   * @param _feeModule Fee Module contract address
   */
  struct AccessSetup {
    address _portfolio;
    address _portfolioCreator;
    address _rebalancing;
    address _feeModule;
    address _borrowManager;
  }

  /**
   * @dev Struct containing the parameters required for repaying a debt using a flash loan.
   *
   * @param _factory The address of the factory contract responsible for creating necessary contracts.
   * @param _token0 The address of the first token in the swap pair (e.g., USDT).
   * @param _token1 The address of the second token in the swap pair (e.g., USDC).
   * @param _flashLoanToken The address of the token to be borrowed in the flash loan.
   * @param _debtToken The addresses of the tokens representing the debt to be repaid.
   * @param _protocolToken The addresses of the protocol-specific tokens, such as lending tokens (e.g., vTokens for Venus protocol).
   * @param _solverHandler The address of the contract handling the execution of swaps and other logic.
   * @param _bufferUnit Buffer unit for collateral amount
   * @param _flashLoanAmount The amounts of the flash loan to be taken for each corresponding `_flashLoanToken`.
   * @param _debtRepayAmount The amounts of debt to be repaid for each corresponding `_debtToken`.
   * @param firstSwapData The encoded data for the first swap operation, used for repaying the debt.
   * @param secondSwapData The encoded data for the second swap operation, used for further adjustments after repaying the debt.
   * @param isMaxRepayment Boolean flag to determine if the maximum borrowed amount should be repaid.
   */
  struct RepayParams {
    address _factory;
    address _token0; //USDT
    address _token1; //USDC
    address _flashLoanToken;
    address[] _debtToken;
    address[] _protocolToken; // lending token in case of venus
    address _solverHandler;
    uint256 _bufferUnit;
    uint256[] _flashLoanAmount;
    uint256[] _debtRepayAmount;
    bytes[] firstSwapData;
    bytes[] secondSwapData;
    bool isMaxRepayment;
  }

  /**
   * @dev Struct containing the parameters required for withdrawing and repaying debt using a flash loan.
   *
   * @param _factory The address of the factory contract responsible for creating necessary contracts.
   * @param _token0 The address of the first token in the swap pair.
   * @param _token1 The address of the second token in the swap pair.
   * @param _flashLoanToken The address of the token to be borrowed in the flash loan.
   * @param _solverHandler The address of the contract handling the execution of swaps and other logic.
   * @param _bufferUnit Buffer unit for collateral amount
   * @param _flashLoanAmount The amounts of the flash loan to be taken for each corresponding `_flashLoanToken`.
   * @param firstSwapData The encoded data for the first swap operation, used in the process of repaying or withdrawing.
   * @param secondSwapData The encoded data for the second swap operation, used for further adjustments after the first swap.
   */
  struct withdrawRepayParams {
    address _factory;
    address _token0;
    address _token1;
    address _flashLoanToken;
    address _solverHandler;
    uint256 _bufferUnit;
    uint256[] _flashLoanAmount;
    bytes[] firstSwapData;
    bytes[] secondSwapData;
  }

  /**
   * @dev Struct containing detailed data for executing a flash loan and managing debt repayment.
   *
   * @param flashLoanToken The address of the token to be borrowed in the flash loan.
   * @param debtToken The addresses of the tokens representing the debt to be repaid.
   * @param protocolTokens The addresses of the protocol-specific tokens, such as lending tokens (e.g., vTokens for Venus protocol).
   * @param solverHandler The address of the contract handling the execution of swaps and other logic.
   * @param bufferUnit Buffer unit for collateral amount
   * @param flashLoanAmount The amounts of the flash loan to be taken for each corresponding `flashLoanToken`.
   * @param debtRepayAmount The amounts of debt to be repaid for each corresponding `debtToken`.
   * @param firstSwapData The encoded data for the first swap operation, used for repaying the debt.
   * @param secondSwapData The encoded data for the second swap operation, used for further adjustments after repaying the debt.
   * @param isMaxRepayment Boolean flag to determine if the maximum borrowed amount should be repaid.
   */
  struct FlashLoanData {
    address flashLoanToken;
    address[] debtToken;
    address[] protocolTokens;
    address solverHandler;
    address poolAddress;
    uint256 bufferUnit;
    uint256[] flashLoanAmount;
    uint256[] debtRepayAmount;
    bytes[] firstSwapData;
    bytes[] secondSwapData;
    bool isMaxRepayment;
  }

  /**
   * @dev Struct containing account-related data such as collateral, debt, and health factors.
   *
   * @param totalCollateral The total collateral value of the account.
   * @param totalDebt The total debt value of the account.
   * @param availableBorrows The total amount available for borrowing.
   * @param currentLiquidationThreshold The current liquidation threshold value of the account.
   * @param ltv The loan-to-value ratio of the account.
   * @param healthFactor The health factor of the account, used to determine its risk of liquidation.
   */
  struct AccountData {
    uint totalCollateral;
    uint totalDebt;
    uint availableBorrows;
    uint currentLiquidationThreshold;
    uint ltv;
    uint healthFactor;
  }

  /**
   * @dev Struct containing arrays of token addresses related to lending and borrowing activities.
   *
   * @param lendTokens The array of addresses for tokens that are used in lending operations.
   * @param borrowTokens The array of addresses for tokens that are used in borrowing operations.
   */
  struct TokenAddresses {
    address[] lendTokens;
    address[] borrowTokens;
  }

  /**
   * @notice Struct for defining a rebalance intent
   * @dev Encapsulates the intent data for performing a rebalance operation.
   * @param _newTokens Array of new token addresses to be included in the Portfolio Fund
   * @param _sellTokens Array of token addresses to be sold during the rebalance
   * @param _sellAmounts Corresponding amounts of each token to sell
   * @param _handler Address of the intent handler for executing rebalance
   * @param _callData Encoded call data for the rebalance operation
   */
  struct RebalanceIntent {
    address[] _newTokens;
    address[] _sellTokens;
    uint256[] _sellAmounts;
    address _handler;
    bytes _callData;
  }

  /**
   * @notice Struct of batchHandler data
   * @dev Encapsulates the data needed to batch transaction.
   * @param _minMintAmount The minimum amount of portfolio tokens the user expects to receive for their deposit, protecting against slippage
   * @param _depositAmount Amount to token to swap to vailt tokens
   * @param _target Adress of portfolio contract to deposit
   * @param _depositToken Address of token that needed to be swapped
   * @param _callData Encoded call data for swap operation
   */
  struct BatchHandler {
    uint256 _minMintAmount;
    uint256 _depositAmount;
    address _target;
    address _depositToken;
    bytes[] _callData;
  }

  /**
   * @dev Struct to encapsulate the parameters required for deploying a Safe and its associated modules.
   * @param _gnosisSingleton Address of the Safe singleton contract.
   * @param _gnosisSafeProxyFactory Address of the Safe Proxy Factory contract.
   * @param _gnosisMultisendLibrary Address of the Multisend library contract.
   * @param _gnosisFallbackLibrary Address of the Fallback library contract.
   * @param _baseGnosisModule Address of the base module to be used.
   * @param _owners Array of addresses to be designated as owners of the Safe.
   * @param _threshold Number of owner signatures required to execute a transaction in the Safe.
   */
  struct SafeAndModuleDeploymentParams {
    address _gnosisSingleton;
    address _gnosisSafeProxyFactory;
    address _gnosisMultisendLibrary;
    address _gnosisFallbackLibrary;
    address _baseGnosisModule;
    address[] _owners;
    uint256 _threshold;
  }

  /**
   * @notice Struct to hold parameters for managing deposits into external positions.
   * @dev This struct organizes data for performing swaps and managing liquidity in external positions.
   * @param _positionWrappers Addresses of external position wrapper contracts.
   * @param _swapTokens Tokens involved in swaps or liquidity additions.
   * @param _positionWrapperIndex Indices linking position wrappers to portfolio tokens.
   * @param _portfolioTokenIndex Indices linking swap tokens to portfolio tokens.
   * @param _index0 Indices of first tokens in liquidity pairs.
   * @param _index1 Indices of second tokens in liquidity pairs.
   * @param _amount0Min Minimum amounts for first tokens to mitigate slippage.
   * @param _amount1Min Minimum amounts for second tokens to mitigate slippage.
   * @param _isExternalPosition Booleans indicating external position involvement.
   * @param _tokenIn Input tokens for swap operations.
   * @param _tokenOut Output tokens for swap operations.
   * @param _amountIn Input amounts for swap operations.
   */
  struct ExternalPositionDepositParams {
    address[] _positionWrappers;
    address[] _swapTokens;
    uint256[] _positionWrapperIndex;
    uint256[] _portfolioTokenIndex;
    uint256[] _index0;
    uint256[] _index1;
    uint256[] _amount0Min;
    uint256[] _amount1Min;
    bool[] _isExternalPosition;
    address[] _tokenIn;
    address[] _tokenOut;
    uint256[] _amountIn;
  }

  /**
   /**
    * @title ExternalPositionWithdrawParams
    * @dev Struct to hold parameters for managing withdrawals from external positions, facilitating operations like swaps or liquidity removals.
    * This structure is crucial for coordinating interactions with external DeFi protocols, ensuring that operations proceed within predefined parameters for risk and slippage management.
    * @param _positionWrappers Array of addresses of external position wrapper contracts from which withdrawals are to be made.
    * @param _amountsMin0 Array of minimum amounts of the first token that must be received when withdrawing liquidity or performing swaps.
    * @param _amountsMin1 Array of minimum amounts of the second token that must be received, analogous to _amountsMin0.
    * @param _tokenIn Array of addresses of tokens being used as input for swap operations.
    * @param _tokenOut Array of addresses of tokens expected to be received from swap operations.
    * @param _amountIn Array of amounts of input tokens to be used in swap or withdrawal operations.
    */
  struct ExternalPositionWithdrawParams {
    address[] _positionWrappers;
    uint256[] _amountsMin0;
    uint256[] _amountsMin1;
    address[] _tokenIn;
    address[] _tokenOut;
    uint256[] _amountIn;
  }

  /**
   * @notice Struct for Enso Rebalance Params
   * @dev Encapsulates the parameters required for performing a rebalance operation using the Enso protocol.
   * @param _positionManager Address of the Enso Position Manager contract.
   * @param _to Address of the recipient for the rebalance operation.
   * @param _calldata Encoded call data for the rebalance operation.
   */
  struct EnsoRebalanceParams {
    IPositionManager _positionManager;
    address _to;
    bytes _calldata;
  }
}
