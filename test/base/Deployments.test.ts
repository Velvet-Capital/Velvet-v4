import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { chainIdToAddresses } from "../../scripts/networkVariables";
import {
  IERC20Upgradeable__factory,
  ProtocolConfig,
  Rebalancing,
  AccessController,
  AssetManagementConfig,
  FeeModule,
  PriceOracle,
} from "../../typechain";

let protocolConfig: ProtocolConfig;
let accessController: AccessController;
let priceOracle: PriceOracle;
let owner: SignerWithAddress;
let treasury: SignerWithAddress;
let wbnbAddress: string;
let busdAddress: string;
let daiAddress: string;
let dogeAddress: string;
let linkAddress: string;
let cakeAddress: string;
let usdtAddress: string;
let accounts;
let wethAddress: string;
let btcAddress: string;
let arbAddress: string;
const forkChainId: any = process.env.FORK_CHAINID;
const chainId: any = forkChainId ? forkChainId : 8453;
const addresses = chainIdToAddresses[chainId];
const assetManagerHash = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("ASSET_MANAGER")
);

before(async () => {
  accounts = await ethers.getSigners();
  [owner, treasury] = accounts;

  const AccessController = await ethers.getContractFactory("AccessController");
  accessController = await AccessController.deploy();
  await accessController.deployed();

  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  priceOracle = await PriceOracle.deploy(addresses.WETH);
  await priceOracle.deployed();

  await priceOracle.setFeeds(
    [
      "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      addresses.DAI,
      addresses.USDC,
    ],
    [
      "0x0000000000000000000000000000000000000348",
      "0x0000000000000000000000000000000000000348",
      "0x0000000000000000000000000000000000000348",
    ],
    [
      "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
      "0x591e79239a7d679378eC8c847e5038150364C78F",
      "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
    ]
  );
});

export async function RebalancingDeploy(
  portfolioAddress: string,
  tokenRegistryAddress: string,
  exchangeAddress: string,
  accessController: AccessController,
  ownerAddress: string,
  assetManagementConfig: AssetManagementConfig,
  feeModule: FeeModule
): Promise<Rebalancing> {
  let rebalancing: Rebalancing;

  const res = await accessController.hasRole(
    "0x0000000000000000000000000000000000000000000000000000000000000000",
    ownerAddress
  );
  // Grant Portfolio portfolio manager role
  await accessController
    .connect(owner)
    .grantRole(
      "0x1916b456004f332cd8a19679364ef4be668619658be72c17b7e86697c4ae0f16",
      portfolioAddress
    );

  const Rebalancing = await ethers.getContractFactory("Rebalancing", {});
  rebalancing = await Rebalancing.deploy();
  await rebalancing.deployed();
  rebalancing.init(portfolioAddress, accessController.address);

  // Grant owner asset manager admin role
  await accessController.grantRole(
    "0x15900ee5215ef76a9f5d2b8a5ec2fe469c362cbf4d7bef6646ab417b6d169e88",
    owner.address
  );

  // Grant owner asset manager role
  await accessController.grantRole(assetManagerHash, owner.address);

  // Grant rebalancing portfolio manager role
  await accessController.grantRole(
    "0x1916b456004f332cd8a19679364ef4be668619658be72c17b7e86697c4ae0f16",
    rebalancing.address
  );

  // Grant owner super admin
  await accessController.grantRole(
    "0xd980155b32cf66e6af51e0972d64b9d5efe0e6f237dfaa4bdc83f990dd79e9c8",
    owner.address
  );

  // Granting owner portfolio manager role to swap eth to token
  await accessController.grantRole(
    "0x1916b456004f332cd8a19679364ef4be668619658be72c17b7e86697c4ae0f16",
    owner.address
  );

  await accessController.grantRole(
    "0x516339d85ab12e7c2454a5a806ee27e82ad851d244092d49dc944d35f3f89061",
    exchangeAddress
  );

  //Grant rebalancing rebalancer contract role
  await accessController.grantRole(
    "0x8e73530dd444215065cdf478f826e993aeb5e2798587f0bbf5a978bd97df63ea",
    rebalancing.address
  );

  // grant fee module role for minting
  await accessController.grantRole(
    "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6",
    feeModule.address
  );

  return rebalancing;
}

export { protocolConfig, accessController, priceOracle };
