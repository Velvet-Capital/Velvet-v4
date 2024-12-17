import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import "@nomicfoundation/hardhat-chai-matchers";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";

import {
  swapTokensToLPTokens,
  increaseLiquidity,
  decreaseLiquidity,
  calculateSwapAmountUpdateRange,
} from "./IntentCalculations";

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

import { tokenAddresses, IAddresses, priceOracle } from "./Deployments.test";

import {
  Portfolio,
  Portfolio__factory,
  ProtocolConfig,
  Rebalancing__factory,
  PortfolioFactory,
  UniswapV2Handler,
  VelvetSafeModule,
  FeeModule,
  FeeModule__factory,
  EnsoHandler,
  VenusAssetHandler,
  EnsoHandlerBundled,
  AccessController__factory,
  TokenExclusionManager__factory,
  DepositBatch,
  DepositManager,
  WithdrawBatch,
  WithdrawManager,
  DepositBatchExternalPositions,
  DepositManagerExternalPositions,
  TokenBalanceLibrary,
  BorrowManagerVenus,
  PositionManagerAlgebra,
  AssetManagementConfig,
  AmountCalculationsAlgebra,
} from "../../typechain";

import { chainIdToAddresses } from "../../scripts/networkVariables";
import { max } from "bn.js";

var chai = require("chai");
const axios = require("axios");
const qs = require("qs");
//use default BigNumber
chai.use(require("chai-bignumber")());

