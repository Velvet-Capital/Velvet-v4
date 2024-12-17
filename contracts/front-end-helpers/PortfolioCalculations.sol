// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import {IPortfolio} from "../core/interfaces/IPortfolio.sol";
import {ITokenExclusionManager} from "../core/interfaces/ITokenExclusionManager.sol";
import {IFeeModule} from "../fee/IFeeModule.sol";
import {IAssetManagementConfig} from "../config/assetManagement/IAssetManagementConfig.sol";
import {IProtocolConfig} from "../config/protocol/IProtocolConfig.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {IPriceOracle} from "../../contracts/oracle/IPriceOracle.sol";
import {IVenusPool} from "../core/interfaces/IVenusPool.sol";
import {IThena} from "../core/interfaces/IThena.sol";
import {IAssetHandler} from "../core/interfaces/IAssetHandler.sol";
import {FunctionParameters} from "../FunctionParameters.sol";
import {IVenusComptroller, IVAIController} from "../handler/Venus/IVenusComptroller.sol";
import {ExponentialNoError} from "../handler/Venus/ExponentialNoError.sol";
import {ErrorLibrary} from "../library/ErrorLibrary.sol";
import {TokenBalanceLibrary} from "../core/calculations/TokenBalanceLibrary.sol";
import {IAavePriceOracle} from "../handler/Aave/IAavePriceOracle.sol";
import {IPoolDataProvider} from "../handler/Aave/IPoolDataProvider.sol";
import {IAaveToken} from "../handler/Aave/IAaveToken.sol";

