// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { run, ethers, upgrades } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  await run("compile");

  console.log("--------------- Contract Deployment Started ---------------");

  const EnsoHandler = await ethers.getContractFactory("EnsoHandler");
  const ensoHandler = await EnsoHandler.deploy(
    0x38147794ff247e5fc179edbae6c37fff88f68c52
  );
  console.log("EnsoHandler deployed to: ", ensoHandler.address);

  console.log(
    "------------------------------ Deployment Storage Ended ------------------------------"
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
