
import { ethers } from "hardhat";

async function main() {

  // Deploy FeeDistribution
  const trustedForwarder = "0xd8253782c45a12053594b9deB72d8e8aB2Fca54c"
  const feeDistributor = "0x04d740D2D93AF7417060Ec7b35415c81820470d0"
  const FeeDistribution = await ethers.getContractFactory("FeeDistribution");
  const feeDistribution = await FeeDistribution.deploy(feeDistributor, trustedForwarder);
  await feeDistribution.deployed();

  await tenderly.verify({
    name: "FeeDistribution",
    address: feeDistribution.address,
  });

  console.log(`FeeDistribution deployed at: ${feeDistribution.address}`);
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
