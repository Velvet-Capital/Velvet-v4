import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import "@nomicfoundation/hardhat-chai-matchers";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import {
  PERMIT2_ADDRESS,
  AllowanceTransfer,
  MaxAllowanceTransferAmount,
  PermitBatch,
} from "@uniswap/permit2-sdk";

import {
  calcuateExpectedMintAmount,
  createEnsoDataElement,
} from "../calculations/DepositCalculations.test";

import {
  createEnsoCallData,
  createEnsoCallDataRoute,
} from "./IntentCalculations";

import { IAddresses, priceOracle } from "./Deployments.test";

import {
  Portfolio,
  Portfolio__factory,
  ProtocolConfig,
  Rebalancing__factory,
  PortfolioFactory,
  EnsoHandler,
  VelvetSafeModule,
  FeeModule,
  UniswapV2Handler,
  DepositBatch,
  DepositManager,
  TokenBalanceLibrary,
  BorrowManagerAave,
  TokenExclusionManager,
  TokenExclusionManager__factory,
  WithdrawBatch,
  WithdrawManager,
  AaveAssetHandler,
  IAavePool,
  IPoolDataProvider,
} from "../../typechain";

import { chainIdToAddresses } from "../../scripts/networkVariables";
import { AbiCoder } from "ethers/lib/utils";

var chai = require("chai");
const axios = require("axios");
const qs = require("qs");
//use default BigNumber
chai.use(require("chai-bignumber")());

