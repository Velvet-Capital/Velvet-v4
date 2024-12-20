// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers, upgrades, tenderly } = require("hardhat");
const { chainIdToAddresses } = require("../scripts/networkVariables");

async function main() {
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
    gasLimit: 35000000, // Adjust this value based on your contract's complexity
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
    0x38147794ff247e5fc179edbae6c37fff88f68c52
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

  console.log("tokenBalanceLibrary address:", tokenBalanceLibrary.address);

  const VenusAssetHandler = await ethers.getContractFactory(
    "VenusAssetHandler"
  );
  const venusAssetHandler = await VenusAssetHandler.deploy();
  await venusAssetHandler.deployed();

  console.log("venusAssetHandler address:", venusAssetHandler.address);

  const PositionWrapper = await ethers.getContractFactory("PositionWrapper");
  const positionWrapperBaseAddress = await PositionWrapper.deploy(overrides);
  await positionWrapperBaseAddress.deployed();

  console.log("PositionWrapper address:", positionWrapperBaseAddress.address);

  await tenderly.verify({
    name: "PositionWrapper",
    address: positionWrapperBaseAddress.address,
  });

  const ProtocolConfig = await ethers.getContractFactory("ProtocolConfig");
  const protocolConfig = await upgrades.deployProxy(
    ProtocolConfig,
    [treasury.address, priceOracle.address, positionWrapperBaseAddress.address],
    { kind: "uups" }
  );

  await tenderly.verify({
    name: "ProtocolConfig",
    address: protocolConfig.address,
  });

  await protocolConfig.enableTokens([
    addresses.WETH_Address,
    addresses.USDC_Address,
    addresses.DAI_Address,
  ]);

  await protocolConfig.updateProtocolFee(0);
  await protocolConfig.updateProtocolStreamingFee(0);

  console.log("protocolConfig address:", protocolConfig.address);

  await protocolConfig.setCoolDownPeriod("60");

  await protocolConfig.enableSolverHandler(ensoHandler.address);

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

  const Rebalancing = await ethers.getContractFactory("Rebalancing", {
    libraries: {
      TokenBalanceLibrary: tokenBalanceLibrary.address,
    },
  });
  const rebalancingDefault = await Rebalancing.deploy(overrides);

  console.log("rebalancingDefult address:", rebalancingDefault.address);

  await tenderly.verify({
    name: "Rebalancing",
    address: rebalancingDefault.address,
  });

  const PositionManager = await ethers.getContractFactory(
    "PositionManagerAlgebra"
  );
  const positionManagerBaseAddress = await PositionManager.deploy(overrides);
  await positionManagerBaseAddress.deployed(overrides);

  console.log("PositionManager address:", positionManagerBaseAddress.address);

  await tenderly.verify({
    name: "PositionManagerAlgebra",
    address: positionManagerBaseAddress.address,
  });

  const AssetManagementConfig = await ethers.getContractFactory(
    "AssetManagementConfig"
  );
  const assetManagementConfig = await AssetManagementConfig.deploy();

  console.log("assetManagerConfig address:", assetManagementConfig.address);

  await tenderly.verify({
    name: "AssetManagementConfig",
    address: assetManagementConfig.address,
  });

  const Portfolio = await ethers.getContractFactory("Portfolio", {
    libraries: {
      TokenBalanceLibrary: tokenBalanceLibrary.address,
    },
  });
  const portfolioContract = await Portfolio.deploy(overrides);

  console.log("portfolioContract address:", portfolioContract.address);

  await tenderly.verify({
    name: "Portfolio",
    address: portfolioContract.address,
  });

  const FeeModule = await ethers.getContractFactory("FeeModule");
  const feeModule = await FeeModule.deploy();

  console.log("feeModule address:", feeModule.address);

  await tenderly.verify({
    name: "FeeModule",
    address: feeModule.address,
  });

  const VelvetSafeModule = await ethers.getContractFactory("VelvetSafeModule");
  const velvetSafeModule = await VelvetSafeModule.deploy();

  console.log("velvetSafeModule address:", velvetSafeModule.address);

  await tenderly.verify({
    name: "VelvetSafeModule",
    address: velvetSafeModule.address,
  });

  const TokenExclusionManager = await ethers.getContractFactory(
    "TokenExclusionManager"
  );
  const tokenExclusionManager = await TokenExclusionManager.deploy(overrides);

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

  const BorrowManager = await ethers.getContractFactory("BorrowManager");
  const borrowManager = await BorrowManager.deploy();
  await borrowManager.deployed();

  console.log("borrowManager address:", borrowManager.address);

  await tenderly.verify({
    name: "BorrowManager",
    address: borrowManager.address,
  });

  const DepositBatch = await ethers.getContractFactory(
    "DepositBatchExternalPositions"
  );
  const depositBatch = await DepositBatch.deploy(
    0x38147794ff247e5fc179edbae6c37fff88f68c52
  );

  console.log("depositBatch address:", depositBatch.address);

  await tenderly.verify({
    name: "DepositBatchExternalPositions",
    address: depositBatch.address,
  });

  const DepositManager = await ethers.getContractFactory(
    "DepositManagerExternalPositions"
  );
  const depositManager = await DepositManager.deploy(depositBatch.address);

  console.log("depositManager address:", depositManager.address);

  await tenderly.verify({
    name: "DepositManagerExternalPositions",
    address: depositManager.address,
  });

  const WithdrawBatch = await ethers.getContractFactory(
    "WithdrawBatchExternalPositions"
  );
  const withdrawBatch = await WithdrawBatch.deploy(
    0x38147794ff247e5fc179edbae6c37fff88f68c52
  );

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

  console.log("portfolioCalculations address:", portfolioCalculations.address);

  await tenderly.verify({
    name: "PortfolioCalculations",
    address: portfolioCalculations.address,
  });

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
        _basePositionManager: positionManagerBaseAddress.address,
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

  const WithdrawManager = await ethers.getContractFactory(
    "WithdrawManagerExternalPositions"
  );
  const withdrawManager = await WithdrawManager.deploy();

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
