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
  let depositManager: DepositManagerExternalPositions;
  let withdrawBatch: WithdrawBatchExternalPositions;
  let withdrawManager: WithdrawManagerExternalPositions;
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
  let swapVerificationLibrary: any;

  let zeroAddress: any;

  let amountCalculationsAlgebra: AmountCalculationsAlgebra;

  const assetManagerHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("ASSET_MANAGER")
  );

  const thenaProtocolHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("THENA-CONCENTRATED-LIQUIDITY")
  );

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
        [treasury.address, priceOracle.address],
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

      await protocolConfig.enableProtocol(
        thenaProtocolHash,
        "0xa51adb08cbe6ae398046a23bec013979816b77ab",
        "0x327dd3208f0bcf590a66110acb6e5e6941a4efa0",
        positionWrapperBaseAddress.address
      );

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
      const PancakeSwapHandler = await ethers.getContractFactory(
        "UniswapV2Handler"
      );
      swapHandler = await PancakeSwapHandler.deploy();
      await swapHandler.deployed();

      swapHandler.init(addresses.PancakeSwapRouterAddress);

      await protocolConfig.setSupportedFactory(addresses.thena_factory);

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

      const ExternalPositionStorage = await ethers.getContractFactory(
        "ExternalPositionStorage"
      );
      const externalPositionStorage = await ExternalPositionStorage.deploy();
      await externalPositionStorage.deployed();

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
            _baseExternalPositionStorage: externalPositionStorage.address,
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
          _witelistedProtocolIds: [thenaProtocolHash],
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
          _witelistedProtocolIds: [thenaProtocolHash],
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

      await assetManagementConfig.enableUniSwapV3Manager(thenaProtocolHash);

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
            _amount0Min: [0, 0],
            _amount1Min: [0, 0],
            _isExternalPosition: isExternalPosition,
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
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
            _amount0Min: [0, 0],
            _amount1Min: [0, 0],
            _isExternalPosition: isExternalPosition,
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
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
            _amount0Min: [0, 0],
            _amount1Min: [0, 0],
            _isExternalPosition: isExternalPosition,
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
          }
        );

        console.log("SupplyAfter", await portfolio.totalSupply());

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(owner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));
        await calculateOutputAmounts(position1, "10000");
      });

      it("should rebalance from a position wrapper token to a ERC20 token", async () => {
        // initialized tokens

        let tokens = await portfolio.getTokens();
        let sellToken = position1;
        let buyToken = iaddress.usdtAddress;

        let removedPosition = positionWrapper;

        let token0 = await removedPosition.token0();
        let token1 = await removedPosition.token1();

        let newTokens = [
          iaddress.usdcAddress,
          position2,
          iaddress.dogeAddress,
          iaddress.btcAddress,
          buyToken,
        ];

        positionWrappers = [position2];
        swapTokens = [
          iaddress.usdcAddress,
          await positionWrapper2.token0(), // position2 - token0
          await positionWrapper2.token1(), // position2 - token1
          iaddress.dogeAddress,
          iaddress.btcAddress,
          iaddress.usdtAddress,
        ];
        positionWrapperIndex = [1];
        portfolioTokenIndex = [0, 1, 1, 2, 3, 4];
        isExternalPosition = [false, true, true, false, false, false];
        isTokenExternalPosition = [false, true, false, false, false];
        index0 = [1];
        index1 = [2];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let sellTokenBalance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        // get underlying amounts of position
        let percentage = await amountCalculationsAlgebra.getPercentage(
          sellTokenBalance,
          await removedPosition.totalSupply()
        );

        let withdrawAmounts = await calculateOutputAmounts(
          sellToken,
          percentage.toString()
        );

        let swapAmounts: any = [[]];
        if (withdrawAmounts.token0Amount > 0) {
          swapAmounts[0][0] = (withdrawAmounts.token0Amount * 0.99999).toFixed(
            0
          );
        }

        if (withdrawAmounts.token1Amount > 0) {
          swapAmounts[0][1] = (withdrawAmounts.token1Amount * 0.99999).toFixed(
            0
          );
        }

        const postResponse0 = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          token0,
          buyToken,
          swapAmounts[0][0]
        );

        const postResponse1 = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          token1,
          buyToken,
          swapAmounts[0][1]
        );

        let callDataEnso: any = [[]];
        callDataEnso[0][0] = postResponse0.data.tx.data;
        callDataEnso[0][1] = postResponse1.data.tx.data;

        const callDataDecreaseLiquidity: any = [];
        // Encode the function call
        let ABI = [
          "function decreaseLiquidity(address _positionWrapper, uint256 _withdrawalAmount, uint256 _amount0Min, uint256 _amount1Min, address tokenIn, address tokenOut, uint256 amountIn)",
        ];
        let abiEncode = new ethers.utils.Interface(ABI);
        callDataDecreaseLiquidity[0] = abiEncode.encodeFunctionData(
          "decreaseLiquidity",
          [sellToken, sellTokenBalance, 0, 0, token0, token1, 0]
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
            callDataDecreaseLiquidity,
            [[]],
            [[]],
            [await removedPosition.token0(), await removedPosition.token1()],
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
          iaddress.usdcAddress,
          position2,
          iaddress.dogeAddress,
          iaddress.btcAddress,
          buyToken,
        ];

        positionWrappers = [position2, buyToken];
        swapTokens = [
          iaddress.usdcAddress,
          await positionWrapper2.token0(), // position2 - token0
          await positionWrapper2.token1(), // position2 - token1
          iaddress.dogeAddress,
          iaddress.btcAddress,
          await addedPosition.token0(), // position1 - token0
          await addedPosition.token1(), // position1 - token1
        ];
        positionWrapperIndex = [1, 4];
        portfolioTokenIndex = [0, 1, 1, 2, 3, 4, 4];
        isExternalPosition = [false, true, true, false, false, true, true];
        isTokenExternalPosition = [false, true, false, false, true];
        index0 = [1, 5];
        index1 = [2, 6];

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
              _amount0Desired: (depositAmounts.amount0 * 0.999).toFixed(0),
              _amount1Desired: (depositAmounts.amount1 * 0.999).toFixed(0),
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

      it("should withdraw in single token by user in native token", async () => {
        await ethers.provider.send("evm_increaseTime", [62]);

        const supplyBefore = await portfolio.totalSupply();
        const user = owner;
        const tokenToSwapInto = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

        let responses = [];

        const amountPortfolioToken = BigNumber.from(
          await portfolio.balanceOf(user.address)
        ).div(2);

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const balanceBefore = await provider.getBalance(user.address);
        const tokens = await portfolio.getTokens();

        let withdrawalAmounts =
          await portfolioCalculations.getWithdrawalAmounts(
            amountPortfolioToken,
            portfolio.address
          );

        let swapAmounts = [];
        let wrapperIndex = 0;
        for (let i = 0; i < tokens.length; i++) {
          // only push one amount
          if (!isTokenExternalPosition[i]) {
            swapAmounts.push(withdrawalAmounts[i]);
          } else {
            const PositionWrapper = await ethers.getContractFactory(
              "PositionWrapper"
            );
            const positionWrapperCurrent = PositionWrapper.attach(
              positionWrappers[wrapperIndex]
            );
            let percentage = await amountCalculationsAlgebra.getPercentage(
              withdrawalAmounts[i],
              await positionWrapperCurrent.totalSupply()
            );

            let withdrawAmounts = await calculateOutputAmounts(
              tokens[i],
              percentage.toString()
            );
            if (withdrawAmounts.token0Amount > 0) {
              swapAmounts.push(
                (withdrawAmounts.token0Amount * 0.99999).toFixed(0)
              );
            }
            if (withdrawAmounts.token1Amount > 0) {
              swapAmounts.push(
                (withdrawAmounts.token1Amount * 0.99999).toFixed(0)
              );
            }
            wrapperIndex++;
          }
        }

        await portfolio.approve(
          withdrawManager.address,
          BigNumber.from(amountPortfolioToken)
        );

        for (let i = 0; i < swapTokens.length; i++) {
          if (swapTokens[i] == tokenToSwapInto) {
            responses.push("0x");
          } else {
            let response = await createEnsoCallDataRoute(
              withdrawBatch.address,
              user.address,
              swapTokens[i],
              tokenToSwapInto,
              (swapAmounts[i] * 0.99999).toFixed(0)
            );
            responses.push(response.data.tx.data);
          }
        }

        let balanceBeforeETH = await owner.getBalance();

        /*
    FunctionParameters.withdrawRepayParams calldata repayData,
    FunctionParameters.ExternalPositionWithdrawParams memory _params*/

        await withdrawManager.withdraw(
          swapTokens,
          portfolio.address,
          tokenToSwapInto,
          amountPortfolioToken,
          responses,
          0,
          {
            _factory: addresses.thena_factory,
            _token0: zeroAddress,
            _token1: zeroAddress,
            _flashLoanToken: zeroAddress,
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address,
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          },
          {
            _positionWrappers: positionWrappers,
            _amountsMin0: [0, 0],
            _amountsMin1: [0, 0],
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
          }
        );

        let balanceAfterETH = await owner.getBalance();

        const supplyAfter = await portfolio.totalSupply();

        const balanceAfter = await provider.getBalance(user.address);

        expect(Number(balanceAfter)).to.be.greaterThan(Number(balanceBefore));
        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
      });

      it("should withdraw in single token by user in native token", async () => {
        await ethers.provider.send("evm_increaseTime", [62]);

        const supplyBefore = await portfolio.totalSupply();
        const user = owner;
        const tokenToSwapInto = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

        let responses = [];

        const amountPortfolioToken = BigNumber.from(
          await portfolio.balanceOf(user.address)
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const balanceBefore = await provider.getBalance(user.address);
        const tokens = await portfolio.getTokens();

        let withdrawalAmounts =
          await portfolioCalculations.getWithdrawalAmounts(
            amountPortfolioToken,
            portfolio.address
          );

        let swapAmounts = [];
        let wrapperIndex = 0;
        for (let i = 0; i < tokens.length; i++) {
          // only push one amount
          if (!isTokenExternalPosition[i]) {
            swapAmounts.push(withdrawalAmounts[i]);
          } else {
            const PositionWrapper = await ethers.getContractFactory(
              "PositionWrapper"
            );
            const positionWrapperCurrent = PositionWrapper.attach(
              positionWrappers[wrapperIndex]
            );
            let percentage = await amountCalculationsAlgebra.getPercentage(
              withdrawalAmounts[i],
              await positionWrapperCurrent.totalSupply()
            );

            let withdrawAmounts = await calculateOutputAmounts(
              tokens[i],
              percentage.toString()
            );
            if (withdrawAmounts.token0Amount > 0) {
              swapAmounts.push(
                (withdrawAmounts.token0Amount * 0.99999).toFixed(0)
              );
            }
            if (withdrawAmounts.token1Amount > 0) {
              swapAmounts.push(
                (withdrawAmounts.token1Amount * 0.99999).toFixed(0)
              );
            }
            wrapperIndex++;
          }
        }

        await portfolio.approve(
          withdrawManager.address,
          BigNumber.from(amountPortfolioToken)
        );

        for (let i = 0; i < swapTokens.length; i++) {
          if (swapTokens[i] == tokenToSwapInto) {
            responses.push("0x");
          } else {
            let response = await createEnsoCallDataRoute(
              withdrawBatch.address,
              user.address,
              swapTokens[i],
              tokenToSwapInto,
              (swapAmounts[i] * 0.99999).toFixed(0)
            );
            responses.push(response.data.tx.data);
          }
        }

        let balanceBeforeETH = await owner.getBalance();

        await withdrawManager.withdraw(
          swapTokens,
          portfolio.address,
          tokenToSwapInto,
          amountPortfolioToken,
          responses,
          0,
          {
            _factory: addresses.thena_factory,
            _token0: zeroAddress,
            _token1: zeroAddress,
            _flashLoanToken: zeroAddress,
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address,
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          },
          {
            _positionWrappers: positionWrappers,
            _amountsMin0: [0, 0],
            _amountsMin1: [0, 0],
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
          }
        );

        let balanceAfterETH = await owner.getBalance();

        const supplyAfter = await portfolio.totalSupply();

        const balanceAfter = await provider.getBalance(user.address);

        expect(Number(balanceAfter)).to.be.greaterThan(Number(balanceBefore));
        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
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

        let balanceBefore = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address
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
          }
        );

        let balanceAfter = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address
        );
        console.log(
          "Balance Difference",
          Number(BigNumber.from(balanceBefore)) -
            Number(BigNumber.from(balanceAfter))
        );

        console.log("SupplyAfter", await portfolio.totalSupply());

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(owner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));
        await calculateOutputAmounts(position1, "10000");
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

        let balanceBefore = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address
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
          }
        );

        let balanceAfter = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address
        );
        console.log(
          "Balance Difference",
          Number(BigNumber.from(balanceBefore)) -
            Number(BigNumber.from(balanceAfter))
        );

        console.log("SupplyAfter", await portfolio.totalSupply());

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(owner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));
        await calculateOutputAmounts(position1, "10000");
      });

      it("should withdraw in single token by user in native token", async () => {
        await ethers.provider.send("evm_increaseTime", [62]);

        const supplyBefore = await portfolio.totalSupply();
        const user = owner;
        const tokenToSwapInto = iaddress.usdcAddress;

        let responses = [];

        const amountPortfolioToken = BigNumber.from(
          await portfolio.balanceOf(user.address)
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const balanceBefore = await provider.getBalance(user.address);
        const tokens = await portfolio.getTokens();

        let withdrawalAmounts =
          await portfolioCalculations.getWithdrawalAmounts(
            amountPortfolioToken,
            portfolio.address
          );

        let swapAmounts = [];
        let wrapperIndex = 0;
        for (let i = 0; i < tokens.length; i++) {
          // only push one amount
          if (!isTokenExternalPosition[i]) {
            swapAmounts.push(withdrawalAmounts[i]);
          } else {
            const PositionWrapper = await ethers.getContractFactory(
              "PositionWrapper"
            );
            const positionWrapperCurrent = PositionWrapper.attach(
              positionWrappers[wrapperIndex]
            );
            let percentage = await amountCalculationsAlgebra.getPercentage(
              withdrawalAmounts[i],
              await positionWrapperCurrent.totalSupply()
            );

            let withdrawAmounts = await calculateOutputAmounts(
              tokens[i],
              percentage.toString()
            );
            swapAmounts.push(
              (withdrawAmounts.token0Amount * 0.99999).toFixed(0)
            );
            swapAmounts.push(
              (withdrawAmounts.token1Amount * 0.99999).toFixed(0)
            );
            wrapperIndex++;
          }
        }

        await portfolio.approve(
          withdrawManager.address,
          BigNumber.from(amountPortfolioToken)
        );

        for (let i = 0; i < swapTokens.length; i++) {
          if (swapTokens[i] == tokenToSwapInto) {
            responses.push("0x");
          } else {
            let response = await createEnsoCallDataRoute(
              withdrawBatch.address,
              user.address,
              swapTokens[i],
              tokenToSwapInto,
              (swapAmounts[i] * 0.99999).toFixed(0)
            );
            responses.push(response.data.tx.data);
          }
        }

        let balanceBeforeETH = await owner.getBalance();

        let balanceBeforeI = await ERC20.attach(tokenToSwapInto).balanceOf(
          owner.address
        );

        await withdrawManager.withdraw(
          swapTokens,
          portfolio.address,
          tokenToSwapInto,
          amountPortfolioToken,
          responses,
          0,
          {
            _factory: addresses.thena_factory,
            _token0: zeroAddress,
            _token1: zeroAddress,
            _flashLoanToken: zeroAddress,
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address,
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          },
          {
            _positionWrappers: positionWrappers,
            _amountsMin0: [0, 0],
            _amountsMin1: [0, 0],
            _tokenIn: [ZERO_ADDRESS, ZERO_ADDRESS],
            _tokenOut: [ZERO_ADDRESS, ZERO_ADDRESS],
            _amountIn: ["0", "0"],
          }
        );

        let balanceAfterETH = await owner.getBalance();

        let balanceAfterI = await ERC20.attach(tokenToSwapInto).balanceOf(
          owner.address
        );
        console.log(
          "Balance Difference",
          Number(BigNumber.from(balanceAfterI)) -
            Number(BigNumber.from(balanceBeforeI))
        );

        const supplyAfter = await portfolio.totalSupply();

        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
      });
    });
  });
});
