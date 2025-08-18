import { ethers } from "hardhat";

export const setupTest = async () => {
    const [deployer, feeDistributor, receiver1, receiver2] = await ethers.getSigners(); // Get signers


    // Deploy Token1
    const Token1 = await ethers.getContractFactory("TESTERC20");
    const token1 = await Token1.deploy("Token1", "T1");
    await token1.deployed();

    // Deploy Token2
    const Token2 = await ethers.getContractFactory("TESTERC20");
    const token2 = await Token2.deploy("Token2", "T2");
    await token2.deployed();

    //deploy trusted forwarder
    const TrustedForwarder = await ethers.getContractFactory("TrustedForwarder");
    const trustedForwarder = await TrustedForwarder.deploy();
    await trustedForwarder.deployed();

    // Deploy FeeDistribution
    const FeeDistribution = await ethers.getContractFactory("FeeDistribution");
    const feeDistribution = await FeeDistribution.connect(deployer).deploy(feeDistributor.address, trustedForwarder.address);
    await feeDistribution.deployed();

    //deploy malicious trusted forwarder
    const MaliciousTrustedForwarder = await ethers.getContractFactory("TrustedForwarder");
    const maliciousTrustedForwarder = await MaliciousTrustedForwarder.deploy();
    await maliciousTrustedForwarder.deployed();

    //deploy receiver revert 
    const ReceiverRevert = await ethers.getContractFactory("ReceiverRevert");
    const receiverRevert = await ReceiverRevert.deploy();
    await receiverRevert.deployed();


    const nativeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const zeroAddress = "0x0000000000000000000000000000000000000000";


    console.log("*******************************test setup completed*******************************");

    return {
        token1,
        token2,
        deployer,
        receiver1,
        receiver2,
        feeDistributor,
        feeDistribution,
        trustedForwarder,
        maliciousTrustedForwarder,
        receiverRevert,
        nativeToken,
        zeroAddress
    };
};
