import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-ethers";
import "@typechain/hardhat";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-contract-sizer";
import "solidity-coverage";
import "hardhat-tracer";
import "@nomicfoundation/hardhat-chai-matchers";

import "hardhat-gas-reporter";
import "hardhat-abi-exporter";
require("dotenv").config();

import { HardhatUserConfig } from "hardhat/types";
import { chainIdToAddresses } from "./scripts/networkVariables";

import * as tdly from "@tenderly/hardhat-tenderly";

tdly.setup({ automaticVerifications: false });

const mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
  throw new Error("Please set your MNEMONIC in a .env file");
}

const infuraApiKey = process.env.INFURA_API_KEY;
const privateKey = process.env.PRIVATE_KEY;
const forkChainId: any = process.env.FORK_CHAINID;

if (!infuraApiKey) {
  throw new Error("Please set your INFURA_API_KEY in a .env file");
}

interface ForkingConfigurations {
  [network: string]: string | undefined;
}

const forkingConfigs: ForkingConfigurations = {
  42161: process.env.ARB_RPC,
  56: process.env.BSC_RPC,
  8453: process.env.BASE_RPC,
};

const forkNetwork = process.env.CHAIN_ID;
const forkingUrl = forkingConfigs[forkNetwork || ""];

const chainIds = {
  ganache: 5777,
  goerli: 5,
  hardhat: 7545,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  bscTestnet: 97,
  bscMainnet: 56,
  MaticTestnet: 80001,
  MaticMainnet: 137,
  ropsten: 3,
  ArbitrumOne: 42161,
  BaseMainnet: 8453,
};

const config: HardhatUserConfig = {
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 21,
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic,
      },
      forking: {
        // eslint-disable-next-line
        enabled: true,
        url: forkingUrl ? forkingUrl : "",
      },
      chainId: Number(forkNetwork),
    },
    ganache: {
      chainId: 5777,
      url: "http://127.0.0.1:7545/",
    },

    mainnet: {
      accounts: {
        count: 10,
        mnemonic,
        path: "m/44'/60'/0'/0",
      },
      chainId: chainIds["mainnet"],
      url: "https://mainnet.infura.io/v3/" + infuraApiKey + "",
    },
    rinkeby: {
      accounts: {
        mnemonic,
        // path: "m/44'/60'/0'/0",
      },
      chainId: chainIds["rinkeby"],
      url: "https://rinkeby.infura.io/v3/" + infuraApiKey + "",
    },
    bscTestnet: {
      accounts: {
        mnemonic,
        // path: "m/44'/60'/0'/0",
      },
      chainId: chainIds["bscTestnet"],
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
    },
    bscMainnet: {
      accounts: {
        mnemonic,
        // path: "m/44'/60'/0'/0",
      },
      chainId: chainIds["bscMainnet"],
      url: "https://bsc-dataseed.binance.org/",
    },
    MaticTestnet: {
      accounts: {
        mnemonic,
        // path: "m/44'/60'/0'/0",
      },
      // chainId: chainIds["MaticTestnet"],
      chainId: 80001,
      allowUnlimitedContractSize: true,
      url:
        "https://speedy-nodes-nyc.moralis.io/" +
        infuraApiKey +
        "/polygon/mumbai",
    },
    MaticMainnet: {
      accounts: {
        mnemonic,
        // path: "m/44'/60'/0'/0",
      },
      chainId: chainIds["MaticMainnet"],
      allowUnlimitedContractSize: true,
      url: "https://rpc-mainnet.maticvigil.com/",
    },
    ArbitrumOne: {
      accounts: {
        mnemonic,
      },
      chainId: chainIds["ArbitrumOne"],
      allowUnlimitedContractSize: true,
      url: "https://arbitrum-one.publicnode.com",
    },
    BaseMainnet: {
      accounts: {
        mnemonic,
      },
      chainId: chainIds["BaseMainnet"],
      allowUnlimitedContractSize: true,
      url: "https://1rpc.io/base",
    },
    TenderlyArbitrum: {
      accounts: {
        mnemonic,
      },
      chainId: chainIds["ArbitrumOne"],
      allowUnlimitedContractSize: true,
      url: "https://rpc.vnet.tenderly.co/devnet/arbitrum-velvet-v2/cd36114b-0a3a-4be4-8e34-8423cdd151ab",
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  mocha: {
    timeout: 400000,
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY
        ? process.env.ETHERSCAN_API_KEY
        : "",
      bsc: process.env.BSCSCAN_API_KEY ? process.env.BSCSCAN_API_KEY : "",
    },
  },
  abiExporter: {
    path: "./abi",
    clear: true,
    flat: true,
    only: [
      "Portfolio",
      "PortfolioFactory",
      "Rebalancing",
      "AssetManagementConfig",
      "ProtocolConfig",
      "TokenExclusionManager",
      "VelvetSafeModule",
      "PriceOracle",
      "PriceOracleL2",
      "FeeModule",
      "DepositBatch",
      "WithdrawBatch",
    ],
    spacing: 2,
  },
  tenderly: {
    project: "v4-bnb-test",
    username: "velvet-capital",
    privateVerification: true,
  },
};

module.exports = config;