describe.only("Tests for Deposit + Withdrawal", () => {
  let accounts;
  let iaddress: IAddresses;
  let vaultAddress: string;
  let velvetSafeModule: VelvetSafeModule;
  let portfolio: any;
  let portfolio1: any;
  let portfolioCalculations: any;
  let tokenExclusionManager: any;
  let tokenExclusionManager1: any;
  let ensoHandler: EnsoHandler;
  let depositBatch: DepositBatch;
  let depositManager: DepositManager;
  let withdrawBatch: WithdrawBatch;
  let withdrawManager: WithdrawManager;
  let borrowManager: BorrowManagerAave;
  let tokenBalanceLibrary: TokenBalanceLibrary;
  let portfolioContract: Portfolio;
  let portfolioFactory: PortfolioFactory;
  let swapHandler: UniswapV2Handler;
  let rebalancing: any;
  let rebalancing1: any;
  let protocolConfig: ProtocolConfig;
  let fakePortfolio: Portfolio;
  let txObject;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let assetManagerTreasury: SignerWithAddress;
  let nonOwner: SignerWithAddress;
  let aaveAssetHandler: AaveAssetHandler;
  let depositor1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addrs: SignerWithAddress[];
  let feeModule0: FeeModule;
  let zeroAddress: any;
  let approve_amount = ethers.constants.MaxUint256; //(2^256 - 1 )
  let token;

  const provider = ethers.provider;
  const chainId: any = process.env.CHAIN_ID;
  const addresses = chainIdToAddresses[chainId];

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  describe.only("Tests for Deposit + Withdrawal", () => {
    before(async () => {
      accounts = await ethers.getSigners();
      [
        owner,
        depositor1,
        nonOwner,
        treasury,
        assetManagerTreasury,
        addr1,
        addr2,
        ...addrs
      ] = accounts;

      const provider = ethers.getDefaultProvider();

      const TokenBalanceLibrary = await ethers.getContractFactory(
        "TokenBalanceLibrary"
      );

      tokenBalanceLibrary = await TokenBalanceLibrary.deploy();
      await tokenBalanceLibrary.deployed();

      const EnsoHandler = await ethers.getContractFactory("EnsoHandler");
      ensoHandler = await EnsoHandler.deploy();
      await ensoHandler.deployed();

      const DepositBatch = await ethers.getContractFactory("DepositBatch");
      depositBatch = await DepositBatch.deploy();
      await depositBatch.deployed();

      const DepositManager = await ethers.getContractFactory("DepositManager");
      depositManager = await DepositManager.deploy(depositBatch.address);
      await depositManager.deployed();

      const WithdrawBatch = await ethers.getContractFactory("WithdrawBatch");
      withdrawBatch = await WithdrawBatch.deploy();
      await withdrawBatch.deployed();

      const WithdrawManager = await ethers.getContractFactory(
        "WithdrawManager"
      );
      withdrawManager = await WithdrawManager.deploy();
      await withdrawManager.deployed();

      const PositionWrapper = await ethers.getContractFactory(
        "PositionWrapper"
      );
      const positionWrapperBaseAddress = await PositionWrapper.deploy();
      await positionWrapperBaseAddress.deployed();

      const ProtocolConfig = await ethers.getContractFactory("ProtocolConfig");
      const _protocolConfig = await upgrades.deployProxy(
        ProtocolConfig,
        [
          treasury.address,
          priceOracle.address,
          positionWrapperBaseAddress.address,
        ],
        { kind: "uups" }
      );

      protocolConfig = ProtocolConfig.attach(_protocolConfig.address);
      await protocolConfig.setCoolDownPeriod("60");
      await protocolConfig.enableSolverHandler(ensoHandler.address);
      await protocolConfig.setSupportedFactory(addresses.aavePool);

      const Rebalancing = await ethers.getContractFactory("Rebalancing");
      const rebalancingDefult = await Rebalancing.deploy();
      await rebalancingDefult.deployed();

      const TokenExclusionManager = await ethers.getContractFactory(
        "TokenExclusionManager"
      );
      const tokenExclusionManagerDefault = await TokenExclusionManager.deploy();
      await tokenExclusionManagerDefault.deployed();

      const AssetManagementConfig = await ethers.getContractFactory(
        "AssetManagementConfig"
      );
      const assetManagementConfig = await AssetManagementConfig.deploy();
      await assetManagementConfig.deployed();

      const AaveAssetHandler = await ethers.getContractFactory(
        "AaveAssetHandler"
      );
      aaveAssetHandler = await AaveAssetHandler.deploy();
      await aaveAssetHandler.deployed();

      const BorrowManager = await ethers.getContractFactory(
        "BorrowManagerAave"
      );
      borrowManager = await BorrowManager.deploy();
      await borrowManager.deployed();

      await protocolConfig.setAssetHandlers(
        [
          addresses.aArbDAI,
          addresses.aArbUSDC,
          addresses.aArbLINK,
          addresses.aArbUSDT,
          addresses.aArbWBTC,
          addresses.aArbWETH,
          addresses.aavePool,
          addresses.aArbARB,
        ],
        [
          aaveAssetHandler.address,
          aaveAssetHandler.address,
          aaveAssetHandler.address,
          aaveAssetHandler.address,
          aaveAssetHandler.address,
          aaveAssetHandler.address,
          aaveAssetHandler.address,
          aaveAssetHandler.address,
        ]
      );

      await protocolConfig.setAssetAndMarketControllers(
        [
          addresses.aArbDAI,
          addresses.aArbUSDC,
          addresses.aArbLINK,
          addresses.aArbUSDT,
          addresses.aArbWBTC,
          addresses.aArbWETH,
          addresses.aArbARB,
          addresses.aavePool,
        ],
        [
          addresses.aavePool,
          addresses.aavePool,
          addresses.aavePool,
          addresses.aavePool,
          addresses.aavePool,
          addresses.aavePool,
          addresses.aavePool,
          addresses.aavePool,
        ]
      );

      await protocolConfig.setSupportedControllers([addresses.aavePool]);

      const Portfolio = await ethers.getContractFactory("Portfolio", {
        libraries: {
          TokenBalanceLibrary: tokenBalanceLibrary.address,
        },
      });
      portfolioContract = await Portfolio.deploy();
      await portfolioContract.deployed();
      const PancakeSwapHandler = await ethers.getContractFactory(
        "UniswapV2Handler"
      );
      swapHandler = await PancakeSwapHandler.deploy();
      await swapHandler.deployed();

      swapHandler.init(addresses.SushiSwapRouterAddress);

      let whitelistedTokens = [
        addresses.ARB,
        addresses.WBTC,
        addresses.WETH,
        addresses.DAI,
        addresses.ADoge,
        addresses.USDCe,
        addresses.USDT,
        addresses.aArbUSDC,
        addresses.aArbUSDT,
        addresses.MAIN_LP_USDT,
      ];

      let whitelist = [owner.address];

      zeroAddress = "0x0000000000000000000000000000000000000000";

      const SwapVerificationLibrary = await ethers.getContractFactory(
        "SwapVerificationLibraryUniswap"
      );
      const swapVerificationLibrary = await SwapVerificationLibrary.deploy();
      await swapVerificationLibrary.deployed();

      const PositionManager = await ethers.getContractFactory(
        "PositionManagerUniswap",
        {
          libraries: {
            SwapVerificationLibraryUniswap: swapVerificationLibrary.address,
          },
        }
      );
      const positionManagerBaseAddress = await PositionManager.deploy();
      await positionManagerBaseAddress.deployed();

      const FeeModule = await ethers.getContractFactory("FeeModule", {});
      const feeModule = await FeeModule.deploy();
      await feeModule.deployed();

      const TokenRemovalVault = await ethers.getContractFactory(
        "TokenRemovalVault"
      );
      const tokenRemovalVault = await TokenRemovalVault.deploy();
      await tokenRemovalVault.deployed();

      fakePortfolio = await Portfolio.deploy();
      await fakePortfolio.deployed();

      const VelvetSafeModule = await ethers.getContractFactory(
        "VelvetSafeModule"
      );
      velvetSafeModule = await VelvetSafeModule.deploy();
      await velvetSafeModule.deployed();

      const PortfolioFactory = await ethers.getContractFactory(
        "PortfolioFactory"
      );

      const portfolioFactoryInstance = await upgrades.deployProxy(
        PortfolioFactory,
        [
          {
            _basePortfolioAddress: portfolioContract.address,
            _baseTokenExclusionManagerAddress:
              tokenExclusionManagerDefault.address,
            _baseRebalancingAddres: rebalancingDefult.address,
            _baseAssetManagementConfigAddress: assetManagementConfig.address,
            _feeModuleImplementationAddress: feeModule.address,
            _baseTokenRemovalVaultImplementation: tokenRemovalVault.address,
            _baseVelvetGnosisSafeModuleAddress: velvetSafeModule.address,
            _baseBorrowManager: borrowManager.address,
            _basePositionManager: positionManagerBaseAddress.address,
            _gnosisSingleton: addresses.gnosisSingleton,
            _gnosisFallbackLibrary: addresses.gnosisFallbackLibrary,
            _gnosisMultisendLibrary: addresses.gnosisMultisendLibrary,
            _gnosisSafeProxyFactory: addresses.gnosisSafeProxyFactory,
            _protocolConfig: protocolConfig.address,
          },
        ],
        { kind: "uups" }
      );

      portfolioFactory = PortfolioFactory.attach(
        portfolioFactoryInstance.address
      );

      await withdrawManager.initialize(
        withdrawBatch.address,
        portfolioFactory.address
      );

      console.log("portfolioFactory address:", portfolioFactory.address);
      const portfolioFactoryCreate =
        await portfolioFactory.createPortfolioNonCustodial({
          _name: "PORTFOLIOLY",
          _symbol: "IDX",
          _managementFee: "20",
          _performanceFee: "2500",
          _entryFee: "0",
          _exitFee: "0",
          _initialPortfolioAmount: "100000000000000000000",
          _minPortfolioTokenHoldingAmount: "10000000000000000",
          _assetManagerTreasury: assetManagerTreasury.address,
          _whitelistedTokens: whitelistedTokens,
          _public: true,
          _transferable: true,
          _transferableToPublic: true,
          _whitelistTokens: false,
          _externalPositionManagementWhitelisted: true,
        });

      const portfolioFactoryCreate2 = await portfolioFactory
        .connect(nonOwner)
        .createPortfolioNonCustodial({
          _name: "PORTFOLIOLY",
          _symbol: "IDX",
          _managementFee: "200",
          _performanceFee: "2500",
          _entryFee: "0",
          _exitFee: "0",
          _initialPortfolioAmount: "100000000000000000000",
          _minPortfolioTokenHoldingAmount: "10000000000000000",
          _assetManagerTreasury: assetManagerTreasury.address,
          _whitelistedTokens: whitelistedTokens,
          _public: true,
          _transferable: false,
          _transferableToPublic: false,
          _whitelistTokens: false,
          _externalPositionManagementWhitelisted: true,
        });
      const portfolioAddress = await portfolioFactory.getPortfolioList(0);
      const portfolioInfo = await portfolioFactory.PortfolioInfolList(0);

      const portfolioAddress1 = await portfolioFactory.getPortfolioList(1);
      const portfolioInfo1 = await portfolioFactory.PortfolioInfolList(1);

      portfolio = await ethers.getContractAt(
        Portfolio__factory.abi,
        portfolioAddress
      );
      const PortfolioCalculations = await ethers.getContractFactory(
        "PortfolioCalculations",
        {
          libraries: {
            TokenBalanceLibrary: tokenBalanceLibrary.address,
          },
        }
      );
      feeModule0 = FeeModule.attach(await portfolio.feeModule());
      portfolioCalculations = await PortfolioCalculations.deploy();
      await portfolioCalculations.deployed();

      portfolio1 = await ethers.getContractAt(
        Portfolio__factory.abi,
        portfolioAddress1
      );

      rebalancing = await ethers.getContractAt(
        Rebalancing__factory.abi,
        portfolioInfo.rebalancing
      );

      rebalancing1 = await ethers.getContractAt(
        Rebalancing__factory.abi,
        portfolioInfo1.rebalancing
      );

      tokenExclusionManager = await ethers.getContractAt(
        TokenExclusionManager__factory.abi,
        portfolioInfo.tokenExclusionManager
      );

      tokenExclusionManager1 = await ethers.getContractAt(
        TokenExclusionManager__factory.abi,
        portfolioInfo1.tokenExclusionManager
      );

      console.log("portfolio deployed to:", portfolio.address);

      console.log("rebalancing:", rebalancing1.address);
    });

    describe("Deposit Tests", function () {
      it("should init tokens", async () => {
        await portfolio.initToken([
          addresses.WETH,
          addresses.WBTC,
          addresses.USDT,
          addresses.USDC,
          addresses.DAI,
          addresses.USDCe,
        ]);
      });

      it("should swap tokens for user using native token", async () => {
        let tokens = await portfolio.getTokens();

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse = [];

        for (let i = 0; i < tokens.length; i++) {
          let response = await createEnsoCallDataRoute(
            depositBatch.address,
            depositBatch.address,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            tokens[i],
            "100000000000000000"
          );
          postResponse.push(response.data.tx.data);
        }

        const data = await depositBatch.multiTokenSwapETHAndTransfer(
          {
            _minMintAmount: 0,
            _depositAmount: "600000000000000000",
            _target: portfolio.address,
            _depositToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            _callData: postResponse,
          },
          {
            value: "600000000000000000",
          }
        );

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("should swap tokens for user using native token", async () => {
        let tokens = await portfolio.getTokens();

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse = [];

        for (let i = 0; i < tokens.length; i++) {
          let response = await createEnsoCallDataRoute(
            depositBatch.address,
            depositBatch.address,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            tokens[i],
            "100000000000000000"
          );
          postResponse.push(response.data.tx.data);
        }

        const data = await depositBatch
          .connect(nonOwner)
          .multiTokenSwapETHAndTransfer(
            {
              _minMintAmount: 0,
              _depositAmount: "600000000000000000",
              _target: portfolio.address,
              _depositToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
              _callData: postResponse,
            },
            {
              value: "600000000000000000",
            }
          );

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("should rebalance to lending token aArbDAI", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[2];
        let buyToken = addresses.aArbDAI;

        let newTokens = [
          tokens[0],
          tokens[1],
          buyToken,
          tokens[3],
          tokens[4],
          tokens[5],
        ];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        let balanceToSwap = BigNumber.from(balance).toString();
        console.log("Balance to rebalance", balanceToSwap);

        const postResponse = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          sellToken,
          buyToken,
          balanceToSwap
        );

        const encodedParameters = ethers.utils.defaultAbiCoder.encode(
          [
            " bytes[][]", // callDataEnso
            "bytes[]", // callDataDecreaseLiquidity
            "bytes[][]", // callDataIncreaseLiquidity
            "address[][]", // increaseLiquidityTarget
            "address[]", // underlyingTokensDecreaseLiquidity
            "address[]", // tokensIn
            "address[]", // tokens
            " uint256[]", // minExpectedOutputAmounts
          ],
          [
            [[postResponse.data.tx.data]],
            [],
            [[]],
            [[]],
            [],
            [sellToken],
            [buyToken],
            [0],
          ]
        );

        await rebalancing.updateTokens({
          _newTokens: newTokens,
          _sellTokens: [sellToken],
          _sellAmounts: [balanceToSwap],
          _handler: ensoHandler.address,
          _callData: encodedParameters,
        });

        console.log(
          "balance after sell",
          await ERC20.attach(sellToken).balanceOf(vault)
        );
        console.log(
          "balance after buy",
          await ERC20.attach(buyToken).balanceOf(vault)
        );
      });

      it("should rebalance to lending token aArbLINK", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[3];
        let buyToken = addresses.aArbLINK;

        let newTokens = [
          tokens[0],
          tokens[1],
          tokens[2],
          buyToken,
          tokens[4],
          tokens[5],
        ];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        let balanceToSwap = BigNumber.from(balance).toString();
        console.log("Balance to rebalance", balanceToSwap);

        const postResponse = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          sellToken,
          buyToken,
          balanceToSwap
        );

        const encodedParameters = ethers.utils.defaultAbiCoder.encode(
          [
            " bytes[][]", // callDataEnso
            "bytes[]", // callDataDecreaseLiquidity
            "bytes[][]", // callDataIncreaseLiquidity
            "address[][]", // increaseLiquidityTarget
            "address[]", // underlyingTokensDecreaseLiquidity
            "address[]", // tokensIn
            "address[]", // tokens
            " uint256[]", // minExpectedOutputAmounts
          ],
          [
            [[postResponse.data.tx.data]],
            [],
            [[]],
            [[]],
            [],
            [sellToken],
            [buyToken],
            [0],
          ]
        );

        await rebalancing.updateTokens({
          _newTokens: newTokens,
          _sellTokens: [sellToken],
          _sellAmounts: [balanceToSwap],
          _handler: ensoHandler.address,
          _callData: encodedParameters,
        });

        console.log(
          "balance after sell",
          await ERC20.attach(sellToken).balanceOf(vault)
        );
        console.log(
          "balance after buy",
          await ERC20.attach(buyToken).balanceOf(vault)
        );
      });

      it("should swap tokens for user using native token", async () => {
        let tokens = await portfolio.getTokens();

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse = [];

        for (let i = 0; i < tokens.length; i++) {
          let response = await createEnsoCallDataRoute(
            depositBatch.address,
            depositBatch.address,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            tokens[i],
            "100000000000000000"
          );
          postResponse.push(response.data.tx.data);
        }

        const data = await depositBatch.multiTokenSwapETHAndTransfer(
          {
            _minMintAmount: 0,
            _depositAmount: "600000000000000000",
            _target: portfolio.address,
            _depositToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            _callData: postResponse,
          },
          {
            value: "600000000000000000",
          }
        );

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("should remove tokens as collateral", async () => {
        let tokens = [addresses.DAI];
        let vault = await portfolio.vault();
        await rebalancing.disableCollateralTokens(tokens, addresses.aavePool);
        const pool: IPoolDataProvider = await ethers.getContractAt(
          "IPoolDataProvider",
          addresses.aavePoolDataProvider
        );

        expect(
          (await pool.getUserReserveData(addresses.DAI, vault))[8]
        ).to.be.equals(false);
      });

      it("should enable collateral", async () => {
        let tokens = [addresses.DAI];
        await rebalancing.enableCollateralTokens(tokens, addresses.aavePool);
        let vault = await portfolio.vault();
        const pool: IPoolDataProvider = await ethers.getContractAt(
          "IPoolDataProvider",
          addresses.aavePoolDataProvider
        );

        expect(
          (await pool.getUserReserveData(addresses.DAI, vault))[8]
        ).to.be.equals(true);
      });

      it("should borrow ARB using aArbLink as collateral", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let vault = await portfolio.vault();
        console.log(
          "ARB Balance before",
          await ERC20.attach(addresses.ARB).balanceOf(vault)
        );

        await rebalancing.borrow(
          addresses.aavePool,
          [addresses.LINK],
          addresses.ARB,
          addresses.aavePool,
          "10000000000000000000"
        );
        console.log(
          "ARB Balance after",
          await ERC20.attach(addresses.ARB).balanceOf(vault)
        );

        console.log("newtokens", await portfolio.getTokens());
      });

      it("should borrow USDT using aARBDAI as collateral", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let vault = await portfolio.vault();
        console.log(
          "USDT Balance before",
          await ERC20.attach(addresses.USDT).balanceOf(vault)
        );

        await rebalancing.borrow(
          addresses.aavePool,
          [addresses.DAI],
          addresses.USDT,
          addresses.aavePool,
          "100000000"
        );
        console.log(
          "USDT Balance after",
          await ERC20.attach(addresses.USDT).balanceOf(vault)
        );

        console.log("newtokens", await portfolio.getTokens());
      });

      it("should repay half of ARB using flashloan", async () => {
        let vault = await portfolio.vault();
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        let flashloanBufferUnit = 30; //Flashloan buffer unit in 1/10000
        let bufferUnit = 310; //Buffer unit for collateral amount in 1/100000

        const pool: IPoolDataProvider = await ethers.getContractAt(
          "IPoolDataProvider",
          addresses.aavePoolDataProvider
        );

        let balanceBorrowed: any = (
          await pool.getUserReserveData(addresses.ARB, vault)
        )[2];

        console.log("before getUserAccountData");
        const userData = await aaveAssetHandler.getUserAccountData(
          vault,
          addresses.aavePool,
          await portfolio.getTokens()
        );
        const lendTokens = userData[1].lendTokens;

        console.log("balanceBorrowed before repay", balanceBorrowed);

        const balanceToRepay = (balanceBorrowed / 2).toString();

        const balanceToSwap = balanceToRepay;

        console.log("balanceToRepay", balanceToRepay);
        console.log("balanceToSwap", balanceToSwap);

        const Ipool: IAavePool = await ethers.getContractAt(
          "IAavePool",
          addresses.aavePool
        );

        let encodedParameters1 = [];
        const flashLoanFee = await Ipool.FLASHLOAN_PREMIUM_TOTAL();

        console.log("flashLoanFee", flashLoanFee);
        //Because repay(rebalance) is one borrow token at a time

        console.log("Before repay");

        await rebalancing.repay(addresses.aavePool, {
          _factory: addresses.aavePool,
          _token0: addresses.aavePool, //USDT - Pool token
          _token1: addresses.aavePool, //USDC - Pool token
          _flashLoanToken: addresses.ARB, //Token to take flashlaon
          _debtToken: [addresses.ARB], //Token to pay debt of
          _protocolToken: [addresses.aArbARB], // lending token in case of venus
          _bufferUnit: bufferUnit, //Buffer unit for collateral amount
          _solverHandler: ensoHandler.address, //Handler to swap
          _flashLoanAmount: [balanceToSwap],
          _debtRepayAmount: [balanceToRepay],
          firstSwapData: [],
          secondSwapData: [],
          isMaxRepayment: false,
        });

        console.log(
          "Balance of vToken After",
          await ERC20.attach(addresses.aArbLINK).balanceOf(vault)
        );

        balanceBorrowed = (
          await pool.getUserReserveData(addresses.ARB, vault)
        )[2];

        console.log("balanceBorrowed after repay", balanceBorrowed);
      });

      it("should withdraw in BTC by owner(user1)", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        const supplyBefore = await portfolio.totalSupply();
        const tokenToSwapInto = addresses.WBTC;

        const user = owner;

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokens = await portfolio.getTokens();

        let vault = await portfolio.vault();

        let flashloanBufferUnit = 11; //Flashloan buffer unit in 1/10000
        let bufferUnit = 300; //Buffer unit for collateral amount in 1/100000

        let flashLoanToken = addresses.USDT;
        let flashLoanProtocolToken = addresses.aArbUSDT;

        const amountPortfolioToken = await portfolio.balanceOf(user.address);

        console.log("amountPortfolioToken", amountPortfolioToken);

        let withdrawalAmounts =
          await portfolioCalculations.getWithdrawalAmounts(
            amountPortfolioToken,
            portfolio.address
          );

        await portfolio.approve(
          withdrawManager.address,
          BigNumber.from(amountPortfolioToken)
        );
        let responses = [];
        let userBalanceBefore = [];
        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i] == tokenToSwapInto) {
            responses.push("0x");
          } else {
            let response = await createEnsoCallDataRoute(
              withdrawBatch.address,
              user.address,
              tokens[i],
              tokenToSwapInto,
              (withdrawalAmounts[i] * 0.993).toFixed(0)
            );
            responses.push(response.data.tx.data);
          }
          userBalanceBefore.push(
            await ERC20.attach(tokens[i]).balanceOf(user.address)
          );
        }

        const values =
          await portfolioCalculations.calculateAaveBorrowedPortionAndFlashLoanDetails(
            portfolio.address,
            flashLoanProtocolToken,
            vault,
            addresses.corePool_controller,
            aaveAssetHandler.address,
            amountPortfolioToken,
            flashloanBufferUnit
          );

        const flashLoanAmount = values[1];

        await withdrawManager.withdraw(
          portfolio.address,
          tokenToSwapInto,
          amountPortfolioToken,
          0,
          {
            _factory: addresses.aavePool,
            _token0: addresses.aavePool, //USDT - Pool token
            _token1: addresses.aavePool, //USDC - Pool token
            _flashLoanToken: flashLoanToken, //Token to take flashlaon
            _bufferUnit: bufferUnit, //Buffer unit for collateral amount
            _solverHandler: ensoHandler.address, //Handler to swap
            _flashLoanAmount: flashLoanAmount,
            firstSwapData: [],
            secondSwapData: [],
          },
          responses
        );

        const supplyAfter = await portfolio.totalSupply();
        console.log("SupplyAfter", supplyAfter);

        for (let i = 0; i < tokens.length; i++) {
          let balanceAfter = await ERC20.attach(tokens[i]).balanceOf(
            owner.address
          );
          let balanceOFHandler = await ERC20.attach(tokens[i]).balanceOf(
            withdrawBatch.address
          );
          expect(Number(balanceAfter)).to.be.greaterThan(
            Number(userBalanceBefore[i])
          );
          expect(Number(balanceOFHandler)).to.be.equal(0);
        }

        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
      });
    });
  });
});