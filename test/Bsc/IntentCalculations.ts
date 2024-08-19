import "@nomicfoundation/hardhat-chai-matchers";
import { ethers, userConfig } from "hardhat";
import { BigNumber, Contract } from "ethers";

import {
  IERC20Upgradeable__factory,
  IFactory__factory,
  IPool__factory,
  INonfungiblePositionManager__factory,
} from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Sign } from "crypto";

const axios = require("axios");
const qs = require("qs");

export async function createEnsoCallData(
  data: any,
  ensoHandler: string,
): Promise<any> {
  const params = {
    chainId: 56,
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
  _amountIn: any,
): Promise<any> {
  const params = {
    chainId: 56,
    fromAddress: ensoHandler,
    receiver: receiver,
    spender: ensoHandler,
    amountIn: _amountIn,
    slippage: 700,
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

export async function calculateSwapAmounts(
  portfolioAddress: string,
  portfolioAddressLibraryAddressLibraryAddress: string,
  depositAmount: any,
): Promise<{ inputAmounts: any[] }> {
  const Portfolio = await ethers.getContractFactory("Portfolio");
  const portfolioSwapInstance = Portfolio.attach(portfolioAddress);

  const length = (await portfolioSwapInstance.getTokens()).length;
  let inputAmounts = [];
  for (let i = 0; i < length; i++) {
    inputAmounts.push(
      ethers.BigNumber.from(depositAmount).div(length).toString(),
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
  _inputAmounts: any[],
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
  nativeDeposit: boolean,
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
    inputAmounts,
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
  swapAmount1: string,
): Promise<any> {
  const PancakeSwapHandler = await ethers.getContractFactory(
    "UniswapV2Handler",
  );
  const swapHandler = PancakeSwapHandler.attach(swapHandlerAddress);

  const ERC20Upgradeable = await ethers.getContractFactory("ERC20Upgradeable");
  const balanceT0Before = await ERC20Upgradeable.attach(token0).balanceOf(
    user.address,
  );
  const balanceT1Before = await ERC20Upgradeable.attach(token1).balanceOf(
    user.address,
  );

  await swapHandler.swapETHToTokens("500", token0, user.address, {
    value: swapAmount0,
  });

  await swapHandler.swapETHToTokens("500", token1, user.address, {
    value: swapAmount1,
  });

  const balanceT0After = await ERC20Upgradeable.attach(token0).balanceOf(
    user.address,
  );
  const balanceT1After = await ERC20Upgradeable.attach(token1).balanceOf(
    user.address,
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
  swapAmount1: string,
): Promise<any> {
  let { swapResult0, swapResult1 } = await swapTokensToLPTokens(
    user,
    positionManagerAddress,
    swapHandlerAddress,
    token0,
    token1,
    swapAmount0,
    swapAmount1,
  );

  const ERC20Upgradeable = await ethers.getContractFactory("ERC20Upgradeable");
  const balanceT0Before = await ERC20Upgradeable.attach(token0).balanceOf(
    user.address,
  );
  const balanceT1Before = await ERC20Upgradeable.attach(token1).balanceOf(
    user.address,
  );

  const PositionManager = await ethers.getContractFactory(
    "PositionManagerThena",
  );
  const positionManager = PositionManager.attach(positionManagerAddress);

  await positionManager
    .connect(user)
    .increaseLiquidity(user.address, position, swapResult0, swapResult1, 0, 0);

  const balanceT0After = await ERC20Upgradeable.attach(token0).balanceOf(
    user.address,
  );
  const balanceT1After = await ERC20Upgradeable.attach(token1).balanceOf(
    user.address,
  );

  console.log("deposited amount T0: ", balanceT0Before.sub(balanceT0After));
  console.log("deposited amount T1: ", balanceT1Before.sub(balanceT1After));
}

export async function decreaseLiquidity(
  user: SignerWithAddress,
  positionManagerAddress: string,
  positionWrapperAddress: string,
): Promise<any> {
  const PositionManager = await ethers.getContractFactory(
    "PositionManagerThena",
  );
  const positionManager = PositionManager.attach(positionManagerAddress);

  const PositionWrapper = await ethers.getContractFactory("PositionWrapper");
  const positionWrapper = PositionWrapper.attach(positionWrapperAddress);

  let token0 = await positionWrapper.token0();
  let token1 = await positionWrapper.token1();

  const ERC20Upgradeable = await ethers.getContractFactory("ERC20Upgradeable");
  let balanceT0Before = await ERC20Upgradeable.attach(token0).balanceOf(
    user.address,
  );
  let balanceT1Before = await ERC20Upgradeable.attach(token1).balanceOf(
    user.address,
  );

  let balance = BigNumber.from(await positionWrapper.balanceOf(user.address));

  console.log("balance", balance);
  await positionManager
    .connect(user)
    .decreaseLiquidity(positionWrapper.address, balance, 0, 0);

  let balanceT0After = await ERC20Upgradeable.attach(token0).balanceOf(
    user.address,
  );
  let balanceT1After = await ERC20Upgradeable.attach(token1).balanceOf(
    user.address,
  );

  console.log("balanceT0Returned", balanceT0After.sub(balanceT0Before));
  console.log("balanceT1Returned", balanceT1After.sub(balanceT1Before));
}

export async function calculateOutputAmounts(
  _user: SignerWithAddress,
  _portfolio: string,
  _withdrawalAmount: any,
  _positionWrapperAddress: any,
  _tokenId: any,
  _token0: string,
  _token1: string,
  _userShare: any,
): Promise<any> {
  const UniswapV3HelperBNB = await ethers.getContractFactory(
    "UniswapV3HelperBNB",
  );
  const uniswapV3HelperBNB = await UniswapV3HelperBNB.deploy();
  await uniswapV3HelperBNB.deployed();

  let result = await uniswapV3HelperBNB.getPoolAddressAndLiquidity(
    _portfolio,
    _tokenId,
    _withdrawalAmount,
    _token0,
    _token1,
  );

  let token0Amount = result.tokenBalance0;
  let token1Amount = result.tokenBalance1;

  console.log("token0Amount", token0Amount);
  console.log("token1Amount", token1Amount);

  return { token0Amount, token1Amount };
}
