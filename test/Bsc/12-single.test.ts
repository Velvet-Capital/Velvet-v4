import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import "@nomicfoundation/hardhat-chai-matchers";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";

import {
  createEnsoCallDataRoute,
  calculateOutputAmounts,
} from "./IntentCalculations";

import { tokenAddresses, IAddresses, priceOracle } from "./Deployments.test";

import {
  Portfolio__factory,
  AmountCalculationsAlgebra,
  EnsoHandler,
  UniswapV2Handler,
  PositionManagerThena,
  Rebalancing__factory,
} from "../../typechain";

import { chainIdToAddresses } from "../../scripts/networkVariables";

import { IAddresses } from "./Deployments.test";

var chai = require("chai");
const axios = require("axios");
const qs = require("qs");
//use default BigNumber
chai.use(require("chai-bignumber")());

const zeroAddress = "0x0000000000000000000000000000000000000000";

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
  let depositBatch: any;
  let depositManager: any;
  let portfolioCalculations: any;
  let withdrawManager: any;
  let withdrawBatch: any;

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

      iaddress = await tokenAddresses();

      // @todo
      /*const PortfolioFactory = await ethers.getContractFactory(
        "PortfolioFactory"
      );
      const portfolioFactory = PortfolioFactory.attach(
        "0x6a3D8602522a9EcE6D017061B2FDDf62188B597A"
      );
      const DepositBatchExternalPositions = await ethers.getContractFactory(
        "DepositBatchExternalPositions"
      );
      depositBatch = await DepositBatchExternalPositions.attach(
        "0x0ca226CA59d20FfF1d5279D02FE16f6d79A8BcAe"
      );

      const DepositManager = await ethers.getContractFactory(
        "DepositManagerExternalPositions"
      );
      depositManager = await DepositManager.attach(
        "0x977cA5cDA3b6f1FdAD2fFfDC2c8d1e1724E23563"
      );

      const AmountCalculationsAlgebra = await ethers.getContractFactory(
        "AmountCalculationsAlgebra"
      );
      amountCalculationsAlgebra = AmountCalculationsAlgebra.attach(
        "0xFC1dDbeb05a72083E0D7E3BeD952cBb008AC1aFF"
      );

      const EnsoHandler = await ethers.getContractFactory("EnsoHandler");
      ensoHandler = EnsoHandler.attach(
        "0x854554ce1db7615887cC91b19a7AF633e469c282"
      );*/
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

        console.log("position1", position1);

        const PositionWrapper = await ethers.getContractFactory(
          "PositionWrapper"
        );
        positionWrapper = PositionWrapper.attach(position1);
      });

      /*it("should create new position", async () => {
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

        console.log("position2", position2);

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
            "2800000000000000"
          );
          postResponse.push(response.data.tx.data);
        }

        let balanceBeforeETH = await nonOwner.getBalance();

        const data = await depositBatch
          .connect(nonOwner)
          .multiTokenSwapETHAndTransfer(
            {
              _minMintAmount: 0,
              _depositAmount: "20000000000000000",
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
              value: "20000000000000000",
            }
          );

        const receipt = await data.wait();
        console.log("Transaction ID:", receipt.transactionHash);

        let balanceAfterETH = await nonOwner.getBalance();

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(nonOwner.address))) /
          Number(BigNumber.from(await portfolio.totalSupply()));

        await calculateOutputAmounts(position1, "10000");

        console.log("SupplyAfter", await portfolio.totalSupply());
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
            "2800000000000000"
          );
          postResponse.push(response.data.tx.data);
        }

        let balanceBeforeETH = await nonOwner.getBalance();

        const data = await depositBatch
          .connect(nonOwner)
          .multiTokenSwapETHAndTransfer(
            {
              _minMintAmount: 0,
              _depositAmount: "20000000000000000",
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
              value: "20000000000000000",
            }
          );

        const receipt = await data.wait();
        console.log("Transaction ID:", receipt.transactionHash);

        let balanceAfterETH = await nonOwner.getBalance();

        const userShare =
          Number(BigNumber.from(await portfolio.balanceOf(nonOwner.address))) /
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

        const data = await rebalancing.updateTokens({
          _newTokens: newTokens,
          _sellTokens: [sellToken],
          _sellAmounts: [sellTokenBalance],
          _handler: ensoHandler.address,
          _callData: encodedParameters,
        });

        const receipt = await data.wait();
        console.log("Transaction ID:", receipt.transactionHash);
      });

      it("should withdraw in single token by user in native token", async () => {
        await ethers.provider.send("evm_increaseTime", [62]);

        const supplyBefore = await portfolio.totalSupply();
        const user = nonOwner;
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
                (withdrawAmounts.token0Amount * 0.9999999).toFixed(0)
              );
            }
            if (withdrawAmounts.token1Amount > 0) {
              swapAmounts.push(
                (withdrawAmounts.token1Amount * 0.9999999).toFixed(0)
              );
            }
            wrapperIndex++;
          }
        }

        await portfolio
          .connect(user)
          .approve(
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
              (swapAmounts[i] * 0.9999999).toFixed(0)
            );
            responses.push(response.data.tx.data);
          }
        }

        let balanceBeforeETH = await user.getBalance();

        /*
    FunctionParameters.withdrawRepayParams calldata repayData,
    FunctionParameters.ExternalPositionWithdrawParams memory _params*/

      /*const data = await withdrawManager.connect(user).withdraw(
          swapTokens,
          portfolio.address,
          tokenToSwapInto,
          amountPortfolioToken,
          responses,
          {
            _factory: zeroAddress,
            _token0: zeroAddress,
            _token1: zeroAddress,
            _flashLoanToken: zeroAddress,
            _solverHandler: zeroAddress,
            _flashLoanAmount: [0],
            firstSwapData: ["0x"],
            secondSwapData: ["0x"],
          },
          {
            _positionWrappers: positionWrappers,
            _amountsMin0: [0, 0],
            _amountsMin1: [0, 0],
            _tokenIn: ZERO_ADDRESS,
            _tokenOut: ZERO_ADDRESS,
            _amountIn: "0",
          }
        );

        const receipt = await data.wait();
        console.log("Transaction ID:", receipt.transactionHash);

        let balanceAfterETH = await user.getBalance();

        const supplyAfter = await portfolio.totalSupply();

        const balanceAfter = await provider.getBalance(user.address);

        expect(Number(balanceAfter)).to.be.greaterThan(Number(balanceBefore));
        expect(Number(supplyBefore)).to.be.greaterThan(Number(supplyAfter));
      });*/
    });
  });
});
