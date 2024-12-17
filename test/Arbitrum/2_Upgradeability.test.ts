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
  tokenAddresses,
  IAddresses,
  accessController,
  priceOracle,
} from "./Deployments.test";

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
  TokenBalanceLibrary,
  BorrowManagerAave,
  FeeModule__factory,
  UniswapV2Handler,
  AssetManagementConfig,
  AccessControl,
  TokenExclusionManager__factory,
  EnsoHandler,
} from "../../typechain";

import { chainIdToAddresses } from "../../scripts/networkVariables";

var chai = require("chai");
const axios = require("axios");
const qs = require("qs");
//use default BigNumber
chai.use(require("chai-bignumber")());

describe.only("Tests for Upgradeability", () => {
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
  let borrowManager: BorrowManagerAave;
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

  // upgradeability value testing
  let vaultBefore: any;
  let safeModuleBefore: any;
  let tokenExclusionManagerBefore: any;
  let assetManagerConfigBefore: any;
  let protocolConfigBefore: any;
  let feeModuleBefore: any;

  let lastProtocolFeeChargedBefore: any;
  let lastManagementFeeChargedBefore: any;
  let highWaterMarkBefore: any;

  const forkChainId: any = process.env.FORK_CHAINID;
  const provider = ethers.provider;
  const chainId: any = forkChainId ? forkChainId : 42161;
  const addresses = chainIdToAddresses[chainId];

  const SLIPPAGE = "500";

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

      const BorrowManager = await ethers.getContractFactory("BorrowManagerAave");
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

      const EnsoHandler = await ethers.getContractFactory("EnsoHandler");
      ensoHandler = await EnsoHandler.deploy();
      await ensoHandler.deployed();

      swapHandler.init(addresses.SushiSwapRouterAddress);

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

      const FeeModule = await ethers.getContractFactory("FeeModule", {});
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
      feeModule0 = await FeeModule.attach(await portfolio.feeModule());
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

    describe("Upgradeability Testing", function () {
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
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multitoken into fund by nonOwner(Second Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const supplyBefore = await portfolio.totalSupply();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        let tokenDetails = [];

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

        await portfolio
          .connect(nonOwner)
          .multiTokenDeposit(inputAmounts, "0", permit, signature);

        const supplyAfter = await portfolio.totalSupply();
        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should withdraw in multitoken by owner", async () => {
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

        await portfolio.multiTokenWithdrawal(
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

      it("should withdraw multitoken by nonOwner", async () => {
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
        const token2BalanceBefore = await ERC20.attach(tokens[2]).balanceOf(
          nonOwner.address
        );

        await portfolio
          .connect(nonOwner)
          .multiTokenWithdrawal(amountPortfolioToken, {
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

        const token0BalanceAfter = await ERC20.attach(tokens[0]).balanceOf(
          nonOwner.address
        );
        const token1BalanceAfter = await ERC20.attach(tokens[1]).balanceOf(
          nonOwner.address
        );
        const token2BalanceAfter = await ERC20.attach(tokens[2]).balanceOf(
          nonOwner.address
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
        console.log(
          "token2Balance",
          BigNumber.from(token2BalanceAfter).sub(token2BalanceBefore)
        );
        console.log("supplyAfter", supplyAfter);
      });

      it("store values to validate upgradeability", async () => {
        vaultBefore = await portfolio.vault();
        safeModuleBefore = await portfolio.safeModule();
        tokenExclusionManagerBefore = await portfolio.tokenExclusionManager();

        /* 
          the following 3 variables are defined in Portfolio which is aggregating all parent contracts 
          if there would be a storage collision before those values would be affected
        */
        assetManagerConfigBefore = await portfolio.assetManagementConfig();
        protocolConfigBefore = await portfolio.protocolConfig();
        feeModuleBefore = await portfolio.feeModule();
      });

      // upgrade to V3.2
      it("should pause protocol", async () => {
        await protocolConfig.setProtocolPause(true);
      });

      it("validate values after upgrading the contract", async () => {
        expect(await portfolio.vault()).to.be.equal(vaultBefore);
        expect(await portfolio.safeModule()).to.be.equal(safeModuleBefore);
        expect(await portfolio.tokenExclusionManager()).to.be.equal(
          tokenExclusionManagerBefore
        );
        expect(await portfolio.assetManagementConfig()).to.be.equal(
          assetManagerConfigBefore
        );
        expect(await portfolio.protocolConfig()).to.be.equal(
          protocolConfigBefore
        );
        expect(await portfolio.feeModule()).to.be.equal(feeModuleBefore);
      });

      it("should upgrade portfolio contract to V3.2", async () => {
        const PortfolioV3_2 = await ethers.getContractFactory("PortfolioV3_2", {
          libraries: {
            TokenBalanceLibrary: tokenBalanceLibrary.address,
          },
        });
        const portfolioContractV3_2 = await PortfolioV3_2.deploy();
        await portfolioContractV3_2.deployed();

        const proxyAddress = await portfolioFactory.getPortfolioList(0);
        await portfolioFactory.upgradePortfolio(
          [proxyAddress],
          portfolioContractV3_2.address
        );
      });

      it("should unpause protocol", async () => {
        await protocolConfig.setProtocolPause(false);
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
        console.log("inputAmounts for owner", amounts);

        const supplyAfter = await portfolio.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multitoken into fund by nonOwner(Second Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];

        const supplyBefore = await portfolio.totalSupply();
        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];

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

      it("should withdraw in multitoken by owner", async () => {
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

        await portfolio.multiTokenWithdrawal(
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
        const token2BalanceBefore = await ERC20.attach(tokens[2]).balanceOf(
          nonOwner.address
        );

        await portfolio
          .connect(nonOwner)
          .multiTokenWithdrawal(amountPortfolioToken, {
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

        const token0BalanceAfter = await ERC20.attach(tokens[0]).balanceOf(
          nonOwner.address
        );
        const token1BalanceAfter = await ERC20.attach(tokens[1]).balanceOf(
          nonOwner.address
        );
        const token2BalanceAfter = await ERC20.attach(tokens[2]).balanceOf(
          nonOwner.address
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
        console.log(
          "token2Balance",
          BigNumber.from(token2BalanceAfter).sub(token2BalanceBefore)
        );
        console.log("supplyAfter", supplyAfter);
      });

      it("store values to validate upgradeability", async () => {
        vaultBefore = await portfolio.vault();
        safeModuleBefore = await portfolio.safeModule();
        tokenExclusionManagerBefore = await portfolio.tokenExclusionManager();
        assetManagerConfigBefore = await portfolio.assetManagementConfig();
        protocolConfigBefore = await portfolio.protocolConfig();
        feeModuleBefore = await portfolio.feeModule();
      });

      // upgrade to V3.3
      it("should pause protocol", async () => {
        await protocolConfig.setProtocolPause(true);
      });

      it("validate values after upgrading the contract", async () => {
        expect(await portfolio.vault()).to.be.equal(vaultBefore);
        expect(await portfolio.safeModule()).to.be.equal(safeModuleBefore);
        expect(await portfolio.tokenExclusionManager()).to.be.equal(
          tokenExclusionManagerBefore
        );
        expect(await portfolio.assetManagementConfig()).to.be.equal(
          assetManagerConfigBefore
        );
        expect(await portfolio.protocolConfig()).to.be.equal(
          protocolConfigBefore
        );
        expect(await portfolio.feeModule()).to.be.equal(feeModuleBefore);
      });

      it("should upgrade portfolio contract to V3.3", async () => {
        const PortfolioV3_3 = await ethers.getContractFactory("PortfolioV3_3", {
          libraries: {
            TokenBalanceLibrary: tokenBalanceLibrary.address,
          },
        });
        const portfolioContractV3_3 = await PortfolioV3_3.deploy();
        await portfolioContractV3_3.deployed();

        const proxyAddress = await portfolioFactory.getPortfolioList(0);
        await portfolioFactory.upgradePortfolio(
          [proxyAddress],
          portfolioContractV3_3.address
        );
      });

      it("should unpause protocol", async () => {
        await protocolConfig.setProtocolPause(false);
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
        console.log("inputAmounts for owner", amounts);

        const supplyAfter = await portfolio.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multitoken into fund by nonOwner(Second Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];

        let tokenDetails = [];

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

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

      it("should withdraw in multitoken by owner", async () => {
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

        await portfolio.multiTokenWithdrawal(
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

      it("should withdraw multitoken by nonOwner", async () => {
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
        const token2BalanceBefore = await ERC20.attach(tokens[2]).balanceOf(
          nonOwner.address
        );

        await portfolio
          .connect(nonOwner)
          .multiTokenWithdrawal(amountPortfolioToken, {
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

        const token0BalanceAfter = await ERC20.attach(tokens[0]).balanceOf(
          nonOwner.address
        );
        const token1BalanceAfter = await ERC20.attach(tokens[1]).balanceOf(
          nonOwner.address
        );
        const token2BalanceAfter = await ERC20.attach(tokens[2]).balanceOf(
          nonOwner.address
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
        console.log(
          "token2Balance",
          BigNumber.from(token2BalanceAfter).sub(token2BalanceBefore)
        );
        console.log("supplyAfter", supplyAfter);
      });

      it("should pause protocol", async () => {
        await protocolConfig.setProtocolPause(true);
      });

      it("store fee values before upgrade", async () => {
        lastProtocolFeeChargedBefore =
          await feeModule0.lastChargedProtocolFee();
        lastManagementFeeChargedBefore =
          await feeModule0.lastChargedManagementFee();
        highWaterMarkBefore = await feeModule0.highWatermark();
      });

      it("should upgrade the fee module", async () => {
        const FeeModuleV3_2 = await ethers.getContractFactory("FeeModuleV3_2");
        const newFeeImpl = await FeeModuleV3_2.deploy();
        await newFeeImpl.deployed();

        await portfolioFactory.upgradeFeeModule(
          [feeModule0.address],
          newFeeImpl.address
        );
      });

      it("validate values after upgrade", async () => {
        expect(await feeModule0.lastChargedProtocolFee()).to.be.equal(
          lastProtocolFeeChargedBefore
        );
        expect(await feeModule0.lastChargedManagementFee()).to.be.equal(
          lastManagementFeeChargedBefore
        );
        expect(await feeModule0.highWatermark()).to.be.equal(
          highWaterMarkBefore
        );
      });

      it("should unpause protocol", async () => {
        await protocolConfig.setProtocolPause(false);
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
        console.log("inputAmounts for owner", amounts);

        const supplyAfter = await portfolio.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("should deposit multitoken into fund by nonOwner(Second Deposit)", async () => {
        let amounts = [];
        let newAmounts: any = [];

        let tokenDetails = [];

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

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

      it("should withdraw in multitoken by owner", async () => {
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

        await portfolio.multiTokenWithdrawal(
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

      it("should withdraw multitoken by nonOwner", async () => {
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
        const token2BalanceBefore = await ERC20.attach(tokens[2]).balanceOf(
          nonOwner.address
        );

        await portfolio
          .connect(nonOwner)
          .multiTokenWithdrawal(amountPortfolioToken, {
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

        const token0BalanceAfter = await ERC20.attach(tokens[0]).balanceOf(
          nonOwner.address
        );
        const token1BalanceAfter = await ERC20.attach(tokens[1]).balanceOf(
          nonOwner.address
        );
        const token2BalanceAfter = await ERC20.attach(tokens[2]).balanceOf(
          nonOwner.address
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
        console.log(
          "token2Balance",
          BigNumber.from(token2BalanceAfter).sub(token2BalanceBefore)
        );
        console.log("supplyAfter", supplyAfter);
      });

      // upgrade to V3.4
      it("should pause protocol", async () => {
        await protocolConfig.setProtocolPause(true);
      });

      it("should upgrade portfolio contract to V3.4", async () => {
        const PortfolioV3_4 = await ethers.getContractFactory("PortfolioV3_4", {
          libraries: {
            TokenBalanceLibrary: tokenBalanceLibrary.address,
          },
        });
        const portfolioContractV3_4 = await PortfolioV3_4.deploy();
        await portfolioContractV3_4.deployed();

        const proxyAddress = await portfolioFactory.getPortfolioList(0);
        await portfolioFactory.upgradePortfolio(
          [proxyAddress],
          portfolioContractV3_4.address
        );
      });

      it("should unpause protocol", async () => {
        await protocolConfig.setProtocolPause(false);
      });

      it("deposit should fail after wrong upgrade", async () => {
        // by adding a new mapping without decreasing the storage gap the storage got messed up
        // by adding a new mapping without decreasing the storage gap the storage got messed up

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];
        // swap native token to deposit token

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        const permit: PermitBatch = {
          details: [
            {
              token: addresses.USDCe,
              amount: 1,
              expiration: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
              nonce: 0,
            },
          ],
          spender: portfolio.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await owner._signTypedData(domain, types, values);
        let amounts = ["10000", "10000"];
        await expect(
          portfolio.multiTokenDeposit(amounts, "0", permit, signature)
        ).to.be.reverted;
      });

      // upgrade back to V3.3
      it("should pause protocol", async () => {
        await protocolConfig.setProtocolPause(true);
      });

      it("owner should be able upgrade back to portfolio contract to V3.3 after wrong upgrade", async () => {
        // storage also includes the owner and the structure got messed up
        const PortfolioV3_3 = await ethers.getContractFactory("PortfolioV3_3", {
          libraries: {
            TokenBalanceLibrary: tokenBalanceLibrary.address,
          },
        });
        const portfolioContractV3_3 = await PortfolioV3_3.deploy();
        await portfolioContractV3_3.deployed();

        const proxyAddress = await portfolioFactory.getPortfolioList(0);
        await portfolioFactory.upgradePortfolio(
          [proxyAddress],
          portfolioContractV3_3.address
        );
      });

      it("owner should be able upgrade tokenExclusionManager", async () => {
        const TokenExclusionManagerV3_2 = await ethers.getContractFactory(
          "TokenExclusionManagerV3_2"
        );
        const tokenExclusionManagerV3_2 =
          await TokenExclusionManagerV3_2.deploy();
        await tokenExclusionManagerV3_2.deployed();

        const portfolioInfo = await portfolioFactory.PortfolioInfolList(0);

        const proxyAddress = await ethers.getContractAt(
          TokenExclusionManager__factory.abi,
          portfolioInfo.tokenExclusionManager
        );

        await portfolioFactory.upgradePortfolio(
          [proxyAddress.address],
          tokenExclusionManagerV3_2.address
        );
      });

      it("store values to validate upgradeability", async () => {
        vaultBefore = await portfolio.vault();
        safeModuleBefore = await portfolio.safeModule();
        tokenExclusionManagerBefore = await portfolio.tokenExclusionManager();

        /* 
          the following 3 variables are defined in Portfolio which is aggregating all parent contracts 
          if there would be a storage collision before those values would be affected
        */
        assetManagerConfigBefore = await portfolio.assetManagementConfig();
        protocolConfigBefore = await portfolio.protocolConfig();
        feeModuleBefore = await portfolio.feeModule();
      });
    });
  });
});
