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
  TokenBalanceLibrary,
  BorrowManager,
  TokenExclusionManager,
  TokenExclusionManager__factory,
} from "../../typechain";

import { chainIdToAddresses } from "../../scripts/networkVariables";

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
  let portfolio2: any;
  let portfolioCalculations: any;
  let tokenExclusionManager: any;
  let tokenExclusionManager1: any;
  let tokenExclusionManager2: any;
  let ensoHandler: EnsoHandler;
  let portfolioContract: Portfolio;
  let portfolioFactory: PortfolioFactory;
  let swapHandler: UniswapV2Handler;
  let rebalancing: any;
  let rebalancing1: any;
  let rebalancing2: any;
  let protocolConfig: ProtocolConfig;
  let borrowManager: BorrowManager;
  let tokenBalanceLibrary: TokenBalanceLibrary;
  let txObject;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let assetManagerTreasury: SignerWithAddress;
  let nonOwner: SignerWithAddress;
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

      const PositionWrapper = await ethers.getContractFactory(
        "PositionWrapper"
      );
      const positionWrapperBaseAddress = await PositionWrapper.deploy();
      await positionWrapperBaseAddress.deployed();

      const ProtocolConfig = await ethers.getContractFactory("ProtocolConfig");
      const _protocolConfig = await upgrades.deployProxy(
        ProtocolConfig,
        [treasury.address, priceOracle.address],
        { kind: "uups" }
      );

      protocolConfig = ProtocolConfig.attach(_protocolConfig.address);
      await protocolConfig.setCoolDownPeriod("70");
      await protocolConfig.enableSolverHandler(ensoHandler.address);

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

      await protocolConfig.setSupportedFactory(ensoHandler.address);

      let whitelistedTokens = [
        addresses.ARB,
        addresses.WBTC,
        addresses.WETH,
        addresses.DAI,
        addresses.ADoge,
        addresses.USDCe,
        addresses.USDT,
        addresses.CAKE,
        addresses.SUSHI,
        addresses.LINK,
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

      const FeeModule = await ethers.getContractFactory("FeeModule");
      const feeModule = await FeeModule.deploy();
      await feeModule.deployed();

      const TokenRemovalVault = await ethers.getContractFactory(
        "TokenRemovalVault"
      );
      const tokenRemovalVault = await TokenRemovalVault.deploy();
      await tokenRemovalVault.deployed();

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
            _baseAssetManagementConfigAddress: assetManagementConfig.address,
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
          _whitelistTokens: true,
          _witelistedProtocolIds: [],
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
          _witelistedProtocolIds: [],
        });

      const portfolioFactoryCreate3 =
        await portfolioFactory.createPortfolioNonCustodial({
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
          _witelistedProtocolIds: [],
        });
      const portfolioAddress = await portfolioFactory.getPortfolioList(0);
      const portfolioInfo = await portfolioFactory.PortfolioInfolList(0);

      const portfolioAddress1 = await portfolioFactory.getPortfolioList(1);
      const portfolioInfo1 = await portfolioFactory.PortfolioInfolList(1);

      const portfolioAddress2 = await portfolioFactory.getPortfolioList(2);
      const portfolioInfo2 = await portfolioFactory.PortfolioInfolList(2);

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

      /////////////
      portfolio2 = await ethers.getContractAt(
        Portfolio__factory.abi,
        portfolioAddress2
      );

      rebalancing = await ethers.getContractAt(
        Rebalancing__factory.abi,
        portfolioInfo.rebalancing
      );

      rebalancing1 = await ethers.getContractAt(
        Rebalancing__factory.abi,
        portfolioInfo1.rebalancing
      );

      rebalancing2 = await ethers.getContractAt(
        Rebalancing__factory.abi,
        portfolioInfo2.rebalancing
      );

      tokenExclusionManager = await ethers.getContractAt(
        TokenExclusionManager__factory.abi,
        portfolioInfo.tokenExclusionManager
      );

      tokenExclusionManager1 = await ethers.getContractAt(
        TokenExclusionManager__factory.abi,
        portfolioInfo1.tokenExclusionManager
      );

      tokenExclusionManager2 = await ethers.getContractAt(
        TokenExclusionManager__factory.abi,
        portfolioInfo2.tokenExclusionManager
      );

      console.log("portfolio deployed to:", portfolio.address);

      console.log("rebalancing:", rebalancing1.address);
    });

    describe("Deposit Tests", function () {
      it("should retrieve the current max asset limit from the ProtocolConfig", async () => {
        expect(await protocolConfig.assetLimit()).to.equal(15);
      });

      it("should update the max asset limit to 10 in the ProtocolConfig", async () => {
        await protocolConfig.setAssetLimit(10);
        expect(await protocolConfig.assetLimit()).to.equal(10);
      });

      it("should revert if not a superAdmin + nonRebalancer contract calls functions", async () => {
        await expect(
          portfolio.connect(addr2).initToken([addresses.ARB, addresses.WBTC])
        ).to.be.revertedWithCustomError(portfolio, "CallerNotSuperAdmin");
      });

      it("Calling the function mintShares should fail (only callable by contracts)", async () => {
        await expect(
          portfolio.mintShares(owner.address, "10000000")
        ).to.be.revertedWithCustomError(portfolio, "CallerNotPortfolioManager");
      });

      it("Initialize should fail if the number of tokens exceed the max limit set by the Registry (current = 10)", async () => {
        await expect(
          portfolio.initToken([
            addresses.ARB,
            addresses.WBTC,
            addresses.WETH,
            addresses.DAI,
            addresses.ADoge,
            addresses.USDCe,
            addresses.MIM,
            addresses.aArbDAI,
            addresses.aArbLINK,
            addresses.aArbUSDC,
            addresses.aArbUSDT,
          ])
        ).to.be.revertedWithCustomError(portfolio, "TokenCountOutOfLimit");
      });

      it("should init tokens", async () => {
        await portfolio.initToken([
          addresses.ARB,
          addresses.WBTC,
          addresses.USDCe,
        ]);
      });

      it("should init 2nd portfolio tokens", async () => {
        await portfolio1
          .connect(nonOwner)
          .initToken([
            addresses.ARB,
            addresses.WBTC,
            addresses.USDCe,
            addresses.LINK,
            addresses.DAI,
            addresses.USDT,
            addresses.SUSHI,
            addresses.USDC,
          ]);
      });

      it("deposit should fail if user has not approve permit2 contract", async () => {
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

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio.address
          );
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
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

        await expect(
          portfolio.multiTokenDeposit(amounts, "0", permit, signature)
        ).to.be.reverted;
      });

      it("owner should approve tokens to permit2 contract", async () => {
        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          await ERC20.attach(tokens[i]).approve(
            PERMIT2_ADDRESS,
            MaxAllowanceTransferAmount
          );
        }
      });

      it("nonOWner should approve tokens to permit2 contract", async () => {
        const tokens = await portfolio1.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          await ERC20.attach(tokens[i])
            .connect(nonOwner)
            .approve(PERMIT2_ADDRESS, MaxAllowanceTransferAmount);
        }
        for (let i = 0; i < tokens.length; i++) {
          await ERC20.attach(tokens[i])
            .connect(owner)
            .approve(PERMIT2_ADDRESS, MaxAllowanceTransferAmount);
        }
        for (let i = 0; i < tokens.length; i++) {
          await ERC20.attach(tokens[i])
            .connect(addr2)
            .approve(PERMIT2_ADDRESS, MaxAllowanceTransferAmount);
        }
      });

      it("should deposit multitoken into fund should fail if caller is asset manager treasury", async () => {
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

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            assetManagerTreasury.address,
            tokens[i],
            portfolio.address
          );
          let balance = await ERC20.attach(tokens[i]).balanceOf(
            assetManagerTreasury.address
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
        const signature = await assetManagerTreasury._signTypedData(
          domain,
          types,
          values
        );

        await expect(
          portfolio
            .connect(assetManagerTreasury)
            .multiTokenDeposit(amounts, "0", permit, signature)
        ).to.be.revertedWithCustomError(portfolio, "UserNotAllowedToDeposit");
      });

      it("should deposit multitoken into fund should fail if caller is asset velvet treasury", async () => {
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

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            treasury.address,
            tokens[i],
            portfolio.address
          );
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
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

        await expect(
          portfolio
            .connect(treasury)
            .multiTokenDeposit(amounts, "0", permit, signature)
        ).to.be.revertedWithCustomError(portfolio, "UserNotAllowedToDeposit");
      });

      it("non owner should not be able to change the minPortfolioTokenHoldingAmount", async () => {
        await expect(
          protocolConfig
            .connect(nonOwner)
            .updateMinPortfolioTokenHoldingAmount("100000")
        ).to.be.reverted;
      });

      it("deposit multitoken into fund(First Deposit) should fail", async () => {
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

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio.address
          );
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
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

        await expect(
          portfolio.multiTokenDeposit(
            amounts,
            "101000000000000000000",
            permit,
            signature
          )
        ).to.be.revertedWithCustomError(portfolio, "InvalidMintAmount");
      });

      it("deposit multitoken into fund(First Deposit) should fail if user inputs zero depositAmounts", async () => {
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

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio.address
          );
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
          let balance = await ERC20.attach(tokens[i]).balanceOf(owner.address);
          let detail = {
            token: tokens[i],
            amount: balance,
            expiration: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
            nonce,
          };
          amounts.push(0);
          tokenDetails.push(detail);
        }

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

        await expect(
          portfolio.multiTokenDeposit(amounts, "0", permit, signature)
        ).to.be.revertedWithCustomError(portfolio, "AmountCannotBeZero");
      });

      it("should deposit multitoken into 2nd fund(First Deposit)", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];

        let amounts = [];

        const supplyBefore = await portfolio1.totalSupply();
        const tokens = await portfolio1.getTokens();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio1.address
          );
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
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

        const permit: PermitBatch = {
          details: tokenDetails,
          spender: portfolio1.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await owner._signTypedData(domain, types, values);

        await portfolio1.multiTokenDeposit(amounts, "0", permit, signature);

        const supplyAfter = await portfolio1.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("Deposit multitoken into 2nd fund(Second Deposit) should fail, if user inputs zero Deposit Amount", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];

        let amounts = [];

        const supplyBefore = await portfolio1.totalSupply();
        const tokens = await portfolio1.getTokens();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio1.address
          );
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
          let balance = await ERC20.attach(tokens[i]).balanceOf(owner.address);
          let detail = {
            token: tokens[i],
            amount: balance,
            expiration: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
            nonce,
          };
          amounts.push(0);
          tokenDetails.push(detail);
        }

        const permit: PermitBatch = {
          details: tokenDetails,
          spender: portfolio1.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await owner._signTypedData(domain, types, values);

        await expect(
          portfolio1.multiTokenDeposit(amounts, "0", permit, signature)
        ).to.be.revertedWithCustomError(
          portfolio1,
          "MintedAmountIsNotAccepted"
        );
      });

      it("should deposit multitoken into 2nd fund(Second Deposit)", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];

        let amounts = [];

        const supplyBefore = await portfolio1.totalSupply();
        const tokens = await portfolio1.getTokens();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio1.address
          );
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
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

        const permit: PermitBatch = {
          details: tokenDetails,
          spender: portfolio1.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await owner._signTypedData(domain, types, values);

        await portfolio1.multiTokenDeposit(amounts, "0", permit, signature);

        const supplyAfter = await portfolio1.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multitoken into 2nd fund(Third Deposit)", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];

        let amounts = [];

        const supplyBefore = await portfolio1.totalSupply();
        const tokens = await portfolio1.getTokens();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            addr2.address,
            tokens[i],
            portfolio1.address
          );
          await swapHandler.swapETHToTokens("5000", tokens[i], addr2.address, {
            value: "100000000000000000",
          });
          let balance = await ERC20.attach(tokens[i]).balanceOf(addr2.address);
          let detail = {
            token: tokens[i],
            amount: balance,
            expiration: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
            nonce,
          };
          amounts.push(balance);
          tokenDetails.push(detail);
        }

        const permit: PermitBatch = {
          details: tokenDetails,
          spender: portfolio1.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await addr2._signTypedData(domain, types, values);

        await portfolio1
          .connect(addr2)
          .multiTokenDeposit(amounts, "0", permit, signature);

        const supplyAfter = await portfolio1.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multitoken into fund(First Deposit)", async () => {
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
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
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

      it("should deposit multitoken in behalf of another user", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        // swap native token to deposit token
        let amounts = [];

        const supplyBefore = await portfolio.totalSupply();
        const balanceBefore = await portfolio.balanceOf(nonOwner.address);

        const tokens = await portfolio.getTokens();

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
          let balance = await ERC20.attach(tokens[i]).balanceOf(owner.address);
          await ERC20.attach(tokens[i]).approve(portfolio.address, balance);
          amounts.push(balance);
        }

        await portfolio.multiTokenDepositFor(nonOwner.address, amounts, "0");

        const supplyAfter = await portfolio.totalSupply();
        const balanceAfter = await portfolio.balanceOf(nonOwner.address);

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));

        expect(Number(balanceAfter)).to.be.greaterThan(Number(balanceBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multitoken into fund (Second Deposit) should fail if entry fee is not calculated in expected token amount", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];
        // swap native token to deposit token
        let amounts = [];
        let newAmounts = [];
        let leastPercentage = 0;

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio.address
          );
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
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

        let mintAmount = await calcuateExpectedMintAmount(
          leastPercentage,
          await portfolio.totalSupply()
        );

        // considering 1% slippage
        await expect(
          portfolio.multiTokenDeposit(
            inputAmounts,
            Math.abs(mintAmount).toString(),
            permit,
            signature
          )
        ).to.be.revertedWithCustomError(portfolio, "InvalidMintAmount");
      });

      it("should deposit multitoken into fund (Second Deposit)", async () => {
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
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
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
          (Math.abs(mintAmount) * 0.99).toString(),
          permit,
          signature // slippage 1%
        );

        const supplyAfter = await portfolio.totalSupply();
        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("owner can change minPortfolioTokenHoldingAmount", async () => {
        await protocolConfig.updateMinPortfolioTokenHoldingAmount(
          "500000000000000000"
        );
      });

      it("assetManager changes minPortfoliotokenHoldingAmount and user should be not be able to mint token less then accepted by assetManager", async () => {
        let amounts = [];
        let newAmounts: any = [];

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);
        await assetManagementConfig.updateMinPortfolioTokenHoldingAmount(
          "500000000000000000"
        );

        let tokenDetails = [];

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            nonOwner.address,
            tokens[i],
            portfolio.address
          );
          await swapHandler.swapETHToTokens(
            "500",
            tokens[i],
            nonOwner.address,
            {
              value: "100000000000000000",
            }
          );
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

        let inputAmounts = [];
        for (let i = 0; i < newAmounts.length; i++) {
          inputAmounts.push(
            ethers.BigNumber.from(newAmounts[i]).div(1000).toString()
          );
        }

        await expect(
          portfolio
            .connect(nonOwner)
            .multiTokenDeposit(inputAmounts, "0", permit, signature)
        ).to.be.revertedWithCustomError(portfolio, "MintedAmountIsNotAccepted");
      });

      it("should deposit multitoken into fund by nonOwner(Third Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];
        let tokenDetails = [];

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const supplyBefore = await portfolio.totalSupply();
        const tokens = await portfolio.getTokens();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            nonOwner.address,
            tokens[i],
            portfolio.address
          );
          await swapHandler.swapETHToTokens(
            "500",
            tokens[i],
            nonOwner.address,
            {
              value: "100000000000000000",
            }
          );
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

        let inputAmounts = [];
        for (let i = 0; i < newAmounts.length; i++) {
          inputAmounts.push(ethers.BigNumber.from(newAmounts[i]).toString());
        }

        await portfolio
          .connect(nonOwner)
          .multiTokenDeposit(inputAmounts, "0", permit, signature);

        const supplyAfter = await portfolio.totalSupply();
        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multitoken into fund by nonOwner(Fourth Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];
        let tokenDetails = [];

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const supplyBefore = await portfolio.totalSupply();
        const tokens = await portfolio.getTokens();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            nonOwner.address,
            tokens[i],
            portfolio.address
          );
          await swapHandler.swapETHToTokens(
            "500",
            tokens[i],
            nonOwner.address,
            {
              value: "100000000000000000",
            }
          );
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

        let inputAmounts = [];
        for (let i = 0; i < newAmounts.length; i++) {
          inputAmounts.push(ethers.BigNumber.from(newAmounts[i]).toString());
        }

        await portfolio
          .connect(nonOwner)
          .multiTokenDeposit(inputAmounts, "0", permit, signature);

        const supplyAfter = await portfolio.totalSupply();
        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("asset manager teasury should greater then 0", async () => {
        expect(
          Number(await portfolio.balanceOf(assetManagerTreasury.address))
        ).to.be.greaterThan(0);
      });

      it("owner should be able to update the protocol fee", async () => {
        await protocolConfig.updateProtocolFee("0");
      });

      it("should deposit multitoken into fund", async () => {
        let tokenDetails = [];
        let amounts = [];
        // swap native token to deposit token

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const supplyBefore = await portfolio.totalSupply();

        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            owner.address,
            tokens[i],
            portfolio.address
          );
          await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
            value: "100000000000000000",
          });
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
        console.log("supplyAfter", supplyAfter);
      });

      it("update tokens with non whitelist token should revert", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.aArbLINK;

        let newTokens = [
          buyToken,
          addresses.ARB,
          addresses.WBTC,
          addresses.USDCe,
        ];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

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
          [[["0x"]], [], [[]], [[]], [], [sellToken], [buyToken], [0]]
        );

        await expect(
          rebalancing.updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [balance],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(portfolio, "TokenNotWhitelisted");
      });

      it("should revert is handler is not enabled", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.aArbUSDC;

        let newTokens = [
          buyToken,
          addresses.ARB,
          addresses.WBTC,
          addresses.USDCe,
        ];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        const data = await createEnsoDataElement(sellToken, buyToken, balance);

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
          [[["0x"]], [], [[]], [[]], [], [sellToken], [buyToken], [0]]
        );

        await expect(
          rebalancing.updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [balance],
            _handler: addresses.WBTC,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(rebalancing, "InvalidSolver");
      });

      it("should fail if protocol is paused", async () => {
        await protocolConfig.setProtocolPause(true);
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.USDT;

        let newTokens = [
          buyToken,
          addresses.ARB,
          addresses.WBTC,
          addresses.USDCe,
        ];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

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
          [[["0x"]], [], [[]], [[]], [], [sellToken], [buyToken], [0]]
        );

        await expect(
          rebalancing.updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [balance],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(rebalancing, "ProtocolIsPaused");
      });

      it("should be able to unpause protocol", async () => {
        await protocolConfig.setProtocolPause(false);
      });

      it("should revert if wrong buy token is passed to enso", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyTokenManipulated = addresses.LINK;
        let buyToken = addresses.DAI;

        let newTokens = [buyToken, tokens[1], tokens[2]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        const postResponse = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          sellToken,
          buyTokenManipulated,
          balance
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

        await expect(
          rebalancing.updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [balance],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(
          ensoHandler,
          "ReturnValueLessThenExpected"
        );
      });

      it("should revert if wrong buy token is passed to enso and as buy token (not included in new token list)", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyTokenManipulated = addresses.LINK;
        let buyToken = addresses.DAI;

        let newTokens = [buyToken, tokens[1], tokens[2]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        const postResponse = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          sellToken,
          buyTokenManipulated,
          balance
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
            [buyTokenManipulated],
            [0],
          ]
        );

        await expect(
          rebalancing.updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [balance],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(
          rebalancing,
          "BalanceOfVaultCannotNotBeZero"
        );
      });

      it("should revert if portfolio token should be sold completely but balance is not zero", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.DAI;

        let newTokens = [buyToken, tokens[1], tokens[2]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        let manipulatedBalance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        )
          .div(2)
          .toString();

        const postResponse = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          sellToken,
          buyToken,
          manipulatedBalance
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

        await expect(
          rebalancing.updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [manipulatedBalance],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(
          rebalancing,
          "BalanceOfVaultShouldNotExceedDust"
        );
      });

      it("rebalance should revert if expected output amount length unequal tokens length", async () => {
        await ethers.provider.send("evm_increaseTime", [1000]);

        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.DAI;

        let newTokens = [buyToken, tokens[1], tokens[2]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

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
          [[["0x"]], [], [[]], [[]], [], [sellToken], [buyToken], [0, 0]]
        );

        await expect(
          rebalancing.updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [balance],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(ensoHandler, "InvalidLength");
      });

      it("rebalance should revert if calldata length unequal tokens length", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.DAI;

        let newTokens = [buyToken, tokens[1], tokens[2]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

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
          [[["0x"], ["0x"]], [], [[]], [[]], [], [sellToken], [buyToken], [0]]
        );

        await expect(
          rebalancing.updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [balance],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(ensoHandler, "InvalidLength");
      });

      it("rebalance should revert if sellamount length unequal tokens length", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.DAI;

        let newTokens = [buyToken, tokens[1], tokens[2]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

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
          [[["0x"]], [], [[]], [[]], [], [sellToken], [buyToken], [0]]
        );

        await expect(
          rebalancing.updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [balance, "20"],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(rebalancing, "InvalidLength");
      });

      it("should rebalance should fail if bought token is missing in new token list", async () => {
        await ethers.provider.send("evm_increaseTime", [1000]);

        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.DAI;

        let newTokens = [tokens[1], tokens[2]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        const postResponse = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          sellToken,
          buyToken,
          balance
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

        await expect(
          rebalancing.updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [balance],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(rebalancing, "InvalidBuyTokenList");

        console.log(
          "balance after sell",
          await ERC20.attach(sellToken).balanceOf(vault)
        );
      });

      it("should rebalance should fail if caller is not asset manager", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.DAI;

        let newTokens = [buyToken, tokens[1], tokens[2]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

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
          [[["0x"]], [], [[]], [[]], [], [sellToken], [buyToken], [0]]
        );

        await expect(
          rebalancing.connect(nonOwner).updateTokens({
            _newTokens: newTokens,
            _sellTokens: [sellToken],
            _sellAmounts: [balance],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(rebalancing, "CallerNotAssetManager");
      });

      it("should rebalance", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.DAI;

        let newTokens = [buyToken, tokens[1], tokens[2]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        const postResponse = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          sellToken,
          buyToken,
          balance
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
          _sellAmounts: [balance],
          _handler: ensoHandler.address,
          _callData: encodedParameters,
        });

        console.log(
          "balance after sell",
          await ERC20.attach(sellToken).balanceOf(vault)
        );
      });

      it("should update weights/amounts", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = tokens[2];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        )
          .div(2)
          .toString();

        const postResponse = await createEnsoCallDataRoute(
          ensoHandler.address,
          ensoHandler.address,
          sellToken,
          buyToken,
          balance
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

        let balanceBefore = await ERC20.attach(buyToken).balanceOf(vault);

        await rebalancing.updateWeights(
          [sellToken],
          [balance],
          ensoHandler.address,
          encodedParameters
        );

        let balanceAfter = await ERC20.attach(buyToken).balanceOf(vault);
        expect(balanceAfter).to.be.greaterThan(balanceBefore);
      });

      it("assetmanager should remove disbale token", async () => {
        await rebalancing.removePortfolioToken(addresses.WBTC);
      });

      it("user1(owner) should be able to claim their removed tokens at snapshot id 1", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenRemoved = addresses.WBTC;

        let tokenBalanceBefore = await ERC20.attach(tokenRemoved).balanceOf(
          owner.address
        );

        let userShare = (
          await tokenExclusionManager.userRecord(owner.address, 1)
        ).portfolioBalance;
        let totalSupply = (await tokenExclusionManager.removedToken(1))
          .totalSupply;

        let userIdxShareRatio = BigNumber.from(userShare)
          .mul(100)
          .div(BigNumber.from(totalSupply))
          .toString();

        let removedTokenVault = (await tokenExclusionManager.removedToken(1))
          .vault;

        let tokenBalanceBeforeVault = await ERC20.attach(
          tokenRemoved
        ).balanceOf(removedTokenVault);

        await tokenExclusionManager.claimTokenAtId(owner.address, 1);

        let tokenBalanceAfter = await ERC20.attach(tokenRemoved).balanceOf(
          owner.address
        );

        let tokenBalanceAfterVault = await ERC20.attach(tokenRemoved).balanceOf(
          removedTokenVault
        );

        let userRemovedTokenRatio = BigNumber.from(tokenBalanceBeforeVault)
          .sub(BigNumber.from(tokenBalanceAfterVault))
          .mul(100)
          .div(BigNumber.from(tokenBalanceBeforeVault));

        expect(tokenBalanceAfter).to.be.greaterThan(tokenBalanceBefore);
        expect(userRemovedTokenRatio).to.be.equals(userIdxShareRatio);
      });

      it("if user1 again try to claim same token twice, he will not receive any tokens", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenToRemove = addresses.WBTC;

        let tokenBalanceBefore = await ERC20.attach(tokenToRemove).balanceOf(
          owner.address
        );

        await tokenExclusionManager.claimTokenAtId(owner.address, 1);

        let tokenBalanceAfter = await ERC20.attach(tokenToRemove).balanceOf(
          owner.address
        );

        expect(tokenBalanceAfter).to.be.equals(tokenBalanceBefore);
      });

      it("should withdraw in multitoken by nonwOwner(user2)", async () => {
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
            _factory: ensoHandler.address,
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
      });

      it("user2(nonOwner) should claim removed tokens after complete withdrawal from portfolio", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenToRemove = addresses.WBTC;

        let tokenBalanceBefore: any = await ERC20.attach(
          tokenToRemove
        ).balanceOf(nonOwner.address);

        let userShare = (
          await tokenExclusionManager.userRecord(nonOwner.address, 1)
        ).portfolioBalance;

        let totalSupply = (await tokenExclusionManager.removedToken(1))
          .totalSupply;

        let userIdxShareRatio = BigNumber.from(userShare)
          .mul(100)
          .div(BigNumber.from(totalSupply));

        let removedTokenVault = (await tokenExclusionManager.removedToken(1))
          .vault;

        let tokenBalanceBeforeVault = await ERC20.attach(
          tokenToRemove
        ).balanceOf(removedTokenVault);

        await tokenExclusionManager.claimTokenAtId(nonOwner.address, 1);

        let tokenBalanceAfter: any = await ERC20.attach(
          tokenToRemove
        ).balanceOf(nonOwner.address);

        let tokenBalanceAfterVault = await ERC20.attach(
          tokenToRemove
        ).balanceOf(removedTokenVault);

        let userRemovedTokenRatio = BigNumber.from(tokenBalanceBeforeVault)
          .sub(BigNumber.from(tokenBalanceAfterVault))
          .mul(100)
          .div(BigNumber.from(tokenBalanceBeforeVault));

        expect(tokenBalanceAfter).to.be.greaterThan(tokenBalanceBefore);
        expect(userRemovedTokenRatio).to.be.equals(userIdxShareRatio);
      });

      it("should fail if random user not eligible trying to claim tokens, should not get any token", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenToRemove = addresses.WBTC;

        let tokenBalanceBefore = await ERC20.attach(tokenToRemove).balanceOf(
          owner.address
        );

        await tokenExclusionManager.claimTokenAtId(addr1.address, 1);

        let tokenBalanceAfter = await ERC20.attach(tokenToRemove).balanceOf(
          owner.address
        );

        expect(tokenBalanceAfter).to.be.equals(tokenBalanceBefore);
      });

      it("non asset manager should not be able to remove a token partially", async () => {
        let tokens = await portfolio.getTokens();
        const tokenToRemove = tokens[0];

        await expect(
          rebalancing
            .connect(addr2)
            .removePortfolioTokenPartially(tokenToRemove, "10000")
        ).to.be.revertedWithCustomError(rebalancing, "CallerNotAssetManager");
      });

      it("should fail to remove 100% of the token calling the function to remove a token partially", async () => {
        let tokens = await portfolio.getTokens();
        const tokenToRemove = tokens[0];

        await expect(
          rebalancing.removePortfolioTokenPartially(tokenToRemove, "10000")
        ).to.be.revertedWithCustomError(
          rebalancing,
          "InvalidTokenRemovalPercentage"
        );
      });

      it("assetManager should remove token partially", async () => {
        let tokens = await portfolio.getTokens();
        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenToRemove = tokens[0];

        let vaultBalanceBefore = await ERC20.attach(tokenToRemove).balanceOf(
          vault
        );

        await rebalancing.removePortfolioTokenPartially(tokenToRemove, "5000");

        let vaultBalanceAfter = await ERC20.attach(tokenToRemove).balanceOf(
          vault
        );

        expect(vaultBalanceBefore).to.be.greaterThan(vaultBalanceAfter);
      });

      it("user1 (owner) should be able to claim the partially removed token", async () => {
        let tokens = await portfolio.getTokens();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenToRemove = tokens[0];

        let token1BalanceBefore = await ERC20.attach(tokenToRemove).balanceOf(
          owner.address
        );

        let userShare = (
          await tokenExclusionManager.userRecord(owner.address, 2)
        ).portfolioBalance;

        let totalSupply = (await tokenExclusionManager.removedToken(2))
          .totalSupply;

        console.log("totalSupply", totalSupply);

        let userIdxShareRatio1 = BigNumber.from(userShare)
          .mul(100)
          .div(BigNumber.from(totalSupply));

        let removedTokenVault = (await tokenExclusionManager.removedToken(2))
          .vault;

        let tokenRemovalVaultBalanceBefore = await ERC20.attach(
          tokenToRemove
        ).balanceOf(removedTokenVault);

        await tokenExclusionManager.claimTokenAtId(owner.address, 2);

        let token1BalanceAfter = await ERC20.attach(tokenToRemove).balanceOf(
          owner.address
        );

        let tokenRemovalVaultBalanceAfter = await ERC20.attach(
          tokenToRemove
        ).balanceOf(removedTokenVault);

        let totalSupplyAfter = (await tokenExclusionManager.removedToken(2))
          .totalSupply;

        let userRemovedToken1Ratio = BigNumber.from(
          tokenRemovalVaultBalanceBefore
        )
          .sub(BigNumber.from(tokenRemovalVaultBalanceAfter))
          .mul(100)
          .div(BigNumber.from(tokenRemovalVaultBalanceBefore));

        expect(totalSupplyAfter).to.be.equals(
          BigNumber.from(totalSupply).sub(BigNumber.from(userShare))
        );
        expect(token1BalanceAfter).to.be.greaterThan(token1BalanceBefore);
        expect(userRemovedToken1Ratio).to.be.equals(userIdxShareRatio1);
      });

      it("assetManager should create 2 snapshot(remove 2 tokens) simultaneously for 2nd Portfolio Fund", async () => {
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(addresses.WBTC);
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(addresses.ARB);
      });

      it("should fail if startId is greater then last Id", async () => {
        await expect(
          tokenExclusionManager1.claimRemovedTokens(owner.address, 2, 1)
        ).to.be.revertedWithCustomError(tokenExclusionManager1, "InvalidId");
      });

      it("should fail if last Id is greater then current snapshot id", async () => {
        await expect(
          tokenExclusionManager1.claimRemovedTokens(owner.address, 1, 5)
        ).to.be.revertedWithCustomError(tokenExclusionManager1, "InvalidId");
      });

      it("should fail if id is greater then currentSnapsotId", async () => {
        await expect(
          tokenExclusionManager1.claimTokenAtId(owner.address, 5)
        ).to.be.revertedWithCustomError(tokenExclusionManager1, "InvalidId");
      });

      it("user1(owner) should be able to claim both of his removed tokens", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const token1ToRemove = addresses.WBTC;
        const token2ToRemove = addresses.ARB;

        let token1BalanceBefore = await ERC20.attach(token1ToRemove).balanceOf(
          owner.address
        );

        let token2BalanceBefore = await ERC20.attach(token2ToRemove).balanceOf(
          owner.address
        );

        let userShare1 = (
          await tokenExclusionManager1.userRecord(owner.address, 1)
        ).portfolioBalance;

        //As userShare2 is not recorded we will use userShare1 for verification
        let userShare2 = userShare1;

        let totalSupply1 = (await tokenExclusionManager1.removedToken(1))
          .totalSupply;

        let totalSupply2 = (await tokenExclusionManager1.removedToken(2))
          .totalSupply;

        let userIdxShareRatio1 = BigNumber.from(userShare1)
          .mul(100)
          .div(BigNumber.from(totalSupply1));

        let userIdxShareRatio2 = BigNumber.from(userShare2)
          .mul(100)
          .div(BigNumber.from(totalSupply2));

        let removedToken1Vault1 = (await tokenExclusionManager1.removedToken(1))
          .vault;

        let removedToken1Vault2 = (await tokenExclusionManager1.removedToken(2))
          .vault;

        let token1BalanceBeforeVault = await ERC20.attach(
          token1ToRemove
        ).balanceOf(removedToken1Vault1);

        let token2BalanceBeforeVault = await ERC20.attach(
          token2ToRemove
        ).balanceOf(removedToken1Vault2);

        await tokenExclusionManager1.claimRemovedTokens(owner.address, 2, 2);
        await tokenExclusionManager1.claimTokenAtId(owner.address, 1);

        let token1BalanceAfter = await ERC20.attach(token1ToRemove).balanceOf(
          owner.address
        );

        let token2BalanceAfter = await ERC20.attach(token2ToRemove).balanceOf(
          owner.address
        );

        let token1BalanceAfterVault = await ERC20.attach(
          token1ToRemove
        ).balanceOf(removedToken1Vault1);

        let token2BalanceAfterVault = await ERC20.attach(
          token2ToRemove
        ).balanceOf(removedToken1Vault2);

        let userRemovedToken1Ratio = BigNumber.from(token1BalanceBeforeVault)
          .sub(BigNumber.from(token1BalanceAfterVault))
          .mul(100)
          .div(BigNumber.from(token1BalanceBeforeVault));

        let userRemovedToken2Ratio = BigNumber.from(token2BalanceBeforeVault)
          .sub(BigNumber.from(token2BalanceAfterVault))
          .mul(100)
          .div(BigNumber.from(token2BalanceBeforeVault));

        expect(token1BalanceAfter).to.be.greaterThan(token1BalanceBefore);
        expect(token2BalanceAfter).to.be.greaterThan(token2BalanceBefore);

        expect(userRemovedToken1Ratio).to.be.equals(userIdxShareRatio1);
        expect(userRemovedToken2Ratio).to.be.equals(userIdxShareRatio2);
      });

      it("only portfolio manager can set userRecord that is portfolio contract and rebalancing contract", async () => {
        await expect(
          tokenExclusionManager1.setUserRecord(owner.address, "10000")
        ).to.be.reverted;
      });

      it("user1(owner) should not get any token if he claims removed token", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenToRemove = addresses.WBTC;

        let tokenBalanceBefore = await ERC20.attach(tokenToRemove).balanceOf(
          owner.address
        );

        await tokenExclusionManager1.claimTokenAtId(owner.address, 2);

        let tokenBalanceAfter = await ERC20.attach(tokenToRemove).balanceOf(
          owner.address
        );

        expect(tokenBalanceAfter).to.be.equals(tokenBalanceBefore);
      });

      it("assetManager should create 2 snapshot(remove 2 tokens) simultaneously for 2nd Portfolio Fund", async () => {
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(addresses.USDCe);
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(addresses.LINK);
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(addresses.DAI);
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(addresses.USDT);
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(addresses.SUSHI);
      });

      it("addr2 should claim all 7 tokens", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const token1Removed = addresses.WBTC;
        const token2Removed = addresses.ARB;
        const token3Removed = addresses.USDCe;
        const token4Removed = addresses.LINK;
        const token5Removed = addresses.DAI;
        const token6Removed = addresses.USDT;
        const token7Removed = addresses.SUSHI;

        //1-3
        //6-7
        //4

        let userShare1 = (
          await tokenExclusionManager1.userRecord(addr2.address, 1)
        ).portfolioBalance;

        let totalSupply1 = (await tokenExclusionManager1.removedToken(1))
          .totalSupply;

        let userIdxShareRatio1 = BigNumber.from(userShare1)
          .mul(100)
          .div(BigNumber.from(totalSupply1));

        let token1BalanceBefore = await ERC20.attach(token1Removed).balanceOf(
          addr2.address
        );

        let token2BalanceBefore = await ERC20.attach(token2Removed).balanceOf(
          addr2.address
        );

        let token3BalanceBefore = await ERC20.attach(token3Removed).balanceOf(
          addr2.address
        );

        let token4BalanceBefore = await ERC20.attach(token4Removed).balanceOf(
          addr2.address
        );

        let token5BalanceBefore = await ERC20.attach(token5Removed).balanceOf(
          addr2.address
        );

        let token6BalanceBefore = await ERC20.attach(token6Removed).balanceOf(
          addr2.address
        );

        let token7BalanceBefore = await ERC20.attach(token7Removed).balanceOf(
          addr2.address
        );

        //Claiming Token At Id 5
        await tokenExclusionManager1.claimTokenAtId(addr2.address, 5);

        let token5BalanceAfter = await ERC20.attach(token5Removed).balanceOf(
          addr2.address
        );

        let userShare6 = (
          await tokenExclusionManager1.userRecord(addr2.address, 6)
        ).portfolioBalance;

        let totalSupply6 = (await tokenExclusionManager1.removedToken(6))
          .totalSupply;

        let userIdxShareRatio6 = BigNumber.from(userShare6)
          .mul(100)
          .div(BigNumber.from(totalSupply6));

        let removedTokenVault1 = (await tokenExclusionManager1.removedToken(1))
          .vault;

        let tokenBalanceBeforeVault1 = await ERC20.attach(
          token1Removed
        ).balanceOf(removedTokenVault1);

        //Claiming Token From Id 1 To 3
        await tokenExclusionManager1.claimRemovedTokens(addr2.address, 1, 3);

        let token1BalanceAfter = await ERC20.attach(token1Removed).balanceOf(
          addr2.address
        );

        let token2BalanceAfter = await ERC20.attach(token2Removed).balanceOf(
          addr2.address
        );

        let token3BalanceAfter = await ERC20.attach(token3Removed).balanceOf(
          addr2.address
        );

        let userShare4 = (
          await tokenExclusionManager1.userRecord(addr2.address, 4)
        ).portfolioBalance;

        let totalSupply4 = (await tokenExclusionManager1.removedToken(4))
          .totalSupply;

        let userIdxShareRatio4 = BigNumber.from(userShare4)
          .mul(100)
          .div(BigNumber.from(totalSupply4));

        let removedTokenVault6 = (await tokenExclusionManager1.removedToken(6))
          .vault;

        let tokenBalanceBeforeVault6 = await ERC20.attach(
          token6Removed
        ).balanceOf(removedTokenVault6);

        //Claiming Token From Id 6 To 7
        await tokenExclusionManager1.claimRemovedTokens(addr2.address, 6, 7);

        let token6BalanceAfter = await ERC20.attach(token6Removed).balanceOf(
          addr2.address
        );

        let token7BalanceAfter = await ERC20.attach(token7Removed).balanceOf(
          addr2.address
        );

        let removedTokenVault4 = (await tokenExclusionManager1.removedToken(4))
          .vault;

        let tokenBalanceBeforeVault4 = await ERC20.attach(
          token4Removed
        ).balanceOf(removedTokenVault4);

        //Claiming Token At Id 4
        await tokenExclusionManager1.claimTokenAtId(addr2.address, 4);

        let token4BalanceAfter = await ERC20.attach(token4Removed).balanceOf(
          addr2.address
        );

        let tokenBalanceAfterVault1 = await ERC20.attach(
          token1Removed
        ).balanceOf(removedTokenVault1);

        let tokenBalanceAfterVault4 = await ERC20.attach(
          token4Removed
        ).balanceOf(removedTokenVault4);

        let tokenBalanceAfterVault6 = await ERC20.attach(
          token6Removed
        ).balanceOf(removedTokenVault6);

        let userRemovedToken1Ratio = BigNumber.from(tokenBalanceBeforeVault1)
          .sub(BigNumber.from(tokenBalanceAfterVault1))
          .mul(100)
          .div(BigNumber.from(tokenBalanceBeforeVault1));

        console.log("userRemovedToken1Ratio", userRemovedToken1Ratio);

        let userRemovedToken4Ratio = BigNumber.from(tokenBalanceBeforeVault4)
          .sub(BigNumber.from(tokenBalanceAfterVault4))
          .mul(100)
          .div(BigNumber.from(tokenBalanceBeforeVault4));

        let userRemovedToken6Ratio = BigNumber.from(tokenBalanceBeforeVault6)
          .sub(BigNumber.from(tokenBalanceAfterVault6))
          .mul(100)
          .div(BigNumber.from(tokenBalanceBeforeVault6));

        expect(token1BalanceAfter).to.be.greaterThan(token1BalanceBefore);
        expect(token2BalanceAfter).to.be.greaterThan(token2BalanceBefore);
        expect(token3BalanceAfter).to.be.greaterThan(token3BalanceBefore);
        expect(token4BalanceAfter).to.be.greaterThan(token4BalanceBefore);
        expect(token5BalanceAfter).to.be.greaterThan(token5BalanceBefore);
        expect(token6BalanceAfter).to.be.greaterThan(token6BalanceBefore);
        expect(token7BalanceAfter).to.be.greaterThan(token7BalanceBefore);
        expect(userRemovedToken4Ratio).to.be.equals(userIdxShareRatio4);
        expect(userRemovedToken6Ratio).to.be.equals(userIdxShareRatio6);
        expect(userRemovedToken1Ratio).to.be.equals(userIdxShareRatio1);
      });

      it("assetManager should remove last token from portfoliio", async () => {
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(addresses.USDC);
      });

      it("addr2 should be able to claim last token", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        let tokenRemoved = addresses.USDC;

        let tokenBalanceBefore = await ERC20.attach(tokenRemoved).balanceOf(
          addr2.address
        );

        let userShare = (
          await tokenExclusionManager1.userRecord(addr2.address, 8)
        ).portfolioBalance;

        let totalSupply = (await tokenExclusionManager1.removedToken(8))
          .totalSupply;

        let userIdxShareRatio = BigNumber.from(userShare)
          .mul(100)
          .div(BigNumber.from(totalSupply));

        let removedTokenVault = (await tokenExclusionManager1.removedToken(8))
          .vault;

        let tokenBalanceBeforeVault = await ERC20.attach(
          tokenRemoved
        ).balanceOf(removedTokenVault);

        await tokenExclusionManager1.claimTokenAtId(addr2.address, 8);

        let tokenBalanceAfter = await ERC20.attach(tokenRemoved).balanceOf(
          addr2.address
        );

        let tokenBalanceAfterVault = await ERC20.attach(tokenRemoved).balanceOf(
          removedTokenVault
        );

        let userRemovedTokenRatio = BigNumber.from(tokenBalanceBeforeVault)
          .sub(BigNumber.from(tokenBalanceAfterVault))
          .mul(100)
          .div(BigNumber.from(tokenBalanceBeforeVault));

        expect(tokenBalanceAfter).to.be.greaterThan(tokenBalanceBefore);
        expect(userRemovedTokenRatio).to.be.equals(userIdxShareRatio);
      });

      it("addr2 should not be able to claim token if already claimed", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        let tokenRemoved = addresses.DAI;

        let tokenBalanceBefore = await ERC20.attach(tokenRemoved).balanceOf(
          addr2.address
        );

        await tokenExclusionManager1.claimTokenAtId(addr2.address, 5);

        let tokenBalanceAfter = await ERC20.attach(tokenRemoved).balanceOf(
          addr2.address
        );

        expect(tokenBalanceAfter).to.be.equals(tokenBalanceBefore);
      });

      it("old user(owner) should be able to claim removed tokens", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        let tokenRemoved = addresses.DAI;

        let tokenBalanceBefore = await ERC20.attach(tokenRemoved).balanceOf(
          owner.address
        );

        await tokenExclusionManager1.claimTokenAtId(owner.address, 5);

        let tokenBalanceAfter = await ERC20.attach(tokenRemoved).balanceOf(
          owner.address
        );

        expect(tokenBalanceAfter).to.be.greaterThan(tokenBalanceBefore);
      });
    });
  });
});
