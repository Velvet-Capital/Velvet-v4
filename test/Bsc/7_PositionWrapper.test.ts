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
} from "@uniswap/Permit2-sdk";

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
  EnsoHandlerBundled,
  AccessController__factory,
  TokenExclusionManager__factory,
  DepositBatch,
  DepositManager,
  WithdrawBatch,
  WithdrawManager,
  TokenBalanceLibrary,
  BorrowManager,
  DepositBatchExternalPositions,
  DepositManagerExternalPositions,
  PositionManagerThena,
  AssetManagementConfig,
  AmountCalculationsAlgebra,
} from "../../typechain";

import { chainIdToAddresses } from "../../scripts/networkVariables";
import { max } from "bn.js";
import { config } from "process";

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
  let borrowManager: BorrowManager;
  let tokenBalanceLibrary: TokenBalanceLibrary;
  let rebalancing: any;
  let rebalancing1: any;
  let protocolConfig: ProtocolConfig;
  let fakePortfolio: Portfolio;
  let txObject;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let _assetManagerTreasury: SignerWithAddress;
  let positionManager: PositionManagerThena;
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

      const BorrowManager = await ethers.getContractFactory("BorrowManager");
      borrowManager = await BorrowManager.deploy();
      await borrowManager.deployed();

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

      const Rebalancing = await ethers.getContractFactory("Rebalancing", {
        libraries: {
          TokenBalanceLibrary: tokenBalanceLibrary.address,
        },
      });
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
        "PositionManagerThena"
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
          _assetManagerTreasury: _assetManagerTreasury.address,
          _whitelistedTokens: whitelistedTokens,
          _public: true,
          _transferable: true,
          _transferableToPublic: true,
          _whitelistTokens: true,
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
      it("non owner should not be able to enable the uniswapV3 position manager", async () => {
        await expect(
          assetManagementConfig.connect(nonOwner).enableUniSwapV3Manager()
        ).to.be.revertedWithCustomError(
          assetManagementConfig,
          "CallerNotAssetManager"
        );
      });

      it("owner should not be able to enable the uniswapV3 position manager after it has already been enabled", async () => {
        await expect(
          assetManagementConfig.enableUniSwapV3Manager()
        ).to.be.revertedWithCustomError(
          assetManagementConfig,
          "UniSwapV3WrapperAlreadyEnabled"
        );
      });

      it("owner should not be able to create a new position when protocol is paused", async () => {
        // UniswapV3 position
        const token0 = iaddress.usdtAddress;
        const token1 = iaddress.usdcAddress;

        await protocolConfig.setProtocolPause(true);

        await expect(
          positionManager
            .connect(nonOwner)
            .createNewWrapperPosition(
              token0,
              token1,
              "Test",
              "t",
              MIN_TICK,
              MAX_TICK
            )
        ).to.be.revertedWithCustomError(positionManager, "ProtocolIsPaused");

        await protocolConfig.setProtocolPause(false);
      });

      it("non owner should not be able to create a new position", async () => {
        // UniswapV3 position
        const token0 = iaddress.usdtAddress;
        const token1 = iaddress.usdcAddress;

        await expect(
          positionManager
            .connect(nonOwner)
            .createNewWrapperPosition(
              token0,
              token1,
              "Test",
              "t",
              MIN_TICK,
              MAX_TICK
            )
        ).to.be.revertedWithCustomError(
          positionManager,
          "CallerNotAssetManager"
        );
      });

      it("owner should not be able to create a new position with a non-whitelisted token", async () => {
        // UniswapV3 position
        const token0 = iaddress.usdcAddress;
        const token1 = addresses.DOT;

        await expect(
          positionManager.createNewWrapperPosition(
            token0,
            token1,
            "Test",
            "t",
            MIN_TICK,
            MAX_TICK
          )
        ).to.be.revertedWithCustomError(positionManager, "TokenNotWhitelisted");
      });

      it("owner should create new position", async () => {
        // UniswapV3 position
        const token0 = iaddress.usdtAddress;
        const token1 = iaddress.usdcAddress;

        await positionManager.createNewWrapperPosition(
          token0,
          token1,
          "Test",
          "t",
          MIN_TICK,
          MAX_TICK
        );

        position1 = await positionManager.deployedPositionWrappers(0);

        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        positionWrapper = PositionWrapper.attach(position1);
      });

      it("should init tokens should fail if the list includes a non-whitelisted token", async () => {
        await expect(
          portfolio.initToken([
            addresses.DOT,
            iaddress.btcAddress,
            iaddress.cakeAddress,
            position1,
          ])
        ).to.be.revertedWithCustomError(portfolio, "TokenNotWhitelisted");
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

      it("nonOwner should approve tokens to permit2 contract", async () => {
        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          await ERC20.attach(tokens[i])
            .connect(nonOwner)
            .approve(PERMIT2_ADDRESS, MaxAllowanceTransferAmount);
        }
      });

      it("should not be able to create new wrapper position and deposit when protocol is paused", async () => {
        await protocolConfig.setProtocolPause(true);

        const token0 = iaddress.usdtAddress;
        const token1 = iaddress.usdcAddress;

        const params = {
          _amount0Desired: 1000,
          _amount1Desired: 1000,
          _amount0Min: 0,
          _amount1Min: 0,
          _tickLower: MIN_TICK,
          _tickUpper: MAX_TICK,
        };

        await expect(
          positionManager.createNewWrapperPositionAndDeposit(
            owner.address,
            token0,
            token1,
            "Test",
            "t",
            params
          )
        ).to.be.revertedWithCustomError(positionManager, "ProtocolIsPaused");

        await protocolConfig.setProtocolPause(false);
      });

      it("should not be able to initialize position and deposit when protocol is paused", async () => {
        await protocolConfig.setProtocolPause(true);

        await expect(
          positionManager.initializePositionAndDeposit(
            owner.address,
            position1,
            {
              _amount0Desired: 1000,
              _amount1Desired: 1000,
              _amount0Min: 0,
              _amount1Min: 0,
            }
          )
        ).to.be.revertedWithCustomError(positionManager, "ProtocolIsPaused");

        await protocolConfig.setProtocolPause(false);
      });

      it("increasing liquidity should fail if protocol is paused", async () => {
        await protocolConfig.setProtocolPause(true);

        await expect(
          positionManager.increaseLiquidity({
            _dustReceiver: owner.address,
            _positionWrapper: position1,
            _amount0Desired: 1000,
            _amount1Desired: 1000,
            _amount0Min: 0,
            _amount1Min: 0,
            _tokenIn: await positionWrapper.token0(),
            _tokenOut: await positionWrapper.token1(),
            _amountIn: 0,
          })
        ).to.be.revertedWithCustomError(positionManager, "ProtocolIsPaused");

        await protocolConfig.setProtocolPause(true);
      });

      it("should not be able to decrease liquidity when protocol is paused", async () => {
        await protocolConfig.setEmergencyPause(true, false);

        await expect(
          positionManager.decreaseLiquidity(
            position1,
            10000,
            0,
            0,
            await positionWrapper.token0(),
            await positionWrapper.token1(),
            0
          )
        ).to.be.revertedWithCustomError(
          positionManager,
          "ProtocolEmergencyPaused"
        );

        await protocolConfig.setEmergencyPause(false, true);
      });

      it("should not be able to update range when protocol is paused", async () => {
        await protocolConfig.setProtocolPause(true);

        const token0 = await positionWrapper.token0();
        const token1 = await positionWrapper.token1();

        await expect(
          positionManager.updateRange(
            position1,
            token0,
            token1,
            1000,
            0,
            0,
            MIN_TICK,
            MAX_TICK
          )
        ).to.be.revertedWithCustomError(positionManager, "ProtocolIsPaused");

        await protocolConfig.setProtocolPause(false);
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

      it("nonOwner should not be able to update the price range", async () => {
        const token0 = await positionWrapper.token0();
        const token1 = await positionWrapper.token1();

        await expect(
          positionManager
            .connect(nonOwner)
            .updateRange(position1, token0, token1, 0, 0, 0, MIN_TICK, MAX_TICK)
        ).to.be.revertedWithCustomError(
          positionManager,
          "CallerNotAssetManager"
        );
      });

      it("owner should not be able to update the price range with zero swap amount", async () => {
        let totalSupplyBefore = await positionWrapper.totalSupply();

        const token0 = await positionWrapper.token0();
        const token1 = await positionWrapper.token1();

        const newTickLower = -180;
        const newTickUpper = 240;

        await expect(
          positionManager.updateRange(
            position1,
            token0,
            token1,
            0,
            0,
            0,
            newTickLower,
            newTickUpper
          )
        ).to.be.revertedWithCustomError(positionManager, "InvalidSwapAmount");

        let totalSupplyAfter = await positionWrapper.totalSupply();
        expect(totalSupplyAfter).to.be.equals(totalSupplyBefore);
      });

      it("owner should not be able to update the price range with random swap amount", async () => {
        let totalSupplyBefore = await positionWrapper.totalSupply();

        const token0 = await positionWrapper.token0();
        const token1 = await positionWrapper.token1();

        const newTickLower = -180;
        const newTickUpper = 240;

        await expect(
          positionManager.updateRange(
            position1,
            token0,
            token1,
            1000,
            0,
            0,
            newTickLower,
            newTickUpper
          )
        ).to.be.revertedWithCustomError(positionManager, "InvalidSwapAmount");

        let totalSupplyAfter = await positionWrapper.totalSupply();
        expect(totalSupplyAfter).to.be.equals(totalSupplyBefore);
      });

      it("owner should update the price range", async () => {
        let totalSupplyBefore = await positionWrapper.totalSupply();

        const newTickLower = -180;
        const newTickUpper = 240;

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

      it("should withdraw in multitoken by nonwOwner", async () => {
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
            _factory: zeroAddress,
            _token0: zeroAddress, //USDT - Pool token
            _token1: zeroAddress, //USDC - Pool token
            _flashLoanToken: zeroAddress, //Token to take flashlaon
            _solverHandler: zeroAddress, //Handler to swap
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
            _factory: zeroAddress,
            _token0: zeroAddress, //USDT - Pool token
            _token1: zeroAddress, //USDC - Pool token
            _flashLoanToken: zeroAddress, //Token to take flashlaon
            _solverHandler: zeroAddress, //Handler to swap
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

      it("nonOwner should not be able to update allowedRatioDeviationBps param", async () => {
        await expect(
          protocolConfig.connect(nonOwner).updateAllowedRatioDeviationBps(100)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("owner should not be able to update allowedRatioDeviationBps param with invalid value", async () => {
        await expect(
          protocolConfig.updateAllowedRatioDeviationBps(20000)
        ).to.be.revertedWithCustomError(protocolConfig, "InvalidDeviationBps");
      });

      it("owner should be able to update allowedRatioDeviationBps param", async () => {
        await protocolConfig.updateAllowedRatioDeviationBps(100);
      });

      it("owner should not be able to upgrade the position wrapper if protocol is not paused", async () => {
        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        const positionWrapperBase = await PositionWrapper.deploy();
        await positionWrapperBase.deployed();

        await expect(
          protocolConfig.upgradePositionWrapper(
            [position1],
            positionWrapperBase.address
          )
        ).to.be.revertedWithCustomError(protocolConfig, "ProtocolNotPaused");
      });

      it("owner should not be able to  upgrade the position manager if protocol is not paused", async () => {
        const PositionManager = await ethers.getContractFactory(
          "PositionManagerThena"
        );
        const positionManagerBase = await PositionManager.deploy();
        await positionManagerBase.deployed();

        await expect(
          portfolioFactory.upgradePositionManager(
            [positionManager.address],
            positionManagerBase.address
          )
        ).to.be.revertedWithCustomError(portfolioFactory, "ProtocolNotPaused");
      });

      it("should pause protocol", async () => {
        await protocolConfig.setProtocolPause(true);
      });

      it("should upgrade the position manager", async () => {
        const PositionManager = await ethers.getContractFactory(
          "PositionManagerThena"
        );
        const positionManagerBase = await PositionManager.deploy();
        await positionManagerBase.deployed();

        await portfolioFactory.upgradePositionManager(
          [positionManager.address],
          positionManagerBase.address
        );
      });

      it("nonOwner should not be able to upgrade the position manager", async () => {
        const PositionManager = await ethers.getContractFactory(
          "PositionManagerThena"
        );
        const positionManagerBase = await PositionManager.deploy();
        await positionManagerBase.deployed();

        await expect(
          portfolioFactory
            .connect(nonOwner)
            .upgradePositionManager(
              [positionManager.address],
              positionManagerBase.address
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should upgrade the position wrapper", async () => {
        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        const positionWrapperBase = await PositionWrapper.deploy();
        await positionWrapperBase.deployed();

        await protocolConfig.upgradePositionWrapper(
          [position1],
          positionWrapperBase.address
        );
      });

      it("nonOwner should not be able to upgrade the position wrapper", async () => {
        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        const positionWrapperBase = await PositionWrapper.deploy();
        await positionWrapperBase.deployed();

        await expect(
          protocolConfig
            .connect(nonOwner)
            .upgradePositionWrapper([position1], positionWrapperBase.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
});
