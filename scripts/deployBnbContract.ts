// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers, upgrades, tenderly } = require("hardhat");
import { chainIdToAddresses } from "../scripts/networkVariables";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  let owner;
  let treasury;
  let accounts = await ethers.getSigners();
  [owner, treasury] = accounts;

  const chainId: any = process.env.CHAIN_ID;
  const addresses = chainIdToAddresses[chainId];

  // Set maximum gas fee (in Gwei)
  const MAX_GAS_FEE_GWEI = 10; // Adjust this value as needed

  // Get the current base fee
  const feeData = await ethers.provider.getFeeData();
  const baseFee = feeData.lastBaseFeePerGas;

  // Calculate priority fee (tip)
  const priorityFee = ethers.utils.parseUnits("1.5", "gwei");

  // Ensure the priority fee is at least 1 Gwei
  const minPriorityFee = ethers.utils.parseUnits("1", "gwei");
  const adjustedPriorityFee = priorityFee.lt(minPriorityFee)
    ? minPriorityFee
    : priorityFee;

  // Calculate max fee per gas, but cap it at MAX_GAS_FEE_GWEI
  const calculatedMaxFee = baseFee.mul(2).add(adjustedPriorityFee);
  const maxFeePerGas = calculatedMaxFee.gt(
    ethers.utils.parseUnits(MAX_GAS_FEE_GWEI.toString(), "gwei")
  )
    ? ethers.utils.parseUnits(MAX_GAS_FEE_GWEI.toString(), "gwei")
    : calculatedMaxFee;

  // Use this for deployment transactions
  const overrides = {
    maxFeePerGas: maxFeePerGas,
    maxPriorityFeePerGas: adjustedPriorityFee,
    gasLimit: 29000000, // Adjust this value based on your contract's complexity
  };

  console.log("Base fee:", ethers.utils.formatUnits(baseFee, "gwei"), "Gwei");
  console.log(
    "Max fee per gas:",
    ethers.utils.formatUnits(maxFeePerGas, "gwei"),
    "Gwei"
  );
  console.log(
    "Priority fee:",
    ethers.utils.formatUnits(adjustedPriorityFee, "gwei"),
    "Gwei"
  );

  console.log("--------------- Contract Deployment Started ---------------");

  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy(addresses.WETH_Address);
  await priceOracle.deployed();

  console.log("priceOracle address:", priceOracle.address);

  await priceOracle.setFeeds(
    [addresses.WETH_Address, addresses.USDC_Address, addresses.DAI_Address],
    [
      "0x0000000000000000000000000000000000000348",
      "0x0000000000000000000000000000000000000348",
      "0x0000000000000000000000000000000000000348",
    ],
    [
      "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE", //chainlink price feed
      "0x51597f405303C4377E36123cBc172b13269EA163",
      "0x132d3C0B1D2cEa0BC552588063bdBb210FDeecfA",
    ]
  );

  await tenderly.verify({
    name: "PriceOracle",
    address: priceOracle.address,
  });

  const EnsoHandler = await ethers.getContractFactory("EnsoHandler");
  const ensoHandler = await EnsoHandler.deploy(
    "0x7663fd40081dcCd47805c00e613B6beAc3B87F08"
  );
  await ensoHandler.deployed();

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

  console.log("tokenBalanceLibrary address:", tokenBalanceLibrary.address);

  await tenderly.verify({
    name: "TokenBalanceLibrary",
    address: tokenBalanceLibrary.address,
  });

  await sleep(2000); // 2 seconds

  const SwapVerificationLibrary = await ethers.getContractFactory(
    "SwapVerificationLibraryAlgebra"
  );
  const swapVerificationLibrary = await SwapVerificationLibrary.deploy();
  await swapVerificationLibrary.deployed();

  console.log(
    "swapVerificationLibrary address:",
    swapVerificationLibrary.address
  );

  await tenderly.verify({
    name: "SwapVerificationLibraryAlgebra",
    address: swapVerificationLibrary.address,
  });

  const VenusAssetHandler = await ethers.getContractFactory(
    "VenusAssetHandler"
  );
  const venusAssetHandler = await VenusAssetHandler.deploy(
    addresses.vBNB_Address,
    addresses.WETH_Address
  );
  await venusAssetHandler.deployed();

  console.log("venusAssetHandler address:", venusAssetHandler.address);

  await tenderly.verify({
    name: "VenusAssetHandler",
    address: venusAssetHandler.address,
  });

  await sleep(2000); // 2 seconds

  const PositionWrapper = await ethers.getContractFactory("PositionWrapper");
  const positionWrapperBaseAddress = await PositionWrapper.deploy(overrides);
  await positionWrapperBaseAddress.deployed();

  console.log("PositionWrapper address:", positionWrapperBaseAddress.address);

  await tenderly.verify({
    name: "PositionWrapper",
    address: positionWrapperBaseAddress.address,
  });

  const PancakeSwapHandler = await ethers.getContractFactory(
    "UniswapV2Handler"
  );
  const swapHandler = await PancakeSwapHandler.deploy();
  await swapHandler.deployed();

  console.log("swapHandler address:", swapHandler.address);

  await tenderly.verify({
    name: "UniswapV2Handler",
    address: swapHandler.address,
  });

  swapHandler.init(addresses.PancakeSwapRouterAddress);

  await sleep(2000); // 2 seconds
  const ProtocolConfig = await ethers.getContractFactory("ProtocolConfig");
  const protocolConfig = await upgrades.deployProxy(
    ProtocolConfig,
    [treasury.address, priceOracle.address],
    { kind: "uups" }
  );

  console.log("protocolConfig address:", protocolConfig.address);

  await tenderly.verify({
    name: "ProtocolConfig",
    address: protocolConfig.address,
  });

  const thenaProtocolHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("THENA-CONCENTRATED-LIQUIDITY")
  );

  await sleep(2000); // 2 seconds

  await protocolConfig.enableTokens([
    addresses.WETH_Address,
    addresses.USDC_Address,
    addresses.DAI_Address,
  ]);

  await protocolConfig.updateProtocolFee(0);
  await protocolConfig.updateProtocolStreamingFee(0);

  await protocolConfig.setCoolDownPeriod("60");

  await protocolConfig.enableSolverHandler(ensoHandler.address);

  await protocolConfig.enableSwapHandler(swapHandler.address);

  await protocolConfig.setAssetHandlers(
    [
      addresses.vBNB_Address,
      addresses.vBTC_Address,
      addresses.vDAI_Address,
      addresses.vUSDT_Address,
      addresses.corePool_controller,
    ],
    [
      venusAssetHandler.address,
      venusAssetHandler.address,
      venusAssetHandler.address,
      venusAssetHandler.address,
      venusAssetHandler.address,
    ]
  );

  await protocolConfig.setSupportedControllers([addresses.corePool_controller]);

  await protocolConfig.setSupportedFactory(addresses.thena_factory);

  await protocolConfig.setAssetAndMarketControllers(
    [
      addresses.vBNB_Address,
      addresses.vBTC_Address,
      addresses.vDAI_Address,
      addresses.vUSDT_Address,
    ],
    [
      addresses.corePool_controller,
      addresses.corePool_controller,
      addresses.corePool_controller,
      addresses.corePool_controller,
    ]
  );

  await sleep(2000); // 2 seconds

  const Rebalancing = await ethers.getContractFactory("Rebalancing");
  const rebalancingDefault = await Rebalancing.deploy(overrides);
  await rebalancingDefault.deployed();

  console.log("rebalancingDefult address:", rebalancingDefault.address);

  await tenderly.verify({
    name: "Rebalancing",
    address: rebalancingDefault.address,
  });

  const PositionManager = await ethers.getContractFactory(
    "PositionManagerAlgebra",
    {
      libraries: {
        SwapVerificationLibraryAlgebra: swapVerificationLibrary.address,
      },
    }
  );
  const positionManagerBaseAddress = await PositionManager.deploy(overrides);
  await positionManagerBaseAddress.deployed(overrides);

  await protocolConfig.enableProtocol(
    thenaProtocolHash,
    "0xa51adb08cbe6ae398046a23bec013979816b77ab",
    "0x327dd3208f0bcf590a66110acb6e5e6941a4efa0",
    positionManagerBaseAddress.address
  );

  console.log("PositionManager address:", positionManagerBaseAddress.address);

  await tenderly.verify({
    name: "PositionManagerAlgebra",
    address: positionManagerBaseAddress.address,
  });

  const ExternalPositionStorage = await ethers.getContractFactory(
    "ExternalPositionStorage"
  );
  const externalPositionStorage = await ExternalPositionStorage.deploy();
  await externalPositionStorage.deployed();

  console.log(
    "externalPositionStorage address:",
    externalPositionStorage.address
  );

  await tenderly.verify({
    name: "ExternalPositionStorage",
    address: externalPositionStorage.address,
  });

  await sleep(2000); // 2 seconds

  const AmountCalculationsAlgebra = await ethers.getContractFactory(
    "AmountCalculationsAlgebra"
  );
  const amountCalculationsAlgebra = await AmountCalculationsAlgebra.deploy();
  await amountCalculationsAlgebra.deployed();

  console.log(
    "amountCalculationsAlgebra address:",
    amountCalculationsAlgebra.address
  );

  await tenderly.verify({
    name: "AmountCalculationsAlgebra",
    address: amountCalculationsAlgebra.address,
  });

  const AssetManagementConfig = await ethers.getContractFactory(
    "AssetManagementConfig"
  );
  const assetManagementConfig = await AssetManagementConfig.deploy();
  await assetManagementConfig.deployed();

  console.log("assetManagerConfig address:", assetManagementConfig.address);

  await tenderly.verify({
    name: "AssetManagementConfig",
    address: assetManagementConfig.address,
  });

  await sleep(2000); // 2 seconds

  const Portfolio = await ethers.getContractFactory("Portfolio", {
    libraries: {
      TokenBalanceLibrary: tokenBalanceLibrary.address,
    },
  });
  const portfolioContract = await Portfolio.deploy(overrides);
  await portfolioContract.deployed();

  console.log("portfolioContract address:", portfolioContract.address);

  await tenderly.verify({
    name: "Portfolio",
    address: portfolioContract.address,
  });

  const FeeModule = await ethers.getContractFactory("FeeModule");
  const feeModule = await FeeModule.deploy();

  await feeModule.deployed();

  console.log("feeModule address:", feeModule.address);

  await tenderly.verify({
    name: "FeeModule",
    address: feeModule.address,
  });

  const VelvetSafeModule = await ethers.getContractFactory("VelvetSafeModule");
  const velvetSafeModule = await VelvetSafeModule.deploy();
  await velvetSafeModule.deployed();

  console.log("velvetSafeModule address:", velvetSafeModule.address);

  await tenderly.verify({
    name: "VelvetSafeModule",
    address: velvetSafeModule.address,
  });

  await sleep(2000); // 2 seconds

  const TokenExclusionManager = await ethers.getContractFactory(
    "TokenExclusionManager"
  );
  const tokenExclusionManager = await TokenExclusionManager.deploy(overrides);
  await tokenExclusionManager.deployed();

  console.log("tokenExclusionManager address:", tokenExclusionManager.address);

  await tenderly.verify({
    name: "TokenExclusionManager",
    address: tokenExclusionManager.address,
  });

  const TokenRemovalVault = await ethers.getContractFactory(
    "TokenRemovalVault"
  );
  const tokenRemovalVault = await TokenRemovalVault.deploy();
  await tokenRemovalVault.deployed();

  console.log("tokenRemovalVault address:", tokenRemovalVault.address);

  await tenderly.verify({
    name: "TokenRemovalVault",
    address: tokenRemovalVault.address,
  });

  const BorrowManager = await ethers.getContractFactory("BorrowManagerVenus");
  const borrowManager = await BorrowManager.deploy();
  await borrowManager.deployed();

  console.log("borrowManagerVenus address:", borrowManager.address);

  await tenderly.verify({
    name: "BorrowManagerVenus",
    address: borrowManager.address,
  });

  await sleep(2000); // 2 seconds

  const DepositBatch = await ethers.getContractFactory(
    "DepositBatchExternalPositions"
  );
  const depositBatch = await DepositBatch.deploy(
    "0x7663fd40081dcCd47805c00e613B6beAc3B87F08"
  );
  await depositBatch.deployed();

  console.log("depositBatch address:", depositBatch.address);

  await tenderly.verify({
    name: "DepositBatchExternalPositions",
    address: depositBatch.address,
  });

  const DepositManager = await ethers.getContractFactory(
    "DepositManagerExternalPositions"
  );
  const depositManager = await DepositManager.deploy(depositBatch.address);
  await depositManager.deployed();

  console.log("depositManager address:", depositManager.address);

  await tenderly.verify({
    name: "DepositManagerExternalPositions",
    address: depositManager.address,
  });

  await sleep(2000); // 2 seconds

  const WithdrawBatch = await ethers.getContractFactory(
    "WithdrawBatchExternalPositions"
  );
  const withdrawBatch = await WithdrawBatch.deploy(
    "0x7663fd40081dcCd47805c00e613B6beAc3B87F08"
  );
  await withdrawBatch.deployed();

  console.log("withdrawBatch address:", withdrawBatch.address);

  await tenderly.verify({
    name: "WithdrawBatchExternalPositions",
    address: withdrawBatch.address,
  });

  const PortfolioCalculations = await ethers.getContractFactory(
    "PortfolioCalculations",
    {
      libraries: {
        TokenBalanceLibrary: tokenBalanceLibrary.address,
      },
    }
  );
  const portfolioCalculations = await PortfolioCalculations.deploy(overrides);
  await portfolioCalculations.deployed();

  console.log("portfolioCalculations address:", portfolioCalculations.address);

  await tenderly.verify({
    name: "PortfolioCalculations",
    address: portfolioCalculations.address,
  });

  await sleep(2000); // 2 seconds

  console.log(
    "------------------------------ Deployment Ended ------------------------------"
  );

  const PortfolioFactory = await ethers.getContractFactory("PortfolioFactory");

  const portfolioFactoryInstance = await upgrades.deployProxy(
    PortfolioFactory,
    [
      {
        _basePortfolioAddress: portfolioContract.address,
        _baseTokenExclusionManagerAddress: tokenExclusionManager.address,
        _baseRebalancingAddres: rebalancingDefault.address,
        _baseAssetManagementConfigAddress: assetManagementConfig.address,
        _feeModuleImplementationAddress: feeModule.address,
        _baseTokenRemovalVaultImplementation: tokenRemovalVault.address,
        _baseVelvetGnosisSafeModuleAddress: velvetSafeModule.address,
        _baseBorrowManager: borrowManager.address,
        _basePositionWrapper: positionWrapperBaseAddress.address,
        _baseExternalPositionStorage: externalPositionStorage.address,
        _gnosisSingleton: addresses.gnosisSingleton,
        _gnosisFallbackLibrary: addresses.gnosisFallbackLibrary,
        _gnosisMultisendLibrary: addresses.gnosisMultisendLibrary,
        _gnosisSafeProxyFactory: addresses.gnosisSafeProxyFactory,
        _protocolConfig: protocolConfig.address,
      },
    ],
    { kind: "uups" },
    overrides
  );

  const portfolioFactory = PortfolioFactory.attach(
    portfolioFactoryInstance.address
  );

  console.log("portfolioFactory address:", portfolioFactory.address);

  await sleep(2000); // 2 seconds

  const WithdrawManager = await ethers.getContractFactory(
    "WithdrawManagerExternalPositions"
  );
  const withdrawManager = await WithdrawManager.deploy();
  await withdrawManager.deployed();

  console.log("withdrawManager address:", withdrawManager.address);

  await tenderly.verify({
    name: "WithdrawManagerExternalPositions",
    address: withdrawManager.address,
  });

  await withdrawManager.initialize(
    withdrawBatch.address,
    portfolioFactory.address
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
