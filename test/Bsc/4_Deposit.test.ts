import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import "@nomicfoundation/hardhat-chai-matchers";
import { ethers, upgrades } from "hardhat";
import { BigNumber } from "ethers";

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
  TokenBalanceLibrary,
  BorrowManagerVenus,
  AccessController__factory,
  TokenExclusionManager__factory,
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
  let portfolioCalculations1: any;
  let tokenExclusionManager: any;
  let tokenExclusionManager1: any;
  let ensoHandler: EnsoHandler;
  let ensoHandlerBundled: EnsoHandlerBundled;
  let portfolioContract: Portfolio;
  let portfolioFactory: PortfolioFactory;
  let swapHandler: UniswapV2Handler;
  let borrowManager: BorrowManagerVenus;
  let tokenBalanceLibrary: TokenBalanceLibrary;
  let rebalancing: any;
  let rebalancing1: any;
  let protocolConfig: ProtocolConfig;
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

      await protocolConfig.setSupportedFactory(addresses.thena_factory);

      await protocolConfig.enableRewardTarget(addresses.venus_RewardToken);

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

      console.log("portfolioFactory address:", portfolioFactory.address);
      const portfolioFactoryCreate =
        await portfolioFactory.createPortfolioNonCustodial({
          _name: "PORTFOLIOLY",
          _symbol: "IDX",
          _managementFee: "200",
          _performanceFee: "2500",
          _entryFee: "100",
          _exitFee: "0",
          _initialPortfolioAmount: "100000000000000000000",
          _minPortfolioTokenHoldingAmount: "10000000000000000",
          _assetManagerTreasury: _assetManagerTreasury.address,
          _whitelistedTokens: whitelistedTokens,
          _public: true,
          _transferable: false,
          _transferableToPublic: false,
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
          _transferable: true,
          _transferableToPublic: true,
          _whitelistTokens: false,
          _externalPositionManagementWhitelisted: true,
        });
      const portfolioAddress = await portfolioFactory.getPortfolioList(0);
      const portfolioInfo = await portfolioFactory.PortfolioInfolList(0);

      feeModule0 = FeeModule.attach(portfolioInfo.feeModule);

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
      portfolioCalculations = await PortfolioCalculations.deploy();
      await portfolioCalculations.deployed();

      portfolio1 = await ethers.getContractAt(
        Portfolio__factory.abi,
        portfolioAddress1
      );
      portfolioCalculations1 = await PortfolioCalculations.deploy();
      await portfolioCalculations.deployed();

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

      const accessController1 = await ethers.getContractAt(
        AccessController__factory.abi,
        await portfolio.accessController()
      );

      // Grant owner asset manager role
      await accessController1.grantRole(assetManagerHash, owner.address);

      console.log("portfolio deployed to:", portfolio.address);

      console.log("rebalancing:", rebalancing1.address);
    });

    describe("Enso Tests", function () {
      it("Initialize should fail if the number of tokens exceed the max limit set during deployment (current = 15)", async () => {
        await expect(
          portfolio.initToken([
            iaddress.wbnbAddress,
            iaddress.linkAddress,
            iaddress.ethAddress,
            iaddress.daiAddress,
            iaddress.btcAddress,
            iaddress.dogeAddress,
            addresses.vETH_Address,
            addresses.vBTC_Address,
            addresses.vBNB_Address,
            addresses.vDAI_Address,
            addresses.vDOGE_Address,
            addresses.vLINK_Address,
            addresses.Cake_BUSDLP_Address,
            addresses.Cake_WBNBLP_Address,
            addresses.WBNB_BUSDLP_Address,
            addresses.ADA_WBNBLP_Address,
            addresses.BAND_WBNBLP_Address,
          ])
        ).to.be.revertedWithCustomError(portfolio, "TokenCountOutOfLimit");
      });

      it("should retrieve the current max asset limit from the ProtocolConfig", async () => {
        expect(await protocolConfig.assetLimit()).to.equal(15);
      });

      it("should update the max asset limit to 10 in the ProtocolConfig", async () => {
        await protocolConfig.setAssetLimit(10);
        expect(await protocolConfig.assetLimit()).to.equal(10);
      });

      it("should revert if not a superAdmin + nonRebalancer contract calls functions", async () => {
        await expect(
          portfolio
            .connect(addr2)
            .initToken([iaddress.wbnbAddress, iaddress.busdAddress])
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
            iaddress.wbnbAddress,
            iaddress.usdtAddress,
            iaddress.ethAddress,
            iaddress.btcAddress,
            iaddress.daiAddress,
            addresses.vETH_Address,
            addresses.vBTC_Address,
            addresses.vBNB_Address,
            addresses.vDAI_Address,
            addresses.vDOGE_Address,
            addresses.vLINK_Address,
          ])
        ).to.be.revertedWithCustomError(portfolio, "TokenCountOutOfLimit");
      });

      it("should init tokens", async () => {
        await portfolio.initToken([
          iaddress.usdcAddress,
          iaddress.btcAddress,
          iaddress.ethAddress,
          iaddress.dogeAddress,
          iaddress.usdtAddress,
          iaddress.cakeAddress,
        ]);
      });

      it("should init 2nd portfolio tokens", async () => {
        await portfolio1
          .connect(nonOwner)
          .initToken([
            iaddress.usdcAddress,
            iaddress.btcAddress,
            iaddress.ethAddress,
            iaddress.dogeAddress,
            iaddress.usdtAddress,
            iaddress.cakeAddress,
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
            _assetManagerTreasury.address,
            tokens[i],
            portfolio.address
          );
          let balance = await ERC20.attach(tokens[i]).balanceOf(
            _assetManagerTreasury.address
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
        const signature = await _assetManagerTreasury._signTypedData(
          domain,
          types,
          values
        );

        await expect(
          portfolio
            .connect(_assetManagerTreasury)
            .multiTokenDeposit(amounts, "0", permit, signature)
        ).to.be.revertedWithCustomError(portfolio, "UserNotAllowedToDeposit");
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

      it("nonOWner and addr1 should approve tokens to permit2 contract", async () => {
        const tokens = await portfolio1.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          await ERC20.attach(tokens[i])
            .connect(nonOwner)
            .approve(PERMIT2_ADDRESS, MaxAllowanceTransferAmount);

          await ERC20.attach(tokens[i])
            .connect(addr1)
            .approve(PERMIT2_ADDRESS, MaxAllowanceTransferAmount);
        }
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
          let balance = await ERC20.attach(tokens[i]).balanceOf(
            treasury.address
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
        const signature = await treasury._signTypedData(domain, types, values);

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

      it("owner should be able to update the protocol streaming fee", async () => {
        await protocolConfig.updateProtocolStreamingFee("100");
      });

      // it("should deposit multitoken into fund (Second Deposit)", async () => {
      //   await ethers.provider.send("evm_increaseTime", [15780000]);

      //   let amounts = [];
      //   let newAmounts: any = [];
      //   let leastPercentage = 0;
      //   const supplyBefore = await portfolio.totalSupply();
      //   const tokens = await portfolio.getTokens();
      //   const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

      //   function toDeadline(expiration: number) {
      //     return Math.floor((Date.now() + expiration) / 1000);
      //   }

      //   const permit2 = await ethers.getContractAt(
      //     "IAllowanceTransfer",
      //     PERMIT2_ADDRESS,
      //   );

      //   let tokenDetails = [];

      //   for (let i = 0; i < tokens.length; i++) {
      //     let { nonce } = await permit2.allowance(
      //       owner.address,
      //       tokens[i],
      //       portfolio.address,
      //     );
      //     console.log("NONCE",nonce);
      //     await swapHandler.swapETHToTokens("500", tokens[i], owner.address, {
      //       value: "100000000000000000",
      //     });
      //     let balance = await ERC20.attach(tokens[i]).balanceOf(owner.address);
      //     let detail = {
      //       token: tokens[i],
      //       amount: balance,
      //       expiration: toDeadline(/* 30 minutes = */ 1000 * 60 * 60 * 30),
      //       nonce,
      //     };
      //     amounts.push(balance);
      //     tokenDetails.push(detail);
      //   }

      //   const permit: PermitBatch = {
      //     details: tokenDetails,
      //     spender: portfolio.address,
      //     sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
      //   };

      //   const { domain, types, values } = AllowanceTransfer.getPermitData(
      //     permit,
      //     PERMIT2_ADDRESS,
      //     chainId,
      //   );
      //   const signature = await owner._signTypedData(domain, types, values);

      //   // Calculation to make minimum amount value for user---------------------------------
      //   let result = await portfolioCalculations.getUserAmountToDeposit(
      //     amounts,
      //   );
      //   //-----------------------------------------------------------------------------------

      //   newAmounts = result[0];
      //   leastPercentage = result[1];

      //   let inputAmounts = [];
      //   for (let i = 0; i < newAmounts.length; i++) {
      //     inputAmounts.push(ethers.BigNumber.from(newAmounts[i]).toString());
      //   }

      //   console.log("leastPercentage ", leastPercentage);
      //   console.log("totalSupply ", await portfolio.totalSupply());

      //   let mintAmount =
      //     (await calcuateExpectedMintAmount(
      //       leastPercentage,
      //       await portfolio.totalSupply(),
      //     )) * 0.98; // 2% entry fee

      //   let userBalanceBefore = await portfolio.balanceOf(owner.address);

      //   // considering 1% slippage
      //   let tx = await portfolio.multiTokenDeposit(
      //     inputAmounts,
      //     (Math.abs(mintAmount) * 0.99).toString(),
      //     permit,
      //     signature, // slippage 1%
      //   );

      //   let userBalanceAfter = await portfolio.balanceOf(owner.address);

      //   let receipt = await tx.wait();
      //   const FeeModuleAbi = new ethers.utils.Interface(FeeModule__factory.abi);

      //   // Define the event signature
      //   const eventSignature =
      //     "ManagementFeeCalculated(uint256,uint256,uint256)";

      //   // Calculate the Keccak-256 hash of the event signature
      //   const eventSignatureHash = ethers.utils.keccak256(
      //     ethers.utils.toUtf8Bytes(eventSignature),
      //   );

      //   let protocolStreamingFee;
      //   let managementStreamingFee;
      //   let protocolFeeCut;
      //   let entryFeeAssetManager;
      //   let entryFeeProtocol;

      //   for (const log of receipt.logs) {
      //     if (log.topics && log.topics[0] == eventSignatureHash) {
      //       try {
      //         const parsedLog = FeeModuleAbi.parseLog(log);
      //         protocolStreamingFee =
      //           parsedLog.args["protocolStreamingFeeAmount"];
      //         managementStreamingFee = parsedLog.args["managementFeeAmount"];
      //         protocolFeeCut = parsedLog.args["protocolFeeCutAmount"];
      //       } catch (error) {
      //         // This log was not from the contract of interest or not an event we have in our ABI
      //         console.error("Error parsing log:", error);
      //       }
      //     }
      //   }

      //   // Define the event signature
      //   const eventSignatureEntryExit = "EntryExitFeeCharged(uint256,uint256)";

      //   // Calculate the Keccak-256 hash of the event signature
      //   const eventSignatureHashEntryExit = ethers.utils.keccak256(
      //     ethers.utils.toUtf8Bytes(eventSignatureEntryExit),
      //   );

      //   for (const log of receipt.logs) {
      //     if (log.topics && log.topics[0] == eventSignatureHashEntryExit) {
      //       try {
      //         const parsedLog = FeeModuleAbi.parseLog(log);
      //         entryFeeAssetManager =
      //           parsedLog.args["entryExitAssetManagerFeeAmount"];
      //         entryFeeProtocol = parsedLog.args["entryExitProtocolFeeAmount"];
      //       } catch (error) {
      //         // This log was not from the contract of interest or not an event we have in our ABI
      //         console.error("Error parsing log:", error);
      //       }
      //     }
      //   }

      //   // console.log("protocol streaming fee", protocolStreamingFee);
      //   // console.log("management streaming fee", managementStreamingFee);
      //   // console.log("protocol fee cut", protocolFeeCut);

      //   // should be 25% (fee cut from management fee)
      //   let protocolShareOfManagementFee = (
      //     Number(BigNumber.from(protocolFeeCut)) /
      //     (Number(BigNumber.from(protocolFeeCut)) +
      //       Number(BigNumber.from(managementStreamingFee)))
      //   ).toFixed(2);

      //   expect(protocolShareOfManagementFee).to.be.equal("0.25");

      //   // the tx before updates the annual protocol streaming fee to 1%, after 6 months 0.05% of the total supply should be minted as fee
      //   let protocolFeeShare6Months = (
      //     Number(BigNumber.from(protocolStreamingFee)) /
      //     Number(BigNumber.from(supplyBefore))
      //   ).toFixed(3);

      //   expect(protocolFeeShare6Months).to.be.equal("0.005");

      //   // the annual management streaming fee to 2%, after 6 months 1% of the total supply should be minted as fee
      //   let managementFeeShare6Months = (
      //     (Number(BigNumber.from(managementStreamingFee)) +
      //       Number(BigNumber.from(protocolFeeCut))) /
      //     Number(BigNumber.from(supplyBefore))
      //   ).toFixed(2);
      //   expect(managementFeeShare6Months).to.be.equal("0.01");

      //   let userBalanceIncreasement =
      //     Number(BigNumber.from(userBalanceAfter)) -
      //     Number(BigNumber.from(userBalanceBefore));

      //   let totalEntryFee =
      //     Number(BigNumber.from(entryFeeAssetManager)) +
      //     Number(BigNumber.from(entryFeeProtocol));

      //   let entryFeePercentage = (
      //     totalEntryFee /
      //     (totalEntryFee + userBalanceIncreasement)
      //   ).toFixed(2);

      //   let protocolEntryFeeShare = (
      //     Number(BigNumber.from(entryFeeProtocol)) / totalEntryFee
      //   ).toFixed(2);

      //   // 1% entry fee
      //   expect(entryFeePercentage).to.be.equal("0.01");

      //   // 25% fee cut as protocol fee
      //   expect(protocolEntryFeeShare).to.be.equal("0.25");

      //   const supplyAfter = await portfolio.totalSupply();
      //   expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
      // });

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

      // it("should deposit multitoken into fund by nonOwner(Third Deposit)", async () => {
      //   await ethers.provider.send("evm_increaseTime", [7890000]);
      //   let amounts = [];
      //   let newAmounts: any = [];

      //   const supplyBefore = await portfolio.totalSupply();

      //   function toDeadline(expiration: number) {
      //     return Math.floor((Date.now() + expiration) / 1000);
      //   }

      //   const config = await portfolio.assetManagementConfig();
      //   const AssetManagementConfig = await ethers.getContractFactory(
      //     "AssetManagementConfig",
      //   );
      //   const assetManagementConfig = AssetManagementConfig.attach(config);
      //   await assetManagementConfig.updateMinPortfolioTokenHoldingAmount(
      //     "500000000000000000",
      //   );

      //   let tokenDetails = [];

      //   const permit2 = await ethers.getContractAt(
      //     "IAllowanceTransfer",
      //     PERMIT2_ADDRESS,
      //   );

      //   const tokens = await portfolio.getTokens();
      //   const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
      //   for (let i = 0; i < tokens.length; i++) {
      //     let { nonce } = await permit2.allowance(
      //       nonOwner.address,
      //       tokens[i],
      //       portfolio.address,
      //     );
      //     await swapHandler.swapETHToTokens(
      //       "500",
      //       tokens[i],
      //       nonOwner.address,
      //       {
      //         value: "100000000000000000",
      //       },
      //     );
      //     let balance = await ERC20.attach(tokens[i]).balanceOf(
      //       nonOwner.address,
      //     );
      //     let detail = {
      //       token: tokens[i],
      //       amount: balance,
      //       expiration: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
      //       nonce,
      //     };
      //     amounts.push(balance);
      //     tokenDetails.push(detail);
      //   }

      //   const permit: PermitBatch = {
      //     details: tokenDetails,
      //     spender: portfolio.address,
      //     sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
      //   };

      //   const { domain, types, values } = AllowanceTransfer.getPermitData(
      //     permit,
      //     PERMIT2_ADDRESS,
      //     chainId,
      //   );
      //   const signature = await nonOwner._signTypedData(domain, types, values);

      //   // Calculation to make minimum amount value for user---------------------------------
      //   let result = await portfolioCalculations.getUserAmountToDeposit(
      //     amounts,
      //   );
      //   //-----------------------------------------------------------------------------------

      //   newAmounts = result[0];

      //   let inputAmounts = [];
      //   for (let i = 0; i < newAmounts.length; i++) {
      //     inputAmounts.push(ethers.BigNumber.from(newAmounts[i]).toString());
      //   }

      //   const tx = await portfolio
      //     .connect(nonOwner)
      //     .multiTokenDeposit(inputAmounts, "0", permit, signature);

      //   let receipt = await tx.wait();
      //   const FeeModuleAbi = new ethers.utils.Interface(FeeModule__factory.abi);

      //   // Define the event signature
      //   const eventSignature =
      //     "ManagementFeeCalculated(uint256,uint256,uint256)";

      //   // Calculate the Keccak-256 hash of the event signature
      //   const eventSignatureHash = ethers.utils.keccak256(
      //     ethers.utils.toUtf8Bytes(eventSignature),
      //   );

      //   let protocolStreamingFee;
      //   let managementStreamingFee;
      //   let protocolFeeCut;

      //   for (const log of receipt.logs) {
      //     if (log.topics && log.topics[0] == eventSignatureHash) {
      //       try {
      //         const parsedLog = FeeModuleAbi.parseLog(log);
      //         protocolStreamingFee =
      //           parsedLog.args["protocolStreamingFeeAmount"];
      //         managementStreamingFee = parsedLog.args["managementFeeAmount"];
      //         protocolFeeCut = parsedLog.args["protocolFeeCutAmount"];
      //       } catch (error) {
      //         // This log was not from the contract of interest or not an event we have in our ABI
      //         console.error("Error parsing log:", error);
      //       }
      //     }
      //   }

      //   // console.log("protocol streaming fee", protocolStreamingFee);
      //   // console.log("management streaming fee", managementStreamingFee);
      //   // console.log("protocol fee cut", protocolFeeCut);

      //   // should be 25% (fee cut from management fee)
      //   let protocolShareOfManagementFee = (
      //     Number(BigNumber.from(protocolFeeCut)) /
      //     (Number(BigNumber.from(protocolFeeCut)) +
      //       Number(BigNumber.from(managementStreamingFee)))
      //   ).toFixed(2);

      //   expect(protocolShareOfManagementFee).to.be.equal("0.25");

      //   // the tx before updates the annual protocol streaming fee to 1%, after 3 months 0.025% of the total supply should be minted as fee
      //   let protocolFeeShare6Months = (
      //     Number(BigNumber.from(protocolStreamingFee)) /
      //     Number(BigNumber.from(supplyBefore))
      //   ).toFixed(4);

      //   expect(protocolFeeShare6Months).to.be.equal("0.0025");

      //   // the annual management streaming fee to 2%, after 3 months 0.5% of the total supply should be minted as fee
      //   let managementFeeShare6Months = (
      //     (Number(BigNumber.from(managementStreamingFee)) +
      //       Number(BigNumber.from(protocolFeeCut))) /
      //     Number(BigNumber.from(supplyBefore))
      //   ).toFixed(3);
      //   expect(managementFeeShare6Months).to.be.equal("0.005");

      //   const supplyAfter = await portfolio.totalSupply();
      //   expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
      //   console.log("supplyAfter", supplyAfter);
      // });

      it("should deposit multitoken into 2nd fund by nonOwner(Second Deposit)", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];

        let amounts = [];

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const supplyBefore = await portfolio1.totalSupply();
        const tokens = await portfolio1.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            nonOwner.address,
            tokens[i],
            portfolio1.address
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
            expiration: toDeadline(/* 30 minutes = */ 1000 * 60 * 60 * 30),
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
        const signature = await nonOwner._signTypedData(domain, types, values);

        await portfolio1
          .connect(nonOwner)
          .multiTokenDeposit(amounts, "0", permit, signature);

        const supplyAfter = await portfolio1.totalSupply();
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
        let result = await portfolioCalculations1.getUserAmountToDeposit(
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

      it("owner should be able to update the protocol fee", async () => {
        await protocolConfig.updateProtocolFee("0");
      });

      it("should deposit multitoken into fund", async () => {
        let amounts = [];
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
        await portfolio.multiTokenDeposit(amounts, "0", permit, signature);

        const supplyAfter = await portfolio.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("update tokens with non whitelist token should revert", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.vBNB_Address;

        let newTokens = [
          buyToken,
          "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
          "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
          "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
          "0x55d398326f99059fF775485246999027B3197955",
          "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
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
        let buyToken = addresses.vBTC_Address;

        let newTokens = [
          buyToken,
          "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
          "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
          "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
          "0x55d398326f99059fF775485246999027B3197955",
          "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
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
            _handler: iaddress.btcAddress,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(rebalancing, "InvalidSolver");
      });

      it("should fail if protocol is paused", async () => {
        await protocolConfig.setProtocolPause(true);
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.vBTC_Address;

        let newTokens = [
          buyToken,
          "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
          "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
          "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
          "0x55d398326f99059fF775485246999027B3197955",
          "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
        ];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        const data = await createEnsoCallDataRoute(
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
        let buyTokenManipulated = addresses.LINK_Address;
        let buyToken = addresses.DOT;

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
        let buyTokenManipulated = addresses.LINK_Address;
        let buyToken = addresses.DOT;

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
        await ethers.provider.send("evm_increaseTime", [1000]);

        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.LINK_Address;

        let newTokens = [buyToken, tokens[1], tokens[2]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");

        let manipulatedBalance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        )
          .div(2)
          .toString();

        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

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
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.vBTC_Address;

        let newTokens = [buyToken, tokens[1]];

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
        let buyToken = addresses.vBTC_Address;

        let newTokens = [buyToken, tokens[1]];

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

      it("rebalance should revert if calldata length unequal tokens length", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.vBTC_Address;

        let newTokens = [buyToken, tokens[1]];

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
            _sellAmounts: [balance, "200"],
            _handler: ensoHandler.address,
            _callData: encodedParameters,
          })
        ).to.be.revertedWithCustomError(rebalancing, "InvalidLength");
      });

      it("should rebalance should fail if bought token is missing in new token list", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.DOT;

        let newTokens = [tokens[1], tokens[2], tokens[3], tokens[4], tokens[5]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = BigNumber.from(
          await ERC20.attach(sellToken).balanceOf(vault)
        ).toString();

        const data = await createEnsoDataElement(sellToken, buyToken, balance);

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

      it("should rebalance", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.DOT;

        let newTokens = [
          buyToken,
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

        console.log(
          "balance after sell",
          await ERC20.attach(sellToken).balanceOf(vault)
        );
      });

      it("should rebalance", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = tokens[0];
        let buyToken = addresses.DOT;

        let newTokens = [
          buyToken,
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

      it("Update weights/amounts should fail if sellamount length unequals selltokens length", async () => {
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
          rebalancing.updateWeights(
            [sellToken],
            [balance, "200"],
            ensoHandler.address,
            encodedParameters
          )
        ).to.be.revertedWithCustomError(rebalancing, "InvalidLength");
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
          rebalancing
            .connect(nonOwner)
            .updateWeights(
              [sellToken],
              [balance],
              ensoHandler.address,
              encodedParameters
            )
        ).to.be.revertedWithCustomError(rebalancing, "CallerNotAssetManager");
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
          rebalancing
            .connect(nonOwner)
            .updateWeights(
              [sellToken],
              [balance],
              ensoHandler.address,
              encodedParameters
            )
        ).to.be.revertedWithCustomError(rebalancing, "CallerNotAssetManager");
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

      it("should update weights/amounts for multiple tokens", async () => {
        let tokens = await portfolio.getTokens();
        let sellToken = [tokens[0], tokens[1], tokens[2]];
        let buyToken = [tokens[3], tokens[4], tokens[4]];

        let vault = await portfolio.vault();

        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = [];

        for (let i = 0; i < sellToken.length; i++) {
          balance[i] = BigNumber.from(
            await ERC20.attach(sellToken[i]).balanceOf(vault)
          )
            .div(2)
            .toString();
        }

        //-----------------------Creating Data----------------------------------

        let postResponse = [];
        let expectedAmounts = [];

        for (let i = 0; i < sellToken.length; i++) {
          let response = await createEnsoCallDataRoute(
            ensoHandler.address,
            ensoHandler.address,
            sellToken[i],
            buyToken[i],
            balance[i]
          );
          expectedAmounts.push(0);
          postResponse.push([response.data.tx.data]);
        }

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
            postResponse,
            [],
            [[]],
            [[]],
            [],
            sellToken,
            buyToken,
            expectedAmounts,
          ]
        );

        let balanceBefore = [];
        for (let i = 0; i < buyToken.length; i++) {
          balanceBefore[i] = await ERC20.attach(buyToken[i]).balanceOf(vault);
        }

        await rebalancing.updateWeights(
          sellToken,
          balance,
          ensoHandler.address,
          encodedParameters
        );

        for (let i = 0; i < buyToken.length; i++) {
          let balanceAfter = await ERC20.attach(buyToken[i]).balanceOf(vault);
          expect(balanceAfter).to.be.greaterThan(balanceBefore[i]);
        }
      });

      it("assetmanager should remove disbale token", async () => {
        await rebalancing.removePortfolioToken(iaddress.cakeAddress);
      });

      it("user1(owner) should be able to claim their removed tokens", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenToRemove = iaddress.cakeAddress;

        let tokenBalanceBefore = await ERC20.attach(tokenToRemove).balanceOf(
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

        await tokenExclusionManager.claimTokenAtId(owner.address, 1);

        let tokenBalanceAfter = await ERC20.attach(tokenToRemove).balanceOf(
          owner.address
        );

        /*let removedTokenBalance = (await tokenExclusionManager.removedToken(1))
          .balanceAtRemoval;

        let userRemovedTokenRatio = BigNumber.from(tokenBalanceAfter)
          .sub(BigNumber.from(tokenBalanceBefore))
          .mul(100)
          .div(BigNumber.from(removedTokenBalance));*/

        let balanceDiff = BigNumber.from(tokenBalanceAfter).sub(
          BigNumber.from(tokenBalanceBefore)
        );

        expect(tokenBalanceAfter).to.be.greaterThan(tokenBalanceBefore);
        //expect(userRemovedTokenRatio).to.be.equals(userIdxShareRatio);
      });

      it("if user1 again try to claim same token twice, he will not receive any tokens", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenToRemove = iaddress.cakeAddress;

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
      });

      it("user2(nonOwner) should claim removed tokens after complete withdrawal from portfolio", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenToRemove = iaddress.cakeAddress;

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

        await tokenExclusionManager.claimTokenAtId(nonOwner.address, 1);

        let tokenBalanceAfter: any = await ERC20.attach(
          tokenToRemove
        ).balanceOf(nonOwner.address);

        /*let removedTokenBalance = (await tokenExclusionManager.removedToken(1))
          .balanceAtRemoval;

        let userRemovedTokenRatio = BigNumber.from(tokenBalanceAfter)
          .sub(BigNumber.from(tokenBalanceBefore))
          .mul(100)
          .div(BigNumber.from(removedTokenBalance));*/

        expect(tokenBalanceAfter).to.be.greaterThan(tokenBalanceBefore);
        // expect(userRemovedTokenRatio).to.be.equals(userIdxShareRatio);
      });

      it("should fail if random user not eligible trying to claim tokens, should not get any token", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokenToRemove = iaddress.cakeAddress;

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

      it("assetManager should create 2 snapshot(remove 2 tokens) simultaneously for 2nd Portfolio Fund", async () => {
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(iaddress.cakeAddress);
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(iaddress.usdtAddress);
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
        const token1ToRemove = iaddress.cakeAddress;
        const token2ToRemove = iaddress.usdtAddress;

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

        await tokenExclusionManager1.claimRemovedTokens(owner.address, 1, 2);

        let token1BalanceAfter = await ERC20.attach(token1ToRemove).balanceOf(
          owner.address
        );

        let token2BalanceAfter = await ERC20.attach(token2ToRemove).balanceOf(
          owner.address
        );

        /*let removedToken1Balance = (
          await tokenExclusionManager1.removedToken(1)
        ).balanceAtRemoval;

        let removedToken2Balance = (
          await tokenExclusionManager1.removedToken(2)
        ).balanceAtRemoval;

        let userRemovedToken1Ratio = BigNumber.from(token1BalanceAfter)
          .sub(BigNumber.from(token1BalanceBefore))
          .mul(100)
          .div(BigNumber.from(removedToken1Balance));

        let userRemovedToken2Ratio = BigNumber.from(token2BalanceAfter)
          .sub(BigNumber.from(token2BalanceBefore))
          .mul(100)
          .div(BigNumber.from(removedToken2Balance));*/

        expect(token1BalanceAfter).to.be.greaterThan(token1BalanceBefore);
        expect(token2BalanceAfter).to.be.greaterThan(token2BalanceBefore);

        // expect(userRemovedToken1Ratio).to.be.equals(userIdxShareRatio1);
        //expect(userRemovedToken2Ratio).to.be.equals(userIdxShareRatio2);
      });

      it("New user(addr1) should deposit and get the correct amount of idx tokens,after multi-snapshots", async () => {
        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        let tokenDetails = [];
        // swap native token to deposit token
        let amounts = [];

        const tokens = await portfolio1.getTokens();
        const supplyBefore = await portfolio1.totalSupply();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            addr1.address,
            tokens[i],
            portfolio1.address
          );
          await swapHandler.swapETHToTokens("500", tokens[i], addr1.address, {
            value: "100000000000000000",
          });
          let balance = await ERC20.attach(tokens[i]).balanceOf(addr1.address);
          let detail = {
            token: tokens[i],
            amount: balance,
            expiration: toDeadline(/* 30 days= */ 1000 * 60 * 60 * 24 * 30),
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
        const signature = await addr1._signTypedData(domain, types, values);

        await portfolio1
          .connect(addr1)
          .multiTokenDeposit(amounts, "0", permit, signature);

        const supplyAfter = await portfolio1.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
      });

      it("nonOwner should deposit before assetManager removes new token", async () => {
        let amounts = [];
        let tokenDetails = [];

        function toDeadline(expiration: number) {
          return Math.floor((Date.now() + expiration) / 1000);
        }

        const supplyBefore = await portfolio1.totalSupply();
        const tokens = await portfolio1.getTokens();

        const permit2 = await ethers.getContractAt(
          "IAllowanceTransfer",
          PERMIT2_ADDRESS
        );

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            nonOwner.address,
            tokens[i],
            portfolio1.address
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
          spender: portfolio1.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await nonOwner._signTypedData(domain, types, values);

        await portfolio1
          .connect(nonOwner)
          .multiTokenDeposit(amounts, "0", permit, signature);

        const supplyAfter = await portfolio1.totalSupply();

        expect(Number(supplyAfter)).to.be.greaterThan(Number(supplyBefore));
        console.log("supplyAfter", supplyAfter);
      });

      it("AssetManager should remove doge token", async () => {
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(iaddress.dogeAddress);
      });

      it("new user(addr1) should withdraw from portfolio", async () => {
        await ethers.provider.send("evm_increaseTime", [70]);

        const supplyBefore = await portfolio1.totalSupply();
        const amountPortfolioToken = await portfolio1.balanceOf(addr1.address);

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        const tokens = await portfolio1.getTokens();

        let tokenBalanceBefore: any = [];
        for (let i = 0; i < tokens.length; i++) {
          tokenBalanceBefore[i] = await ERC20.attach(tokens[i]).balanceOf(
            addr1.address
          );
        }

        await portfolio1
          .connect(addr1)
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

        const supplyAfter = await portfolio1.totalSupply();

        for (let i = 0; i < tokens.length; i++) {
          let tokenBalanceAfter = await ERC20.attach(tokens[i]).balanceOf(
            addr1.address
          );
          expect(Number(tokenBalanceAfter)).to.be.greaterThan(
            Number(tokenBalanceBefore[i])
          );
        }
        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
      });

      it("treasuries should be able to claim their share too", async () => {
        let ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let vault = await portfolio1.vault();

        let cakeBalanceBeforeForTreasury = await ERC20.attach(
          iaddress.cakeAddress
        ).balanceOf(treasury.address);

        let dogeBalanceBeforeForTreasury = await ERC20.attach(
          iaddress.dogeAddress
        ).balanceOf(treasury.address);

        let usdtBalanceBeforeForTreasury = await ERC20.attach(
          iaddress.usdtAddress
        ).balanceOf(treasury.address);

        let cakeBalanceBeforeForManager = await ERC20.attach(
          iaddress.cakeAddress
        ).balanceOf(_assetManagerTreasury.address);

        let dogeBalanceBeforeForManager = await ERC20.attach(
          iaddress.dogeAddress
        ).balanceOf(_assetManagerTreasury.address);

        let usdtBalanceBeforeForManager = await ERC20.attach(
          iaddress.usdtAddress
        ).balanceOf(_assetManagerTreasury.address);

        await tokenExclusionManager1.claimRemovedTokens(treasury.address, 1, 3);
        await tokenExclusionManager1
          .connect(_assetManagerTreasury)
          .claimRemovedTokens(_assetManagerTreasury.address, 1, 3);

        let cakeBalanceAfterForTreasury = await ERC20.attach(
          iaddress.cakeAddress
        ).balanceOf(treasury.address);

        let dogeBalanceAfterForTreasury = await ERC20.attach(
          iaddress.dogeAddress
        ).balanceOf(treasury.address);

        let usdtBalanceAfterForTreasury = await ERC20.attach(
          iaddress.usdtAddress
        ).balanceOf(treasury.address);

        let cakeBalanceAfterForManager = await ERC20.attach(
          iaddress.cakeAddress
        ).balanceOf(_assetManagerTreasury.address);

        let dogeBalanceAfterForManager = await ERC20.attach(
          iaddress.dogeAddress
        ).balanceOf(_assetManagerTreasury.address);

        let usdtBalanceAfterForManager = await ERC20.attach(
          iaddress.usdtAddress
        ).balanceOf(_assetManagerTreasury.address);

        let cakeBalanceInVault = await ERC20.attach(
          iaddress.cakeAddress
        ).balanceOf(tokenExclusionManager1.address);

        console.log("cakeBalanceInVault", cakeBalanceInVault);

        let usdtBalanceInVault = await ERC20.attach(
          iaddress.dogeAddress
        ).balanceOf(tokenExclusionManager1.address);

        console.log("usdtBalanceInVault", usdtBalanceInVault);

        let dogeBalanceInVault = await ERC20.attach(
          iaddress.usdtAddress
        ).balanceOf(tokenExclusionManager1.address);

        console.log("dogeBalanceInVault", dogeBalanceInVault);

        expect(cakeBalanceAfterForManager).to.be.greaterThan(
          cakeBalanceBeforeForTreasury
        );
        expect(dogeBalanceAfterForManager).to.be.greaterThan(
          dogeBalanceBeforeForTreasury
        );
        expect(usdtBalanceAfterForManager).to.be.greaterThan(
          usdtBalanceBeforeForTreasury
        );
        expect(cakeBalanceAfterForTreasury).to.be.greaterThan(
          cakeBalanceBeforeForManager
        );
        expect(dogeBalanceAfterForTreasury).to.be.greaterThan(
          dogeBalanceBeforeForManager
        );
        expect(usdtBalanceAfterForTreasury).to.be.greaterThan(
          usdtBalanceBeforeForManager
        );
      });

      it("old user(nonOwner) should transfer it's token to new User(addr2)", async () => {
        let portfolioBalance = BigNumber.from(
          await portfolio1.balanceOf(nonOwner.address)
        );
        await portfolio1
          .connect(nonOwner)
          .transfer(addr2.address, portfolioBalance);
      });

      it("AssetManager should remove btc", async () => {
        await rebalancing1
          .connect(nonOwner)
          .removePortfolioToken(iaddress.btcAddress);
      });

      it("only portfolio manager can set userRecord that is portfolio contract and rebalancing contract", async () => {
        await expect(
          tokenExclusionManager1.setUserRecord(owner.address, "10000")
        ).to.be.reverted;
      });

      it("random user should send some token to vault and assetManager cannot updateToken list as it is not portfoliotoken", async () => {
        let tokenToRemove = iaddress.daiAddress;

        await expect(
          rebalancing1.connect(nonOwner).removePortfolioToken(tokenToRemove)
        ).to.be.revertedWithCustomError(rebalancing1, "NotPortfolioToken");
      });

      it("non asset manager should not be able to claim reward tokens", async () => {
        let vault = await portfolio.vault();

        // claim reward tokens
        let ABI = ["function claimVenus(address _holder)"];
        let abiEncode = new ethers.utils.Interface(ABI);
        let txData = abiEncode.encodeFunctionData("claimVenus", [vault]);

        await expect(
          rebalancing
            .connect(nonOwner)
            .claimRewardTokens(
              addresses.venus_RewardToken,
              "0xfD36E2c2a6789Db23113685031d7F16329158384",
              txData
            )
        ).to.be.revertedWithCustomError(rebalancing, "CallerNotAssetManager");
      });

      it("asset manager should not be able to withdraw funds using the claim functionality", async () => {
        let vault = await portfolio.vault();
        let tokens = await portfolio.getTokens();
        let token = tokens[0];

        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        let balance = await ERC20.attach(token).balanceOf(vault);

        // claim reward tokens
        let ABI = ["function transfer(address to, uint256 value)"];
        let abiEncode = new ethers.utils.Interface(ABI);
        let txData = abiEncode.encodeFunctionData("transfer", [
          owner.address,
          balance,
        ]);

        await protocolConfig.enableRewardTarget(token);

        await expect(
          rebalancing.claimRewardTokens(token, token, txData)
        ).to.be.revertedWithCustomError(rebalancing, "ClaimFailed");
      });
    });
  });
});