describe.only("Tests for Deposit", () => {
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
  let depositBatch: DepositBatchExternalPositions;
  let depositManager: DepositManagerExternalPositions;
  let withdrawBatch: WithdrawBatch;
  let withdrawManager: WithdrawManager;
  let portfolioContract: Portfolio;
  let portfolioFactory: PortfolioFactory;
  let swapHandler: UniswapV2Handler;
  let borrowManager: BorrowManagerVenus;
  let tokenBalanceLibrary: TokenBalanceLibrary;
  let venusAssetHandler: VenusAssetHandler;
  let rebalancing: any;
  let rebalancing1: any;
  let protocolConfig: ProtocolConfig;
  let fakePortfolio: Portfolio;
  let txObject;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let _assetManagerTreasury: SignerWithAddress;
  let positionManager: PositionManagerAlgebra;
  let assetManagementConfig: AssetManagementConfig;
  let positionWrapper: any;
  let positionWrapper2: any;
  let nonOwner: SignerWithAddress;
  let depositor1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addrs: SignerWithAddress[];
  let feeModule0: FeeModule;
  let zeroAddress: any;
  const assetManagerHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("ASSET_MANAGER")
  );
  let swapVerificationLibrary: any;

  let positionWrappers: any = [];
  let swapTokens: any = [];
  let positionWrapperIndex: any = [];
  let portfolioTokenIndex: any = [];
  let isExternalPosition: any = [];
  let index0: any = [];
  let index1: any = [];

  let amountCalculationsAlgebra: AmountCalculationsAlgebra;

  let position1: any;
  let position2: any;

  /// @dev The minimum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**-128
  const MIN_TICK = -887220;
  /// @dev The maximum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**128
  const MAX_TICK = 887220;

  const provider = ethers.provider;
  const chainId: any = process.env.CHAIN_ID;
  const addresses = chainIdToAddresses[chainId];

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  describe.only("Tests for Deposit", () => {
    before(async () => {
      accounts = await ethers.getSigners();
      [
        owner,
        depositor1,
        nonOwner,
        treasury,
        _assetManagerTreasury,
        addr1,
        addr2,
        ...addrs
      ] = accounts;

      const provider = ethers.getDefaultProvider();

      const SwapVerificationLibrary = await ethers.getContractFactory(
        "SwapVerificationLibraryAlgebra"
      );
      swapVerificationLibrary = await SwapVerificationLibrary.deploy();
      await swapVerificationLibrary.deployed();

      const TokenBalanceLibrary = await ethers.getContractFactory(
        "TokenBalanceLibrary"
      );

      tokenBalanceLibrary = await TokenBalanceLibrary.deploy();
      await tokenBalanceLibrary.deployed();

      iaddress = await tokenAddresses();

      const EnsoHandler = await ethers.getContractFactory("EnsoHandler");
      ensoHandler = await EnsoHandler.deploy();
      await ensoHandler.deployed();

      const DepositBatch = await ethers.getContractFactory(
        "DepositBatchExternalPositions"
      );
      depositBatch = await DepositBatch.deploy();
      await depositBatch.deployed();

      const DepositManager = await ethers.getContractFactory(
        "DepositManagerExternalPositions"
      );
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
      await protocolConfig.setCoolDownPeriod("70");
      await protocolConfig.enableSolverHandler(ensoHandler.address);

      await protocolConfig.enableTokens([
        iaddress.ethAddress,
        iaddress.btcAddress,
        iaddress.usdcAddress,
        iaddress.usdtAddress,
      ]);

      const Rebalancing = await ethers.getContractFactory("Rebalancing");
      const rebalancingDefult = await Rebalancing.deploy();
      await rebalancingDefult.deployed();

      const AssetManagementConfig = await ethers.getContractFactory(
        "AssetManagementConfig"
      );
      const assetManagementConfigBase = await AssetManagementConfig.deploy();
      await assetManagementConfigBase.deployed();

      const TokenExclusionManager = await ethers.getContractFactory(
        "TokenExclusionManager"
      );
      const tokenExclusionManagerDefault = await TokenExclusionManager.deploy();
      await tokenExclusionManagerDefault.deployed();

      const BorrowManager = await ethers.getContractFactory("BorrowManagerVenus");
      borrowManager = await BorrowManager.deploy();
      await borrowManager.deployed();

      const VenusAssetHandler = await ethers.getContractFactory(
        "VenusAssetHandler"
      );
      venusAssetHandler = await VenusAssetHandler.deploy();
      await venusAssetHandler.deployed();

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

      swapHandler.init(addresses.PancakeSwapRouterAddress);

      await protocolConfig.setAssetHandlers(
        [
          addresses.vBNB_Address,
          addresses.vBTC_Address,
          addresses.vDAI_Address,
          addresses.vUSDT_Address,
          addresses.vUSDT_DeFi_Address,
          addresses.corePool_controller,
        ],
        [
          venusAssetHandler.address,
          venusAssetHandler.address,
          venusAssetHandler.address,
          venusAssetHandler.address,
          venusAssetHandler.address,
          venusAssetHandler.address,
        ]
      );

      await protocolConfig.setSupportedControllers([
        addresses.corePool_controller,
      ]);

      await protocolConfig.setSupportedFactory(addresses.thena_factory);

      await protocolConfig.setAssetAndMarketControllers(
        [
          addresses.vBNB_Address,
          addresses.vBTC_Address,
          addresses.vDAI_Address,
          addresses.vUSDT_Address,
        ],
        [
          addresses.corePool_controller,
          addresses.corePool_controller,
          addresses.corePool_controller,
          addresses.corePool_controller,
        ]
      );

      let whitelistedTokens = [
        iaddress.usdcAddress,
        iaddress.btcAddress,
        iaddress.ethAddress,
        iaddress.wbnbAddress,
        iaddress.usdtAddress,
        iaddress.dogeAddress,
        iaddress.daiAddress,
        iaddress.cakeAddress,
        addresses.LINK_Address,
        addresses.vBTC_Address,
        addresses.vETH_Address,
      ];

      let whitelist = [owner.address];

      zeroAddress = "0x0000000000000000000000000000000000000000";

      const PositionManager = await ethers.getContractFactory(
        "PositionManagerAlgebra",
        {
          libraries: {
            SwapVerificationLibraryAlgebra: swapVerificationLibrary.address,
          },
        }
      );
      const positionManagerBaseAddress = await PositionManager.deploy();
      await positionManagerBaseAddress.deployed();

      const AmountCalculationsAlgebra = await ethers.getContractFactory(
        "AmountCalculationsAlgebra"
      );
      amountCalculationsAlgebra = await AmountCalculationsAlgebra.deploy();
      await amountCalculationsAlgebra.deployed();

      const FeeModule = await ethers.getContractFactory("FeeModule");
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
            _baseAssetManagementConfigAddress:
              assetManagementConfigBase.address,
            _feeModuleImplementationAddress: feeModule.address,
            _baseTokenRemovalVaultImplementation: tokenRemovalVault.address,
            _baseVelvetGnosisSafeModuleAddress: velvetSafeModule.address,
            _basePositionManager: positionManagerBaseAddress.address,
            _baseBorrowManager: borrowManager.address,
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

      await portfolioFactory.setPositionManagerAddresses(
        "0xa51adb08cbe6ae398046a23bec013979816b77ab",
        "0x327dd3208f0bcf590a66110acb6e5e6941a4efa0"
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
          _assetManagerTreasury: _assetManagerTreasury.address,
          _whitelistedTokens: whitelistedTokens,
          _public: true,
          _transferable: true,
          _transferableToPublic: true,
          _whitelistTokens: true,
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
          _assetManagerTreasury: _assetManagerTreasury.address,
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

      const config = await portfolio.assetManagementConfig();

      assetManagementConfig = AssetManagementConfig.attach(config);

      await assetManagementConfig.enableUniSwapV3Manager();

      let positionManagerAddress =
        await assetManagementConfig.positionManager();

      positionManager = PositionManager.attach(positionManagerAddress);

      console.log("portfolio deployed to:", portfolio.address);

      console.log("rebalancing:", rebalancing1.address);
    });

    describe("Deposit Tests", function () {
      it("owner should create new position", async () => {
        // UniswapV3 position
        const token0 = iaddress.usdtAddress;
        const token1 = iaddress.usdcAddress;

        await positionManager.createNewWrapperPosition(
          token0,
          token1,
          "Test",
          "t",
          "840",
          "1080"
        );

        position1 = await positionManager.deployedPositionWrappers(0);

        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        positionWrapper = PositionWrapper.attach(position1);
      });

      it("should init tokens", async () => {
        await portfolio.initToken([
          iaddress.usdtAddress,
          iaddress.btcAddress,
          iaddress.ethAddress,
          position1,
        ]);
      });

      it("owner should approve tokens to permit2 contract", async () => {
        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          await ERC20.attach(tokens[i]).approve(PERMIT2_ADDRESS, 0);
          await ERC20.attach(tokens[i]).approve(
            PERMIT2_ADDRESS,
            MaxAllowanceTransferAmount
          );
        }
      });

      it("owner should approve tokens to permit2 contract for nonOwner", async () => {
        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          await ERC20.attach(tokens[i])
            .connect(nonOwner)
            .approve(PERMIT2_ADDRESS, 0);
          await ERC20.attach(tokens[i])
            .connect(nonOwner)
            .approve(PERMIT2_ADDRESS, MaxAllowanceTransferAmount);
        }
      });

      it("should deposit multi-token into fund (First Deposit)", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];
        // swap native token to deposit token
        let amounts = [];

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const supplyBefore = await portfolio.totalSupply();

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio.address
          );
          if (i < tokens.length - 1) {
            await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
              value: "100000000000000000",
            });
          } else {
            // UniswapV3 position
            const token0 = await positionWrapper.token0();
            const token1 = await positionWrapper.token1();

            let { swapResult0, swapResult1 } = await swapTokensToLPTokens(
              owner,
              positionManager.address,
              swapHandler.address,
              token0,
              token1,
              "1000000000000000000",
              "1000000000000000000"
            );

            const ERC20Upgradeable = await ethers.getContractFactory(
              "ERC20Upgradeable"
            );
            const balanceT0Before = await ERC20Upgradeable.attach(
              token0
            ).balanceOf(owner.address);
            const balanceT1Before = await ERC20Upgradeable.attach(
              token1
            ).balanceOf(owner.address);

            await positionManager.initializePositionAndDeposit(
              owner.address,
              position1,
              {
                _amount0Desired: swapResult0,
                _amount1Desired: swapResult1,
                _amount0Min: "0",
                _amount1Min: "0",
              }
            );

            const balanceT0After = await ERC20Upgradeable.attach(
              token0
            ).balanceOf(owner.address);
            const balanceT1After = await ERC20Upgradeable.attach(
              token1
            ).balanceOf(owner.address);

            console.log(
              "deposited amount T0: ",
              balanceT0Before.sub(balanceT0After)
            );
            console.log(
              "deposited amount T1: ",
              balanceT1Before.sub(balanceT1After)
            );
          }

          let balance = await ERC20.attach(tokens[i]).balanceOf(owner.address);
          let detail = {
            token: tokens[i],
            amount: balance,
            expiration: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
            nonce,
          };
          amounts.push(balance);
          tokenDetails.push(detail);
        }

        console.log(
          "user balance after first deposit, first mint",
          await positionWrapper.balanceOf(owner.address)
        );

        console.log("total supply", await positionWrapper.totalSupply());

        const permit: PermitBatch = {
          details: tokenDetails,
          spender: portfolio.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await owner._signTypedData(domain, types, values);

        await portfolio.multiTokenDeposit(amounts, "0", permit, signature);

        const supplyAfter = await portfolio.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        expect(Number(supplyAfter)).to.be.equals(
          Number("100000000000000000000")
        );
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multi-token into fund (Second Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];
        let leastPercentage = 0;
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];
        // swap native token to deposit token

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const supplyBefore = await portfolio.totalSupply();

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio.address
          );
          if (i < tokens.length - 1) {
            await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
              value: "150000000000000000",
            });
          } else {
            // UniswapV3 position
            const token0 = await positionWrapper.token0();
            const token1 = await positionWrapper.token1();

            await increaseLiquidity(
              owner,
              positionManager.address,
              swapHandler.address,
              token0,
              token1,
              position1,
              "100000000000000000",
              "100000000000000000"
            );
          }

          let balance = await ERC20.attach(tokens[i]).balanceOf(owner.address);
          let detail = {
            token: tokens[i],
            amount: balance,
            expiration: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
            nonce,
          };
          amounts.push(balance);
          tokenDetails.push(detail);
        }

        console.log(
          "user balance",
          await positionWrapper.balanceOf(owner.address)
        );

        console.log("total supply", await positionWrapper.totalSupply());

        const permit: PermitBatch = {
          details: tokenDetails,
          spender: portfolio.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await owner._signTypedData(domain, types, values);

        // Calculation to make minimum amount value for user---------------------------------
        let result = await portfolioCalculations.getUserAmountToDeposit(
          amounts,
          portfolio.address
        );
        //-----------------------------------------------------------------------------------

        newAmounts = result[0];
        leastPercentage = result[1];

        let inputAmounts = [];
        for (let i = 0; i < newAmounts.length; i++) {
          inputAmounts.push(ethers.BigNumber.from(newAmounts[i]).toString());
        }

        console.log("leastPercentage ", leastPercentage);
        console.log("totalSupply ", await portfolio.totalSupply());

        let mintAmount =
          (await calcuateExpectedMintAmount(
            leastPercentage,
            await portfolio.totalSupply()
          )) * 0.98; // 2% entry fee

        // considering 1% slippage
        await portfolio.multiTokenDeposit(
          inputAmounts,
          mintAmount.toString(),
          permit,
          signature // slippage 1%
        );

        const supplyAfter = await portfolio.totalSupply();
        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multi-token into fund (Third Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];
        let leastPercentage = 0;
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];
        // swap native token to deposit token

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const supplyBefore = await portfolio.totalSupply();

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio.address
          );
          if (i < tokens.length - 1) {
            await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
              value: "150000000000000000",
            });
          } else {
            // UniswapV3 position
            const token0 = await positionWrapper.token0();
            const token1 = await positionWrapper.token1();

            await increaseLiquidity(
              owner,
              positionManager.address,
              swapHandler.address,
              token0,
              token1,
              position1,
              "100000000000000000",
              "100000000000000000"
            );
          }
          let balance = await ERC20.attach(tokens[i]).balanceOf(owner.address);
          let detail = {
            token: tokens[i],
            amount: balance,
            expiration: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
            nonce,
          };
          amounts.push(balance);
          tokenDetails.push(detail);
        }

        console.log(
          "user balance",
          await positionWrapper.balanceOf(owner.address)
        );

        console.log("total supply", await positionWrapper.totalSupply());

        const permit: PermitBatch = {
          details: tokenDetails,
          spender: portfolio.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await owner._signTypedData(domain, types, values);

        // Calculation to make minimum amount value for user---------------------------------
        let result = await portfolioCalculations.getUserAmountToDeposit(
          amounts,
          portfolio.address
        );
        //-----------------------------------------------------------------------------------

        newAmounts = result[0];
        leastPercentage = result[1];

        let inputAmounts = [];
        for (let i = 0; i < newAmounts.length; i++) {
          inputAmounts.push(ethers.BigNumber.from(newAmounts[i]).toString());
        }

        console.log("leastPercentage ", leastPercentage);
        console.log("totalSupply ", await portfolio.totalSupply());

        let mintAmount =
          (await calcuateExpectedMintAmount(
            leastPercentage,
            await portfolio.totalSupply()
          )) * 0.98; // 2% entry fee

        // considering 1% slippage
        await portfolio.multiTokenDeposit(
          inputAmounts,
          mintAmount.toString(),
          permit,
          signature // slippage 1%
        );

        const supplyAfter = await portfolio.totalSupply();
        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multi-token into fund from nonOwner (Fourth Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];
        let leastPercentage = 0;
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];
        // swap native token to deposit token

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const supplyBefore = await portfolio.totalSupply();

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            nonOwner.address,
            tokens[i],
            portfolio.address
          );
          if (i < tokens.length - 1) {
            await swapHandler.swapETHToTokens(
              "500",
              tokens[i],
              nonOwner.address,
              {
                value: "150000000000000000",
              }
            );
          } else {
            // UniswapV3 position
            const token0 = await positionWrapper.token0();
            const token1 = await positionWrapper.token1();

            await increaseLiquidity(
              nonOwner,
              positionManager.address,
              swapHandler.address,
              token0,
              token1,
              position1,
              "100000000000000000",
              "100000000000000000"
            );
          }

          let balance = await ERC20.attach(tokens[i]).balanceOf(
            nonOwner.address
          );
          let detail = {
            token: tokens[i],
            amount: balance,
            expiration: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
            nonce,
          };
          amounts.push(balance);
          tokenDetails.push(detail);
        }

        console.log(
          "user balance",
          await positionWrapper.balanceOf(nonOwner.address)
        );

        console.log("total supply", await positionWrapper.totalSupply());

        const permit: PermitBatch = {
          details: tokenDetails,
          spender: portfolio.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await nonOwner._signTypedData(domain, types, values);

        // Calculation to make minimum amount value for user---------------------------------
        let result = await portfolioCalculations.getUserAmountToDeposit(
          amounts,
          portfolio.address
        );
        //-----------------------------------------------------------------------------------

        newAmounts = result[0];
        leastPercentage = result[1];

        let inputAmounts = [];
        for (let i = 0; i < newAmounts.length; i++) {
          inputAmounts.push(ethers.BigNumber.from(newAmounts[i]).toString());
        }

        console.log("leastPercentage ", leastPercentage);
        console.log("totalSupply ", await portfolio.totalSupply());

        let mintAmount =
          (await calcuateExpectedMintAmount(
            leastPercentage,
            await portfolio.totalSupply()
          )) * 0.98; // 2% entry fee

        // considering 1% slippage
        await portfolio.connect(nonOwner).multiTokenDeposit(
          inputAmounts,
          mintAmount.toString(),
          permit,
          signature // slippage 1%
        );

        const supplyAfter = await portfolio.totalSupply();
        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("owner should update the price range", async () => {
        let totalSupplyBefore = await positionWrapper.totalSupply();

        const newTickLower = "-1380";
        const newTickUpper = "-1020";

        let updateRangeData = await calculateSwapAmountUpdateRange(
          positionManager.address,
          position1,
          newTickLower,
          newTickUpper
        );

        await positionManager.updateRange(
          position1,
          updateRangeData.tokenIn,
          updateRangeData.tokenOut,
          updateRangeData.swapAmount.toString(),
          0,
          0,
          newTickLower,
          newTickUpper
        );

        let totalSupplyAfter = await positionWrapper.totalSupply();
        expect(totalSupplyAfter).to.be.equals(totalSupplyBefore);
      });

      it("owner should update the price range", async () => {
        let totalSupplyBefore = await positionWrapper.totalSupply();

        const newTickLower = MIN_TICK;
        const newTickUpper = MAX_TICK;

        let updateRangeData = await calculateSwapAmountUpdateRange(
          positionManager.address,
          position1,
          newTickLower,
          newTickUpper
        );

        await positionManager.updateRange(
          position1,
          updateRangeData.tokenIn,
          updateRangeData.tokenOut,
          updateRangeData.swapAmount.toString(),
          0,
          0,
          newTickLower,
          newTickUpper
        );

        let totalSupplyAfter = await positionWrapper.totalSupply();
        expect(totalSupplyAfter).to.be.equals(totalSupplyBefore);
      });

      it("owner should update the price range", async () => {
        let totalSupplyBefore = await positionWrapper.totalSupply();

        const newTickLower = "-1380";
        const newTickUpper = "-1020";

        let updateRangeData = await calculateSwapAmountUpdateRange(
          positionManager.address,
          position1,
          newTickLower,
          newTickUpper
        );

        await positionManager.updateRange(
          position1,
          updateRangeData.tokenIn,
          updateRangeData.tokenOut,
          updateRangeData.swapAmount.toString(),
          0,
          0,
          newTickLower,
          newTickUpper
        );

        let totalSupplyAfter = await positionWrapper.totalSupply();
        expect(totalSupplyAfter).to.be.equals(totalSupplyBefore);
      });

      it("should withdraw in multitoken by nonOwner", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        const supplyBefore = await portfolio.totalSupply();
        const amountPortfolioToken = await portfolio.balanceOf(
          nonOwner.address
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokens = await portfolio.getTokens();

        let tokenBalanceBefore: any = [];
        for (let i = 0; i < tokens.length; i++) {
          tokenBalanceBefore[i] = await ERC20.attach(tokens[i]).balanceOf(
            nonOwner.address
          );
        }

        await portfolio
          .connect(nonOwner)
          .multiTokenWithdrawal(BigNumber.from(amountPortfolioToken), {
            _factory: addresses.thena_factory,
            _token0: zeroAddress, //USDT - Pool token
            _token1: zeroAddress, //USDC - Pool token
            _flashLoanToken: zeroAddress, //Token to take flashlaon
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address, //Handler to swap
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          });

        const supplyAfter = await portfolio.totalSupply();

        for (let i = 0; i < tokens.length; i++) {
          let tokenBalanceAfter = await ERC20.attach(tokens[i]).balanceOf(
            nonOwner.address
          );
          expect(Number(tokenBalanceAfter)).to.be.greaterThan(
            Number(tokenBalanceBefore[i])
          );
        }
        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));

        await decreaseLiquidity(nonOwner, positionManager.address, position1);
      });

      it("should withdraw in multitoken by owner", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        const supplyBefore = await portfolio.totalSupply();
        const amountPortfolioToken = await portfolio.balanceOf(owner.address);

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokens = await portfolio.getTokens();

        let tokenBalanceBefore: any = [];
        for (let i = 0; i < tokens.length; i++) {
          tokenBalanceBefore[i] = await ERC20.attach(tokens[i]).balanceOf(
            owner.address
          );
        }

        await portfolio
          .connect(owner)
          .multiTokenWithdrawal(BigNumber.from(amountPortfolioToken), {
            _factory: addresses.thena_factory,
            _token0: zeroAddress, //USDT - Pool token
            _token1: zeroAddress, //USDC - Pool token
            _flashLoanToken: zeroAddress, //Token to take flashlaon
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address, //Handler to swap
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          });

        const supplyAfter = await portfolio.totalSupply();

        for (let i = 0; i < tokens.length; i++) {
          let tokenBalanceAfter = await ERC20.attach(tokens[i]).balanceOf(
            owner.address
          );
          expect(Number(tokenBalanceAfter)).to.be.greaterThan(
            Number(tokenBalanceBefore[i])
          );
        }
        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));

        await decreaseLiquidity(owner, positionManager.address, position1);
      });
    });
  });
});
