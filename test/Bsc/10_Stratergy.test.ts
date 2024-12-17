import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import "@nomicfoundation/hardhat-chai-matchers";
import { ethers, network, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import VENUS_CHAINLINK_ORACLE_ABI from "../abi/venus_chainlink_oracle.json";

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
  calculateOutputAmounts,
  calculateDepositAmounts,
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
  TokenBalanceLibrary,
  BorrowManager,
  VenusAssetHandler,
  EnsoHandlerBundled,
  AccessController__factory,
  TokenExclusionManager__factory,
  DepositBatch,
  DepositManager,
  WithdrawBatchExternalPositions,
  WithdrawManagerExternalPositions,
  DepositBatchExternalPositions,
  DepositManagerExternalPositions,
  PositionManagerAlgebra,
  AssetManagementConfig,
  AmountCalculationsAlgebra,
  IFactory__factory,
  INonfungiblePositionManager__factory,
  IPool__factory,
  IVenusComptroller,
} from "../../typechain";

import { chainIdToAddresses } from "../../scripts/networkVariables";

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
  let borrowManager: BorrowManager;
  let tokenBalanceLibrary: TokenBalanceLibrary;
  let depositBatch: DepositBatchExternalPositions;
  let depositBatch2: DepositBatch;
  let depositManager: DepositManagerExternalPositions;
  let withdrawBatch: WithdrawBatchExternalPositions;
  let withdrawManager: WithdrawManagerExternalPositions;
  let portfolioContract: Portfolio;
  let portfolioFactory: PortfolioFactory;
  let swapHandler: UniswapV2Handler;
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
  let positionWrapper3: any;
  let nonOwner: SignerWithAddress;
  let depositor1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addrs: SignerWithAddress[];
  let feeModule0: FeeModule;

  let zeroAddress: any;

  let amountCalculationsAlgebra: AmountCalculationsAlgebra;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  let positionWrappers: any = [];
  let swapTokens: any = [];
  let positionWrapperIndex: any = [];
  let portfolioTokenIndex: any = [];
  let isExternalPosition: any = [];
  let isTokenExternalPosition: any = [];
  let index0: any = [];
  let index1: any = [];

  let position1: any;
  let position2: any;
  let position3: any;

  /// @dev The minimum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**-128
  const MIN_TICK = -887220;
  /// @dev The maximum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**128
  const MAX_TICK = 887220;

  zeroAddress = "0x0000000000000000000000000000000000000000";

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

      const DepositBatch2 = await ethers.getContractFactory("DepositBatch");
      depositBatch2 = await DepositBatch2.deploy();
      await depositBatch2.deployed();

      const WithdrawBatch = await ethers.getContractFactory(
        "WithdrawBatchExternalPositions"
      );
      withdrawBatch = await WithdrawBatch.deploy();
      await withdrawBatch.deployed();

      const WithdrawManager = await ethers.getContractFactory(
        "WithdrawManagerExternalPositions"
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

      const chainLinkOracle = "0x1B2103441A0A108daD8848D8F5d790e4D402921F";

      let oracle = new ethers.Contract(
        chainLinkOracle,
        VENUS_CHAINLINK_ORACLE_ABI,
        owner.provider
      );

      let oracleOwner = await oracle.owner();

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [oracleOwner],
      });
      const oracleSigner = await ethers.getSigner(oracleOwner);

      const tx = await oracle.connect(oracleSigner).setTokenConfigs([
        {
          asset: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
          feed: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
          maxStalePeriod: "31536000",
        },
        {
          asset: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
          feed: "0x132d3C0B1D2cEa0BC552588063bdBb210FDeecfA",
          maxStalePeriod: "31536000",
        },
        {
          asset: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
          feed: "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf",
          maxStalePeriod: "31536000",
        },
      ]);
      await tx.wait();

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

      const Portfolio = await ethers.getContractFactory("Portfolio", {
        libraries: {
          TokenBalanceLibrary: tokenBalanceLibrary.address,
        },
      });
      portfolioContract = await Portfolio.deploy();
      await portfolioContract.deployed();

      const VenusAssetHandler = await ethers.getContractFactory(
        "VenusAssetHandler"
      );
      venusAssetHandler = await VenusAssetHandler.deploy();
      await venusAssetHandler.deployed();

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
        addresses.DOT,
        addresses.vBTC_Address,
        addresses.vETH_Address,
      ];

      let whitelist = [owner.address];

      const SwapVerificationLibrary = await ethers.getContractFactory(
        "SwapVerificationLibraryAlgebra"
      );
      const swapVerificationLibrary = await SwapVerificationLibrary.deploy();
      await swapVerificationLibrary.deployed();

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
      it("should create new position", async () => {
        // UniswapV3 position
        const token0 = iaddress.ethAddress;
        const token1 = iaddress.btcAddress;

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

      it("should create new position", async () => {
        // UniswapV3 position
        const token0 = iaddress.btcAddress;
        const token1 = iaddress.ethAddress;

        await positionManager.createNewWrapperPosition(
          token0,
          token1,
          "Test",
          "t",
          MIN_TICK,
          MAX_TICK
        );

        position2 = await positionManager.deployedPositionWrappers(1);

        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        positionWrapper2 = PositionWrapper.attach(position2);
      });

      it("should init tokens", async () => {
        await portfolio.initToken([
          iaddress.usdcAddress,
          position2,
          iaddress.dogeAddress,
          iaddress.btcAddress,
          position1,
        ]);

        positionWrappers = [position2, position1];
        swapTokens = [
          iaddress.usdcAddress,
          await positionWrapper2.token0(), // position2 - token0
          await positionWrapper2.token1(), // position2 - token1
          iaddress.dogeAddress,
          iaddress.btcAddress,
          await positionWrapper.token0(), // position1 - token0
          await positionWrapper.token1(), // position1 - token1
        ];
        positionWrapperIndex = [1, 4];
        portfolioTokenIndex = [0, 1, 1, 2, 3, 4, 4];
        isExternalPosition = [false, true, true, false, false, true, true];
        isTokenExternalPosition = [false, true, false, false, true];
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

        let balanceBeforeETH = await owner.getBalance();

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
            _amount0Min: [1, 1],
            _amount1Min: [1, 1],
            _isExternalPosition: isExternalPosition,
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
            _deployer: zeroAddress,
          },
          {
            value: "1000000000000000000",
          }
        );

        let balanceAfterETH = await owner.getBalance();

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(owner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));

        await calculateOutputAmounts(position1, "10000");

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("user should invest (investment token equals one portfolio token)", async () => {
        let tokens = await portfolio.getTokens();

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokenToSwap = iaddress.ethAddress;

        await swapHandler.swapETHToTokens("800", tokenToSwap, owner.address, {
          value: "1000000000000000000",
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

        await ERC20.attach(tokenToSwap).approve(depositManager.address, 0);
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
            _amount0Min: [1, 1],
            _amount1Min: [1, 1],
            _isExternalPosition: isExternalPosition,
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
            _deployer: zeroAddress,
          }
        );

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(owner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));
        await calculateOutputAmounts(position1, "10000");

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("user should invest", async () => {
        let tokens = await portfolio.getTokens();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokenToSwap = iaddress.usdcAddress;

        await swapHandler.swapETHToTokens("500", tokenToSwap, owner.address, {
          value: "3000000000000000000",
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
            _amount0Min: [1, 1],
            _amount1Min: [1, 1],
            _isExternalPosition: isExternalPosition,
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
            _deployer: zeroAddress,
          }
        );

        console.log("SupplyAfter", await portfolio.totalSupply());

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(owner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));
        await calculateOutputAmounts(position1, "10000");
      });

      it("should rebalance to lending token vBNB", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[3];
        let buyToken = addresses.vBNB_Address;

        let newTokens = [tokens[0], tokens[1], tokens[2], buyToken, tokens[4]];

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
            "bytes[][]", // callDataEnso
            "bytes[]", // callDataDecreaseLiquidity
            "bytes[][]", // callDataIncreaseLiquidity
            "address[][]", // increaseLiquidityTarget
            "address[]", // underlyingTokensDecreaseLiquidity
            "address[]", // tokensIn
            "address[]", // tokens
            "uint256[]", // minExpectedOutputAmounts
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

      it("should borrow USDT using vBNB as collateral", async () => {
        console.log("newtokens", await portfolio.getTokens());
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let vault = await portfolio.vault();
        console.log(
          "USDT Balance before",
          await ERC20.attach(addresses.USDT).balanceOf(vault)
        );

        await rebalancing.borrow(
          addresses.vUSDT_Address,
          [addresses.vBNB_Address],
          addresses.USDT,
          addresses.corePool_controller,
          "5000000000000000000"
        );
        console.log(
          "USDT Balance after",
          await ERC20.attach(addresses.USDT).balanceOf(vault)
        );
      });

      it("should borrow DAI using vBNB as collateral", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let vault = await portfolio.vault();
        console.log(
          "DAI Balance before",
          await ERC20.attach(addresses.DAI_Address).balanceOf(vault)
        );

        await rebalancing.borrow(
          addresses.vDAI_Address,
          [addresses.vBNB_Address],
          addresses.DAI_Address,
          addresses.corePool_controller,
          "5000000000000000000"
        );
        console.log(
          "DAI Balance after",
          await ERC20.attach(addresses.DAI_Address).balanceOf(vault)
        );

        console.log("newtokens", await portfolio.getTokens());
      });

      it("Create a new position wrapper", async () => {
        // UniswapV3 position
        const token0 = iaddress.usdcAddress;
        const token1 = iaddress.usdtAddress;

        await positionManager.createNewWrapperPosition(
          token0,
          token1,
          "Test",
          "t",
          MIN_TICK,
          MAX_TICK
        );

        position3 = await positionManager.deployedPositionWrappers(2);

        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        positionWrapper3 = PositionWrapper.attach(position3);
      });

      it("should rebalance from a ERC20 token to a position wrapper token", async () => {
        // initialized tokens

        let tokens = await portfolio.getTokens();
        let sellToken = iaddress.usdtAddress;
        let buyToken = position3;

        let addedPosition = positionWrapper3;

        let token0 = await addedPosition.token0();
        let token1 = await addedPosition.token1();

        let newTokens = [
          tokens[0],
          tokens[1], // position1
          tokens[2],
          tokens[3], //position2
          tokens[4],
          buyToken,
          tokens[6],
        ];

        positionWrappers = [position1, position2, buyToken];
        swapTokens = [
          iaddress.usdcAddress,
          await positionWrapper2.token0(), // position2 - token0
          await positionWrapper2.token1(), // position2 - token1
          iaddress.dogeAddress,
          addresses.vBNB_Address,
          await positionWrapper.token0(), // position1 - token0
          await positionWrapper.token1(), // position1 - token1
          token0,
          token1,
          addresses.DAI_Address,
        ];
        positionWrapperIndex = [1, 4, 5];
        portfolioTokenIndex = [0, 1, 1, 2, 3, 4, 4, 5, 5, 6];
        isExternalPosition = [
          false,
          true,
          true,
          false,
          false,
          true,
          true,
          true,
          true,
          false,
        ];
        isTokenExternalPosition = [
          false,
          true,
          false,
          false,
          true,
          true,
          false,
        ];
        index0 = [1, 5, 7];
        index1 = [2, 6, 8];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let sellTokenBalance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        let depositAmounts = await calculateDepositAmounts(
          buyToken,
          MIN_TICK,
          MAX_TICK,
          sellTokenBalance
        );

        let callDataEnso: any = [[]];
        if (sellToken != token0) {
          let swapAmount = depositAmounts.amount0;
          const postResponse0 = await createEnsoCallDataRoute(
            ensoHandler.address,
            ensoHandler.address,
            sellToken,
            token0,
            swapAmount
          );
          callDataEnso[0].push(postResponse0.data.tx.data);
        }

        if (sellToken != token1) {
          let swapAmount = depositAmounts.amount1;

          const postResponse1 = await createEnsoCallDataRoute(
            ensoHandler.address,
            ensoHandler.address,
            sellToken,
            token1,
            swapAmount
          );
          callDataEnso[0].push(postResponse1.data.tx.data);
        }

        const callDataIncreaseLiquidity: any = [[]];
        // Encode the function call
        let ABIApprove = ["function approve(address spender, uint256 amount)"];
        let abiEncodeApprove = new ethers.utils.Interface(ABIApprove);
        callDataIncreaseLiquidity[0][0] = abiEncodeApprove.encodeFunctionData(
          "approve",
          [positionManager.address, sellTokenBalance]
        );

        callDataIncreaseLiquidity[0][1] = abiEncodeApprove.encodeFunctionData(
          "approve",
          [positionManager.address, sellTokenBalance]
        );

        // Define the ABI with the correct structure of WrapperDepositParams
        let ABI = [
          "function initializePositionAndDeposit(address _dustReceiver, address _positionWrapper, (uint256 _amount0Desired, uint256 _amount1Desired, uint256 _amount0Min, uint256 _amount1Min) params)",
        ];

        let abiEncode = new ethers.utils.Interface(ABI);

        // Encode the initializePositionAndDeposit function call
        callDataIncreaseLiquidity[0][2] = abiEncode.encodeFunctionData(
          "initializePositionAndDeposit",
          [
            owner.address, // _dustReceiver
            buyToken, // _positionWrapper
            {
              _amount0Desired: (depositAmounts.amount0 * 0.9995).toFixed(0),
              _amount1Desired: (depositAmounts.amount1 * 0.9995).toFixed(0),
              _amount0Min: 0,
              _amount1Min: 0,
            },
          ]
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
            callDataEnso,
            [],
            callDataIncreaseLiquidity,
            [[token0, token1, positionManager.address]],
            [],
            [sellToken],
            [buyToken],
            [0],
          ]
        );

        await rebalancing.updateTokens({
          _newTokens: newTokens,
          _sellTokens: [sellToken],
          _sellAmounts: [sellTokenBalance],
          _handler: ensoHandler.address,
          _callData: encodedParameters,
        });
      });

      it("should rebalance dai to vBNB", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[6];
        let buyToken = addresses.vBNB_Address;

        let newTokens = [
          tokens[0],
          tokens[1],
          tokens[2],
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

      it("should repay borrowed dai using flashloan", async () => {
        let vault = await portfolio.vault();
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        let flashloanBufferUnit = 23; //Flashloan buffer unit in 1/10000
        let bufferUnit = 160; //Buffer unit for collateral amount in 1/100000

        let balanceBorrowed =
          await portfolioCalculations.getVenusTokenBorrowedBalance(
            [addresses.vDAI_Address],
            vault
          );
        const userData = await venusAssetHandler.getUserAccountData(
          vault,
          addresses.corePool_controller
        );
        const lendTokens = userData[1].lendTokens;

        console.log("balanceBorrowed before repay", balanceBorrowed);

        const balanceToRepay = balanceBorrowed[0].toString();

        const balanceToSwap = (
          await portfolioCalculations.calculateFlashLoanAmountForRepayment(
            addresses.vDAI_Address,
            addresses.vUSDT_Address,
            addresses.corePool_controller,
            balanceToRepay,
            flashloanBufferUnit
          )
        ).toString();

        console.log("balanceToRepay", balanceToRepay);
        console.log("balanceToSwap", balanceToSwap);

        const postResponse = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          addresses.USDT,
          addresses.DAI_Address,
          balanceToSwap
        );

        const encodedParameters = ethers.utils.defaultAbiCoder.encode(
          ["bytes[]", "address[]", "uint256[]"],
          [[postResponse.data.tx.data], [addresses.DAI_Address], [0]]
        );

        let encodedParameters1 = [];
        //Because repay(rebalance) is one borrow token at a time
        const amounToSell =
          await portfolioCalculations.getCollateralAmountToSell(
            vault,
            addresses.corePool_controller,
            venusAssetHandler.address,
            addresses.vDAI_Address,
            balanceToRepay,
            "10", //Flash loan fee
            bufferUnit //Buffer unit for collateral amount
          );
        console.log("amounToSell", amounToSell);
        console.log("lendTokens", lendTokens);

        for (let j = 0; j < lendTokens.length; j++) {
          const postResponse1 = await createEnsoCallDataRoute(
            ensoHandler.address,
            ensoHandler.address,
            lendTokens[j],
            addresses.USDT,
            amounToSell[j].toString() //Need calculation here
          );

          encodedParameters1.push(
            ethers.utils.defaultAbiCoder.encode(
              ["bytes[]", "address[]", "uint256[]"],
              [[postResponse1.data.tx.data], [addresses.USDT], [0]]
            )
          );
        }

        await rebalancing.repay(addresses.corePool_controller, {
          _factory: addresses.thena_factory,
          _token0: addresses.USDT, //USDT - Pool token
          _token1: addresses.USDC_Address, //USDC - Pool token
          _flashLoanToken: addresses.USDT, //Token to take flashlaon
          _debtToken: [addresses.DAI_Address], //Token to pay debt of
          _protocolToken: [addresses.vDAI_Address], // lending token in case of venus
          _bufferUnit: bufferUnit, //Buffer unit for collateral amount
          _solverHandler: ensoHandler.address, //Handler to swap
          _flashLoanAmount: [balanceToSwap],
          _debtRepayAmount: [balanceToRepay],
          firstSwapData: [encodedParameters],
          secondSwapData: encodedParameters1,
          isMaxRepayment: false,
        });

        console.log(
          "Balance of vToken After",
          await ERC20.attach(addresses.vBNB_Address).balanceOf(vault)
        );

        balanceBorrowed =
          await portfolioCalculations.getVenusTokenBorrowedBalance(
            [addresses.vUSDT_Address],
            vault
          );

        console.log("balanceBorrowed after repay", balanceBorrowed);
      });
    });
  });
});
