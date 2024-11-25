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
  ProtocolConfig,
  Rebalancing__factory,
  PortfolioFactory,
  UniswapV2Handler,
  VelvetSafeModule,
  FeeModule,
  TokenBalanceLibrary,
  BorrowManager,
  AssetManagementConfig,
  AccessControl,
  PriceOracle,
  TokenExclusionManager__factory,
} from "../../typechain";

import { chainIdToAddresses } from "../../scripts/networkVariables";
import { Sign } from "crypto";

var chai = require("chai");
const axios = require("axios");
const qs = require("qs");
//use default BigNumber
chai.use(require("chai-bignumber")());

describe.only("Tests for Portfolio Config", () => {
  let accounts;
  let iaddress: IAddresses;
  let vaultAddress: string;
  let velvetSafeModule: VelvetSafeModule;
  let portfolio: Portfolio;
  let portfolio1: Portfolio;
  let portfolio2: Portfolio;
  let tokenExclusionManager: any;
  let assetManagementConfig0: AssetManagementConfig;
  let assetManagementConfig1: AssetManagementConfig;
  let assetManagementConfig2: AssetManagementConfig;
  let accessController0: any;
  let accessController1: any;
  let accessController2: any;
  let portfolioContract: Portfolio;
  let portfolioFactory: PortfolioFactory;
  let swapHandler: UniswapV2Handler;
  let borrowManager: BorrowManager;
  let tokenBalanceLibrary: TokenBalanceLibrary;
  let rebalancing: any;
  let rebalancing1: any;
  let rebalancing2: any;
  let protocolConfig: any;
  let txObject;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let nonOwner: SignerWithAddress;
  let depositor1: SignerWithAddress;
  let whitelistManagerAdmin: SignerWithAddress;
  let whitelistManager: SignerWithAddress;
  let assetManager: SignerWithAddress;
  let assetManagerAdmin: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addrs: SignerWithAddress[];
  let feeModule0: FeeModule;
  let approve_amount = ethers.constants.MaxUint256; //(2^256 - 1 )
  let token;
  const assetManagerHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("ASSET_MANAGER")
  );

  const provider = ethers.provider;
  const chainId: any = process.env.CHAIN_ID;
  const addresses = chainIdToAddresses[chainId];

  const thenaProtocolHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("THENA-CONCENTRATED-LIQUIDITY")
  );

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  describe.only("Tests for Portfolio Config", () => {
    before(async () => {
      accounts = await ethers.getSigners();
      [
        owner,
        depositor1,
        nonOwner,
        treasury,
        addr1,
        addr2,
        whitelistManagerAdmin,
        whitelistManager,
        assetManagerAdmin,
        assetManager,
        ...addrs
      ] = accounts;

      const TokenBalanceLibrary = await ethers.getContractFactory(
        "TokenBalanceLibrary"
      );

      tokenBalanceLibrary = await TokenBalanceLibrary.deploy();
      await tokenBalanceLibrary.deployed();

      const provider = ethers.getDefaultProvider();

      iaddress = await tokenAddresses();

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

      await protocolConfig.enableProtocol(
        thenaProtocolHash,
        "0xa51adb08cbe6ae398046a23bec013979816b77ab",
        "0x327dd3208f0bcf590a66110acb6e5e6941a4efa0",
        positionWrapperBaseAddress.address
      );

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
        iaddress.busdAddress,
        iaddress.btcAddress,
        iaddress.ethAddress,
        iaddress.wbnbAddress,
        iaddress.dogeAddress,
        iaddress.daiAddress,
        "0x0d8ce2a99bb6e3b7db580ed848240e4a0f9ae153",
        "0xcc42724c6683b7e57334c4e856f4c9965ed682bd",
        iaddress.cakeAddress,
        addresses.vBTC_Address,
        addresses.vETH_Address,
        addresses.vBNB_Address,
        addresses.vDOGE_Address,
        addresses.vDAI_Address,
        addresses.Cake_BUSDLP_Address,
        addresses.Cake_WBNBLP_Address,
        addresses.MAIN_LP_BUSD,
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

      const FeeModule = await ethers.getContractFactory("FeeModule", {});
      const feeModule = await FeeModule.deploy();
      await feeModule.deployed();

      const BorrowManager = await ethers.getContractFactory("BorrowManager");
      borrowManager = await BorrowManager.deploy();
      await borrowManager.deployed();

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
          _assetManagerTreasury: treasury.address,
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
          _assetManagerTreasury: treasury.address,
          _whitelistedTokens: whitelistedTokens,
          _public: false,
          _transferable: true,
          _transferableToPublic: false,
          _whitelistTokens: true,
          _witelistedProtocolIds: [],
        });

      const portfolioAddress = await portfolioFactory.getPortfolioList(0);
      const portfolioInfo = await portfolioFactory.PortfolioInfolList(0);

      const portfolioAddress1 = await portfolioFactory.getPortfolioList(1);
      const portfolioInfo1 = await portfolioFactory.PortfolioInfolList(1);

      const portfolioAddress2 = await portfolioFactory.getPortfolioList(2);
      const portfolioInfo2 = await portfolioFactory.PortfolioInfolList(2);

      portfolio = Portfolio.attach(portfolioAddress);

      portfolio1 = Portfolio.attach(portfolioAddress1);

      portfolio2 = Portfolio.attach(portfolioAddress2);

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

      console.log("portfolio deployed to:", portfolio.address);

      console.log("rebalancing:", rebalancing1.address);

      const config = await portfolio.assetManagementConfig();
      assetManagementConfig0 = AssetManagementConfig.attach(config);

      const config1 = await portfolio1.assetManagementConfig();
      assetManagementConfig1 = AssetManagementConfig.attach(config1);

      const config2 = await portfolio2.assetManagementConfig();
      assetManagementConfig2 = AssetManagementConfig.attach(config2);

      const feeModuleAddress = await portfolio.feeModule();
      feeModule0 = await FeeModule.attach(feeModuleAddress);

      const accessController0Addr = await portfolio.accessController();
      accessController0 = accessController.attach(accessController0Addr);

      const accessController1Addr = await portfolio.accessController();
      accessController1 = accessController.attach(accessController1Addr);

      const accessController2Addr = await portfolio2.accessController();
      accessController2 = accessController.attach(accessController2Addr);
    });

    describe("Enso Tests", function () {
      it("create portfolio should fail if custodial is true and no address is passed in _owner", async () => {
        await expect(
          portfolioFactory.connect(nonOwner).createPortfolioCustodial(
            {
              _name: "PORTFOLIOLY",
              _symbol: "IDX",
              _managementFee: "500",
              _performanceFee: "2500",
              _entryFee: "0",
              _exitFee: "0",
              _initialPortfolioAmount: "100000000000000000000",
              _minPortfolioTokenHoldingAmount: "10000000000000000",
              _assetManagerTreasury: treasury.address,
              _whitelistedTokens: [],
              _public: true,
              _transferable: true,
              _transferableToPublic: true,
              _whitelistTokens: false,
              _witelistedProtocolIds: [],
            },
            [],
            1
          )
        ).to.be.revertedWithCustomError(portfolioFactory, "NoOwnerPassed");
      });

      it("create portfolio should fail if threshold length greater than owner length", async () => {
        await expect(
          portfolioFactory.connect(nonOwner).createPortfolioCustodial(
            {
              _name: "PORTFOLIOLY",
              _symbol: "IDX",
              _managementFee: "500",
              _performanceFee: "2500",
              _entryFee: "0",
              _exitFee: "0",
              _initialPortfolioAmount: "100000000000000000000",
              _assetManagerTreasury: treasury.address,
              _minPortfolioTokenHoldingAmount: "10000000000000000",
              _whitelistedTokens: [],
              _public: true,
              _transferable: true,
              _transferableToPublic: true,
              _whitelistTokens: false,
              _witelistedProtocolIds: [],
            },
            [owner.address],
            2
          )
        ).to.be.revertedWithCustomError(
          portfolioFactory,
          "InvalidThresholdLength"
        );
      });

      it("create portfolio should fail if token whitelisting is enabled but whitelist token array is empty", async () => {
        await expect(
          portfolioFactory.connect(nonOwner).createPortfolioCustodial(
            {
              _name: "PORTFOLIOLY",
              _symbol: "IDX",
              _managementFee: "500",
              _performanceFee: "2500",
              _entryFee: "0",
              _exitFee: "0",
              _initialPortfolioAmount: "100000000000000000000",
              _minPortfolioTokenHoldingAmount: "10000000000000000",
              _assetManagerTreasury: treasury.address,
              _whitelistedTokens: [],
              _public: true,
              _transferable: true,
              _transferableToPublic: true,
              _whitelistTokens: true,
              _witelistedProtocolIds: [],
            },
            [owner.address],
            1
          )
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "InvalidTokenWhitelistLength"
        );
      });

      it("should protocol pause", async () => {
        await protocolConfig.setProtocolPause(true);
      });

      it("claiming reward tokens should fail if protocol is paused", async () => {
        await expect(
          rebalancing.claimRewardTokens(
            addresses.WETH_Address,
            addresses.WETH_Address,
            "0x"
          )
        ).to.be.revertedWithCustomError(rebalancing, "ProtocolIsPaused");
      });

      it("asset manager should not be able to remove portfolio token if protocol is paused", async () => {
        await expect(
          rebalancing.removePortfolioToken(iaddress.btcAddress)
        ).to.be.revertedWithCustomError(rebalancing, "ProtocolIsPaused");
      });

      it("asset manager should not be able to remove non-portfolio token if protocol is paused", async () => {
        await expect(
          rebalancing.removeNonPortfolioToken(iaddress.btcAddress)
        ).to.be.revertedWithCustomError(rebalancing, "ProtocolIsPaused");
      });

      it("asset manager should not be able to remove portfolio token partially if protocol is paused", async () => {
        await expect(
          rebalancing.removePortfolioTokenPartially(iaddress.btcAddress, "1000")
        ).to.be.revertedWithCustomError(rebalancing, "ProtocolIsPaused");
      });

      it("asset manager should not be able to remove non-portfolio partially token if protocol is paused", async () => {
        await expect(
          rebalancing.removeNonPortfolioTokenPartially(
            iaddress.btcAddress,
            "1000"
          )
        ).to.be.revertedWithCustomError(rebalancing, "ProtocolIsPaused");
      });

      it("create portfolio should fail if protocol is paused", async () => {
        await expect(
          portfolioFactory.connect(nonOwner).createPortfolioCustodial(
            {
              _name: "PORTFOLIOLY",
              _symbol: "IDX",
              _managementFee: "500",
              _performanceFee: "2500",
              _entryFee: "0",
              _exitFee: "0",
              _initialPortfolioAmount: "100000000000000000000",
              _assetManagerTreasury: treasury.address,
              _minPortfolioTokenHoldingAmount: "10000000000000000",
              _whitelistedTokens: [],
              _public: true,
              _transferable: true,
              _transferableToPublic: true,
              _whitelistTokens: false,
              _witelistedProtocolIds: [],
            },
            [owner.address],
            1
          )
        ).to.be.revertedWithCustomError(portfolioFactory, "ProtocolIsPaused");
      });

      it("should protocol pause", async () => {
        await protocolConfig.setProtocolPause(false);
      });

      it("should protocol emergency pause", async () => {
        await protocolConfig.setEmergencyPause(true, true);

        let protocolState = await protocolConfig.isProtocolPaused();
        expect(protocolState).to.be.true;
      });

      it("claim removed tokens should fail if protocol is emergency paused", async () => {
        await expect(
          tokenExclusionManager.claimRemovedTokens(owner.address, 1, 2)
        ).to.be.revertedWithCustomError(
          tokenExclusionManager,
          "ProtocolIsPaused"
        );
      });

      it("unpause protocol when emergency paused should fail", async () => {
        await expect(
          protocolConfig.setProtocolPause(false)
        ).to.be.revertedWithCustomError(
          protocolConfig,
          "ProtocolEmergencyPaused"
        );
      });

      it("create portfolio should fail if protocol is emergency paused", async () => {
        await expect(
          portfolioFactory.connect(nonOwner).createPortfolioCustodial(
            {
              _name: "PORTFOLIOLY",
              _symbol: "IDX",
              _managementFee: "500",
              _performanceFee: "2500",
              _entryFee: "0",
              _exitFee: "0",
              _initialPortfolioAmount: "100000000000000000000",
              _assetManagerTreasury: treasury.address,
              _minPortfolioTokenHoldingAmount: "10000000000000000",
              _whitelistedTokens: [],
              _public: true,
              _transferable: true,
              _transferableToPublic: true,
              _whitelistTokens: false,
              _witelistedProtocolIds: [],
            },
            [owner.address],
            1
          )
        ).to.be.revertedWithCustomError(portfolioFactory, "ProtocolIsPaused");
      });

      it("should protocol emergency unpause and unpause protocol", async () => {
        await protocolConfig.setEmergencyPause(false, true);

        let protocolState = await protocolConfig.isProtocolPaused();
        expect(protocolState).to.be.false;
      });

      it("should protocol emergency pause", async () => {
        await protocolConfig.setEmergencyPause(true, true);

        let protocolState = await protocolConfig.isProtocolPaused();
        expect(protocolState).to.be.true;
      });

      it("should protocol pause should be true if", async () => {
        await protocolConfig.setEmergencyPause(false, false);

        let protocolState = await protocolConfig.isProtocolPaused();
        expect(protocolState).to.be.true;
      });

      it("should protocol emergency pause", async () => {
        await protocolConfig.setEmergencyPause(true, true);
      });

      it("should protocol emergency pause by non owner should fail", async () => {
        await expect(
          protocolConfig.connect(nonOwner).setEmergencyPause(true, true)
        ).to.be.revertedWith("Unauthorized");
      });

      it("should protocol emergency unpause by any nonOwner after 4 weeks should succeed", async () => {
        await ethers.provider.send("evm_increaseTime", [2419200]);
        await protocolConfig.connect(nonOwner).setEmergencyPause(false, true);

        // user should not be able to unpause protocol (only emergency state)
        let protocolState = await protocolConfig.isProtocolPaused();
        expect(protocolState).to.be.true;
      });

      it("should protocol emergency pause by nonOwner should fail if protocol not emergency paused", async () => {
        await expect(
          protocolConfig.connect(nonOwner).setEmergencyPause(false, true)
        ).to.be.revertedWith("Unauthorized");
      });

      it("should protocol emergency pause should fail if protocol has been unpaused less than 5 minutes ago", async () => {
        await expect(
          protocolConfig.setEmergencyPause(true, true)
        ).to.be.revertedWithCustomError(
          protocolConfig,
          "TimeSinceLastUnpauseNotElapsed"
        );
      });

      it("should protocol emergency pause if protocol has been unpaused more than 5 minutes ago", async () => {
        await ethers.provider.send("evm_increaseTime", [300]);
        await protocolConfig.setEmergencyPause(true, true);
      });

      it("should protocol emergency unpause ", async () => {
        await protocolConfig.setEmergencyPause(false, true);
      });

      it("should pause protocol", async () => {
        await protocolConfig.setProtocolPause(true);

        let protocolState = await protocolConfig.isProtocolPaused();
        expect(protocolState).to.be.true;
      });

      it("should unpause protocol", async () => {
        await protocolConfig.setProtocolPause(false);

        let protocolState = await protocolConfig.isProtocolPaused();
        expect(protocolState).to.be.false;
      });

      it("create portfolio should fail if whitelisted tokens include zero addresses", async () => {
        await expect(
          portfolioFactory.connect(nonOwner).createPortfolioCustodial(
            {
              _name: "PORTFOLIOLY",
              _symbol: "IDX",
              _managementFee: "500",
              _performanceFee: "2500",
              _entryFee: "0",
              _exitFee: "0",
              _initialPortfolioAmount: "100000000000000000000",
              _minPortfolioTokenHoldingAmount: "10000000000000000",
              _assetManagerTreasury: treasury.address,
              _whitelistedTokens: [
                "0x0000000000000000000000000000000000000000",
              ],
              _public: true,
              _transferable: true,
              _transferableToPublic: true,
              _whitelistTokens: true,
              _witelistedProtocolIds: [],
            },
            [owner.address],
            1
          )
        ).to.be.revertedWithCustomError(portfolioFactory, "InvalidAddress");
      });

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

      it("super admin should transfer role and set nonOwner as new super admin", async () => {
        expect(
          await accessController0.hasRole(
            "0xd980155b32cf66e6af51e0972d64b9d5efe0e6f237dfaa4bdc83f990dd79e9c8",
            nonOwner.address
          )
        ).to.be.false;

        await portfolioFactory.transferSuperAdminOwnership(
          accessController0.address,
          nonOwner.address
        );

        expect(
          await accessController0.hasRole(
            "0xd980155b32cf66e6af51e0972d64b9d5efe0e6f237dfaa4bdc83f990dd79e9c8",
            nonOwner.address
          )
        ).to.be.true;
      });

      it("new superadmin should be able to grant ,revoke assetmanager admin role", async () => {
        await accessController0
          .connect(nonOwner)
          .grantRole(
            "0x15900ee5215ef76a9f5d2b8a5ec2fe469c362cbf4d7bef6646ab417b6d169e88",
            assetManagerAdmin.address
          );

        expect(
          await accessController0.hasRole(
            "0x15900ee5215ef76a9f5d2b8a5ec2fe469c362cbf4d7bef6646ab417b6d169e88",
            assetManagerAdmin.address
          )
        ).to.be.true;

        await accessController0
          .connect(nonOwner)
          .revokeRole(
            "0x15900ee5215ef76a9f5d2b8a5ec2fe469c362cbf4d7bef6646ab417b6d169e88",
            assetManagerAdmin.address
          );

        expect(
          await accessController0.hasRole(
            "0x15900ee5215ef76a9f5d2b8a5ec2fe469c362cbf4d7bef6646ab417b6d169e88",
            assetManagerAdmin.address
          )
        ).to.be.false;
      });

      it("new superadmin should be able to grant ,revoke whitelistManager role", async () => {
        await accessController0
          .connect(nonOwner)
          .grantRole(
            "0xc5f56b202d004644c051ff6057ecbf2a2764b8d81e0a6641e536e1cfa55dfd42",
            assetManagerAdmin.address
          );

        expect(
          await accessController0.hasRole(
            "0xc5f56b202d004644c051ff6057ecbf2a2764b8d81e0a6641e536e1cfa55dfd42",
            assetManagerAdmin.address
          )
        ).to.be.true;

        await accessController0
          .connect(nonOwner)
          .revokeRole(
            "0xc5f56b202d004644c051ff6057ecbf2a2764b8d81e0a6641e536e1cfa55dfd42",
            assetManagerAdmin.address
          );

        expect(
          await accessController0.hasRole(
            "0xc5f56b202d004644c051ff6057ecbf2a2764b8d81e0a6641e536e1cfa55dfd42",
            assetManagerAdmin.address
          )
        ).to.be.false;
      });

      it("new super admin should transferRole to old admin ", async () => {
        expect(
          await accessController0.hasRole(
            "0xd980155b32cf66e6af51e0972d64b9d5efe0e6f237dfaa4bdc83f990dd79e9c8",
            owner.address
          )
        ).to.be.false;

        await portfolioFactory
          .connect(nonOwner)
          .transferSuperAdminOwnership(
            accessController0.address,
            owner.address
          );

        expect(
          await accessController0.hasRole(
            "0xd980155b32cf66e6af51e0972d64b9d5efe0e6f237dfaa4bdc83f990dd79e9c8",
            owner.address
          )
        ).to.be.true;
      });

      it("only Super admin can transfer roles", async () => {
        await expect(
          portfolioFactory
            .connect(nonOwner)
            .transferSuperAdminOwnership(
              accessController0.address,
              owner.address
            )
        ).to.be.revertedWithCustomError(
          portfolioFactory,
          "CallerNotSuperAdmin"
        );
      });

      it("asset manager should not be able to create portfolio will min Portfolio Price less then min portfolio pirce set by protocol", async () => {
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
            _initialPortfolioAmount: "100000000000",
            _minPortfolioTokenHoldingAmount: "10000000000000000",
            _assetManagerTreasury: treasury.address,
            _whitelistedTokens: [],
            _public: true,
            _transferable: false,
            _transferableToPublic: false,
            _whitelistTokens: false,
            _witelistedProtocolIds: [],
          })
        ).to.be.revertedWithCustomError(
          assetManagementConfig,
          "InvalidMinPortfolioAmountByAssetManager"
        );
      });

      it("non-assetManager should not be able to update minPortfolioAmount", async () => {
        await expect(
          protocolConfig
            .connect(nonOwner)
            .updateMinInitialPortfolioAmount("1000000000000000")
        ).to.be.reverted;
      });

      it("protocol should be able to update minPortfolioAmount and assetManager can use newPrice for vault portfolio creation", async () => {
        await protocolConfig.updateMinInitialPortfolioAmount(
          "1000000000000000"
        );
        //4th Portfolio Creation
        await portfolioFactory.connect(nonOwner).createPortfolioNonCustodial({
          _name: "PORTFOLIOLY",
          _symbol: "IDX",
          _managementFee: "200",
          _performanceFee: "2500",
          _entryFee: "0",
          _exitFee: "0",
          _initialPortfolioAmount: "1000000000000000",
          _minPortfolioTokenHoldingAmount: "10000000000000000",
          _assetManagerTreasury: treasury.address,
          _whitelistedTokens: [],
          _public: true,
          _transferable: false,
          _transferableToPublic: false,
          _whitelistTokens: false,
          _witelistedProtocolIds: [],
        });
      });

      it("non assetManager should not be able to update initial portfolioPrice", async () => {
        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);

        await expect(
          assetManagementConfig
            .connect(nonOwner)
            .updateInitialPortfolioAmount("1000000000")
        ).to.be.reverted;
      });

      it("assetManager should not be able to update initial portfolioPrice less then protocol minInitialPortfolioAmount", async () => {
        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);

        await expect(
          assetManagementConfig.updateInitialPortfolioAmount("1000000000")
        ).to.be.revertedWithCustomError(
          assetManagementConfig,
          "InvalidInitialPortfolioAmount"
        );
      });

      it("assetManager should not be able to update initial portfolioPrice to zero", async () => {
        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);

        await expect(
          assetManagementConfig.updateInitialPortfolioAmount("0")
        ).to.be.revertedWithCustomError(
          assetManagementConfig,
          "InvalidInitialPortfolioAmount"
        );
      });

      it("initialize should revert for token duplicates", async () => {
        await expect(
          portfolio.initToken([iaddress.btcAddress, iaddress.btcAddress])
        ).to.be.revertedWithCustomError(portfolio, "TokenAlreadyExist");
      });

      it("should init tokens", async () => {
        await portfolio2.initToken([
          iaddress.btcAddress,
          iaddress.ethAddress,
          addresses.Cake_WBNBLP_Address,
        ]);
      });

      it("non owner should not be able to add asset manager admin", async () => {
        await expect(
          accessController0
            .connect(nonOwner)
            .grantRole(
              "0x15900ee5215ef76a9f5d2b8a5ec2fe469c362cbf4d7bef6646ab417b6d169e88",
              assetManagerAdmin.address
            )
        ).to.be.reverted;
      });

      it("owner should be able to add asset manager admin", async () => {
        await accessController0.grantRole(
          "0x15900ee5215ef76a9f5d2b8a5ec2fe469c362cbf4d7bef6646ab417b6d169e88",
          assetManagerAdmin.address
        );
      });

      it("non asset manager admin should not be able to add asset manager", async () => {
        await expect(
          accessController0
            .connect(nonOwner)
            .grantRole(assetManagerHash, assetManager.address)
        ).to.be.reverted;
      });

      it("non-protocol owner should not be able to change whitelsitAsset limit", async () => {
        await expect(
          protocolConfig.connect(nonOwner).setWhitelistLimit(20)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("protocol owner should be able to change whitelsitAsset limit", async () => {
        await protocolConfig.setWhitelistLimit(20);
      });

      it("new asset manager admin should be able to add asset manager", async () => {
        await accessController0
          .connect(assetManagerAdmin)
          .grantRole(assetManagerHash, assetManager.address);
      });

      it("owner should be able to add asset manager", async () => {
        await accessController0.grantRole(assetManagerHash, addr1.address);
      });

      it("non-owner should be able to pause protocol", async () => {
        await expect(
          protocolConfig.connect(nonOwner).setProtocolPause(true)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should protocol pause", async () => {
        await protocolConfig.setProtocolPause(true);
      });

      it("owner should not be able to update the protocol streaming fee to higher than 1%", async () => {
        await expect(
          protocolConfig.updateProtocolStreamingFee("200")
        ).to.be.revertedWithCustomError(
          protocolConfig,
          "InvalidProtocolStreamingFee"
        );
      });

      it("non-owner should not be able to update the protocol streaming fee", async () => {
        await expect(
          protocolConfig.connect(nonOwner).updateProtocolStreamingFee("2000")
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should fail if wrong owner tried to accept ownership for protocolConfig", async () => {
        await protocolConfig.transferOwnership(nonOwner.address);

        await expect(protocolConfig.connect(addr1).acceptOwnership()).to.be
          .reverted;
      });

      it("should fail if wrong owner tried to accept ownership portfolio factory", async () => {
        await portfolioFactory.transferOwnership(nonOwner.address);

        await expect(portfolioFactory.connect(addr1).acceptOwnership()).to.be
          .reverted;
      });

      it("owner should be able to transfer protocol config ownership", async () => {
        await protocolConfig.transferOwnership(nonOwner.address);

        await protocolConfig.connect(nonOwner).acceptOwnership();
      });

      it("owner should be able to transfer portfolio factory ownership", async () => {
        await portfolioFactory.transferOwnership(nonOwner.address);

        await portfolioFactory.connect(nonOwner).acceptOwnership();
      });

      it("new owner should be able to update the protocol streaming fee", async () => {
        await protocolConfig.connect(nonOwner).updateProtocolStreamingFee("90");
      });

      it("owner should be able to transfer protocol config ownership", async () => {
        await protocolConfig.connect(nonOwner).transferOwnership(owner.address);

        await protocolConfig.acceptOwnership();
      });

      it("owner should be able to transfer portfolio factory ownership", async () => {
        await portfolioFactory
          .connect(nonOwner)
          .transferOwnership(owner.address);

        await portfolioFactory.acceptOwnership();
      });

      it("owner should be able to update the protocol streaming fee", async () => {
        await protocolConfig.updateProtocolStreamingFee("100");
      });

      it("should fail if owner tried to input previous value as new value while updating protocol streaming fee", async () => {
        await expect(
          protocolConfig.updateProtocolStreamingFee("100")
        ).to.be.revertedWithCustomError(
          protocolConfig,
          "InvalidProtocolStreamingFee"
        );
      });

      it("owner should not be able to update the protocol fee to higher than 50%", async () => {
        await expect(
          protocolConfig.updateProtocolFee("6000")
        ).to.be.revertedWithCustomError(protocolConfig, "InvalidProtocolFee");
      });

      it("non-owner should not be able to update the protocol fee", async () => {
        await expect(
          protocolConfig.connect(nonOwner).updateProtocolFee("2000")
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("owner should be able to update the protocol fee", async () => {
        await protocolConfig.updateProtocolFee("2000");
      });

      it("should fail if owner tried to input previous value as new value while updating protocol fee", async () => {
        await expect(
          protocolConfig.updateProtocolFee("2000")
        ).to.be.revertedWithCustomError(protocolConfig, "InvalidProtocolFee");
      });

      it("owner should be able to update the protocol fee", async () => {
        await protocolConfig.updateProtocolFee("0");
      });

      it("should upgrade Proxy Portfolio To New Contract for 1st Portfolio", async () => {
        const proxyAddress = await portfolioFactory.getPortfolioList(0);
        await portfolioFactory.upgradePortfolio(
          [proxyAddress],
          portfolioContract.address
        );
      });

      it("should unpause protocol", async () => {
        await protocolConfig.setProtocolPause(false);
      });

      it("claiming reward tokens should fail if reward target is not enabled", async () => {
        await expect(
          rebalancing.claimRewardTokens(
            addresses.WETH_Address,
            addresses.WETH_Address,
            "0x"
          )
        ).to.be.revertedWithCustomError(rebalancing, "RewardTargetNotEnabled");
      });

      it("non protocol owner should not be able to enable reward target", async () => {
        await expect(
          protocolConfig
            .connect(nonOwner)
            .enableRewardTarget(addresses.WETH_Address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("protocol owner should be able to enable reward target", async () => {
        await expect(protocolConfig.enableRewardTarget(addresses.WETH_Address));
      });

      it("non protocol owner should not be able to enable reward targets", async () => {
        await expect(
          protocolConfig
            .connect(nonOwner)
            .enableRewardTargets([iaddress.usdtAddress])
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("protocol owner should not be able to enable reward targets passing an empty list", async () => {
        await expect(
          protocolConfig.enableRewardTargets([])
        ).to.be.revertedWithCustomError(protocolConfig, "InvalidLength");
      });

      it("protocol owner should be able to enable reward target", async () => {
        await expect(
          protocolConfig.enableRewardTargets([iaddress.usdtAddress])
        );
      });

      it("reward token target should be usable to claim after enabling", async () => {
        // empty calldata is passed, test case with calldata in file 4
        await expect(
          rebalancing.claimRewardTokens(
            addresses.WETH_Address,
            addresses.WETH_Address,
            "0x"
          )
        ).to.be.revertedWithCustomError(rebalancing, "ClaimFailed");
      });

      it("should retrieve the current max asset limit from the ProtocolConfig", async () => {
        expect(await protocolConfig.assetLimit()).to.equal(15);
      });

      it("asset manager should not be able to make the previous public fund transferable to only whitelisted addresses", async () => {
        const portfolioAddress = await portfolioFactory.getPortfolioList(1);
        const portfolio = await ethers.getContractAt(
          Portfolio__factory.abi,
          portfolioAddress
        );

        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);
        expect(await assetManagementConfig.transferable()).to.eq(false);
        // Try changing the fund to transferable only to whitelisted addresses
        await expect(
          assetManagementConfig
            .connect(nonOwner)
            .updateTransferability(true, false)
        ).to.be.revertedWithCustomError(
          assetManagementConfig,
          "PublicFundToWhitelistedNotAllowed"
        );
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
            iaddress.daiAddress,
            iaddress.btcAddress,
            iaddress.dogeAddress,
            addresses.vETH_Address,
            addresses.vBTC_Address,
            addresses.vBNB_Address,
            addresses.vDAI_Address,
            addresses.vDOGE_Address,
            addresses.vLINK_Address,
          ])
        ).to.be.revertedWithCustomError(portfolio, "TokenCountOutOfLimit");
      });

      it("owner should be able to add asset manager", async () => {
        await accessController.grantRole(assetManagerHash, nonOwner.address);
      });

      it("non owner should not be able to add asset manager", async () => {
        await expect(
          accessController
            .connect(nonOwner)
            .grantRole(assetManagerHash, depositor1.address)
        ).to.be.reverted;
      });

      it("deposit should fail if user is not whitelisted", async () => {
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

        const tokens = await portfolio2.getTokens();
        const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
        for (let i = 0; i < tokens.length; i++) {
          let { nonce } = await permit2.allowance(
            nonOwner.address,
            tokens[i],
            portfolio2.address
          );
          let detail = {
            token: tokens[i],
            amount: 1,
            expiration: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
            nonce,
          };
          tokenDetails.push(detail);
        }

        const permit: PermitBatch = {
          details: tokenDetails,
          spender: portfolio2.address,
          sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permit,
          PERMIT2_ADDRESS,
          chainId
        );
        const signature = await nonOwner._signTypedData(domain, types, values);

        await expect(
          portfolio2
            .connect(nonOwner)
            .multiTokenDeposit([], "0", permit, signature)
        ).to.be.revertedWithCustomError(portfolio2, "UserNotAllowedToDeposit");
      });

      it("should convert private fund to public", async () => {
        await assetManagementConfig2.convertPrivateFundToPublic();
        expect(await assetManagementConfig2.publicPortfolio()).to.be.equals(
          true
        );
      });

      it("Enable and Disable Solver", async () => {
        await protocolConfig.enableSolverHandler(iaddress.daiAddress);

        await protocolConfig.disableSolverHandler(iaddress.daiAddress);

        expect(
          await protocolConfig.solverHandler(iaddress.daiAddress)
        ).to.be.equals(false);
      });

      it("Add addr1 whitelisted user", async () => {
        await assetManagementConfig2.whitelistUser([addr1.address]);
      });

      it("non owner should not be able to add whitelist manager admin", async () => {
        await expect(
          accessController2
            .connect(nonOwner)
            .grantRole(
              "0xc5f56b202d004644c051ff6057ecbf2a2764b8d81e0a6641e536e1cfa55dfd42",
              whitelistManagerAdmin.address
            )
        ).to.be.reverted;
      });

      it("owner should be able to add asset whitelist manager admin", async () => {
        await accessController2.grantRole(
          "0xc5f56b202d004644c051ff6057ecbf2a2764b8d81e0a6641e536e1cfa55dfd42",
          whitelistManagerAdmin.address
        );
      });

      it("owner should not be able to add portfolio manager", async () => {
        await expect(
          accessController2.grantRole(
            "0x1916b456004f332cd8a19679364ef4be668619658be72c17b7e86697c4ae0f16",
            addr2.address
          )
        ).to.be.reverted;
      });

      it("owner should not be able to add rebalancing manager", async () => {
        await expect(
          accessController2.grantRole(
            "0x8e73530dd444215065cdf478f826e993aeb5e2798587f0bbf5a978bd97df63ea",
            addr2.address
          )
        ).to.be.reverted;
      });

      it("non whitelist manager admin should not be able to add asset manager", async () => {
        await expect(
          accessController2
            .connect(addr2)
            .grantRole(
              "0x827de50cc5532fcea9338402dc65442c2567a37fbd0cd8eb56858d00e9e842bd",
              whitelistManager.address
            )
        ).to.be.reverted;
      });

      it("new whitelist manager admin should be able to add whitelist manager", async () => {
        await accessController2
          .connect(whitelistManagerAdmin)
          .grantRole(
            "0x827de50cc5532fcea9338402dc65442c2567a37fbd0cd8eb56858d00e9e842bd",
            whitelistManager.address
          );
      });

      it("owner should be able to add whitelist manager", async () => {
        await accessController2.grantRole(
          "0x827de50cc5532fcea9338402dc65442c2567a37fbd0cd8eb56858d00e9e842bd",
          addr1.address
        );
      });

      it("non whitelist manager should not be able to update merkle root", async () => {
        await expect(
          assetManagementConfig2
            .connect(addr2)
            .removeWhitelistedUser([owner.address])
        ).to.be.revertedWithCustomError(
          assetManagementConfig1,
          "CallerNotWhitelistManager"
        );
      });

      it("Whitelist manager should be able to update merkle root", async () => {
        await assetManagementConfig2
          .connect(whitelistManager)
          .whitelistUser([addr1.address, addr2.address]);
      });

      it("Whitelist manager should be able to add and remove a whitelisted user", async () => {
        await assetManagementConfig2
          .connect(whitelistManager)
          .whitelistUser([addr2.address]);

        await assetManagementConfig2
          .connect(whitelistManager)
          .removeWhitelistedUser([addr2.address]);
      });

      it("non whitelist manager admin should not be able to revoke whitelist manager", async () => {
        await expect(
          accessController2
            .connect(addr1)
            .revokeRole(
              "0x827de50cc5532fcea9338402dc65442c2567a37fbd0cd8eb56858d00e9e842bd",
              whitelistManager.address
            )
        ).to.be.reverted;
      });

      it("whitelist manager admin should be able to revoke whitelist manager", async () => {
        await accessController2
          .connect(whitelistManagerAdmin)
          .revokeRole(
            "0x827de50cc5532fcea9338402dc65442c2567a37fbd0cd8eb56858d00e9e842bd",
            whitelistManager.address
          );
      });

      it("Whitelist manager should not be able to add user to whitelist after his role was revoked", async () => {
        await expect(
          assetManagementConfig2
            .connect(whitelistManager)
            .whitelistUser([addr2.address])
        ).to.be.revertedWithCustomError(
          assetManagementConfig1,
          "CallerNotWhitelistManager"
        );
      });

      it("Non asset manager should not be able to propose new management fee", async () => {
        const config = await portfolio.assetManagementConfig();
        const AssetManagementConfig = await ethers.getContractFactory(
          "AssetManagementConfig"
        );
        const assetManagementConfig = AssetManagementConfig.attach(config);
        await expect(
          assetManagementConfig.connect(nonOwner).proposeNewManagementFee("200")
        ).to.be.revertedWithCustomError(
          assetManagementConfig,
          "CallerNotAssetManager"
        );
      });

      it("Asset manager should propose new management fee", async () => {
        await assetManagementConfig0
          .connect(assetManager)
          .proposeNewManagementFee("200");
        expect(await assetManagementConfig0.newManagementFee()).to.be.equal(
          200
        );
      });

      it("Asset manager should not be able to update management fee before 28 days passed", async () => {
        await expect(
          assetManagementConfig0.connect(assetManager).updateManagementFee()
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "TimePeriodNotOver"
        );
      });

      it("Non asset manager should not be able to delete proposed new management fee", async () => {
        await expect(
          assetManagementConfig0.connect(nonOwner).deleteProposedManagementFee()
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "CallerNotAssetManager"
        );
      });

      it("Asset manager should be able to delete proposed new management fee", async () => {
        await assetManagementConfig0
          .connect(assetManager)
          .deleteProposedManagementFee();
        expect(await assetManagementConfig0.newManagementFee()).to.be.equal(0);
      });

      it("Asset manager should not be able to delete proposed management fee again to prevent event flooding", async () => {
        await expect(
          assetManagementConfig0
            .connect(assetManager)
            .deleteProposedManagementFee()
        ).to.be.revertedWithCustomError(assetManagementConfig0, "NoNewFeeSet");
      });

      it("Non asset manager should not be able to update management fee", async () => {
        await expect(
          assetManagementConfig0.connect(nonOwner).updateManagementFee()
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "CallerNotAssetManager"
        );
      });

      it("asset manager should not be able to update management without proposing new fees", async () => {
        await expect(
          assetManagementConfig0.updateManagementFee()
        ).to.be.revertedWithCustomError(assetManagementConfig0, "NoNewFeeSet");
      });

      it("Asset manager should propose new management fee", async () => {
        await assetManagementConfig0
          .connect(assetManager)
          .proposeNewManagementFee("200");
        expect(await assetManagementConfig0.newManagementFee()).to.be.equal(
          200
        );
      });

      it("Asset manager should be able to update management fee after 28 days passed", async () => {
        await ethers.provider.send("evm_increaseTime", [2419200]);

        await assetManagementConfig0
          .connect(assetManager)
          .updateManagementFee();
      });

      it("Asset manager should not be able to update management fee again to prevent event flooding", async () => {
        await expect(
          assetManagementConfig0.connect(assetManager).updateManagementFee()
        ).to.be.revertedWithCustomError(assetManagementConfig0, "NoNewFeeSet");
      });

      // same for performance

      it("Non asset manager should not be able to propose new performance fee", async () => {
        await expect(
          assetManagementConfig0
            .connect(nonOwner)
            .proposeNewPerformanceFee("200")
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "CallerNotAssetManager"
        );
      });

      it("Asset manager should propose new performance fee", async () => {
        await assetManagementConfig0
          .connect(assetManager)
          .proposeNewPerformanceFee("200");
        expect(await assetManagementConfig0.newPerformanceFee()).to.be.equal(
          200
        );
      });

      it("Asset manager should be able to update performance fee before 28 days passed", async () => {
        await expect(
          assetManagementConfig0.connect(assetManager).updatePerformanceFee()
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "TimePeriodNotOver"
        );
      });

      it("Non asset manager should not be able to delete proposed new performance fee", async () => {
        await expect(
          assetManagementConfig0
            .connect(nonOwner)
            .deleteProposedPerformanceFee()
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "CallerNotAssetManager"
        );
      });

      it("Asset manager should be able to delete proposed new performance fee", async () => {
        await assetManagementConfig0
          .connect(assetManager)
          .deleteProposedPerformanceFee();
        expect(await assetManagementConfig0.newPerformanceFee()).to.be.equal(0);
      });

      it("Asset manager should not be able to delete proposed performance fee again to prevent event flooding", async () => {
        await expect(
          assetManagementConfig0
            .connect(assetManager)
            .deleteProposedPerformanceFee()
        ).to.be.revertedWithCustomError(assetManagementConfig0, "NoNewFeeSet");
      });

      it("Non asset manager should not be able to update performance fee", async () => {
        await expect(
          assetManagementConfig0.connect(nonOwner).updatePerformanceFee()
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "CallerNotAssetManager"
        );
      });

      it("asset manager should not be able to update performance without proposing new fees", async () => {
        await expect(
          assetManagementConfig0.updatePerformanceFee()
        ).to.be.revertedWithCustomError(assetManagementConfig0, "NoNewFeeSet");
      });

      it("Asset manager should propose new performance fee", async () => {
        await assetManagementConfig0
          .connect(assetManager)
          .proposeNewPerformanceFee("200");
        expect(await assetManagementConfig0.newPerformanceFee()).to.be.equal(
          200
        );
      });

      it("Asset manager should be able to update performance fee after 28 days passed", async () => {
        await ethers.provider.send("evm_increaseTime", [2419200]);

        await assetManagementConfig0
          .connect(assetManager)
          .updatePerformanceFee();
      });

      it("Asset manager should not be able to update performance fee again to prevent event flooding", async () => {
        await expect(
          assetManagementConfig0.connect(assetManager).updatePerformanceFee()
        ).to.be.revertedWithCustomError(assetManagementConfig0, "NoNewFeeSet");
      });

      //same for entry and exit fee

      it("Non asset manager should not be able to propose new entry fee", async () => {
        await expect(
          assetManagementConfig0
            .connect(nonOwner)
            .proposeNewEntryAndExitFee("200", "200")
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "CallerNotAssetManager"
        );
      });

      it("asset manager should not be able to propose wrong entry and exit fee(entry)", async () => {
        await expect(
          assetManagementConfig0.proposeNewEntryAndExitFee("20000", "200")
        ).to.be.revertedWithCustomError(assetManagementConfig0, "InvalidFee");
      });

      it("asset manager should not be able to propose wrong entry and exit fee(exit)", async () => {
        await expect(
          assetManagementConfig0.proposeNewEntryAndExitFee("200", "20000")
        ).to.be.revertedWithCustomError(assetManagementConfig0, "InvalidFee");
      });

      it("Asset manager should propose new entry and exit fee", async () => {
        await assetManagementConfig0
          .connect(assetManager)
          .proposeNewEntryAndExitFee("200", "200");
        expect(await assetManagementConfig0.newEntryFee()).to.be.equal(200);
        expect(await assetManagementConfig0.newExitFee()).to.be.equal(200);
      });

      it("Asset manager should be able to update entry and exit fee before 28 days passed", async () => {
        await expect(
          assetManagementConfig0.connect(assetManager).updateEntryAndExitFee()
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "TimePeriodNotOver"
        );
      });

      it("Non asset manager should not be able to delete proposed new entry and exit fee", async () => {
        await expect(
          assetManagementConfig0
            .connect(nonOwner)
            .deleteProposedEntryAndExitFee()
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "CallerNotAssetManager"
        );
      });

      it("Asset manager should be able to delete proposed new entry and exit fee", async () => {
        await assetManagementConfig0
          .connect(assetManager)
          .deleteProposedEntryAndExitFee();
        expect(await assetManagementConfig0.newEntryFee()).to.be.equal(0);
        expect(await assetManagementConfig0.newExitFee()).to.be.equal(0);
      });

      it("Asset manager should not be able to delete proposed entry and exit fees again to prevent event flooding", async () => {
        await expect(
          assetManagementConfig0
            .connect(assetManager)
            .deleteProposedEntryAndExitFee()
        ).to.be.revertedWithCustomError(assetManagementConfig0, "NoNewFeeSet");
      });

      it("Non asset manager should not be able to update entry and exit fee", async () => {
        await expect(
          assetManagementConfig0.connect(nonOwner).updateEntryAndExitFee()
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "CallerNotAssetManager"
        );
      });

      it("asset manager should not be able to update entry and exit fee without proposing new fees", async () => {
        await expect(
          assetManagementConfig0.updateEntryAndExitFee()
        ).to.be.revertedWithCustomError(assetManagementConfig0, "NoNewFeeSet");
      });

      it("Asset manager should propose new entry and exit fee", async () => {
        await assetManagementConfig0
          .connect(assetManager)
          .proposeNewEntryAndExitFee("200", "200");
        expect(await assetManagementConfig0.newEntryFee()).to.be.equal(200);
        expect(await assetManagementConfig0.newExitFee()).to.be.equal(200);
      });

      it("Asset manager should be able to update entry and exit fees after 28 days passed", async () => {
        await ethers.provider.send("evm_increaseTime", [2419200]);

        await assetManagementConfig0
          .connect(assetManager)
          .updateEntryAndExitFee();
      });

      it("Asset manager should not be able to update entry and exit fees again to prevent event flooding", async () => {
        await expect(
          assetManagementConfig0.connect(assetManager).updateEntryAndExitFee()
        ).to.be.revertedWithCustomError(assetManagementConfig0, "NoNewFeeSet");
      });

      // treasury
      it("Non asset manager should not be able to update the asset manager treasury", async () => {
        await expect(
          assetManagementConfig0
            .connect(nonOwner)
            .updateAssetManagerTreasury(owner.address)
        ).to.be.revertedWithCustomError(
          assetManagementConfig0,
          "CallerNotAssetManager"
        );
      });

      it("Asset manager should not be able to update the asset manager treasury", async () => {
        await assetManagementConfig0
          .connect(assetManager)
          .updateAssetManagerTreasury(owner.address);
      });

      it("Non protocol owner should not be able to update the velvet treasury", async () => {
        await expect(
          protocolConfig.connect(nonOwner).updateVelvetTreasury(owner.address)
        ).to.be.reverted;
      });

      it("Protocol owner should not be able to set same address as velvet treasury", async () => {
        await expect(
          protocolConfig.updateVelvetTreasury(treasury.address)
        ).to.be.revertedWithCustomError(
          protocolConfig,
          "PreviousTreasuryAddress"
        );
      });

      it("Protocol owner should be able to update the velvet treasury", async () => {
        await protocolConfig.updateVelvetTreasury(owner.address);
      });

      it("Non asset manager should not be able to update the price oracle", async () => {
        await expect(
          protocolConfig.connect(nonOwner).updatePriceOracle(owner.address)
        ).to.be.reverted;
      });

      it("Asset manager should be able to update the price oracle", async () => {
        const PriceOracle = await ethers.getContractFactory("PriceOracle");
        const newPriceOracle = await PriceOracle.deploy(
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
        );

        await protocolConfig.updatePriceOracle(newPriceOracle.address);
      });

      it("should upgrade the protocol config", async () => {
        const ProtocolConfig = await ethers.getContractFactory(
          "ProtocolConfig"
        );

        await upgrades.upgradeProxy(protocolConfig.address, ProtocolConfig);
      });

      it("non-assetManager tried to remove token and it should fail", async () => {
        await expect(
          rebalancing
            .connect(nonOwner)
            .removePortfolioToken(iaddress.cakeAddress)
        ).to.be.reverted;
      });

      it("should fail if snapshot is not taken and user tries to claim", async () => {
        await expect(
          tokenExclusionManager.claimRemovedTokens(owner.address, 1, 2)
        ).to.be.revertedWithCustomError(
          tokenExclusionManager,
          "NoTokensRemoved"
        );
      });
      it("non-owner should not be able to update the cooldown period", async () => {
        await expect(
          protocolConfig.connect(nonOwner).setCoolDownPeriod("100")
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("owner should not be able to update the cooldown period smaller than 1 minute", async () => {
        await expect(
          protocolConfig.setCoolDownPeriod("1")
        ).to.be.revertedWithCustomError(
          protocolConfig,
          "InvalidCooldownPeriod"
        );
      });

      it("owner should not be able to update the cooldown period greater than 14 days", async () => {
        await expect(
          protocolConfig.setCoolDownPeriod("1296000")
        ).to.be.revertedWithCustomError(
          protocolConfig,
          "InvalidCooldownPeriod"
        );
      });

      it("owner should be able to update the cooldown period", async () => {
        await protocolConfig.setCoolDownPeriod("120");
      });

      it("owner should not be able to update the allowed dust tolerance with the value 0", async () => {
        await expect(
          protocolConfig.updateAllowedDustTolerance("0")
        ).to.be.revertedWithCustomError(protocolConfig, "InvalidDustTolerance");
      });

      it("owner should not be able to update the allowed dust tolerance with the value 10_000", async () => {
        await expect(
          protocolConfig.updateAllowedDustTolerance("10000")
        ).to.be.revertedWithCustomError(protocolConfig, "InvalidDustTolerance");
      });

      it("owner should be able to update the allowed dust tolerance", async () => {
        await protocolConfig.updateAllowedDustTolerance("200");
      });

      it("non-owner should not be able to update the token removal vault module base address", async () => {
        await expect(
          portfolioFactory
            .connect(nonOwner)
            .setTokenRemovalVaultModule(addr1.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("owner should be able to update the token removal vault module base address", async () => {
        await portfolioFactory.setTokenRemovalVaultModule(addr1.address);
      });

      it("non owner should not be able to update portfolio manager base address", async () => {
        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        const positionWrapperBaseAddress = await PositionWrapper.deploy();
        await positionWrapperBaseAddress.deployed();

        await expect(
          protocolConfig
            .connect(nonOwner)
            .updatePositionWrapperBaseImplementation(
              thenaProtocolHash,
              positionWrapperBaseAddress.address
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("owner should be able to update portfolio manager base address", async () => {
        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        const positionWrapperBaseAddress = await PositionWrapper.deploy();
        await positionWrapperBaseAddress.deployed();

        await protocolConfig.updatePositionWrapperBaseImplementation(
          thenaProtocolHash,
          positionWrapperBaseAddress.address
        );
      });
    });
  });
});
