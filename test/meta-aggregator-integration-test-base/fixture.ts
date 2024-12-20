import { ethers } from "hardhat";
import hre from "hardhat"


// test setup
export const setupTest = async () => {
    const [deployer, executor, user, receiver] = await ethers.getSigners(); // Get signers

    const ensoAggregator = "0x38147794FF247e5Fc179eDbAE6C37fff88f68C52"
    const usdt = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"



    // Deploy MetaAggregatorTestSwapContract
    const MetaAggregatorTestSwapContract = await ethers.getContractFactory("MetaAggregatorSwapContract");
    const metaAggregatorTestSwapContract = await MetaAggregatorTestSwapContract.deploy(ensoAggregator, usdt);
    await metaAggregatorTestSwapContract.deployed();

    // Deploy MetaAggregatorManager
    const MetaAggregatorManager = await ethers.getContractFactory("MetaAggregatorManager");
    const metaAggregatorTestManager = await MetaAggregatorManager.deploy(metaAggregatorTestSwapContract.address);
    await metaAggregatorTestManager.deployed();
    // Deploy ReceiverContract
    const ReceiverContract = await ethers.getContractFactory("ReceiverContract");
    const receiverContract = await ReceiverContract.deploy();
    await receiverContract.deployed();

    // Deploy ReceiverRevert
    const ReceiverRevert = await ethers.getContractFactory("ReceiverRevert");
    const receiverRevert = await ReceiverRevert.deploy();
    await receiverRevert.deployed();

    const nativeToken = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    const impersonatedAccount = "0x8941516DbF170712458758FBE244D9Fd73C81B7C";


    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [impersonatedAccount],
    });

    const tokenProvider = await ethers.getSigner(impersonatedAccount);


    console.log("*******************************test setup completed*******************************");



    return {
        metaAggregatorTestManager,
        metaAggregatorTestSwapContract,
        nativeToken,
        deployer,
        executor,
        user,
        receiver,
        receiverContract,
        receiverRevert,
        zeroAddress,
        tokenProvider
    };
};
