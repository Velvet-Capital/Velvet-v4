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
  TokenBalanceLibrary,
  BorrowManager,
  UniswapV2Handler,
  DepositBatchExternalPositions,
  DepositManagerExternalPositions,
  TokenExclusionManager,
  TokenExclusionManager__factory,
  WithdrawBatch,
  WithdrawManager,
  PositionManagerUniswap,
  AssetManagementConfig,
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
  let depositBatch: DepositBatchExternalPositions;
  let depositManager: DepositManagerExternalPositions;
  let borrowManager: BorrowManager;
  let tokenBalanceLibrary: TokenBalanceLibrary;
  let withdrawBatch: WithdrawBatch;
  let withdrawManager: WithdrawManager;
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
  let positionManager: PositionManagerUniswap;
  let assetManagementConfig: AssetManagementConfig;
  let positionWrapper: any;
  let nonOwner: SignerWithAddress;
  let depositor1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addrs: SignerWithAddress[];
  let feeModule0: FeeModule;
  let approve_amount = ethers.constants.MaxUint256; //(2^256 - 1 )
  let token;
  let swapVerificationLibrary: any;

  let positionWrappers: any = [];
  let swapTokens: any = [];
  let positionWrapperIndex: any = [];
  let portfolioTokenIndex: any = [];
  let isExternalPosition: any = [];
  let index0: any = [];
  let index1: any = [];

  let position1: any;
  let position2: any;

  /// @dev The minimum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**-128
  const MIN_TICK = -887272;
  /// @dev The maximum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**128
  const MAX_TICK = -MIN_TICK;

  const provider = ethers.provider;
  const chainId: any = process.env.CHAIN_ID;
  const addresses = chainIdToAddresses[chainId];

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

      const SwapVerificationLibrary = await ethers.getContractFactory(
        "SwapVerificationLibraryUniswap"
      );
      swapVerificationLibrary = await SwapVerificationLibrary.deploy();
      await swapVerificationLibrary.deployed();

      const TokenBalanceLibrary = await ethers.getContractFactory(
        "TokenBalanceLibrary"
      );

      tokenBalanceLibrary = await TokenBalanceLibrary.deploy();
      await tokenBalanceLibrary.deployed();

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

      console.log(
        "positionWrapperBaseAddress:",
        positionWrapperBaseAddress.address
      );

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

      await protocolConfig.enableTokens([
        addresses.USDT,
        addresses.USDC,
        addresses.WBTC,
        addresses.WETH,
      ]);

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
      const assetManagementConfigBase = await AssetManagementConfig.deploy();
      await assetManagementConfigBase.deployed();

      const BorrowManager = await ethers.getContractFactory("BorrowManager");
      borrowManager = await BorrowManager.deploy();
      await borrowManager.deployed();

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

      await portfolioFactory.setPositionManagerAddresses(
        "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        "0xE592427A0AEce92De3Edee1F18E0157C05861564"
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
      it("should create new position", async () => {
        // UniswapV3 position
        const token0 = addresses.USDT;
        const token1 = addresses.USDC;

        await positionManager.createNewWrapperPosition(
          token0,
          token1,
          "Test",
          "t",
          "100",
          MIN_TICK,
          MAX_TICK
        );

        position1 = await positionManager.deployedPositionWrappers(0);

        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        positionWrapper = PositionWrapper.attach(position1);
      });

      it("should create new position", async () => {
        // UniswapV3 position
        const token0 = addresses.USDC;
        const token1 = addresses.USDT;

        await positionManager.createNewWrapperPosition(
          token0,
          token1,
          "Test",
          "t",
          "100",
          MIN_TICK,
          MAX_TICK
        );

        position2 = await positionManager.deployedPositionWrappers(1);
      });

      it("should init tokens", async () => {
        await portfolio.initToken([
          addresses.USDC,
          position2,
          addresses.WBTC,
          addresses.USDCe,
          position1,
        ]);

        positionWrappers = [position2, position1];
        swapTokens = [
          addresses.USDC,
          addresses.USDC, // position2 - token0
          addresses.USDT, // position2 - token1
          addresses.WBTC,
          addresses.USDCe,
          addresses.USDC, // position1 - token0
          addresses.USDT, // position1 - token1
        ];
        positionWrapperIndex = [1, 4];
        portfolioTokenIndex = [0, 1, 1, 2, 3, 4, 4];
        isExternalPosition = [false, true, true, false, false, true, true];
        index0 = [1, 5];
        index1 = [2, 6];
      });

      it("user should invest (ETH - native token)", async () => {
        let tokens = await portfolio.getTokens();

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse = [];

        for (let i = 0; i < swapTokens.length; i++) {
          let response = await createEnsoCallDataRoute(
            depositBatch.address,
            depositBatch.address,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            swapTokens[i],
            "20000000000000000"
          );
          postResponse.push(response.data.tx.data);
        }

        const data = await depositBatch.multiTokenSwapETHAndTransfer(
          {
            _minMintAmount: 0,
            _depositAmount: "1000000000000000000",
            _target: portfolio.address,
            _depositToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            _callData: postResponse,
          },
          {
            _positionWrappers: positionWrappers,
            _swapTokens: swapTokens,
            _positionWrapperIndex: positionWrapperIndex,
            _portfolioTokenIndex: portfolioTokenIndex,
            _index0: index0,
            _index1: index1,
            _amount0Min: [0, 0],
            _amount1Min: [0, 0],
            _isExternalPosition: isExternalPosition,
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
            _deployer: ZERO_ADDRESS,
          },
          {
            value: "1000000000000000000",
          }
        );

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("user should invest (investment token equals one portfolio token)", async () => {
        let tokens = await portfolio.getTokens();

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokenToSwap = addresses.ARB;

        await swapHandler.swapETHToTokens("800", tokenToSwap, owner.address, {
          value: "100000000000000000",
        });

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse = [];

        let amountToSwap = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address
        );

        for (let i = 0; i < swapTokens.length; i++) {
          let amountIn = BigNumber.from(amountToSwap).div(swapTokens.length);
          if (tokenToSwap == swapTokens[i]) {
            const abiCoder = ethers.utils.defaultAbiCoder;
            const encodedata = abiCoder.encode(["uint"], [amountIn]);
            postResponse.push(encodedata);
          } else {
            let response = await createEnsoCallDataRoute(
              depositBatch.address,
              depositBatch.address,
              tokenToSwap,
              swapTokens[i],
              Number(amountIn)
            );
            postResponse.push(response.data.tx.data);
          }
        }

        //----------Approval-------------

        await ERC20.attach(tokenToSwap).approve(
          depositManager.address,
          amountToSwap.toString()
        );

        await depositManager.deposit(
          {
            _minMintAmount: 0,
            _depositAmount: amountToSwap.toString(),
            _target: portfolio.address,
            _depositToken: tokenToSwap,
            _callData: postResponse,
          },
          {
            _positionWrappers: positionWrappers,
            _swapTokens: swapTokens,
            _positionWrapperIndex: positionWrapperIndex,
            _portfolioTokenIndex: portfolioTokenIndex,
            _index0: index0,
            _index1: index1,
            _amount0Min: [0, 0],
            _amount1Min: [0, 0],
            _isExternalPosition: isExternalPosition,
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
            _deployer: ZERO_ADDRESS,
          }
        );

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("user should invest", async () => {
        let tokens = await portfolio.getTokens();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokenToSwap = addresses.USDT;

        await swapHandler.swapETHToTokens("500", tokenToSwap, owner.address, {
          value: "100000000000000000",
        });

        let amountToSwap = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address
        );

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse = [];

        for (let i = 0; i < swapTokens.length; i++) {
          let amountIn = BigNumber.from(amountToSwap).div(swapTokens.length);
          if (tokenToSwap == swapTokens[i]) {
            const abiCoder = ethers.utils.defaultAbiCoder;
            const encodedata = abiCoder.encode(["uint"], [amountIn]);
            postResponse.push(encodedata);
          } else {
            let response = await createEnsoCallDataRoute(
              depositBatch.address,
              depositBatch.address,
              tokenToSwap,
              swapTokens[i],
              Number(amountIn)
            );
            postResponse.push(response.data.tx.data);
          }
        }

        //----------Approval-------------

        await ERC20.attach(tokenToSwap).approve(
          depositManager.address,
          amountToSwap.toString()
        );

        await depositManager.deposit(
          {
            _minMintAmount: 0,
            _depositAmount: amountToSwap.toString(),
            _target: portfolio.address,
            _depositToken: tokenToSwap,
            _callData: postResponse,
          },
          {
            _positionWrappers: positionWrappers,
            _swapTokens: swapTokens,
            _positionWrapperIndex: positionWrapperIndex,
            _portfolioTokenIndex: portfolioTokenIndex,
            _index0: index0,
            _index1: index1,
            _amount0Min: [0, 0],
            _amount1Min: [0, 0],
            _isExternalPosition: isExternalPosition,
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
            _deployer: ZERO_ADDRESS,
          }
        );

        console.log("SupplyAfter", await portfolio.totalSupply());
      });
    });
  });
});
