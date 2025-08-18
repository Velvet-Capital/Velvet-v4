import BigNumber from "bignumber.js";
import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTest } from "./fixture";
import {
    loadFixture,
} from "@nomicfoundation/hardhat-network-helpers";
import { calculateFeeDistribution } from "./utils";

describe("Fee Distribution", function () {
    it("Fee Distribution in erc20 token with 2 receivers and single transaction", async () => {
        const { token1, feeDistributor, feeDistribution, trustedForwarder, receiver1, receiver2 } = await loadFixture(setupTest);

        const { fee1, fee2 } = calculateFeeDistribution("100000000000000000000000000", 5000);


        const transactionHash = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9a"

        await token1.mint(feeDistribution.address, "100000000000000000000000000");

        const { data } = await feeDistribution.populateTransaction.distribute(token1.address, [transactionHash], [fee1, fee2], [receiver1.address, receiver2.address]);

        const tnx = await trustedForwarder.connect(feeDistributor).execute(feeDistribution.address, data || "");

        const balanceOfReceiver1 = await token1.balanceOf(receiver1.address);
        const balanceOfReceiver2 = await token1.balanceOf(receiver2.address);

        expect(balanceOfReceiver1).to.equal(fee1);
        expect(balanceOfReceiver2).to.equal(fee2);
    })

    it("Fee Distribution in erc20 token with 2 receivers and multiple transaction", async () => {
        const { token1, feeDistributor, feeDistribution, trustedForwarder, receiver1, receiver2 } = await loadFixture(setupTest);

        const { fee1, fee2 } = calculateFeeDistribution("100000000000000000000000000", 5000);


        const transactionHash1 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9a"
        const transactionHash2 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9b"


        await token1.mint(feeDistribution.address, "100000000000000000000000000");

        const { data } = await feeDistribution.populateTransaction.distribute(token1.address, [transactionHash1, transactionHash2], [fee1, fee2], [receiver1.address, receiver2.address]);

        const tnx = await trustedForwarder.connect(feeDistributor).execute(feeDistribution.address, data || "");

        const balanceOfReceiver1 = await token1.balanceOf(receiver1.address);
        const balanceOfReceiver2 = await token1.balanceOf(receiver2.address);


        expect(balanceOfReceiver1).to.equal(fee1);
        expect(balanceOfReceiver2).to.equal(fee2);
    })

    it("Fee Distribution in native token with 2 receivers and single transaction", async () => {
        const { feeDistributor, feeDistribution, trustedForwarder, receiver1, receiver2, deployer, nativeToken } = await loadFixture(setupTest);

        const { fee1, fee2 } = calculateFeeDistribution("100000000000000000000", 5000);

        const tx = await deployer.sendTransaction({
            to: feeDistribution.address,
            value: "100000000000000000000"
        });

        const transactionHash = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9a"


        const balanceOfFeeDistribution = await ethers.provider.getBalance(feeDistribution.address);
        const balanceOfReceiver1 = await ethers.provider.getBalance(receiver1.address);
        const balanceOfReceiver2 = await ethers.provider.getBalance(receiver2.address);

        expect(balanceOfFeeDistribution).to.equal(BigNumber(fee1).plus(BigNumber(fee2)).toString());
        const { data } = await feeDistribution.populateTransaction.distribute(nativeToken, [transactionHash], [fee1, fee2], [receiver1.address, receiver2.address]);

        const tnx = await trustedForwarder.connect(feeDistributor).execute(feeDistribution.address, data || "");

        const balanceOfReceiver1After = await ethers.provider.getBalance(receiver1.address);
        const balanceOfReceiver2After = await ethers.provider.getBalance(receiver2.address);


        expect(balanceOfReceiver1After).to.equal(balanceOfReceiver1.add(fee1));
        expect(balanceOfReceiver2After).to.equal(balanceOfReceiver2.add(fee2));
    })

    it("Fee Distribution in native token with 2 receivers and multiple transaction", async () => {
        const { feeDistributor, feeDistribution, trustedForwarder, receiver1, receiver2, deployer, nativeToken } = await loadFixture(setupTest);

        const { fee1, fee2 } = calculateFeeDistribution("100000000000000000000", 5000);

        const tx = await deployer.sendTransaction({
            to: feeDistribution.address,
            value: "100000000000000000000"
        });

        const transactionHash1 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9a"
        const transactionHash2 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9b"


        const balanceOfFeeDistribution = await ethers.provider.getBalance(feeDistribution.address);
        const balanceOfReceiver1 = await ethers.provider.getBalance(receiver1.address);
        const balanceOfReceiver2 = await ethers.provider.getBalance(receiver2.address);

        expect(balanceOfFeeDistribution).to.equal(BigNumber(fee1).plus(BigNumber(fee2)).toString());
        const { data } = await feeDistribution.populateTransaction.distribute(nativeToken, [transactionHash1, transactionHash2], [fee1, fee2], [receiver1.address, receiver2.address]);

        const tnx = await trustedForwarder.connect(feeDistributor).execute(feeDistribution.address, data || "");

        const balanceOfReceiver1After = await ethers.provider.getBalance(receiver1.address);
        const balanceOfReceiver2After = await ethers.provider.getBalance(receiver2.address);


        expect(balanceOfReceiver1After).to.equal(balanceOfReceiver1.add(fee1));
        expect(balanceOfReceiver2After).to.equal(balanceOfReceiver2.add(fee2));
    })


    it("Fee Distribution in batch for both native token and erc20 token with 2 receivers and multiple transaction", async () => {
        const { feeDistributor, feeDistribution, trustedForwarder, receiver1, receiver2, deployer, nativeToken, token1 } = await loadFixture(setupTest);

        const { fee1: nativeFee1, fee2: nativeFee2 } = calculateFeeDistribution("100000000000000000000", 5000);
        const { fee1: erc20Fee1, fee2: erc20Fee2 } = calculateFeeDistribution("100000000000000000000", 5000);
        const tx = await deployer.sendTransaction({
            to: feeDistribution.address,
            value: "100000000000000000000"
        });
        await token1.mint(feeDistribution.address, "100000000000000000000000000");


        const transactionHash1 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9a"
        const transactionHash2 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9b"
        const transactionHash3 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9c"
        const transactionHash4 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9d"


        const balanceOfFeeDistribution = await ethers.provider.getBalance(feeDistribution.address);
        const balanceOfReceiver1 = await ethers.provider.getBalance(receiver1.address);
        const balanceOfReceiver2 = await ethers.provider.getBalance(receiver2.address);

        expect(balanceOfFeeDistribution).to.equal(BigNumber(nativeFee1).plus(BigNumber(nativeFee2)).toString());
        const { data } = await feeDistribution.populateTransaction.distributeBatch([nativeToken, token1.address], [[transactionHash1, transactionHash2], [transactionHash3, transactionHash4]], [[nativeFee1, nativeFee2], [erc20Fee1, erc20Fee2]], [[receiver1.address, receiver2.address], [receiver1.address, receiver2.address]]);

        const tnx = await trustedForwarder.connect(feeDistributor).execute(feeDistribution.address, data || "");

        const balanceOfReceiver1After = await ethers.provider.getBalance(receiver1.address);
        const balanceOfReceiver2After = await ethers.provider.getBalance(receiver2.address);


        expect(balanceOfReceiver1After).to.equal(balanceOfReceiver1.add(nativeFee1));
        expect(balanceOfReceiver2After).to.equal(balanceOfReceiver2.add(nativeFee2));

        const balanceOfToken1Receiver1 = await token1.balanceOf(receiver1.address);
        const balanceOfToken1Receiver2 = await token1.balanceOf(receiver2.address);

        expect(balanceOfToken1Receiver1).to.equal(erc20Fee1);
        expect(balanceOfToken1Receiver2).to.equal(erc20Fee2);
    })
    it("default admin can grant the default admin to a user", async () => {
        const { feeDistributor, feeDistribution, maliciousTrustedForwarder, receiver1, receiver2, deployer, nativeToken, token1 } = await loadFixture(setupTest);

        const tx = await feeDistribution.connect(deployer).grantRole(await feeDistribution.DEFAULT_ADMIN_ROLE(),receiver1.address);

        let hasRole = await feeDistribution.hasRole(await feeDistribution.DEFAULT_ADMIN_ROLE(), receiver1.address);

        expect(hasRole).to.equal(true);

        await feeDistribution.connect(deployer).revokeRole(await feeDistribution.DEFAULT_ADMIN_ROLE(),deployer.address);

        hasRole = await feeDistribution.hasRole(await feeDistribution.DEFAULT_ADMIN_ROLE(), deployer.address);

        expect(hasRole).to.equal(false);
    })
    it("default admin can grant the fee distributor role to a user", async () => {
        const { feeDistributor, feeDistribution, maliciousTrustedForwarder, receiver1, receiver2, deployer, nativeToken, token1 } = await loadFixture(setupTest);

        const tx = await feeDistribution.connect(deployer).grantRole(await feeDistribution.FEE_DISTRIBUTOR_ROLE(),receiver1.address);

        const hasRole = await feeDistribution.hasRole(await feeDistribution.FEE_DISTRIBUTOR_ROLE(), receiver1.address);

        expect(hasRole).to.equal(true);
    })
    it("default admin can revoke the fee distributor role from a user", async () => {
        const { feeDistributor, feeDistribution, maliciousTrustedForwarder, receiver1, receiver2, deployer, nativeToken, token1 } = await loadFixture(setupTest);

        const tx = await feeDistribution.connect(deployer).revokeRole(await feeDistribution.FEE_DISTRIBUTOR_ROLE(),receiver1.address);

        const hasRole = await feeDistribution.hasRole(await feeDistribution.FEE_DISTRIBUTOR_ROLE(), receiver1.address);
        expect(hasRole).to.equal(false);
    })
    it("only default admin can grant the fee distributor role", async () => {
        const { feeDistributor, feeDistribution, maliciousTrustedForwarder, receiver1, receiver2, deployer, nativeToken, token1 } = await loadFixture(setupTest);

        expect(feeDistribution.connect(receiver1).grantRole(await feeDistribution.FEE_DISTRIBUTOR_ROLE(),receiver1.address)).to.be.revertedWith(`AccessControl: account ${receiver1.address} is missing role ${await feeDistribution.DEFAULT_ADMIN_ROLE()}`);
    })
    it("only default admin can revoke the fee distributor role", async () => {
        const { feeDistributor, feeDistribution, maliciousTrustedForwarder, receiver1, receiver2, deployer, nativeToken, token1 } = await loadFixture(setupTest);

        expect(feeDistribution.connect(receiver1).grantRole(await feeDistribution.FEE_DISTRIBUTOR_ROLE(),feeDistributor.address)).to.be.revertedWith(`AccessControl: account ${receiver1.address} is missing role ${await feeDistribution.DEFAULT_ADMIN_ROLE()}`);
    })
    it("only fee distributor can distribute fees", async () => {
        const { feeDistributor, feeDistribution, maliciousTrustedForwarder, receiver1, receiver2, deployer, nativeToken, trustedForwarder } = await loadFixture(setupTest);

        const { fee1, fee2 } = calculateFeeDistribution("100000000000000000000000000", 5000);


        const transactionHash1 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9a"
        const transactionHash2 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9b"

        const { data } = await feeDistribution.populateTransaction.distribute(nativeToken, [transactionHash1, transactionHash2], [fee1, fee2], [receiver1.address, receiver2.address]);

        expect(trustedForwarder.connect(receiver1).execute(feeDistribution.address, data || "")).to.be.revertedWith(`AccessControl: account ${receiver1.address} is missing role ${await feeDistribution.FEE_DISTRIBUTOR_ROLE()}`);
    })
    it("only set trusted forwarder can be used to distribute fees", async () => {
        const { feeDistributor, feeDistribution, maliciousTrustedForwarder, receiver1, receiver2, deployer, nativeToken, trustedForwarder } = await loadFixture(setupTest);

        const { fee1, fee2 } = calculateFeeDistribution("100000000000000000000000000", 5000);


        const transactionHash1 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9a"
        const transactionHash2 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9b"

        const { data } = await feeDistribution.populateTransaction.distribute(nativeToken, [transactionHash1, transactionHash2], [fee1, fee2], [receiver1.address, receiver2.address]);

        expect(maliciousTrustedForwarder.connect(feeDistributor).execute(feeDistribution.address, data || "")).to.be.revertedWith(`AccessControl: account ${maliciousTrustedForwarder.address} is missing role ${await feeDistribution.FEE_DISTRIBUTOR_ROLE()}`);
    })
    it("only fee distributor can distribute fees in batch", async () => {
        const { feeDistributor, feeDistribution, trustedForwarder, receiver1, receiver2, deployer, nativeToken, token1 } = await loadFixture(setupTest);

        const { fee1: nativeFee1, fee2: nativeFee2 } = calculateFeeDistribution("100000000000000000000", 5000);
        const { fee1: erc20Fee1, fee2: erc20Fee2 } = calculateFeeDistribution("100000000000000000000", 5000);
        const tx = await deployer.sendTransaction({
            to: feeDistribution.address,
            value: "100000000000000000000"
        });
        await token1.mint(feeDistribution.address, "100000000000000000000000000");


        const transactionHash1 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9a"
        const transactionHash2 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9b"
        const transactionHash3 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9c"
        const transactionHash4 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9d"


        const { data } = await feeDistribution.populateTransaction.distributeBatch([nativeToken, token1.address], [[transactionHash1, transactionHash2], [transactionHash3, transactionHash4]], [[nativeFee1, nativeFee2], [erc20Fee1, erc20Fee2]], [[receiver1.address, receiver2.address], [receiver1.address, receiver2.address]]);

        expect(trustedForwarder.connect(receiver1).execute(feeDistribution.address, data || "")).to.be.revertedWith(`AccessControl: account ${receiver1.address} is missing role ${await feeDistribution.FEE_DISTRIBUTOR_ROLE()}`);
    })
    it("should fail when args have different length for batch distribution", async () => {
        const { feeDistributor, feeDistribution, trustedForwarder, receiver1, receiver2, deployer, nativeToken, token1 } = await loadFixture(setupTest);

        const { fee1: nativeFee1, fee2: nativeFee2 } = calculateFeeDistribution("100000000000000000000", 5000);
        const { fee1: erc20Fee1, fee2: erc20Fee2 } = calculateFeeDistribution("100000000000000000000", 5000);
        const tx = await deployer.sendTransaction({
            to: feeDistribution.address,
            value: "100000000000000000000"
        });
        await token1.mint(feeDistribution.address, "100000000000000000000000000");


        const transactionHash3 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9c"
        const transactionHash4 = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9d"


        const { data } = await feeDistribution.populateTransaction.distributeBatch([nativeToken, token1.address], [[transactionHash3, transactionHash4]], [[nativeFee1, nativeFee2], [erc20Fee1, erc20Fee2]], [[receiver1.address, receiver2.address], [receiver1.address, receiver2.address]]);

        expect(trustedForwarder.connect(feeDistributor).execute(feeDistribution.address, data || "")).to.be.revertedWith(`FeeDistribution:Parameter length mismatch`);
    })

    it("should fail when transaction hashes are empty", async () => {
        const { token1, feeDistributor, feeDistribution, trustedForwarder, receiver1, receiver2 } = await loadFixture(setupTest);

        const { fee1, fee2 } = calculateFeeDistribution("100000000000000000000000000", 5000);

        await token1.mint(feeDistribution.address, "100000000000000000000000000");

        const { data } = await feeDistribution.populateTransaction.distribute(token1.address, [], [fee1, fee2], [receiver1.address, receiver2.address]);

        expect(trustedForwarder.connect(feeDistributor).execute(feeDistribution.address, data || "")).to.be.revertedWith(`FeeDistribution: Transaction hashes are required`);
    })
    it("should fail when receivers and amounts have different length", async () => {
        const { token1, feeDistributor, feeDistribution, trustedForwarder, receiver1, receiver2 } = await loadFixture(setupTest);

        const { fee1, fee2 } = calculateFeeDistribution("100000000000000000000000000", 5000);


        const transactionHash = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9a"

        await token1.mint(feeDistribution.address, "100000000000000000000000000");

        const { data } = await feeDistribution.populateTransaction.distribute(token1.address, [transactionHash], [fee1, fee2], [receiver2.address]);

        expect(trustedForwarder.connect(feeDistributor).execute(feeDistribution.address, data || "")).to.be.revertedWith(`FeeDistribution: Amounts and receivers length mismatch`);
    })
    it("should fail when native token transfer fails", async () => {
        const { feeDistributor, feeDistribution, receiverRevert, receiver1, receiver2, deployer, nativeToken } = await loadFixture(setupTest);

        const { fee1, fee2 } = calculateFeeDistribution("100000000000000000000", 5000);

        const tx = await deployer.sendTransaction({
            to: feeDistribution.address,
            value: "100000000000000000000"
        });

        const transactionHash = "0x315566a7f34925e8a60ddd1efd6504e770db79ee8270231ca8b97338539bdc9a"

        expect(feeDistribution.connect(feeDistributor).distribute(nativeToken, [transactionHash], [fee1, fee2], [receiver1.address, receiverRevert.address])).to.be.revertedWith(`Native transfer failed`);
    })
})
