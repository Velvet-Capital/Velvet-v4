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
    address[] _whitelistedTokens;
    bool _publicPortfolio;
    bool _transferable;
    bool _transferableToPublic;
    bool _whitelistTokens;
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
   * @dev This struct helps organize the data necessary for performing swaps and managing liquidity, especially for positions represented externally.
   * @param _positionWrappers Array of addresses for external position wrapper contracts, which abstract underlying liquidity pools or other DeFi primitives.
   * @param _swapTokens Array of tokens involved in swaps or to be added to liquidity pools.
   * @param _positionWrapperIndex Array of indices specifying for each position wrapper the index of the corresponding portfolio token.
   * @param _portfolioTokenIndex Array of indices linking each swap token or liquidity operation to specific tokens in the managing portfolio.
   * @param _index0 Array of indices in _swapTokens representing the first token of each liquidity pair.
   * @param _index1 Array of indices in _swapTokens representing the second token of each liquidity pair.
   * @param _amount0Min Minimum amount of the first token in a liquidity pair to mitigate slippage, ensuring operations don't proceed under unfavorable market conditions.
   * @param _amount1Min Minimum amount of the second token in a liquidity pair to mitigate slippage, similarly to _amount0Min.
   * @param _isExternalPosition Array of booleans indicating whether each token operation involves an external position, allowing for specific handling.
   */
  struct ExternalPositionDepositParams {
    address[] _positionWrappers;
    address[] _swapTokens;
    uint256[] _positionWrapperIndex;
    uint256[] _portfolioTokenIndex;
    uint256[] _index0;
    uint256[] _index1;
    uint256 _amount0Min;
    uint256 _amount1Min;
    bool[] _isExternalPosition;
    address _tokenIn;
    address _tokenOut;
    uint256 _amountIn;
  }

  /**
   * @title ExternalPositionWithdrawParams
   * @dev Struct to hold parameters for managing withdrawals from external positions, facilitating operations like swaps or liquidity removals.
   * This structure is crucial for coordinating interactions with external DeFi protocols, ensuring that operations proceed within predefined parameters for risk and slippage management.
   * @param _positionWrappers Array of addresses of external position wrapper contracts from which withdrawals are to be made. These wrappers abstract the interactions with the underlying liquidity pools or DeFi primitives.
   * @param _tokenIn Address of the token being used in the operation, generally for swapping into another token.
   * @param _tokenOut Address of the token expected to be received from the swap operation. This is crucial for operations where a specific output token is desired.
   * @param _amountIn The total amount of the input token that will be used in the swap or withdrawal operation. This defines the scale of the operation.
   * @param _amountsMin0 Array of minimum amounts of the first token that must be received when withdrawing liquidity or performing swaps, specific to each position or operation. This parameter helps to ensure that each operation adheres to risk thresholds specific to the token pair involved.
   * @param _amountsMin1 Array of minimum amounts of the second token that must be received, analogous to _amountsMin0, providing a similar layer of protection and precision in managing slippage and output amounts.
   */
  struct ExternalPositionWithdrawParams {
    address[] _positionWrappers;
    uint256[] _amountsMin0;
    uint256[] _amountsMin1;
    address _tokenIn;
    address _tokenOut;
    uint256 _amountIn;
  }

  struct EnsoRebalanceParams {
    IPositionManager _positionManager;
    address _to;
    bytes _calldata;
  }
}
