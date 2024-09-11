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
  calculateDepositAmounts,
} from "./IntentCalculations";

import { tokenAddresses, IAddresses, priceOracle } from "./Deployments.test";

import {
  Portfolio__factory,
  AssetManagementConfig,
  AmountCalculationsAlgebra,
  EnsoHandler,
  UniswapV2Handler,
  PositionManagerThena,
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
  let portfolio: any;
  let ensoHandler: EnsoHandler;
  let swapHandler: UniswapV2Handler;
  let rebalancing: any;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let _assetManagerTreasury: SignerWithAddress;
  let positionManager: PositionManagerThena;
  let positionWrapper: any;
  let positionWrapper2: any;
  let addrs: SignerWithAddress[];

  let amountCalculationsAlgebra: AmountCalculationsAlgebra;

  const assetManagerHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("ASSET_MANAGER")
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

  const provider = ethers.provider;
  const chainId: any = process.env.CHAIN_ID;
  const addresses = chainIdToAddresses[chainId];

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  describe.only("Tests for Deposit", () => {
    let owner: SignerWithAddress;
    let treasury: SignerWithAddress;
    let depositor1: SignerWithAddress;
    let nonOwner: SignerWithAddress;
    let addr1: SignerWithAddress;
    let addr2: SignerWithAddress;

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

      const forkChainId: any = process.env.CHAIN_ID;
      const chainId: any = forkChainId ? forkChainId : 56;
      const addresses = chainIdToAddresses[chainId];

      let position1: any;
      let position2: any;

      let positionWrapper: any;
      let positionWrapper2: any;
      /// @dev The minimum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**-128
      const MIN_TICK = -887220;
      /// @dev The maximum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**128
      const MAX_TICK = 887220;

      // Create new portfolio
      const PortfolioFactory = await ethers.getContractFactory(
        "PortfolioFactory"
      );
      // @todo add address here
      const portfolioFactory = await PortfolioFactory.attach(
        "todo_put_address"
      );
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
          _whitelistedTokens: [],
          _public: true,
          _transferable: true,
          _transferableToPublic: true,
          _whitelistTokens: false,
          _externalPositionManagementWhitelisted: true,
        });

      // Setup
      const portfolioAddress = await portfolioFactory.getPortfolioList(0);
      const portfolio = await ethers.getContractAt(
        Portfolio__factory.abi,
        portfolioAddress
      );

      const config = await portfolio.assetManagementConfig();
      const AssetManagementConfig = await ethers.getContractFactory(
        "AssetManagementConfig"
      );
      const assetManagementConfig = AssetManagementConfig.attach(config);
      await assetManagementConfig.enableUniSwapV3Manager();

      let positionManagerAddress =
        await assetManagementConfig.positionManager();
      const PositionManager = await ethers.getContractFactory(
        "PositionManagerThena"
      );
      const positionManager = PositionManager.attach(positionManagerAddress);
    });

    describe("Test Cases", function () {
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
            _amount0Min: 1,
            _amount1Min: 1,
            _isExternalPosition: isExternalPosition,
            _tokenIn: ZERO_ADDRESS,
            _tokenOut: ZERO_ADDRESS,
            _amountIn: "0",
          },
          {
            value: "10000000000000000",
          }
        );

        let balanceAfterETH = await owner.getBalance();

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(owner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));

        await calculateOutputAmounts(position1, "10000");

        console.log("SupplyAfter", await portfolio.totalSupply());
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
          swapAmounts[0][0] = (
            withdrawAmounts.token0Amount * 0.9999999
          ).toFixed(0);
        }

        if (withdrawAmounts.token1Amount > 0) {
          swapAmounts[0][1] = (
            withdrawAmounts.token1Amount * 0.9999999
          ).toFixed(0);
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
    });
  });
});
