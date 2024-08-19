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
} from "@uniswap/Permit2-sdk";

import {
  calcuateExpectedMintAmount,
  createEnsoDataElement,
} from "../calculations/DepositCalculations.test";

import {
  createEnsoCallData,
  createEnsoCallDataRoute,
  calculateOutputAmounts,
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
  WithdrawBatchExternalPositions,
  WithdrawManagerExternalPositions,
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
  const assetManagerHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("ASSET_MANAGER"),
  );

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

      iaddress = await tokenAddresses();

      const EnsoHandler = await ethers.getContractFactory("EnsoHandler");
      ensoHandler = await EnsoHandler.deploy();
      await ensoHandler.deployed();

      const DepositBatch = await ethers.getContractFactory(
        "DepositBatchExternalPositions",
      );
      depositBatch = await DepositBatch.deploy();
      await depositBatch.deployed();

      const DepositManager = await ethers.getContractFactory(
        "DepositManagerExternalPositions",
      );
      depositManager = await DepositManager.deploy(depositBatch.address);
      await depositManager.deployed();

      const WithdrawBatch = await ethers.getContractFactory(
        "WithdrawBatchExternalPositions",
      );
      withdrawBatch = await WithdrawBatch.deploy();
      await withdrawBatch.deployed();

      const WithdrawManager = await ethers.getContractFactory(
        "WithdrawManagerExternalPositions",
      );
      withdrawManager = await WithdrawManager.deploy();
      await withdrawManager.deployed();

      const PositionWrapper = await ethers.getContractFactory(
        "PositionWrapper",
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
        { kind: "uups" },
      );

      protocolConfig = ProtocolConfig.attach(_protocolConfig.address);
      await protocolConfig.setCoolDownPeriod("70");
      await protocolConfig.enableSolverHandler(ensoHandler.address);

      const Rebalancing = await ethers.getContractFactory("Rebalancing");
      const rebalancingDefult = await Rebalancing.deploy();
      await rebalancingDefult.deployed();

      const AssetManagementConfig = await ethers.getContractFactory(
        "AssetManagementConfig",
      );
      const assetManagementConfigBase = await AssetManagementConfig.deploy();
      await assetManagementConfigBase.deployed();

      const TokenExclusionManager = await ethers.getContractFactory(
        "TokenExclusionManager",
      );
      const tokenExclusionManagerDefault = await TokenExclusionManager.deploy();
      await tokenExclusionManagerDefault.deployed();

      const Portfolio = await ethers.getContractFactory("Portfolio");
      portfolioContract = await Portfolio.deploy();
      await portfolioContract.deployed();
      const PancakeSwapHandler = await ethers.getContractFactory(
        "UniswapV2Handler",
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
        addresses.DOT,
        addresses.vBTC_Address,
        addresses.vETH_Address,
      ];

      let whitelist = [owner.address];

      const PositionManager = await ethers.getContractFactory(
        "PositionManagerThena",
      );
      const positionManagerBaseAddress = await PositionManager.deploy();
      await positionManagerBaseAddress.deployed();

      const FeeModule = await ethers.getContractFactory("FeeModule");
      const feeModule = await FeeModule.deploy();
      await feeModule.deployed();

      const TokenRemovalVault = await ethers.getContractFactory(
        "TokenRemovalVault",
      );
      const tokenRemovalVault = await TokenRemovalVault.deploy();
      await tokenRemovalVault.deployed();

      fakePortfolio = await Portfolio.deploy();
      await fakePortfolio.deployed();

      const VelvetSafeModule = await ethers.getContractFactory(
        "VelvetSafeModule",
      );
      velvetSafeModule = await VelvetSafeModule.deploy();
      await velvetSafeModule.deployed();

      const PortfolioFactory = await ethers.getContractFactory(
        "PortfolioFactory",
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
            _basePositionWrapper: positionWrapperBaseAddress.address,
            _gnosisSingleton: addresses.gnosisSingleton,
            _gnosisFallbackLibrary: addresses.gnosisFallbackLibrary,
            _gnosisMultisendLibrary: addresses.gnosisMultisendLibrary,
            _gnosisSafeProxyFactory: addresses.gnosisSafeProxyFactory,
            _protocolConfig: protocolConfig.address,
          },
        ],
        { kind: "uups" },
      );

      portfolioFactory = PortfolioFactory.attach(
        portfolioFactoryInstance.address,
      );

      await withdrawManager.initialize(
        withdrawBatch.address,
        portfolioFactory.address,
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
        portfolioAddress,
      );
      const PortfolioCalculations = await ethers.getContractFactory(
        "PortfolioCalculations",
      );
      feeModule0 = FeeModule.attach(await portfolio.feeModule());
      portfolioCalculations = await PortfolioCalculations.deploy();
      await portfolioCalculations.deployed();

      portfolio1 = await ethers.getContractAt(
        Portfolio__factory.abi,
        portfolioAddress1,
      );

      rebalancing = await ethers.getContractAt(
        Rebalancing__factory.abi,
        portfolioInfo.rebalancing,
      );

      rebalancing1 = await ethers.getContractAt(
        Rebalancing__factory.abi,
        portfolioInfo1.rebalancing,
      );

      tokenExclusionManager = await ethers.getContractAt(
        TokenExclusionManager__factory.abi,
        portfolioInfo.tokenExclusionManager,
      );

      tokenExclusionManager1 = await ethers.getContractAt(
        TokenExclusionManager__factory.abi,
        portfolioInfo1.tokenExclusionManager,
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
          MAX_TICK,
        );

        position1 = await positionManager.deployedPositionWrappers(0);

        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper",
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
          MAX_TICK,
        );

        position2 = await positionManager.deployedPositionWrappers(1);

        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper",
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
            "20000000000000000",
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
            _amount0Min: 1,
            _amount1Min: 1,
            _isExternalPosition: isExternalPosition,
          },
          {
            value: "1000000000000000000",
          },
        );

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(owner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));
        await calculateOutputAmounts(
          owner,
          portfolio.address,
          await portfolio.balanceOf(owner.address),
          position1,
          await positionWrapper.tokenId(),
          await positionWrapper.token0(),
          await positionWrapper.token1(),
          userShare,
        );

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      /* it("user should invest (investment token equals one portfolio token)", async () => {
        let tokens = await portfolio.getTokens();

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokenToSwap = iaddress.ethAddress;

        await swapHandler.swapETHToTokens("800", tokenToSwap, owner.address, {
          value: "1000000000000000000",
        });

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse = [];

        let amountToSwap = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address,
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
              Number(amountIn),
            );
            postResponse.push(response.data.tx.data);
          }
        }

        //----------Approval-------------

        await ERC20.attach(tokenToSwap).approve(depositManager.address, 0);
        await ERC20.attach(tokenToSwap).approve(
          depositManager.address,
          amountToSwap.toString(),
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
            _amount0Min: 1,
            _amount1Min: 1,
            _isExternalPosition: isExternalPosition,
          },
        );

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(owner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));
        await calculateOutputAmounts(
          owner,
          portfolio.address,
          await portfolio.balanceOf(owner.address),
          position1,
          await positionWrapper.tokenId(),
          await positionWrapper.token0(),
          await positionWrapper.token1(),
          userShare,
        );

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("user should invest", async () => {
        let tokens = await portfolio.getTokens();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS,
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokenToSwap = iaddress.usdcAddress;

        await swapHandler.swapETHToTokens("500", tokenToSwap, owner.address, {
          value: "3000000000000000000",
        });

        let amountToSwap = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address,
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
              Number(amountIn),
            );
            postResponse.push(response.data.tx.data);
          }
        }

        //----------Approval-------------

        await ERC20.attach(tokenToSwap).approve(
          depositManager.address,
          amountToSwap.toString(),
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
            _amount0Min: 1,
            _amount1Min: 1,
            _isExternalPosition: isExternalPosition,
          },
        );

        console.log("SupplyAfter", await portfolio.totalSupply());

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(owner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));
        await calculateOutputAmounts(
          owner,
          portfolio.address,
          await portfolio.balanceOf(owner.address),
          position1,
          await positionWrapper.tokenId(),
          await positionWrapper.token0(),
          await positionWrapper.token1(),
          userShare,
        );
      });*/

      it("should withdraw in single token by user in native token", async () => {
        await ethers.provider.send("evm_increaseTime", [62]);

        const supplyBefore = await portfolio.totalSupply();
        const user = owner;
        const tokenToSwapInto = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

        let responses = [];

        const amountPortfolioToken = BigNumber.from(
          await portfolio.balanceOf(user.address),
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const balanceBefore = await provider.getBalance(user.address);
        const tokens = await portfolio.getTokens();

        let withdrawalAmounts =
          await portfolioCalculations.getWithdrawalAmounts(
            amountPortfolioToken,
            portfolio.address,
          );

        let swapAmounts = [];
        let wrapperIndex = 0;
        for (let i = 0; i < tokens.length; i++) {
          // only push one amount
          if (!isTokenExternalPosition[i]) {
            swapAmounts.push(withdrawalAmounts[i]);
          } else {
            // push two amounts for uniswap v3 positions
            const userShare =
              Number(BigNumber.from(amountPortfolioToken)) /
              Number(BigNumber.from(await portfolio.totalSupply()));

            const PositionWrapper = await ethers.getContractFactory(
              "PositionWrapper",
            );
            const positionWrapperAddress = await tokens[
              positionWrapperIndex[wrapperIndex]
            ];
            const currentPosition = PositionWrapper.attach(
              positionWrapperAddress,
            );
            console.log("currentPosition", currentPosition.address);
            console.log(await currentPosition.tokenId());
            // todo take position from token i

            let results = await calculateOutputAmounts(
              owner,
              tokens[i],
              withdrawalAmounts[i],
              currentPosition,
              await currentPosition.tokenId(),
              await currentPosition.token0(),
              await currentPosition.token1(),
              userShare,
            );

            swapAmounts.push(results.token0Amount);
            swapAmounts.push(results.token1Amount);
            wrapperIndex++;
          }
        }

        console.log("swapAmounts", swapAmounts);

        await portfolio.approve(
          withdrawManager.address,
          BigNumber.from(amountPortfolioToken),
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
              (swapAmounts[i] * 0.9999999).toFixed(0),
            );
            responses.push(response.data.tx.data);
          }
        }

        await withdrawManager.withdraw(
          swapTokens,
          portfolio.address,
          tokenToSwapInto,
          amountPortfolioToken,
          responses,
          {
            _positionWrappers: positionWrappers,
            _amountsMin0: [0, 0],
            _amountsMin1: [0, 0],
          },
        );

        const supplyAfter = await portfolio.totalSupply();

        const balanceAfter = await provider.getBalance(user.address);

        expect(Number(balanceAfter)).to.be.greaterThan(Number(balanceBefore));
        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
      });
    });
  });
});