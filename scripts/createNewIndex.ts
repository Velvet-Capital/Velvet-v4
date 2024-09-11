// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat

import { isAddress } from "ethers/lib/utils";

import { AssetManagementConfig, Portfolio__factory } from "../../typechain";

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

  let position1: any;
  let position2: any;

  let positionWrapper: any;
  let positionWrapper2: any;
  /// @dev The minimum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**-128
  const MIN_TICK = -887220;
  /// @dev The maximum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**128
  const MAX_TICK = 887220;

  // Create new portfolio
  const PortfolioFactory = await ethers.getContractFactory("PortfolioFactory");
  // @todo add address here
  const portfolioFactory = await PortfolioFactory.attach("todo_put_address");
  const portfolioFactoryCreate =
    await portfolioFactory.createPortfolioNonCustodial({
      _name: "PORTFOLIOLY",
      _symbol: "IDX",
      _managementFee: "500",
      _performanceFee: "2500",
      _entryFee: "0",
      _exitFee: "0",
      _initialPortfolioAmount: "100000000000000000000",
      _minPortfolioTokenHoldingAmount: "10000000000000000",
      _assetManagerTreasury: treasury.address,
      _whitelistedTokens: [],
      _public: true,
      _transferable: true,
      _transferableToPublic: true,
      _whitelistTokens: false,
      _externalPositionManagementWhitelisted: true,
    });

  // Setup
  const portfolioAddress = await portfolioFactory.getPortfolioList(0);
  const portfolio = await ethers.getContractAt(
    Portfolio__factory.abi,
    portfolioAddress
  );

  const config = await portfolio.assetManagementConfig();
  const assetManagementConfig = AssetManagementConfig.attach(config);
  await assetManagementConfig.enableUniSwapV3Manager();

  let positionManagerAddress = await assetManagementConfig.positionManager();
  const PositionManager = await ethers.getContractFactory(
    "PositionManagerThena"
  );
  const positionManager = PositionManager.attach(positionManagerAddress);

  // Test cases here
  it("should create new position", async () => {
    // UniswapV3 position
    const token0 = iaddress.ethAddress;
    const token1 = iaddress.btcAddress;

    await positionManager.createNewWrapperPosition(
      token0,
      token1,
      "Test",
      "t",
      MIN_TICK,
      MAX_TICK
    );

    position1 = await positionManager.deployedPositionWrappers(0);

    const PositionWrapper = await ethers.getContractFactory("PositionWrapper");
    positionWrapper = PositionWrapper.attach(position1);
  });

  // Create new external position
  const token0 = iaddress.btcAddress;
  const token1 = iaddress.ethAddress;

  await positionManager.createNewWrapperPosition(
    token0,
    token1,
    "Test",
    "t",
    MIN_TICK,
    MAX_TICK
  );

  position2 = await positionManager.deployedPositionWrappers(1);

  const PositionWrapper = await ethers.getContractFactory("PositionWrapper");
  positionWrapper2 = PositionWrapper.attach(position2);

  // Create second externalposition

  await positionManager.createNewWrapperPosition(
    token0,
    token1,
    "Test",
    "t",
    MIN_TICK,
    MAX_TICK
  );

  position2 = await positionManager.deployedPositionWrappers(1);

  const PositionWrapper = await ethers.getContractFactory("PositionWrapper");
  positionWrapper2 = PositionWrapper.attach(position2);

  // Init portfolio
  await portfolio.initToken([
    iaddress.usdcAddress,
    position2,
    iaddress.dogeAddress,
    iaddress.btcAddress,
    position1,
  ]);

  positionWrappers = [position2, position1];
  swapTokens = [
    iaddress.usdcAddress,
    await positionWrapper2.token0(), // position2 - token0
    await positionWrapper2.token1(), // position2 - token1
    iaddress.dogeAddress,
    iaddress.btcAddress,
    await positionWrapper.token0(), // position1 - token0
    await positionWrapper.token1(), // position1 - token1
  ];
  positionWrapperIndex = [1, 4];
  portfolioTokenIndex = [0, 1, 1, 2, 3, 4, 4];
  isExternalPosition = [false, true, true, false, false, true, true];
  isTokenExternalPosition = [false, true, false, false, true];
  index0 = [1, 5];
  index1 = [2, 6];
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