contract PortfolioCalculations is ExponentialNoError {
  uint256 internal constant ONE_ETH_IN_WEI = 10 ** 18;
  uint256 constant MIN_MINT_FEE = 1_000_000;
  uint256 public constant TOTAL_WEIGHT = 10_000;

  struct AccountData {
    uint totalCollateral;
    uint totalDebt;
    uint availableBorrows;
    uint currentLiquidationThreshold;
    uint ltv;
    uint healthFactor;
  }

  struct TokenBalances {
    address[] lendTokens;
    address[] borrowTokens;
  }

  struct CalculationParams {
    address protocolToken;
    address vault;
    address comptroller;
    uint256 afterFeeAmount;
    uint256 totalSupplyPortfolio;
    uint256 flashLoanTokenPrice;
    uint256 flashLoanBufferUnit;
  }

  function getTokenBalancesAndDecimals(
    address _portfolio
  ) public view returns (uint256[] memory, uint8[] memory) {
    require(_portfolio != address(0), "Invalid portfolio address");

    IPortfolio portfolio = IPortfolio(_portfolio);
    address vault = portfolio.vault();
    address[] memory tokens = portfolio.getTokens();
    uint256[] memory tokenBalances = new uint256[](tokens.length);
    uint8[] memory tokenDecimals = new uint8[](tokens.length);
    if (portfolio.totalSupply() > 0) {
      for (uint256 i = 0; i < tokens.length; i++) {
        tokenBalances[i] = IERC20Upgradeable(tokens[i]).balanceOf(vault);
        tokenDecimals[i] = IERC20MetadataUpgradeable(tokens[i]).decimals();
      }
      return (tokenBalances, tokenDecimals);
    } else {
      return (new uint256[](0), new uint8[](0));
    }
  }

  function getPortfolioData(
    address _portfolio
  )
    public
    view
    returns (
      uint256[] memory tokenAmountArray,
      uint8[] memory tokenDecimalArray,
      address[] memory indexTokens,
      uint256 totalSupply
    )
  {
    require(_portfolio != address(0), "Invalid portfolio address");

    IPortfolio portfolio = IPortfolio(_portfolio);

    (tokenAmountArray, tokenDecimalArray) = getTokenBalancesAndDecimals(
      _portfolio
    );
    indexTokens = portfolio.getTokens();
    totalSupply = portfolio.totalSupply();
  }

  function getPortfolioDataByte(
    address _portfolio
  ) external view returns (bytes memory) {
    require(_portfolio != address(0), "Invalid portfolio address");

    (
      uint256[] memory tokenAmountArray,
      uint8[] memory tokenDecimalArray,
      address[] memory indexTokens,
      uint256 totalSupply
    ) = getPortfolioData(_portfolio);

    return
      abi.encode(tokenAmountArray, tokenDecimalArray, indexTokens, totalSupply);
  }

  function getExpectedMintAmount(
    address _portfolio,
    uint256 _userShare
  ) external view returns (uint256) {
    require(_portfolio != address(0), "Invalid portfolio address");
    require(_userShare > 0 && _userShare < 10_000, "Invalid user share");

    IPortfolio portfolio = IPortfolio(_portfolio);

    uint256 totalSupply = portfolio.totalSupply();
    IFeeModule _feeModule = IFeeModule(portfolio.feeModule());
    uint256 expectedMintAmount = (_userShare * totalSupply) / (1 - _userShare);

    uint256 entryFee = _feeModule.entryFee();
    if (entryFee > 0) {
      expectedMintAmount = (expectedMintAmount * (1e4 - entryFee)) / 1e4;
    }

    return expectedMintAmount;
  }

  /**
   * @dev This function takes value of portfolio token amounts from user as input and returns the lowest amount possible to deposit to get the exact ratio of token amounts
   * @notice This function is helper function for user to get the correct amount/ratio of tokens to deposit
   * @param userAmounts array of amounts of portfolio tokens
   */
  function getUserAmountToDeposit(
    uint256[] memory userAmounts,
    address _portfolio
  ) external view returns (uint256[] memory, uint256 _desiredShare) {
    IPortfolio portfolio = IPortfolio(_portfolio);
    IProtocolConfig _protocolConfig = IProtocolConfig(
      portfolio.protocolConfig()
    );
    (uint256[] memory vaultBalance, ) = TokenBalanceLibrary.getTokenBalancesOf(
      portfolio.getTokens(),
      portfolio.vault(),
      _protocolConfig
    );
    uint256 vaultTokenLength = vaultBalance.length;

    // Validate that none of the vault balances are zero
    for (uint256 i = 0; i < vaultTokenLength; i++) {
      if (vaultBalance[i] == 0) revert ErrorLibrary.BalanceOfVaultIsZero();
    }

    // Validate that the lengths of the input arrays match
    if (userAmounts.length != vaultTokenLength)
      revert ErrorLibrary.InvalidLength();

    uint256[] memory newAmounts = new uint256[](vaultTokenLength);
    uint256 leastPercentage = (userAmounts[0] * ONE_ETH_IN_WEI) /
      vaultBalance[0];
    _desiredShare =
      (userAmounts[0] * ONE_ETH_IN_WEI) /
      (vaultBalance[0] + userAmounts[0]);
    for (uint256 i = 1; i < vaultTokenLength; i++) {
      uint256 tempPercentage = (userAmounts[i] * ONE_ETH_IN_WEI) /
        vaultBalance[i];
      if (leastPercentage > tempPercentage) {
        leastPercentage = tempPercentage;
        _desiredShare =
          (userAmounts[i] * ONE_ETH_IN_WEI) /
          (vaultBalance[i] + userAmounts[i]);
      }
    }
    for (uint256 i; i < vaultTokenLength; i++) {
      newAmounts[i] = (vaultBalance[i] * leastPercentage) / ONE_ETH_IN_WEI;
    }
    return (newAmounts, _desiredShare);
  }

  /**
   * @dev This function takes portfolioAmount and returns the expected amounts of portfolio token, considering management fee and exit fee
   * @notice This function is helper function for user to get the expected amount of portfolio tokens
   * @param _portfolioTokenAmount amount of vault token
   */
  function getWithdrawalAmounts(
    uint256 _portfolioTokenAmount,
    address _portfolio
  ) external view returns (uint256[] memory) {
    IPortfolio portfolio = IPortfolio(_portfolio);

    address[] memory tokens = portfolio.getTokens();
    uint256 tokensLength = tokens.length;

    uint256[] memory withdrawalAmount = new uint256[](tokensLength);

    IFeeModule _feeModule = IFeeModule(portfolio.feeModule());

    IAssetManagementConfig _assetManagementConfig = IAssetManagementConfig(
      portfolio.assetManagementConfig()
    );

    IProtocolConfig _protocolConfig = IProtocolConfig(
      portfolio.protocolConfig()
    );

    uint256 _userPortfolioTokenAmount = _portfolioTokenAmount;
    uint256 totalSupplyPortfolio = portfolio.totalSupply();

    (uint256 assetManagerFeeToMint, uint256 protocolFeeToMint) = _getFeeAmount(
      _assetManagementConfig,
      _protocolConfig,
      _feeModule,
      totalSupplyPortfolio
    );

    totalSupplyPortfolio = _modifyTotalSupply(
      assetManagerFeeToMint,
      protocolFeeToMint,
      totalSupplyPortfolio
    );

    uint256 afterFeeAmount = _userPortfolioTokenAmount;
    if (_assetManagementConfig.exitFee() > 0) {
      uint256 entryOrExitFee = _calculateEntryOrExitFee(
        _assetManagementConfig.exitFee(),
        _userPortfolioTokenAmount
      );
      (uint256 protocolFee, uint256 assetManagerFee) = _splitFee(
        entryOrExitFee,
        _protocolConfig.protocolFee()
      );
      if (protocolFee > MIN_MINT_FEE) {
        afterFeeAmount -= protocolFee;
      }
      if (assetManagerFee > MIN_MINT_FEE) {
        afterFeeAmount -= assetManagerFee;
      }
    }

    address[] memory _tokens = portfolio.getTokens();
    address _vault = portfolio.vault();

    // Get controllers data for the vault
    TokenBalanceLibrary.ControllerData[]
      memory controllersData = TokenBalanceLibrary.getControllersData(
        _vault,
        _tokens,
        _protocolConfig
      );

    for (uint256 i = 0; i < tokensLength; i++) {
      address _token = tokens[i];
      // Calculate the proportion of each token to return based on the burned portfolio tokens.
      uint256 tokenBalance = TokenBalanceLibrary._getAdjustedTokenBalance(
        _token,
        _vault,
        _protocolConfig,
        controllersData
      );
      tokenBalance = (tokenBalance * afterFeeAmount) / totalSupplyPortfolio;

      if (tokenBalance == 0) revert();

      withdrawalAmount[i] = tokenBalance;
      // Transfer each token's proportional amount from the vault to the user.
    }
    return withdrawalAmount;
  }

  function _calculateEntryOrExitFee(
    uint256 _feePercentage,
    uint256 _tokenAmount
  ) internal pure returns (uint256) {
    return (_tokenAmount * _feePercentage) / 10_000;
  }

  function _splitFee(
    uint256 _feeAmount,
    uint256 _protocolFeePercentage
  ) internal pure returns (uint256 protocolFeeAmount, uint256 assetManagerFee) {
    if (_feeAmount == 0) {
      return (0, 0);
    }
    protocolFeeAmount = (_feeAmount * _protocolFeePercentage) / 10_000;
    assetManagerFee = _feeAmount - protocolFeeAmount;
  }

  function _calculateProtocolAndManagementFeesToMint(
    uint256 _managementFeePercentage,
    uint256 _protocolFeePercentage,
    uint256 _protocolStreamingFeePercentage,
    uint256 _totalSupply,
    uint256 _lastChargedManagementFee,
    uint256 _lastChargedProtocolFee,
    uint256 _currentTime
  )
    internal
    pure
    returns (uint256 managementFeeToMint, uint256 protocolFeeToMint)
  {
    // Calculate the mint amount for asset management streaming fees
    uint256 managementStreamingFeeToMint = _calculateMintAmountForStreamingFees(
      _totalSupply,
      _lastChargedManagementFee,
      _managementFeePercentage,
      _currentTime
    );

    // Calculate the mint amount for protocol streaming fees
    uint256 protocolStreamingFeeToMint = _calculateMintAmountForStreamingFees(
      _totalSupply,
      _lastChargedProtocolFee,
      _protocolStreamingFeePercentage,
      _currentTime
    );

    // Calculate the protocol's cut from the management streaming fee
    uint256 protocolCut;
    (protocolCut, managementFeeToMint) = _splitFee(
      managementStreamingFeeToMint,
      _protocolFeePercentage
    );

    // The total protocol fee to mint is the sum of the protocol's cut from the management fee plus the protocol streaming fee
    protocolFeeToMint = protocolCut + protocolStreamingFeeToMint;

    return (managementFeeToMint, protocolFeeToMint);
  }

  function _calculateMintAmountForStreamingFees(
    uint256 _totalSupply,
    uint256 _lastChargedTime,
    uint256 _feePercentage,
    uint256 _currentTime
  ) internal pure returns (uint256 tokensToMint) {
    if (_lastChargedTime >= _currentTime) {
      return 0;
    }

    uint256 streamingFees = _calculateStreamingFee(
      _totalSupply,
      _lastChargedTime,
      _feePercentage,
      _currentTime
    );

    // Calculates the share of the asset manager after minting
    uint256 feeReceiverShare = (streamingFees * ONE_ETH_IN_WEI) / _totalSupply;

    tokensToMint = _calculateMintAmount(feeReceiverShare, _totalSupply);
  }

  function _calculateStreamingFee(
    uint256 _totalSupply,
    uint256 _lastChargedTime,
    uint256 _feePercentage,
    uint256 _currentTime
  ) internal pure returns (uint256 streamingFee) {
    uint256 timeElapsed = _currentTime - _lastChargedTime;
    streamingFee =
      (_totalSupply * _feePercentage * timeElapsed) /
      365 days /
      10_000;
  }

  function _calculateMintAmount(
    uint256 _userShare,
    uint256 _totalSupply
  ) internal pure returns (uint256) {
    return (_userShare * _totalSupply) / ((10 ** 18) - _userShare);
  }

  function _modifyTotalSupply(
    uint256 _assetManagerFeeToMint,
    uint256 _protocolFeeToMint,
    uint256 totalSupply
  ) internal pure returns (uint256) {
    if (_assetManagerFeeToMint > MIN_MINT_FEE) {
      totalSupply += _assetManagerFeeToMint;
    }
    if (_protocolFeeToMint > MIN_MINT_FEE) {
      totalSupply += _protocolFeeToMint;
    }
    return totalSupply;
  }

  //Get Protocol And Management Fee
  function getProtocolAndManagementFee(
    address _portfolio
  )
    public
    view
    returns (uint256 assetManagerFeeToMint, uint256 protocolFeeToMint)
  {
    IPortfolio portfolio = IPortfolio(_portfolio);
    IFeeModule _feeModule = IFeeModule(portfolio.feeModule());

    IAssetManagementConfig _assetManagementConfig = IAssetManagementConfig(
      portfolio.assetManagementConfig()
    );

    IProtocolConfig _protocolConfig = IProtocolConfig(
      portfolio.protocolConfig()
    );

    uint256 totalSupplyPortfolio = portfolio.totalSupply();

    (assetManagerFeeToMint, protocolFeeToMint) = _getFeeAmount(
      _assetManagementConfig,
      _protocolConfig,
      _feeModule,
      totalSupplyPortfolio
    );

    if (assetManagerFeeToMint < MIN_MINT_FEE) {
      assetManagerFeeToMint = 0;
    }
    if (protocolFeeToMint < MIN_MINT_FEE) {
      protocolFeeToMint = 0;
    }
  }

  //Get Performance Fee
  function getPerformanceFee(
    address _portfolio
  ) public view returns (uint256 protocolFee, uint256 assetManagerFee) {
    IPortfolio portfolio = IPortfolio(_portfolio);

    IProtocolConfig _protocolConfig = IProtocolConfig(
      portfolio.protocolConfig()
    );

    uint256 totalSupply = portfolio.totalSupply();

    IFeeModule _feeModule = IFeeModule(portfolio.feeModule());

    IAssetManagementConfig _assetManagementConfig = IAssetManagementConfig(
      portfolio.assetManagementConfig()
    );

    uint256 vaultBalance = portfolio.getVaultValueInUSD(
      IPriceOracle(_protocolConfig.oracle()),
      portfolio.getTokens(),
      totalSupply,
      portfolio.vault()
    );
    uint256 currentPrice = _getCurrentPrice(vaultBalance, totalSupply);

    uint256 performanceFee = _calculatePerformanceFeeToMint(
      currentPrice,
      _feeModule.highWatermark(),
      totalSupply,
      vaultBalance,
      _assetManagementConfig.performanceFee()
    );

    (protocolFee, assetManagerFee) = _splitFee(
      performanceFee,
      _protocolConfig.protocolFee()
    );

    if (protocolFee < MIN_MINT_FEE) {
      protocolFee = 0;
    }
    if (assetManagerFee < MIN_MINT_FEE) {
      assetManagerFee = 0;
    }
  }

  function _getCurrentPrice(
    uint256 _vaultBalance,
    uint256 _totalSupply
  ) internal pure returns (uint256 currentPrice) {
    currentPrice = _totalSupply == 0
      ? 0
      : (_vaultBalance * ONE_ETH_IN_WEI) / _totalSupply;
  }

  function _calculatePerformanceFeeToMint(
    uint256 _currentPrice,
    uint256 _highWaterMark,
    uint256 _totalSupply,
    uint256 _vaultBalance,
    uint256 _feePercentage
  ) internal pure returns (uint256 tokensToMint) {
    if (_currentPrice <= _highWaterMark) {
      return 0; // No fee if current price is below or equal to high watermark
    }

    uint256 performanceIncrease = _currentPrice - _highWaterMark;
    uint256 performanceFee = (performanceIncrease *
      _totalSupply *
      _feePercentage) / ONE_ETH_IN_WEI / TOTAL_WEIGHT;

    tokensToMint =
      (performanceFee * _totalSupply) /
      (_vaultBalance - performanceFee);
  }

  function _getFeeAmount(
    IAssetManagementConfig _assetManagementConfig,
    IProtocolConfig _protocolConfig,
    IFeeModule _feeModule,
    uint256 totalSupplyPortfolio
  )
    internal
    view
    returns (uint256 assetManagerFeeToMint, uint256 protocolFeeToMint)
  {
    uint256 _managementFee = _assetManagementConfig.managementFee();
    uint256 _protocolFee = _protocolConfig.protocolFee();
    uint256 _protocolStreamingFee = _protocolConfig.protocolStreamingFee();

    (
      assetManagerFeeToMint,
      protocolFeeToMint
    ) = _calculateProtocolAndManagementFeesToMint(
      _managementFee,
      _protocolFee,
      _protocolStreamingFee,
      totalSupplyPortfolio,
      _feeModule.lastChargedManagementFee(),
      _feeModule.lastChargedProtocolFee(),
      block.timestamp
    );
  }

  function calculateFlashLoanAmountForRepayment(
    address _borrowProtocolToken,
    address _flashLoanProtocolToken,
    address _comptroller,
    uint256 _borrowToRepay,
    uint256 _bufferUnit //Buffer unit is the buffer percentage in terms of 1/10000
  ) external view returns (uint256 flashLoanAmount) {
    // Get the oracle price for the borrowed token
    uint256 oraclePrice = IVenusComptroller(_comptroller)
      .oracle()
      .getUnderlyingPrice(_borrowProtocolToken);

    // Calculate the total price of the borrowed amount
    uint256 borrowTokenPrice = oraclePrice * _borrowToRepay;

    // Get the oracle price for the flash loan token
    uint256 flashLoanTokenPrice = IVenusComptroller(_comptroller)
      .oracle()
      .getUnderlyingPrice(_flashLoanProtocolToken);

    // Calculate the flash loan amount needed
    flashLoanAmount =
      (borrowTokenPrice * 10 ** 18) /
      flashLoanTokenPrice /
      10 ** 18;

    // Add a 0.01% buffer to the flash loan amount
    flashLoanAmount =
      flashLoanAmount +
      ((flashLoanAmount * _bufferUnit) / 10_000);
  }

  function calculateAaveFlashLoanAmountForRepayment(
    address _borrowToken,
    uint256 _borrowToRepay,
    uint256 _bufferUnit
  ) external view returns (uint256 flashLoanAmount) {
    // Get the oracle price for the borrowed token
    uint256 _oraclePrice = IAavePriceOracle(
      0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7
    ).getAssetPrice(_borrowToken);

    // Calculate the total price of the borrowed amount
    uint256 borrowTokenPrice = _oraclePrice * _borrowToRepay;

    // Get the oracle price for the flash loan token
    uint256 _flashLoanTokenPrice = IAavePriceOracle(
      0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7
    ).getAssetPrice(_borrowToken);

    // Calculate the flash loan amount needed
    flashLoanAmount =
      (borrowTokenPrice * 10 ** 18) /
      _flashLoanTokenPrice /
      10 ** 18;

    // Add a 0.01% buffer to the flash loan amount
    flashLoanAmount =
      flashLoanAmount +
      ((flashLoanAmount * _bufferUnit) / 10_000);
  }

  function getUserTokenClaimBalance(
    address _portfolio,
    address user,
    uint256 startId,
    uint256 endId
  ) external view returns (uint256[] memory) {
    IPortfolio portfolio = IPortfolio(_portfolio);
    ITokenExclusionManager tokenExclusionManager = ITokenExclusionManager(
      portfolio.tokenExclusionManager()
    );

    uint256 _currentId = tokenExclusionManager._currentSnapshotId();

    // If there are less than two snapshots, no tokens have been removed
    if (_currentId < 2) revert ErrorLibrary.NoTokensRemoved();

    if (startId > endId || endId >= _currentId) revert ErrorLibrary.InvalidId();

    //Adding 1 to endId, to run loop till endId
    uint256 _lastId = endId + 1;

    uint256[] memory claimBalances = new uint256[](_lastId - startId);
    uint256 i = 0;

    for (uint256 id = startId; id < _lastId; id++) {
      (bool isValid, uint256 balance) = tokenExclusionManager.getDataAtId(
        user,
        id
      );
      if (isValid && balance > 0) {
        (
          address token,
          address vault,
          uint256 _totalSupply
        ) = tokenExclusionManager.removedToken(id);
        // Calculate the user's share of the removed token
        uint256 currentVaultBalance = IERC20Upgradeable(token).balanceOf(vault);
        uint256 _balance = (currentVaultBalance * balance) / _totalSupply;
        claimBalances[i] = _balance;
      } else {
        claimBalances[i] = 0;
      }
      i++;
    }
    return claimBalances;
  }

  function getVenusTokenBorrowedBalance(
    address[] memory pools,
    address vault
  ) external view returns (uint256[] memory balances) {
    uint256 poolLength = pools.length;
    balances = new uint256[](poolLength);
    for (uint256 i; i < poolLength; i++) {
      balances[i] = IVenusPool(pools[i]).borrowBalanceStored(vault);
    }
  }

  function getPoolFee(address _pool) external view returns (uint256) {
    return IThena(_pool).globalState().fee;
  }

  function getCollateralAmountToSell(
    address _user,
    address _controller,
    address _venusAssetHandler,
    address _protocolToken,
    address[] memory _portfolioTokens,
    uint256 _debtRepayAmount,
    uint256 feeUnit, //Flash loan fee unit
    uint256 bufferUnit //Buffer unit is the buffer percentage in terms of 1/100000
  ) external view returns (uint256[] memory amounts) {
    // Use the new struct-based return for getUserAccountData
    (
      FunctionParameters.AccountData memory accountData,
      FunctionParameters.TokenAddresses memory tokenAddresses
    ) = IAssetHandler(_venusAssetHandler).getUserAccountData(
        _user,
        _controller,
        _portfolioTokens
      );

    amounts = new uint256[](tokenAddresses.lendTokens.length);

    uint256 borrowBalance = IVenusPool(_protocolToken).borrowBalanceStored(
      _user
    );

    uint256 oraclePriceMantissa = IVenusComptroller(_controller)
      .oracle()
      .getUnderlyingPrice(_protocolToken);

    Exp memory oraclePrice = Exp({mantissa: oraclePriceMantissa});
    // sumBorrowPlusEffects += oraclePrice * borrowBalance
    uint256 sumBorrowPlusEffects;
    sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(
      oraclePrice,
      borrowBalance,
      sumBorrowPlusEffects
    );

    address _account = _user;
    sumBorrowPlusEffects = handleVAIController(
      _controller,
      _account,
      sumBorrowPlusEffects
    );

    (, uint256 percentageToRemove) = calculateDebtAndPercentage(
      _debtRepayAmount,
      feeUnit,
      sumBorrowPlusEffects / 10 ** 10,
      borrowBalance,
      accountData.totalCollateral
    );

    for (uint256 i; i < tokenAddresses.lendTokens.length; i++) {
      uint256 balance = IERC20Upgradeable(tokenAddresses.lendTokens[i])
        .balanceOf(_account);
      uint256 amountToSell = (balance * percentageToRemove);
      amountToSell = amountToSell + ((amountToSell * bufferUnit) / 100000); // Buffer of 0.001%
      amounts[i] = amountToSell / 10 ** 18; // Calculate the amount to sell
    }
  }

  function calculateDebtAndPercentage(
    uint256 _debtRepayAmount,
    uint256 feeUnit,
    uint256 totalDebt,
    uint256 borrowBalance,
    uint256 totalCollateral
  ) internal pure returns (uint256 debtValue, uint256 percentageToRemove) {
    uint256 feeAmount = (_debtRepayAmount * 10 ** 18 * feeUnit) / 10 ** 22;
    uint256 debtAmountWithFee = _debtRepayAmount + feeAmount;
    debtValue = (debtAmountWithFee * totalDebt * 10 ** 18) / borrowBalance;
    percentageToRemove = debtValue / totalCollateral;
  }

  function getAaveCollateralAmountToSell(
    address _user,
    address _controller,
    address _aaveAssetHandler,
    address _protocolToken,
    address[] memory _portfolioTokens,
    uint256 _debtRepayAmount,
    uint256 feeUnit, //Flash loan fee unit
    uint256 bufferUnit
  ) public view returns (uint256[] memory amounts) {
    (
      FunctionParameters.AccountData memory accountData,
      FunctionParameters.TokenAddresses memory tokenAddresses
    ) = IAssetHandler(_aaveAssetHandler).getUserAccountData(
        _user,
        _controller,
        _portfolioTokens
      );

    amounts = new uint256[](tokenAddresses.lendTokens.length);

    //Get borrow balance for _protocolToken
    address _underlyingToken = IAaveToken(_protocolToken)
      .UNDERLYING_ASSET_ADDRESS();
    (, , uint currentVariableDebt, , , , , , ) = IPoolDataProvider(
      0x7F23D86Ee20D869112572136221e173428DD740B
    ).getUserReserveData(_underlyingToken, _user);

    //Convert underlyingToken to 18 decimal
    uint borrowBalance = currentVariableDebt *
      10 ** (18 - IERC20MetadataUpgradeable(_underlyingToken).decimals());


    address _account = _user;
    //Get price for _protocolToken token
    uint _oraclePrice = IAavePriceOracle(
      0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7
    ).getAssetPrice(_underlyingToken);
    //Get price for borrow Balance (amount * price)

    uint _tokenPrice = (borrowBalance * _oraclePrice) / 10 ** 18;

    //calculateDebtAndPercentage
    (, uint256 percentageToRemove) = calculateDebtAndPercentage(
      _debtRepayAmount,
      feeUnit,
      _tokenPrice,
      borrowBalance,
      accountData.totalCollateral
    );

    // Calculate the amounts to sell for each lending token
    for (uint256 i; i < tokenAddresses.lendTokens.length; i++) {
      uint256 balance = IERC20Upgradeable(tokenAddresses.lendTokens[i])
        .balanceOf(_account);
      uint256 amountToSell = (balance * percentageToRemove);
      amountToSell = amountToSell + ((amountToSell * bufferUnit) / 100000); // Buffer of 0.001%
      amounts[i] = amountToSell / 10 ** 18; // Calculate the amount to sell
    }
  }

  function calculateAaveBorrowedPortionAndFlashLoanDetails(
    address _portfolio,
    address _protocolToken,
    address _vault,
    address _comptroller,
    address _aaveAssetHandler,
    uint256 _portfolioTokenAmount,
    uint256 _flashLoanBufferUnit
  )
    external
    view
    returns (
      uint256[] memory borrowedPortion,
      uint256[] memory flashLoanAmount,
      address[] memory underlyingTokens,
      address[] memory borrowedTokens
    )
  {
    return
      _calculateAaveDetails(
        _portfolio,
        _protocolToken,
        _vault,
        _comptroller,
        _aaveAssetHandler,
        _portfolioTokenAmount,
        _flashLoanBufferUnit
      );
  }

  function _calculateAaveDetails(
    address _portfolio,
    address _protocolToken,
    address _vault,
    address _comptroller,
    address _aaveAssetHandler,
    uint256 _portfolioTokenAmount,
    uint256 _flashLoanBufferUnit
  )
    internal
    view
    returns (
      uint256[] memory borrowedPortion,
      uint256[] memory flashLoanAmount,
      address[] memory underlyingTokens,
      address[] memory borrowedTokens
    )
  {
    (
      uint256 afterFeeAmount,
      uint256 totalSupplyPortfolio
    ) = getAfterFeeAmountAndSupply(_portfolio, _portfolioTokenAmount);
    borrowedTokens = IAssetHandler(_aaveAssetHandler).getBorrowedTokens(
      _vault,
      _comptroller
    );

    address _underlyingToken = IAaveToken(_protocolToken)
      .UNDERLYING_ASSET_ADDRESS();

    address protocolToken = _protocolToken;
    address vaultAddress = _vault;
    address comptrollerAddress = _comptroller;
    uint256 tokenCount = borrowedTokens.length;
    borrowedPortion = new uint256[](tokenCount);
    flashLoanAmount = new uint256[](tokenCount);
    underlyingTokens = new address[](tokenCount);

    CalculationParams memory params = CalculationParams({
      protocolToken: protocolToken,
      vault: vaultAddress,
      comptroller: comptrollerAddress,
      afterFeeAmount: afterFeeAmount,
      totalSupplyPortfolio: totalSupplyPortfolio,
      flashLoanTokenPrice: IAavePriceOracle(
        0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7
      ).getAssetPrice(_underlyingToken),
      flashLoanBufferUnit: _flashLoanBufferUnit
    });

    for (uint i = 0; i < tokenCount; i++) {
      (
        borrowedPortion[i],
        flashLoanAmount[i],
        underlyingTokens[i]
      ) = calculateTokenDetails(borrowedTokens[i], params);
    }
  }

  function calculateAaveTokenDetails(
    address borrowedToken,
    CalculationParams memory params
  )
    internal
    view
    returns (
      uint256 borrowedPortion,
      uint256 flashLoanAmount,
      address underlyingToken
    )
  {
    underlyingToken = IAaveToken(borrowedToken).UNDERLYING_ASSET_ADDRESS();
    uint256 oraclePrice = IAavePriceOracle(
      0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7
    ).getAssetPrice(underlyingToken);
    (, , uint256 borrowBalance, , , , , , ) = IPoolDataProvider(
      0x7F23D86Ee20D869112572136221e173428DD740B
    ).getUserReserveData(underlyingToken, params.vault);
    borrowedPortion =
      (borrowBalance * params.afterFeeAmount) /
      params.totalSupplyPortfolio;

    uint256 totalPrice = (borrowBalance * params.afterFeeAmount * oraclePrice) /
      params.totalSupplyPortfolio;
    uint256 _amount = (totalPrice * 10 ** 18) /
      params.flashLoanTokenPrice /
      10 ** 18;

    if (borrowedToken != params.protocolToken) {
      flashLoanAmount =
        _amount +
        ((_amount * params.flashLoanBufferUnit) / 10_000); //Building a buffer of 0.01%
    } else {
      flashLoanAmount = _amount;
    }
  }

  function calculateBorrowedPortionAndFlashLoanDetails(
    address _portfolio,
    address _protocolToken,
    address _vault,
    address _comptroller,
    address _venusAssetHandler,
    uint256 _portfolioTokenAmount,
    uint256 _flashLoanBufferUnit
  )
    external
    view
    returns (
      uint256[] memory borrowedPortion,
      uint256[] memory flashLoanAmount,
      address[] memory underlyingTokens,
      address[] memory borrowedTokens
    )
  {
    return
      _calculateDetails(
        _portfolio,
        _protocolToken,
        _vault,
        _comptroller,
        _venusAssetHandler,
        _portfolioTokenAmount,
        _flashLoanBufferUnit
      );
  }

  function _calculateDetails(
    address _portfolio,
    address _protocolToken,
    address _vault,
    address _comptroller,
    address _venusAssetHandler,
    uint256 _portfolioTokenAmount,
    uint256 _flashLoanBufferUnit
  )
    internal
    view
    returns (
      uint256[] memory borrowedPortion,
      uint256[] memory flashLoanAmount,
      address[] memory underlyingTokens,
      address[] memory borrowedTokens
    )
  {
    (
      uint256 afterFeeAmount,
      uint256 totalSupplyPortfolio
    ) = getAfterFeeAmountAndSupply(_portfolio, _portfolioTokenAmount);
    borrowedTokens = IAssetHandler(_venusAssetHandler).getBorrowedTokens(
      _vault,
      _comptroller
    );
    address protocolToken = _protocolToken;
    uint256 tokenCount = borrowedTokens.length;
    borrowedPortion = new uint256[](tokenCount);
    flashLoanAmount = new uint256[](tokenCount);
    underlyingTokens = new address[](tokenCount);

    CalculationParams memory params = CalculationParams({
      protocolToken: protocolToken,
      vault: _vault,
      comptroller: _comptroller,
      afterFeeAmount: afterFeeAmount,
      totalSupplyPortfolio: totalSupplyPortfolio,
      flashLoanTokenPrice: IVenusComptroller(_comptroller)
        .oracle()
        .getUnderlyingPrice(protocolToken),
      flashLoanBufferUnit: _flashLoanBufferUnit
    });

    for (uint i = 0; i < tokenCount; i++) {
      (
        borrowedPortion[i],
        flashLoanAmount[i],
        underlyingTokens[i]
      ) = calculateTokenDetails(borrowedTokens[i], params);
    }
  }

  function calculateTokenDetails(
    address borrowedToken,
    CalculationParams memory params
  )
    internal
    view
    returns (
      uint256 borrowedPortion,
      uint256 flashLoanAmount,
      address underlyingToken
    )
  {
    underlyingToken = IVenusPool(borrowedToken).underlying();
    uint256 oraclePrice = IVenusComptroller(params.comptroller)
      .oracle()
      .getUnderlyingPrice(borrowedToken);
    uint256 borrowBalance = IVenusPool(borrowedToken).borrowBalanceStored(
      params.vault
    );

    borrowedPortion =
      (borrowBalance * params.afterFeeAmount) /
      params.totalSupplyPortfolio;

    uint256 totalPrice = (borrowBalance * params.afterFeeAmount * oraclePrice) /
      params.totalSupplyPortfolio;
    uint256 _amount = (totalPrice * 10 ** 18) /
      params.flashLoanTokenPrice /
      10 ** 18;

    if (borrowedToken != params.protocolToken) {
      flashLoanAmount =
        _amount +
        ((_amount * params.flashLoanBufferUnit) / 10_000); //Building a buffer of 0.01%
    } else {
      flashLoanAmount = _amount;
    }
  }

  function getAfterFeeAmountAndSupply(
    address _portfolio,
    uint256 _portfolioTokenAmount
  ) internal view returns (uint256, uint256) {
    IPortfolio portfolio = IPortfolio(_portfolio);

    IFeeModule _feeModule = IFeeModule(portfolio.feeModule());

    IAssetManagementConfig _assetManagementConfig = IAssetManagementConfig(
      portfolio.assetManagementConfig()
    );

    IProtocolConfig _protocolConfig = IProtocolConfig(
      portfolio.protocolConfig()
    );

    uint256 _userPortfolioTokenAmount = _portfolioTokenAmount;
    uint256 totalSupplyPortfolio = portfolio.totalSupply();

    (uint256 assetManagerFeeToMint, uint256 protocolFeeToMint) = _getFeeAmount(
      _assetManagementConfig,
      _protocolConfig,
      _feeModule,
      totalSupplyPortfolio
    );

    totalSupplyPortfolio = _modifyTotalSupply(
      assetManagerFeeToMint,
      protocolFeeToMint,
      totalSupplyPortfolio
    );

    uint256 afterFeeAmount = _userPortfolioTokenAmount;
    if (_assetManagementConfig.exitFee() > 0) {
      uint256 entryOrExitFee = _calculateEntryOrExitFee(
        _assetManagementConfig.exitFee(),
        _userPortfolioTokenAmount
      );
      (uint256 protocolFee, uint256 assetManagerFee) = _splitFee(
        entryOrExitFee,
        _protocolConfig.protocolFee()
      );
      if (protocolFee > MIN_MINT_FEE) {
        afterFeeAmount -= protocolFee;
      }
      if (assetManagerFee > MIN_MINT_FEE) {
        afterFeeAmount -= assetManagerFee;
      }
    }

    return (afterFeeAmount, totalSupplyPortfolio);
  }

  function handleVAIController(
    address comptroller,
    address account,
    uint sumBorrowPlusEffects
  ) internal view returns (uint) {
    IVAIController vaiController = IVenusComptroller(comptroller)
      .vaiController();
    if (address(vaiController) != address(0)) {
      sumBorrowPlusEffects = add_(
        sumBorrowPlusEffects,
        vaiController.getVAIRepayAmount(account)
      );
    }
    return sumBorrowPlusEffects;
  }
}
