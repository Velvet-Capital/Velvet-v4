import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import "@nomicfoundation/hardhat-chai-matchers";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";

import {
  tokenAddresses,
  IAddresses,
  accessController,
  priceOracle,
} from "./Deployments.test";

import {
  PERMIT2_ADDRESS,
  AllowanceTransfer,
  MaxAllowanceTransferAmount,
  PermitBatch,
} from "@uniswap/permit2-sdk";

import {
  Portfolio,
  Portfolio__factory,
  IERC20Upgradeable__factory,
  ProtocolConfig,
  Rebalancing__factory,
  Rebalancing,
  PortfolioFactory,
  ERC20Upgradeable,
  VelvetSafeModule,
  FeeModule,
  UniswapV2Handler,
  TokenBalanceLibrary,
  BorrowManager,
  AssetManagementConfig,
  AccessControl,
  EnsoHandler,
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
  let portfolioCalculations: any;
  let portfolioCalculations1: any;
  let portfolioContract: Portfolio;
  let portfolioFactory: PortfolioFactory;
  let swapHandler: UniswapV2Handler;
  let rebalancing: any;
  let rebalancing1: any;
  let protocolConfig: ProtocolConfig;
  let borrowManager: BorrowManager;
  let ensoHandler: EnsoHandler;
  let tokenBalanceLibrary: TokenBalanceLibrary;
  let txObject;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
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
      [owner, depositor1, nonOwner, treasury, addr1, addr2, ...addrs] =
        accounts;

      const TokenBalanceLibrary = await ethers.getContractFactory(
        "TokenBalanceLibrary"
      );

      tokenBalanceLibrary = await TokenBalanceLibrary.deploy();
      await tokenBalanceLibrary.deployed();

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

      const EnsoHandler = await ethers.getContractFactory("EnsoHandler");
      ensoHandler = await EnsoHandler.deploy(
        "0x38147794ff247e5fc179edbae6c37fff88f68c52"
      );
      await ensoHandler.deployed();

      await protocolConfig.enableSolverHandler(ensoHandler.address);
      await protocolConfig.setSupportedFactory(ensoHandler.address);

      let whitelistedTokens = [
        addresses.ARB,
        addresses.WBTC,
        addresses.WETH,
        addresses.DAI,
        addresses.ADoge,
        addresses.USDCe,
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

      const PortfolioFactory = await ethers.getContractFactory(
        "PortfolioFactory"
      );

      const portfolioFactoryInstance = await upgrades.deployProxy(
        PortfolioFactory,
        [
          {
            _outAsset: addresses.WETH_Address,
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

      console.log("portfolioFactory address:", portfolioFactory.address);
      const portfolioFactoryCreate =
        await portfolioFactory.createPortfolioNonCustodial({
          _name: "PORTFOLIOLY",
          _symbol: "IDX",
          _managementFee: "500",
          _performanceFee: "2500",
          _entryFee: "0",
          _exitFee: "0",
          _initialPortfolioAmount: "100000000000000000000",
          _minPortfolioTokenHoldingAmount: "10000000000000000",
          _assetManagerTreasury: treasury.address,
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
          _assetManagerTreasury: treasury.address,
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
      portfolioCalculations1 = await PortfolioCalculations.deploy();
      await portfolioCalculations1.deployed();

      rebalancing = await ethers.getContractAt(
        Rebalancing__factory.abi,
        portfolioInfo.rebalancing
      );

      rebalancing1 = await ethers.getContractAt(
        Rebalancing__factory.abi,
        portfolioInfo1.rebalancing
      );

      console.log("portfolio deployed to:", portfolio.address);

      console.log("rebalancing:", rebalancing1.address);
    });

    describe("Withdrawal Tests", function () {
      it("should init tokens", async () => {
        await portfolio.initToken([
          addresses.WBTC,
          addresses.USDCe,
          addresses.ARB,
        ]);
      });

      it("owner should approve tokens to permit2 contract", async () => {
        const tokens = await portfolio.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          await ERC20.attach(tokens[i]).approve(
            PERMIT2_ADDRESS,
            MaxAllowanceTransferAmount
          );

          await ERC20.attach(tokens[i])
            .connect(nonOwner)
            .approve(PERMIT2_ADDRESS, MaxAllowanceTransferAmount);
        }
      });

      it("should protocol pause", async () => {
        await protocolConfig.setProtocolPause(true);
      });

      it("deposit multitoken into fund(First Deposit) should fail if protocol is paused", async () => {
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
        ).to.be.revertedWithCustomError(portfolio, "ProtocolIsPaused");
      });

      it("should protocol pause", async () => {
        await protocolConfig.setProtocolPause(false);
      });

      it("should deposit multitoken into fund(First Deposit)", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const supplyBefore = await portfolio.totalSupply();

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

        await portfolio.multiTokenDeposit(amounts, "0", permit, signature);

        const supplyAfter = await portfolio.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multitoken into fund by nonOwner(Second Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const supplyBefore = await portfolio.totalSupply();

        let tokenDetails = [];
        // swap native token to deposit token

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
          inputAmounts.push(ethers.BigNumber.from(newAmounts[i]).toString());
        }
        console.log("inputAmounts for nonOwner", inputAmounts);

        await portfolio
          .connect(nonOwner)
          .multiTokenDeposit(inputAmounts, "0", permit, signature);

        const supplyAfter = await portfolio.totalSupply();
        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multitoken into fund (Third Deposit)", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const supplyBefore = await portfolio.totalSupply();

        let tokenDetails = [];
        // swap native token to deposit token
        let amounts = [];
        let newAmounts = [];

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
        let inputAmounts = [];
        for (let i = 0; i < newAmounts.length; i++) {
          inputAmounts.push(ethers.BigNumber.from(newAmounts[i]).toString());
        }
        console.log("inputAmounts for owner", inputAmounts);

        await portfolio.multiTokenDeposit(inputAmounts, "0", permit, signature);

        const supplyAfter = await portfolio.totalSupply();
        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should not be able to set minIdxTokenAmount less then protocol minIdxTokenAmount", async () => {
        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);

        await expect(
          portfolioFactory.connect(nonOwner).createPortfolioNonCustodial({
            _name: "PORTFOLIOLY",
            _symbol: "IDX",
            _managementFee: "200",
            _performanceFee: "2500",
            _entryFee: "0",
            _exitFee: "0",
            _initialPortfolioAmount: "100000000000000000000",
            _minPortfolioTokenHoldingAmount: "1000000000000",
            _assetManagerTreasury: treasury.address,
            _whitelistedTokens: [],
            _public: true,
            _transferable: false,
            _transferableToPublic: false,
            _whitelistTokens: false,
            _externalPositionManagementWhitelisted: true,
          })
        ).to.be.revertedWithCustomError(
          assetManagementConfig,
          "InvalidMinAmountByAssetManager"
        );
      });

      it("should deposit multitoken into fund by nonOwner(Fourth Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const supplyBefore = await portfolio.totalSupply();

        let tokenDetails = [];
        // swap native token to deposit token

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
          inputAmounts.push(ethers.BigNumber.from(newAmounts[i]).toString());
        }
        console.log("inputAmounts for nonOwner", inputAmounts);

        await portfolio
          .connect(nonOwner)
          .multiTokenDeposit(inputAmounts, "0", permit, signature);

        const supplyAfter = await portfolio.totalSupply();
        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("charge performance fee should fail if caller is not asset manager", async () => {
        await expect(
          feeModule0.connect(nonOwner).chargePerformanceFee()
        ).to.be.revertedWithCustomError(feeModule0, "CallerNotAssetManager");
      });

      it("should charge protocol and management fee", async () => {
        await feeModule0.chargeProtocolAndManagementFees();
      });

      it("should not be able to witdraw if idx token is less then minPortfolioTokenHoldingAmount and not zero", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        let amountPortfolioToken = await portfolio.balanceOf(owner.address);
        console.log("amountPortfolioToken", amountPortfolioToken);
        amountPortfolioToken =
          BigNumber.from(amountPortfolioToken).sub("10000000000");
        await expect(
          portfolio.multiTokenWithdrawal(amountPortfolioToken, {
            _factory: ensoHandler.address,
            _token0: zeroAddress, //USDT - Pool token
            _token1: zeroAddress, //USDC - Pool token
            _flashLoanToken: zeroAddress, //Token to take flashlaon
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address, //Handler to swap
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          })
        ).to.be.revertedWithCustomError(
          portfolio,
          "CallerNeedToMaintainMinTokenAmount"
        );
      });

      it("assetmanager should not be able to change the minPortfolioTokenHoldingAmount to value less then set by protocol", async () => {
        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);

        await expect(
          assetManagementConfig.updateMinPortfolioTokenHoldingAmount("100000")
        ).to.be.revertedWithCustomError(
          assetManagementConfig,
          "InvalidMinPortfolioTokenHoldingAmount"
        );
      });

      it("assetmanager should not be able to set zero minPortfolioTokenHoldingAmount", async () => {
        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);

        await expect(
          assetManagementConfig.updateMinPortfolioTokenHoldingAmount("0")
        ).to.be.revertedWithCustomError(
          assetManagementConfig,
          "InvalidMinPortfolioTokenHoldingAmount"
        );
      });

      it("assetmanager should be able to set new minPortfolioTokenHoldingAmount", async () => {
        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);

        await assetManagementConfig.updateMinPortfolioTokenHoldingAmount(
          "10000000000000001"
        );
      });

      it("non assetmanager should not be able to change the minPortfolioTokenHoldingAmount", async () => {
        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);

        await expect(
          assetManagementConfig
            .connect(nonOwner)
            .updateMinPortfolioTokenHoldingAmount("1000000")
        ).to.be.reverted;
      });

      it("should not be able to witdraw if idx token is less then updated minPortfolioTokenHoldingAmount and not zero", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);
        let amountPortfolioToken = await portfolio.balanceOf(owner.address);
        console.log("amountPortfolioToken", amountPortfolioToken);
        amountPortfolioToken =
          BigNumber.from(amountPortfolioToken).sub("100000");
        await expect(
          portfolio.multiTokenWithdrawal(amountPortfolioToken, {
            _factory: ensoHandler.address,
            _token0: zeroAddress, //USDT - Pool token
            _token1: zeroAddress, //USDC - Pool token
            _flashLoanToken: zeroAddress, //Token to take flashlaon
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address, //Handler to swap
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          })
        ).to.be.revertedWithCustomError(
          portfolio,
          "CallerNeedToMaintainMinTokenAmount"
        );
      });

      it("should protocol pause", async () => {
        await protocolConfig.setEmergencyPause(true, false);
      });

      it("charge performance fee should fail if protocol emergency paused", async () => {
        await expect(
          feeModule0.chargePerformanceFee()
        ).to.be.revertedWithCustomError(feeModule0, "ProtocolEmergencyPaused");
      });

      it("charge protocol and management fee should fail if protocol emergency paused", async () => {
        await expect(
          feeModule0.chargeProtocolAndManagementFees()
        ).to.be.revertedWithCustomError(feeModule0, "ProtocolEmergencyPaused");
      });

      it("withdraw in multitoken by owner should fail if protocol is emergency paused", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        const amountPortfolioToken = await portfolio.balanceOf(owner.address);

        await expect(
          portfolio.multiTokenWithdrawal(BigNumber.from(amountPortfolioToken), {
            _factory: ensoHandler.address,
            _token0: zeroAddress, //USDT - Pool token
            _token1: zeroAddress, //USDC - Pool token
            _flashLoanToken: zeroAddress, //Token to take flashlaon
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address, //Handler to swap
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          })
        ).to.be.revertedWithCustomError(portfolio, "ProtocolIsPaused");
      });

      it("unpause only withdrawal", async () => {
        await protocolConfig.setEmergencyPause(false, false);
      });

      it("should fail to withdraw in multitoken for owner if tokens are not approved", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        const supplyBefore = await portfolio.totalSupply();
        const amountPortfolioToken = await portfolio.balanceOf(owner.address);

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokens = await portfolio.getTokens();
        const token0BalanceBefore = await ERC20.attach(tokens[0]).balanceOf(
          owner.address
        );
        const token1BalanceBefore = await ERC20.attach(tokens[1]).balanceOf(
          owner.address
        );
        const token2BalanceBefore = await ERC20.attach(tokens[2]).balanceOf(
          owner.address
        );

        await expect(
          portfolio
            .connect(nonOwner)
            .multiTokenWithdrawalFor(
              owner.address,
              owner.address,
              BigNumber.from(amountPortfolioToken),
              {
                _factory: ensoHandler.address,
                _token0: zeroAddress, //USDT - Pool token
                _token1: zeroAddress, //USDC - Pool token
                _flashLoanToken: zeroAddress, //Token to take flashlaon
                _bufferUnit: "0",
                _solverHandler: ensoHandler.address, //Handler to swap
                _flashLoanAmount: [0],
                firstSwapData: ["0x"],
                secondSwapData: ["0x"],
              }
            )
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("should withdraw in multitoken for owner", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        const supplyBefore = await portfolio.totalSupply();
        const amountPortfolioToken = await portfolio.balanceOf(owner.address);

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokens = await portfolio.getTokens();
        const token0BalanceBefore = await ERC20.attach(tokens[0]).balanceOf(
          owner.address
        );
        const token1BalanceBefore = await ERC20.attach(tokens[1]).balanceOf(
          owner.address
        );
        const token2BalanceBefore = await ERC20.attach(tokens[2]).balanceOf(
          owner.address
        );

        await portfolio.approve(
          nonOwner.address,
          BigNumber.from(amountPortfolioToken)
        );

        await portfolio
          .connect(nonOwner)
          .multiTokenWithdrawalFor(
            owner.address,
            owner.address,
            BigNumber.from(amountPortfolioToken),
            {
              _factory: ensoHandler.address,
              _token0: zeroAddress, //USDT - Pool token
              _token1: zeroAddress, //USDC - Pool token
              _flashLoanToken: zeroAddress, //Token to take flashlaon
              _bufferUnit: "0",
              _solverHandler: ensoHandler.address, //Handler to swap
              _flashLoanAmount: [0],
              firstSwapData: ["0x"],
              secondSwapData: ["0x"],
            }
          );

        const supplyAfter = await portfolio.totalSupply();

        const token0BalanceAfter = await ERC20.attach(tokens[0]).balanceOf(
          owner.address
        );
        const token1BalanceAfter = await ERC20.attach(tokens[1]).balanceOf(
          owner.address
        );
        const token2BalanceAfter = await ERC20.attach(tokens[2]).balanceOf(
          owner.address
        );

        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
        expect(Number(token0BalanceAfter)).to.be.greaterThan(
          Number(token0BalanceBefore)
        );
        expect(Number(token1BalanceAfter)).to.be.greaterThan(
          Number(token1BalanceBefore)
        );
        expect(Number(token2BalanceAfter)).to.be.greaterThan(
          Number(token2BalanceBefore)
        );
        console.log(
          "token0Balance",
          BigNumber.from(token0BalanceAfter).sub(token0BalanceBefore)
        );
        console.log(
          "token1Balance",
          BigNumber.from(token1BalanceAfter).sub(token1BalanceBefore)
        );
        console.log(
          "token2Balance",
          BigNumber.from(token2BalanceAfter).sub(token2BalanceBefore)
        );
        console.log("supplyAfter", supplyAfter);
      });

      it("should protocol pause", async () => {
        await protocolConfig.setProtocolPause(false);
      });

      it("should withdraw multitoken by nonOwner", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        const supplyBefore = await portfolio.totalSupply();
        const amountPortfolioToken = await portfolio.balanceOf(
          nonOwner.address
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokens = await portfolio.getTokens();
        const token0BalanceBefore = await ERC20.attach(tokens[0]).balanceOf(
          nonOwner.address
        );
        const token1BalanceBefore = await ERC20.attach(tokens[1]).balanceOf(
          nonOwner.address
        );

        await portfolio
          .connect(nonOwner)
          .approve(owner.address, BigNumber.from(amountPortfolioToken));

        await portfolio.emergencyWithdrawalFor(
          nonOwner.address,
          nonOwner.address,
          amountPortfolioToken,
          [tokens[0], tokens[1]],
          {
            _factory: ensoHandler.address,
            _token0: zeroAddress, //USDT - Pool token
            _token1: zeroAddress, //USDC - Pool token
            _flashLoanToken: zeroAddress, //Token to take flashlaon
            _bufferUnit: "0",
            _solverHandler: ensoHandler.address, //Handler to swap
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          }
        );

        const supplyAfter = await portfolio.totalSupply();

        const token0BalanceAfter = await ERC20.attach(tokens[0]).balanceOf(
          nonOwner.address
        );
        const token1BalanceAfter = await ERC20.attach(tokens[1]).balanceOf(
          nonOwner.address
        );

        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
        expect(Number(token0BalanceAfter)).to.be.greaterThan(
          Number(token0BalanceBefore)
        );
        expect(Number(token1BalanceAfter)).to.be.greaterThan(
          Number(token1BalanceBefore)
        );
        expect(Number(await portfolio.balanceOf(nonOwner.address))).to.be.equal(
          0
        );
        console.log(
          "token0Balance",
          BigNumber.from(token0BalanceAfter).sub(token0BalanceBefore)
        );
        console.log(
          "token1Balance",
          BigNumber.from(token1BalanceAfter).sub(token1BalanceBefore)
        );
        console.log("supplyAfter", supplyAfter);
      });

      it("assetmanager should be able to change initialPortfolioAmount", async () => {
        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);

        await assetManagementConfig.updateInitialPortfolioAmount(
          "100000000000000000"
        );
      });

      it("treasuries withdrawal should fail, if exemption token list is greater then portoflio tokens", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        const amountPortfolioTreasury = await portfolio.balanceOf(
          treasury.address
        );

        let exemptionTokens = [
          addresses.ARB,
          addresses.WBTC,
          addresses.WETH,
          addresses.DAI,
          addresses.ADoge,
          addresses.USDCe,
        ];

        await expect(
          portfolio
            .connect(treasury)
            .emergencyWithdrawal(amountPortfolioTreasury, exemptionTokens, {
              _factory: ensoHandler.address,
              _token0: zeroAddress, //USDT - Pool token
              _token1: zeroAddress, //USDC - Pool token
              _flashLoanToken: zeroAddress, //Token to take flashlaon
              _bufferUnit: "0",
              _solverHandler: ensoHandler.address, //Handler to swap
              _flashLoanAmount: [0],
              firstSwapData: ["0x"],
              secondSwapData: ["0x"],
            })
        ).to.be.revertedWithCustomError(
          portfolio,
          "InvalidExemptionTokensLength"
        );
      });

      it("treasuries should withdraw their fee", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        const supplyBefore = await portfolio.totalSupply();
        const amountPortfolioTreasury = await portfolio.balanceOf(
          treasury.address
        );
        const tokens = await portfolio.getTokens();
        let balanceBefore = [];

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        for (let i = 0; i < 2; i++) {
          balanceBefore[i] = await ERC20.attach(tokens[i]).balanceOf(
            treasury.address
          );
        }

        let exemptionTokens = [tokens[2]];

        await portfolio
          .connect(treasury)
          .emergencyWithdrawal(amountPortfolioTreasury, exemptionTokens, {
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

        for (let i = 0; i < 2; i++) {
          let balanceAfter = await ERC20.attach(tokens[i]).balanceOf(
            treasury.address
          );
          expect(Number(balanceAfter)).to.be.greaterThan(balanceBefore[i]);
        }

        expect(Number(supplyBefore)).to.be.greaterThan(supplyAfter);
      });

      it("new user should mint token based on new initialPortfolioAmount", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const supplyBefore = await portfolio.totalSupply();

        let tokenDetails = [];
        // swap native token to deposit token
        let amounts = [];
        let newAmounts = [];

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
        await portfolio.multiTokenDeposit(amounts, "0", permit, signature);

        const supplyAfter = await portfolio.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        expect(supplyAfter.toString()).to.be.equals("100000000000000000");
        console.log("supplyAfter", supplyAfter);
      });
    });
  });
});
