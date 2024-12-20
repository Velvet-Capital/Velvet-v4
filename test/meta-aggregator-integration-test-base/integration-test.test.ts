import BigNumber from "bignumber.js";
import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTest } from "./fixture";
import { createMetaAggregatorCalldata } from "./utils"
import { network } from "hardhat"; // Add this line

const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
];

describe("Integration Swap test", function () {
    this.timeout(600000); 
    beforeEach(async () => {
        await network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                    forking: {
                        jsonRpcUrl: process.env.BASE_RPC
                    },
                },
            ],
        });
        const forkingConfig = (network.config as any).forking;

        if (forkingConfig && forkingConfig.enabled) {
            console.log("The network is forked!");
            console.log("Forked from:", forkingConfig.url);

            if (forkingConfig.blockNumber) {
                console.log("Forked at block number:", forkingConfig.blockNumber);
            } else {
                console.log("Block number not specified, using the latest block.");
            }
        } else {
            console.log("This network is not forked.");
        }
    });

    it("Swap ETH to aBasWETH", async () => {
        const { user, nativeToken, receiverContract } = await setupTest();


        const aBasWETH = "0xd4a0e0b9149bcee3c920d2e00b5de09138fd8bb7"


        const ETHAmount = ethers.utils.parseEther("0.000001");
        const response = await createMetaAggregatorCalldata(receiverContract.address, user.address, nativeToken, aBasWETH, Number(ETHAmount))




        const aBasWETHContract = new ethers.Contract(aBasWETH, ERC20_ABI, ethers.provider);

        const aBaseWETHBalanceBefore = await aBasWETHContract.balanceOf(user.address);

        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ", { value: ETHAmount })

        const aBaseWETHBalanceAfter = await aBasWETHContract.balanceOf(user.address);

        expect(aBaseWETHBalanceAfter).to.be.greaterThan(aBaseWETHBalanceBefore)

        ;
    })

    it("Swap ETH to aBaseUSDC", async () => {
        const { metaAggregatorTestSwapContract, user, nativeToken, receiverContract } = await setupTest();


        const aBaseUSDC = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB"


        const ETHAmount = ethers.utils.parseEther("0.000001");
        const response = await createMetaAggregatorCalldata(receiverContract.address, user.address, nativeToken, aBaseUSDC, Number(ETHAmount))



        const aBaseUSDCContract = new ethers.Contract(aBaseUSDC, ERC20_ABI, ethers.provider);


        const aBaseWETHBalanceBefore = await aBaseUSDCContract.balanceOf(user.address);

        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ", { value: ETHAmount })

        const aBaseWETHBalanceAfter = await aBaseUSDCContract.balanceOf(user.address);

        expect(aBaseWETHBalanceAfter).to.be.greaterThan(aBaseWETHBalanceBefore)

        
    })

    it("Swap ETH to aBaswstETH", async () => {
        const { metaAggregatorTestSwapContract, user, nativeToken, receiverContract } = await setupTest();


        const aBaswstETH = "0x99CBC45ea5bb7eF3a5BC08FB1B7E56bB2442Ef0D"


        const ETHAmount = ethers.utils.parseEther("0.000001");
        const response = await createMetaAggregatorCalldata(receiverContract.address, user.address, nativeToken, aBaswstETH, Number(ETHAmount))



        const aBaswstETHContract = new ethers.Contract(aBaswstETH, ERC20_ABI, ethers.provider);


        const aBaswstETHBalanceBefore = await aBaswstETHContract.balanceOf(user.address);

        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ", { value: ETHAmount })

        const aBaswstETHBalanceAfter = await aBaswstETHContract.balanceOf(user.address);

        expect(aBaswstETHBalanceAfter).to.be.greaterThan(aBaswstETHBalanceBefore)
        
    })
    it("Swap ETH to usdc", async () => {
        const { metaAggregatorTestSwapContract, user, nativeToken, receiverContract } = await setupTest();


        const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"


        const ETHAmount = 2000000000000000;
        const response = await createMetaAggregatorCalldata(receiverContract.address, user.address, nativeToken, usdc, Number(ETHAmount))



        const usdcContract = new ethers.Contract(usdc, ERC20_ABI, ethers.provider);


        const usdcBalanceBefore = await usdcContract.balanceOf(user.address);

        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ", { value: ETHAmount })

        const usdcBalanceAfter = await usdcContract.balanceOf(user.address);

        expect(usdcBalanceAfter).to.be.greaterThan(usdcBalanceBefore)
        
    })

    it("Swap ETH to DAI", async () => {
        const { user, nativeToken, receiverContract } = await setupTest();


        const dai = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"


        const ETHAmount = 2000000000000000;
        const response = await createMetaAggregatorCalldata(receiverContract.address, user.address, nativeToken, dai, Number(ETHAmount))



        const daiContract = new ethers.Contract(dai, ERC20_ABI, ethers.provider);


        const daiBalanceBefore = await daiContract.balanceOf(user.address);

        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ", { value: ETHAmount })

        const daiBalanceAfter = await daiContract.balanceOf(user.address);

        expect(daiBalanceAfter).to.be.greaterThan(daiBalanceBefore)
        
    })



    it("Swap dai  to  usdc", async () => {
        const { user, nativeToken, receiverContract } = await setupTest();



        const dai = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"


        const ETHAmount = "100000000000000000";
        let response = await createMetaAggregatorCalldata(receiverContract.address, receiverContract.address, nativeToken, dai,ETHAmount)




        const daiContract = new ethers.Contract(dai, ERC20_ABI, ethers.provider);


        const daiBalanceBefore = await daiContract.balanceOf(receiverContract.address);

        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ", { value: ETHAmount })

        console.log("**********************************************************************************************************************************")
        console.log("*********************************************first swap complete********************************************************************")
        console.log("**********************************************************************************************************************************")


        const daiBalanceAfter = await daiContract.balanceOf(receiverContract.address);

        expect(daiBalanceAfter).to.be.greaterThan(daiBalanceBefore)


        const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"


        const usdcContract = new ethers.Contract(usdc, ERC20_ABI, ethers.provider);

        //32.358521172381315000



        const usdcBalanceBefore = await usdcContract.balanceOf(user.address);


        response = await createMetaAggregatorCalldata(receiverContract.address, user.address, dai, usdc, "32358521172381315000")


        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ")



        const usdcBalanceAfter = await usdcContract.balanceOf(user.address);

        expect(usdcBalanceAfter).to.be.greaterThan(usdcBalanceBefore)

        
    })



    it("Swap cbBTC to DAI", async () => {
        const { user, nativeToken, receiverContract } = await setupTest();



        const cbBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"


        const ETHAmount = "100000000000000000";
        let response = await createMetaAggregatorCalldata(receiverContract.address, receiverContract.address, nativeToken, cbBTC, ETHAmount)




        const cbBTCContract = new ethers.Contract(cbBTC, ERC20_ABI, ethers.provider);


        const cbBTCBalanceBefore = await cbBTCContract.balanceOf(receiverContract.address);

        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ", { value: ETHAmount })

        console.log("**********************************************************************************************************************************")
        console.log("*********************************************first swap complete********************************************************************")
        console.log("**********************************************************************************************************************************")


        const cbBTCBalanceAfter = await cbBTCContract.balanceOf(receiverContract.address);

        expect(cbBTCBalanceAfter).to.be.greaterThan(cbBTCBalanceBefore)


        const dai = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"


        const daiContract = new ethers.Contract(dai, ERC20_ABI, ethers.provider);



        const daiBalanceBefore = await daiContract.balanceOf(user.address);


        response = await createMetaAggregatorCalldata(receiverContract.address, user.address, cbBTC, dai, 178747)


        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ")



        const daiBalanceAfter = await daiContract.balanceOf(user.address);

        expect(daiBalanceAfter).to.be.greaterThan(daiBalanceBefore)
        
    })


    it("Swap WETH to DAI", async () => {
        const { user, nativeToken, receiverContract } = await setupTest();



        const weth = "0x4200000000000000000000000000000000000006"


        const ETHAmount = "100304170629935680";
        let response = await createMetaAggregatorCalldata(receiverContract.address, receiverContract.address, nativeToken, weth, Number(ETHAmount))




        const wethContract = new ethers.Contract(weth, ERC20_ABI, ethers.provider);


        const wethBalanceBefore = await wethContract.balanceOf(receiverContract.address);

        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ", { value: ETHAmount })

        console.log("**********************************************************************************************************************************")
        console.log("*********************************************first swap complete********************************************************************")
        console.log("**********************************************************************************************************************************")

        const wethBalanceAfter = await wethContract.balanceOf(receiverContract.address);

        expect(wethBalanceAfter).to.be.greaterThan(wethBalanceBefore)


        const dai = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"


        const daiContract = new ethers.Contract(dai, ERC20_ABI, ethers.provider);



        const daiBalanceBefore = await daiContract.balanceOf(user.address);


        response = await createMetaAggregatorCalldata(receiverContract.address, user.address, weth, dai, "100304170629935680")


        await receiverContract.connect(user).executeDelegate(response.quotes[0].to
            , response.quotes[0].data || " ")



        const daiBalanceAfter = await daiContract.balanceOf(user.address);

        expect(daiBalanceAfter).to.be.greaterThan(daiBalanceBefore)
        
    })
});