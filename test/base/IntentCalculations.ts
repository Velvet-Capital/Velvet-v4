import "@nomicfoundation/hardhat-chai-matchers";
import { ethers, userConfig } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { chainIdToAddresses } from "../../scripts/networkVariables";

import { IERC20Upgradeable__factory } from "../../typechain";

const axios = require("axios");
const qs = require("qs");

const chainId: any = process.env.CHAIN_ID;
const addresses = chainIdToAddresses[chainId];

export async function createEnsoCallData(
  data: any,
  ensoHandler: string
): Promise<any> {
  const params = {
    chainId: 8453,
    fromAddress: ensoHandler,
  };
  const postUrl = "https://api.enso.finance/api/v1/shortcuts/bundle?";

  const headers = {
    "Content-Type": "application/json",
    Authorization: process.env.ENSO_KEY,
  };

  return await axios.post(postUrl + `${qs.stringify(params)}`, data, {
    headers,
  });
}

export async function createEnsoCallDataRoute(
  ensoHandler: string,
  receiver: string,
  _tokenIn: any,
  _tokenOut: any,
  _amountIn: any
): Promise<any> {
  const params = {
    chainId: 8453,
    fromAddress: ensoHandler,
    receiver: receiver,
    spender: ensoHandler,
    amountIn: _amountIn,
    slippage: 1000,
    tokenIn: _tokenIn,
    tokenOut: _tokenOut,
    routingStrategy: "delegate",
  };

  const postUrl = "https://api.enso.finance/api/v1/shortcuts/route?";

  const headers = {
    //"Content-Type": "application/json",
    Authorization: process.env.ENSO_KEY,
  };

  return await axios.get(postUrl + `${qs.stringify(params)}`, {
    headers,
  });
}

export async function createMetaAggregatorCalldata(
  handler: string,
  receiver: string,
  _tokenIn: any,
  _tokenOut: any,
  _amountIn: any
): Promise<any> {
  const priceParams = {
    slippage: 30,
    amount: _amountIn,
    tokenIn: _tokenIn,
    tokenOut: _tokenOut,
    sender: handler,
    receiver: receiver,
    chainId: 8453,
    skipSimulation: true,
  };

  const postUrl = "http://arbitrumcentral.velvetdao.xyz:3000/best-quotes";

  console.log("price params", priceParams);

  return await axios.post(postUrl, priceParams);
}

export async function calculateSwapAmounts(
  portfolioAddress: string,
  portfolioAddressLibraryAddressLibraryAddress: string,
  depositAmount: any
): Promise<{ inputAmounts: any[] }> {
  const Portfolio = await ethers.getContractFactory("Portfolio");
  const portfolioSwapInstance = Portfolio.attach(portfolioAddress);

  const length = (await portfolioSwapInstance.getTokens()).length;
  let inputAmounts = [];
  for (let i = 0; i < length; i++) {
    inputAmounts.push(
      ethers.BigNumber.from(depositAmount).div(length).toString()
    );
  }
  return { inputAmounts };
}

// Returns the calldata returned by the Enso API
export async function createEnsoDataDeposit(
  _nativeTokenAddress: string,
  _depositToken: string,
  _portfolioTokens: string[],
  _userAddress: any,
  _inputAmounts: any[]
): Promise<{
  ensoApiResponse: any;
}> {
  let data = [];

  for (let i = 0; i < _portfolioTokens.length; i++) {
    if (_depositToken.toLowerCase() != _portfolioTokens[i].toLowerCase()) {
      data.push({
        protocol: "enso",
        action: "route",
        args: {
          tokenIn: _depositToken,
          tokenOut: _portfolioTokens[i],
          amountIn: _inputAmounts[i],
        },
      });
    }
  }

  return {
    ensoApiResponse: await createEnsoCallData(data, _userAddress),
  };
}

// Creates the calldata for the deposit including the Enso calldata + wrap/transfer calldata
export async function getDepositCalldata(
  portfolioAddress: string,
  portfolioAddressLibraryAddressLibraryAddress: string,
  depositToken: string,
  nativeTokenAddress: string,
  depositAmount: string,
  userAddress: string,
  inputAmounts: any[],
  nativeDeposit: boolean
): Promise<any> {
  const Portfolio = await ethers.getContractFactory("Portfolio");
  const portfolio = Portfolio.attach(portfolioAddress);
  const _portfolioTokens = await portfolio.getTokens();

  //Get Smart Wallet For User

  // console.log("getWalletReponse",await getUserSmartWallet(userAddress));

  const { ensoApiResponse } = await createEnsoDataDeposit(
    nativeTokenAddress, // native token
    depositToken, // deposit token Enso (0xeeee... for native)
    _portfolioTokens,
    userAddress,
    inputAmounts
  );

  return ensoApiResponse.data;
}

