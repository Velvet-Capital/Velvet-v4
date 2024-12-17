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
  TokenBalanceLibrary,
  BorrowManagerVenus,
  WithdrawBatch,
  WithdrawManager,
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
  let depositBatch: DepositBatch;
  let depositManager: DepositManager;
  let withdrawBatch: WithdrawBatch;
  let withdrawManager: WithdrawManager;
  let portfolioContract: Portfolio;
  let portfolioFactory: PortfolioFactory;
  let borrowManager: BorrowManagerVenus;
  let tokenBalanceLibrary: TokenBalanceLibrary;
  let swapHandler: UniswapV2Handler;
  let rebalancing: any;
  let rebalancing1: any;
  let protocolConfig: ProtocolConfig;
  let fakePortfolio: Portfolio;
  let txObject;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let _assetManagerTreasury: SignerWithAddress;
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
      await protocolConfig.setCoolDownPeriod("70");
      await protocolConfig.enableSolverHandler(ensoHandler.address);

      const Rebalancing = await ethers.getContractFactory("Rebalancing");
      const rebalancingDefult = await Rebalancing.deploy();
      await rebalancingDefult.deployed();

      const AssetManagementConfig = await ethers.getContractFactory(
        "AssetManagementConfig"
      );
      const assetManagementConfig = await AssetManagementConfig.deploy();
      await assetManagementConfig.deployed();

      const BorrowManager = await ethers.getContractFactory("BorrowManagerVenus");
      borrowManager = await BorrowManager.deploy();
      await borrowManager.deployed();

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

      zeroAddress = "0x0000000000000000000000000000000000000000";

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

      console.log("portfolio deployed to:", portfolio.address);

      console.log("rebalancing:", rebalancing1.address);
    });

    describe("Deposit Tests", function () {
      it("should init tokens", async () => {
        await portfolio.initToken([
          iaddress.wbnbAddress,
          iaddress.btcAddress,
          iaddress.ethAddress,
          iaddress.dogeAddress,
          iaddress.usdcAddress,
          iaddress.cakeAddress,
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
            "2000000000000000"
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
            value: "1000000000000000000",
          }
        );

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("should swap tokens for user using one of the portfolio token", async () => {
        let tokens = await portfolio.getTokens();

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokenToSwap = iaddress.usdcAddress;

        await swapHandler.swapETHToTokens("500", tokenToSwap, owner.address, {
          value: "1000000000000000000",
        });

        let amountToSwap = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address
        );

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse = [];

        for (let i = 0; i < tokens.length; i++) {
          let amountIn = BigNumber.from(amountToSwap).div(tokens.length);

          if (tokenToSwap == tokens[i]) {
            const abiCoder = ethers.utils.defaultAbiCoder;
            const encodedata = abiCoder.encode(["uint"], [amountIn]);
            postResponse.push(encodedata);
          } else {
            let response = await createEnsoCallDataRoute(
              depositBatch.address,
              depositBatch.address,
              tokenToSwap,
              tokens[i],
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

        const data = await depositManager.deposit({
          _minMintAmount: 0,
          _depositAmount: amountToSwap.toString(),
          _target: portfolio.address,
          _depositToken: tokenToSwap,
          _callData: postResponse,
        });

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("should swap tokens for user using erc20 token other then portfolio token", async () => {
        let tokens = await portfolio.getTokens();

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokenToSwap = iaddress.linkAddress;

        await swapHandler.swapETHToTokens("500", tokenToSwap, owner.address, {
          value: "100000000000000000",
        });

        let amountToSwap = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address
        );

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse = [];

        for (let i = 0; i < tokens.length; i++) {
          let amountIn = BigNumber.from(amountToSwap).div(tokens.length);
          if (tokenToSwap == tokens[i]) {
            const abiCoder = ethers.utils.defaultAbiCoder;
            const encodedata = abiCoder.encode(["uint"], [amountIn]);
            postResponse.push(encodedata);
          } else {
            let response = await createEnsoCallDataRoute(
              depositBatch.address,
              depositBatch.address,
              tokenToSwap,
              tokens[i],
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

        const data = await depositManager.deposit({
          _minMintAmount: 0,
          _depositAmount: amountToSwap.toString(),
          _target: portfolio.address,
          _depositToken: tokenToSwap,
          _callData: postResponse,
        });

        console.log("SupplyAfter", await portfolio.totalSupply());
      });

      it("should revert if receiver in calldata is not token holder", async () => {
        await ethers.provider.send("evm_increaseTime", [62]);
        const supplyBefore = await portfolio.totalSupply();
        const user = owner;
        const tokenToSwapInto = iaddress.btcAddress;

        let responses = [];

        const amountPortfolioToken = await portfolio.balanceOf(user.address);

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokens = await portfolio.getTokens();

        let userBalanceBefore = [];

        let withdrawalAmounts =
          await portfolioCalculations.getWithdrawalAmounts(
            amountPortfolioToken.toString(),
            portfolio.address
          );

        await portfolio.approve(
          withdrawManager.address,
          BigNumber.from(amountPortfolioToken.toString())
        );

        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i] == tokenToSwapInto) {
            responses.push("0x");
          } else {
            let response = await createEnsoCallDataRoute(
              withdrawBatch.address,
              nonOwner.address,
              tokens[i],
              tokenToSwapInto,
              (withdrawalAmounts[i] * 0.9999999).toFixed(0)
            );
            responses.push(response.data.tx.data);
          }
          userBalanceBefore.push(
            await ERC20.attach(tokens[i]).balanceOf(user.address)
          );
        }

        await expect(
          withdrawManager.withdraw(
            portfolio.address,
            tokenToSwapInto,
            amountPortfolioToken,
            0,
            {
              _factory: addresses.thena_factory,
              _token0: zeroAddress, //USDT - Pool token
              _token1: zeroAddress, //USDC - Pool token
              _flashLoanToken: zeroAddress, //Token to take flashlaon
              _bufferUnit: "0",
              _solverHandler: ensoHandler.address, //Handler to swap
              _flashLoanAmount: [0],
              firstSwapData: ["0x"],
              secondSwapData: ["0x"],
            },
            responses
          )
        ).to.be.revertedWithCustomError(withdrawBatch, "InvalidBalanceDiff");
      });

      it("should revert if receiver in calldata is not token holder and tries to withdraw in native token", async () => {
        await ethers.provider.send("evm_increaseTime", [62]);
        const user = owner;
        const tokenToSwapInto = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

        let responses = [];

        const amountPortfolioToken = await portfolio.balanceOf(user.address);

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokens = await portfolio.getTokens();

        let userBalanceBefore = [];

        let withdrawalAmounts =
          await portfolioCalculations.getWithdrawalAmounts(
            amountPortfolioToken.toString(),
            portfolio.address
          );

        await portfolio.approve(
          withdrawManager.address,
          BigNumber.from(amountPortfolioToken.toString())
        );

        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i] == tokenToSwapInto) {
            responses.push("0x");
          } else {
            let response = await createEnsoCallDataRoute(
              withdrawBatch.address,
              nonOwner.address,
              tokens[i],
              tokenToSwapInto,
              (withdrawalAmounts[i] * 0.9999999).toFixed(0)
            );
            responses.push(response.data.tx.data);
          }
          userBalanceBefore.push(
            await ERC20.attach(tokens[i]).balanceOf(user.address)
          );
        }

        await expect(
          withdrawManager.withdraw(
            portfolio.address,
            tokenToSwapInto,
            amountPortfolioToken,
            0,
            {
              _factory: addresses.thena_factory,
              _token0: zeroAddress, //USDT - Pool token
              _token1: zeroAddress, //USDC - Pool token
              _flashLoanToken: zeroAddress, //Token to take flashlaon
              _bufferUnit: "0",
              _solverHandler: ensoHandler.address, //Handler to swap
              _flashLoanAmount: [0],
              firstSwapData: ["0x"],
              secondSwapData: ["0x"],
            },
            responses
          )
        ).to.be.revertedWithCustomError(withdrawBatch, "InvalidBalanceDiff");
      });

      it("withdrawal should fail if target address is not whitelisted", async () => {
        const user = owner;
        const amountPortfolioToken = BigNumber.from(
          await portfolio.balanceOf(user.address)
        ).div(2);
        const tokenToSwapInto = iaddress.btcAddress;

        await expect(
          withdrawManager.withdraw(
            fakePortfolio.address,
            tokenToSwapInto,
            amountPortfolioToken,
            0,
            {
              _factory: addresses.thena_factory,
              _token0: zeroAddress, //USDT - Pool token
              _token1: zeroAddress, //USDC - Pool token
              _flashLoanToken: zeroAddress, //Token to take flashlaon
              _bufferUnit: "0",
              _solverHandler: ensoHandler.address, //Handler to swap
              _flashLoanAmount: [0],
              firstSwapData: ["0x"],
              secondSwapData: ["0x"],
            },
            ["0x"]
          )
        ).to.be.revertedWithCustomError(
          withdrawManager,
          "InvalidTargetAddress"
        );
      });

      it("should withdraw in single token by user", async () => {
        const supplyBefore = await portfolio.totalSupply();
        const user = owner;
        const tokenToSwapInto = iaddress.btcAddress;

        let responses = [];

        const amountPortfolioToken = BigNumber.from(
          await portfolio.balanceOf(user.address)
        ).div(2);

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokens = await portfolio.getTokens();

        let userBalanceBefore = [];

        let withdrawalAmounts =
          await portfolioCalculations.getWithdrawalAmounts(
            amountPortfolioToken,
            portfolio.address
          );

        await portfolio.approve(
          withdrawManager.address,
          BigNumber.from(amountPortfolioToken)
        );

        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i] == tokenToSwapInto) {
            responses.push("0x");
          } else {
            let response = await createEnsoCallDataRoute(
              withdrawBatch.address,
              user.address,
              tokens[i],
              tokenToSwapInto,
              (withdrawalAmounts[i] * 0.9999999).toFixed(0)
            );
            responses.push(response.data.tx.data);
          }
          userBalanceBefore.push(
            await ERC20.attach(tokens[i]).balanceOf(user.address)
          );
        }

        await withdrawManager.withdraw(
          portfolio.address,
          tokenToSwapInto,
          amountPortfolioToken,
          0,
          {
            _factory: addresses.thena_factory,
            _token0: zeroAddress, //USDT - Pool token
            _token1: zeroAddress, //USDC - Pool token
            _flashLoanToken: zeroAddress, //Token to take flashlaon
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address, //Handler to swap
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          },
          responses
        );

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

        const supplyAfter = await portfolio.totalSupply();

        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
      });

      it("should withdraw in single token by user in native token", async () => {
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

        await portfolio.approve(
          withdrawManager.address,
          BigNumber.from(amountPortfolioToken)
        );

        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i] == tokenToSwapInto) {
            responses.push("0x");
          } else {
            let response = await createEnsoCallDataRoute(
              withdrawBatch.address,
              user.address,
              tokens[i],
              tokenToSwapInto,
              (withdrawalAmounts[i] * 0.9999999).toFixed(0)
            );
            responses.push(response.data.tx.data);
          }
        }

        await withdrawManager.withdraw(
          portfolio.address,
          tokenToSwapInto,
          amountPortfolioToken,
          0,
          {
            _factory: addresses.thena_factory,
            _token0: zeroAddress, //USDT - Pool token
            _token1: zeroAddress, //USDC - Pool token
            _flashLoanToken: zeroAddress, //Token to take flashlaon
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address, //Handler to swap
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          },
          responses
        );

        const supplyAfter = await portfolio.totalSupply();

        const balanceAfter = await provider.getBalance(user.address);

        expect(Number(balanceAfter)).to.be.greaterThan(Number(balanceBefore));
        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
      });

      it("should fail if balance to deposit is zero", async () => {
        let tokens = await portfolio.getTokens();

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const tokenToSwap = iaddress.usdcAddress;

        await swapHandler.swapETHToTokens("500", tokenToSwap, owner.address, {
          value: "1000000000000000000",
        });

        let amountToSwap = await ERC20.attach(tokenToSwap).balanceOf(
          owner.address
        );

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse = [];

        for (let i = 0; i < tokens.length; i++) {
          let amountIn = BigNumber.from(amountToSwap).div(tokens.length);

          if (tokenToSwap == tokens[i]) {
            const abiCoder = ethers.utils.defaultAbiCoder;
            const encodedata = abiCoder.encode(["uint"], [0]);
            postResponse.push(encodedata);
          } else {
            let response = await createEnsoCallDataRoute(
              depositBatch.address,
              depositBatch.address,
              tokenToSwap,
              tokens[i],
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

        await expect(
          depositManager.deposit({
            _minMintAmount: 0,
            _depositAmount: amountToSwap.toString(),
            _target: portfolio.address,
            _depositToken: tokenToSwap,
            _callData: postResponse,
          })
        ).to.be.revertedWithCustomError(depositBatch, "InvalidBalanceDiff");
      });

      it("should fail if tokens length is not equal calldata length", async () => {
        let tokens = await portfolio.getTokens();

        console.log("SupplyBefore", await portfolio.totalSupply());

        let postResponse: any = [];

        await expect(
          depositBatch.multiTokenSwapETHAndTransfer(
            {
              _minMintAmount: 0,
              _depositAmount: "1000000000000000000",
              _target: portfolio.address,
              _depositToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
              _callData: postResponse,
            },
            {
              value: "1000000000000000000",
            }
          )
        ).to.be.revertedWithCustomError(depositBatch, "InvalidLength");
      });
    });
  });
});
