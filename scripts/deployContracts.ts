// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat

import { isAddress } from "ethers/lib/utils";

// Runtime Environment's members available in the global scope.
const { ethers, upgrades, tenderly } = require("hardhat");
const { chainIdToAddresses } = require("../scripts/networkVariables");

async function main() {
  let owner;
  let treasury;
  let accounts = await ethers.getSigners();
  [owner, treasury] = accounts;

  const forkChainId: any = process.env.CHAIN_ID;
  const chainId: any = forkChainId ? forkChainId : 56;
  const addresses = chainIdToAddresses[chainId];

  console.log("--------------- Contract Deployment Started ---------------");

  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.attach(
    "0x62228b60fa883E23A8F85e6F5362be51c4C0a359"
  );

  const EnsoHandler = await ethers.getContractFactory("EnsoHandler");
  const ensoHandler = await EnsoHandler.attach(
    "0x854554ce1db7615887cC91b19a7AF633e469c282"
  );

  console.log("ensoHandler address:", ensoHandler.address);

  await tenderly.verify({
    name: "EnsoHandler",
    address: ensoHandler.address,
  });

  const TokenBalanceLibrary = await ethers.getContractFactory(
    "TokenBalanceLibrary"
  );
  const tokenBalanceLibrary = await TokenBalanceLibrary.deploy();
  await tokenBalanceLibrary.deployed();

  const PositionWrapper = await ethers.getContractFactory("PositionWrapper");
  const positionWrapperBase = await PositionWrapper.deploy();
  await positionWrapperBase.deployed();

  const ProtocolConfig = await ethers.getContractFactory("ProtocolConfig");
  const protocolConfig = ProtocolConfig.attach(
    "0x6CD9E1FfC17ef0F68f370b8B1E7A33b34970d359"
  );

  console.log("protocolConfig address:", protocolConfig.address);

  await protocolConfig.setCoolDownPeriod("60");

  await protocolConfig.enableSolverHandler(ensoHandler.address);

  const Rebalancing = await ethers.getContractFactory("Rebalancing", {
    libraries: {
      TokenBalanceLibrary: tokenBalanceLibrary.address,
    },
  });
  const rebalancingDefault = await Rebalancing.attach(
    "0xEBfB0fd819A2818177869Aa744965020e3FDCF21"
  );

  const AssetManagementConfig = await ethers.getContractFactory(
    "AssetManagementConfig"
  );
  const assetManagementConfig = await AssetManagementConfig.attach(
    "0x242984CD61a0b43983E6D3394F926dcD2B8C9109"
  );

  const Portfolio = await ethers.getContractFactory("Portfolio", {
    libraries: {
      TokenBalanceLibrary: tokenBalanceLibrary.address,
    },
  });
  const portfolioContract = await Portfolio.attach(
    "0x017E7c4E727a6f705d869Fb571FC991e0D74aa87"
  );

  const FeeModule = await ethers.getContractFactory("FeeModule");
  const feeModule = await FeeModule.attach(
    "0xA15B283C2A5a75A41a8F06288B9D65CA012dae47"
  );

  const VelvetSafeModule = await ethers.getContractFactory("VelvetSafeModule");
  const velvetSafeModule = await VelvetSafeModule.attach(
    "0xc3019e341c06bb4d53d788274847985496b93fda"
  );

  await tenderly.verify({
    name: "VelvetSafeModule",
    address: velvetSafeModule.address,
  });

  const TokenExclusionManager = await ethers.getContractFactory(
    "TokenExclusionManager"
  );
  const tokenExclusionManager = await TokenExclusionManager.attach(
    "0x07f22b9Bc6C0Ad1CAaCd039CC1775c146599111f"
  );

  const TokenRemovalVault = await ethers.getContractFactory(
    "TokenRemovalVault"
  );
  const tokenRemovalVault = await TokenRemovalVault.deploy();
  await tokenRemovalVault.attach("0x6fC0a5547821D93ab015266026D1e0b219303b7C");

  const BorrowManager = await ethers.getContractFactory("BorrowManager");
  const borrowManager = await BorrowManager.attach(
    "0xd2a680c5366fFDAF08b6F12a57fa0a7a27692f18"
  );

  const PositionManagerThena = await ethers.getContractFactory(
    "PositionManagerThena"
  );
  const positionManagerThena = await PositionManagerThena.attach(
    "0x0c7bFE92E28525B40Ae567F3A50b80132F984fe9"
  );

  console.log(
    "------------------------------ Deployment Ended ------------------------------"
  );

  const PortfolioFactory = await ethers.getContractFactory("PortfolioFactory");

  const portfolioFactoryInstance = await upgrades.deployProxy(
    PortfolioFactory,
    [
      {
        _outAsset: addresses.WETH,
        _basePortfolioAddress: portfolioContract.address,
        _baseTokenExclusionManagerAddress: tokenExclusionManager.address,
        _baseRebalancingAddres: rebalancingDefault.address,
        _baseAssetManagementConfigAddress: assetManagementConfig.address,
        _feeModuleImplementationAddress: feeModule.address,
        _baseTokenRemovalVaultImplementation: tokenRemovalVault.address,
        _baseVelvetGnosisSafeModuleAddress: velvetSafeModule.address,
        _baseBorrowManager: borrowManager.address,
        _basePositionManager: positionManagerThena.address,
        _gnosisSingleton: addresses.gnosisSingleton,
        _gnosisFallbackLibrary: addresses.gnosisFallbackLibrary,
        _gnosisMultisendLibrary: addresses.gnosisMultisendLibrary,
        _gnosisSafeProxyFactory: addresses.gnosisSafeProxyFactory,
        _protocolConfig: protocolConfig.address,
      },
    ],
    { kind: "uups" }
  );

  const portfolioFactory = PortfolioFactory.attach(
    portfolioFactoryInstance.address
  );

  console.log("portfolioFactory address:", portfolioFactory.address);

  /*const WithdrawManager = await ethers.getContractFactory(
    "WithdrawManagerExternalPositions"
  );
  const withdrawManager = await WithdrawManager.deploy();

  console.log("withdrawManager address:", withdrawManager.address);

  await tenderly.verify({
    name: "WithdrawManager",
    address: withdrawManager.address,
  });

  await withdrawManager.initialize(
    withdrawBatch.address,
    portfolioFactory.address
  );*/
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