export async function swapTokensToLPTokens(
  user: SignerWithAddress,
  positionManagerAddress: string,
  swapHandlerAddress: string,
  token0: string,
  token1: string,
  swapAmount0: string,
  swapAmount1: string
): Promise<any> {
  const PancakeSwapHandler = await ethers.getContractFactory(
    "UniswapV2Handler"
  );
  const swapHandler = PancakeSwapHandler.attach(swapHandlerAddress);

  const ERC20Upgradeable = await ethers.getContractFactory("ERC20Upgradeable");
  const balanceT0Before = await ERC20Upgradeable.attach(token0).balanceOf(
    user.address
  );
  const balanceT1Before = await ERC20Upgradeable.attach(token1).balanceOf(
    user.address
  );

  await swapHandler.swapETHToTokens("500", token0, user.address, {
    value: swapAmount0,
  });

  await swapHandler.swapETHToTokens("500", token1, user.address, {
    value: swapAmount1,
  });

  const balanceT0After = await ERC20Upgradeable.attach(token0).balanceOf(
    user.address
  );
  const balanceT1After = await ERC20Upgradeable.attach(token1).balanceOf(
    user.address
  );

  let swapResult0 = balanceT0After.sub(balanceT0Before);
  let swapResult1 = balanceT1After.sub(balanceT1Before);

  await ERC20Upgradeable.attach(token0)
    .connect(user)
    .approve(positionManagerAddress, 0);

  await ERC20Upgradeable.attach(token0)
    .connect(user)
    .approve(positionManagerAddress, swapResult0);

  await ERC20Upgradeable.attach(token1)
    .connect(user)
    .approve(positionManagerAddress, 0);

  await ERC20Upgradeable.attach(token1)
    .connect(user)
    .approve(positionManagerAddress, swapResult1);

  return { swapResult0, swapResult1 };
}

export async function increaseLiquidity(
  user: SignerWithAddress,
  positionManagerAddress: string,
  swapHandlerAddress: string,
  token0: string,
  token1: string,
  position: string,
  swapAmount0: string,
  swapAmount1: string
): Promise<any> {
  let { swapResult0, swapResult1 } = await swapTokensToLPTokens(
    user,
    positionManagerAddress,
    swapHandlerAddress,
    token0,
    token1,
    swapAmount0,
    swapAmount1
  );

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
  const positionManager = PositionManager.attach(positionManagerAddress);

  await positionManager.connect(user).increaseLiquidity({
    _dustReceiver: user.address,
    _positionWrapper: position,
    _amount0Desired: swapResult0,
    _amount1Desired: swapResult1,
    _amount0Min: 0,
    _amount1Min: 0,
    _tokenIn: token0,
    _tokenOut: token1,
    _amountIn: 0,
  });
}

export async function decreaseLiquidity(
  user: SignerWithAddress,
  positionManagerAddress: string,
  positionWrapperAddress: string
): Promise<any> {
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
  const positionManager = PositionManager.attach(positionManagerAddress);

  const PositionWrapper = await ethers.getContractFactory("PositionWrapper");
  const positionWrapper = PositionWrapper.attach(positionWrapperAddress);

  let token0 = await positionWrapper.token0();
  let token1 = await positionWrapper.token1();

  const ERC20Upgradeable = await ethers.getContractFactory("ERC20Upgradeable");
  let balanceT0Before = await ERC20Upgradeable.attach(token0).balanceOf(
    user.address
  );
  let balanceT1Before = await ERC20Upgradeable.attach(token1).balanceOf(
    user.address
  );

  let balance = BigNumber.from(await positionWrapper.balanceOf(user.address));

  console.log("balance", balance);
  await positionManager
    .connect(user)
    .decreaseLiquidity(
      positionWrapper.address,
      balance,
      0,
      0,
      token0,
      token1,
      0
    );

  let balanceT0After = await ERC20Upgradeable.attach(token0).balanceOf(
    user.address
  );
  let balanceT1After = await ERC20Upgradeable.attach(token1).balanceOf(
    user.address
  );

  console.log("balanceT0Returned", balanceT0After.sub(balanceT0Before));
  console.log("balanceT1Returned", balanceT1After.sub(balanceT1Before));
}

