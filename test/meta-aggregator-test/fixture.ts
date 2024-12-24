import { ethers } from "hardhat";


// test setup
export const setupTest = async () => {
    const [deployer, executor, user, receiver] = await ethers.getSigners(); // Get signers


    // Deploy Token1
    const Token1 = await ethers.getContractFactory("TESTERC20");
    const token1 = await Token1.deploy("Token1", "T1");
    await token1.deployed();

    const usdtToken = await ethers.getContractFactory("TESTERC20");
    const usdt = await usdtToken.deploy("USDT","usdt");
    await usdt.deployed();

    // Deploy Token2
    const Token2 = await ethers.getContractFactory("TESTERC20");
    const token2 = await Token2.deploy("Token2", "T2");
    await token2.deployed();

    // Deploy Aggregator
    const Aggregator = await ethers.getContractFactory("Aggregator");
    const aggregator = await Aggregator.deploy();
    await aggregator.deployed();

    // Deploy EnsoAggregatorHelper
    const EnsoAggregatorHelper = await ethers.getContractFactory("EnsoAggregatorHelper");
    const ensoHelper = await EnsoAggregatorHelper.deploy();
    await ensoHelper.deployed();

    // Deploy EnsoAggregator
    const EnsoAggregator = await ethers.getContractFactory("EnsoAggregator");
    const ensoAggregator = await EnsoAggregator.deploy(ensoHelper.address);
    await ensoAggregator.deployed();

    // Deploy MetaAggregatorTestSwapContract
    const MetaAggregatorTestSwapContract = await ethers.getContractFactory("MetaAggregatorSwapContract");
    const metaAggregatorTestSwapContract = await MetaAggregatorTestSwapContract.deploy(ensoAggregator.address, usdt.address);
    await metaAggregatorTestSwapContract.deployed();

    // Deploy MetaAggregatorManager
    const MetaAggregatorManager = await ethers.getContractFactory("MetaAggregatorManager");
    const metaAggregatorTestManager = await MetaAggregatorManager.deploy(metaAggregatorTestSwapContract.address);
    await metaAggregatorTestManager.deployed();

    // Deploy NonReentrantTest
    const NonReentrantTest = await ethers.getContractFactory("NonReentrantTest");
    const nonReentrantTest = await NonReentrantTest.deploy();
    await nonReentrantTest.deployed();

    // Deploy ReceiverContract
    const ReceiverContract = await ethers.getContractFactory("ReceiverContract");
    const receiverContract = await ReceiverContract.deploy();
    await receiverContract.deployed();

    // Deploy ReceiverRevert
    const ReceiverRevert = await ethers.getContractFactory("ReceiverRevert");
    const receiverRevert = await ReceiverRevert.deploy();
    await receiverRevert.deployed();

    const nativeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    console.log("*******************************test setup completed*******************************");

    return {
        token1,
        token2,
        aggregator,
        ensoAggregator,
        metaAggregatorTestManager,
        metaAggregatorTestSwapContract,
        nativeToken,
        deployer,
        executor,
        user,
        receiver,
        ensoHelper,
        nonReentrantTest,
        receiverContract,
        receiverRevert,
        zeroAddress,
        usdt
    };
};
