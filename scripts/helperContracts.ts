// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat

import { isAddress } from "ethers/lib/utils";

const { before, describe, it } = require("mocha");

import {
  Portfolio__factory,
  AmountCalculationsAlgebra,
  EnsoHandler,
  UniswapV2Handler,
  PositionManagerThena,
  Rebalancing__factory,
} from "../../typechain";

import { tokenAddresses, IAddresses } from "../test/Bsc/Deployments.test";

// Runtime Environment's members available in the global scope.
const { ethers, upgrades, tenderly } = require("hardhat");
const { chainIdToAddresses } = require("../scripts/networkVariables");

async function main() {
  console.log("--------------- Contract Deployment Started ---------------");

  const WithdrawBatch = await ethers.getContractFactory(
    "WithdrawBatchExternalPositions"
  );
  const withdrawBatch = await WithdrawBatch.deploy();
  await withdrawBatch.deployed();

  console.log("withdrawBatch", withdrawBatch.address);

  const WithdrawManager = await ethers.getContractFactory(
    "WithdrawManagerExternalPositions"
  );
  const withdrawManager = await WithdrawManager.deploy();
  await withdrawManager.deployed();

  console.log("withdrawManager", withdrawManager.address);

  await withdrawManager.initialize(
    withdrawBatch.address,
    "0x6a3D8602522a9EcE6D017061B2FDDf62188B597A"
  );

  const TokenBalanceLibrary = await ethers.getContractFactory(
    "TokenBalanceLibrary"
  );

  const tokenBalanceLibrary = await TokenBalanceLibrary.deploy();
  await tokenBalanceLibrary.deployed();

  console.log("tokenBalanceLibrary", tokenBalanceLibrary.address);

  const PortfolioCalculations = await ethers.getContractFactory(
    "PortfolioCalculations",
    {
      libraries: {
        TokenBalanceLibrary: tokenBalanceLibrary.address,
      },
    }
  );
  const portfolioCalculations = await PortfolioCalculations.deploy();
  await portfolioCalculations.deployed();

  console.log("portfolioCalculations", portfolioCalculations.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