export async function calculateOutputAmounts(
  _positionWrapperAddress: any,
  _percentage: any
): Promise<any> {
  const AmountCalculationsAlgebra = await ethers.getContractFactory(
    "AmountCalculationsUniswap"
  );
  const amountCalculationsAlgebra = await AmountCalculationsAlgebra.deploy();
  await amountCalculationsAlgebra.deployed();

  let result =
    await amountCalculationsAlgebra.callStatic.getLiquidityAmountsForPartialWithdrawal(
      _positionWrapperAddress,
      _percentage
    );

  let token0Amount = result.amount0Out;
  let token1Amount = result.amount1Out;

  return { token0Amount, token1Amount };
}

export async function calculateSwapAmountUpdateRange(
  positionManagerAddress: string,
  position: string,
  newTickLower: any,
  newTickUpper: any
): Promise<any> {
  const AmountCalculationsAlgebra = await ethers.getContractFactory(
    "AmountCalculationsUniswap"
  );
  const amountCalculationsAlgebra = await AmountCalculationsAlgebra.deploy();
  await amountCalculationsAlgebra.deployed();

  const PositionWrapper = await ethers.getContractFactory("PositionWrapper");
  const positionWrapper = PositionWrapper.attach(position);

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
  const positionManager = PositionManager.attach(positionManagerAddress);

  const token0 = await positionWrapper.token0();
  const token1 = await positionWrapper.token1();
  //const tokenId = await positionWrapper.tokenId();
  /*

        Steps:
        - ratioForNewPriceRange - modify, only return both amounts
        - pass amount total, amount0, amount1 to get ratio
        - getTokenBalances before swap token0, token1
        - sum of token0, token1 => total amount, must be in the same currency
        - sum * ratio for each token
        - calculate swap amount

        */

  // Get amounts for new price range (to calculate the ratio)
  let amounts =
    await amountCalculationsAlgebra.callStatic.getRatioAmountsForTicks(
      position,
      newTickLower,
      newTickUpper
    );

  // Convert amount0, amount1 to USD (here we use stable coins for testing so we can skip)

  // Get the ratios the tokens should be swapped to
  let ratio0 =
    Number(BigNumber.from(amounts.amount0)) /
    Number(
      BigNumber.from(amounts.amount0).add(BigNumber.from(amounts.amount1))
    );
  let ratio1 =
    Number(BigNumber.from(amounts.amount1)) /
    Number(
      BigNumber.from(amounts.amount0).add(BigNumber.from(amounts.amount1))
    );

  // Get the token balances before the swap
  const ERC20 = await ethers.getContractFactory("ERC20Upgradeable");
  let underlyingBalances =
    await amountCalculationsAlgebra.callStatic.getUnderlyingAmounts(position);

  // in production: add fees earned
  let token0BalanceBefore = BigNumber.from(
    await ERC20.attach(token0).balanceOf(positionManager.address)
  ).add(BigNumber.from(underlyingBalances.amount0));
  let token1BalanceBefore = BigNumber.from(
    await ERC20.attach(token1).balanceOf(positionManager.address)
  ).add(BigNumber.from(underlyingBalances.amount1));
  // If not stablecoin both balances need to be converted to USD first
  let totalBalance = token0BalanceBefore.add(token1BalanceBefore);

  // Calculate the amounts needed to reinvest
  let depositAmount0 = Number(BigNumber.from(totalBalance)) * ratio0;

  let depositAmount1 = Number(BigNumber.from(totalBalance)) * ratio1;

  let swapAmount;
  let tokenIn;
  let tokenOut;

  // Calculate the amount to swap
  if (depositAmount0 < Number(BigNumber.from(token0BalanceBefore))) {
    swapAmount = Number(BigNumber.from(token0BalanceBefore)) - depositAmount0;
    tokenIn = token0;
    tokenOut = token1;
  } else {
    swapAmount = Number(BigNumber.from(token1BalanceBefore)) - depositAmount1;
    tokenIn = token1;
    tokenOut = token0;
  }

  swapAmount = (swapAmount * 0.999).toFixed(0);

  return { swapAmount, tokenIn, tokenOut };
}
