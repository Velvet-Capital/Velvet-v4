// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { Script } from "forge-std/Script.sol";
import { PortfolioFactory } from "../../../contracts/PortfolioFactory.sol";
import { IPortfolioFactory } from "../../../contracts/core/interfaces/IPortfolioFactory.sol";

import { FunctionParameters } from "../../../contracts/FunctionParameters.sol";

import { PriceOracleDeployment } from "./PriceOracleDeployment.s.sol";
import { BaseContractDeployment } from "./BaseContractDeployment.s.sol";
import { ProtocolConfigDeployment } from "./ProtocolConfigDeployment.s.sol";

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Addresses } from "./Addresses.sol";
import "forge-std/console.sol";

contract PortfolioDeployment is Script, Addresses {
  IPortfolioFactory portfolioFactory;

  address priceOracle;
  address protocolConfig;

  // Deploy PortfolioFactory
  function init() internal {
    BaseContractDeployment baseContractDeploy = new BaseContractDeployment();
    (
      address portfolioFactoryBase,
      address portfolioSwap,
      address tokenExclusionManager,
      address rebalancing,
      address assetManagementConfig,
      address feeModule,
      address tokenRemovalVault,
      address safe
    ) = baseContractDeploy.deployBaseContracts();

    deployDependencies();

    ERC1967Proxy portfolioFactoryProxy = new ERC1967Proxy(
      portfolioFactoryBase,
      abi.encodeWithSelector(
        PortfolioFactory.initialize.selector,
        FunctionParameters.PortfolioFactoryInitData({
          _basePortfolioAddress: portfolioSwap,
          _baseTokenExclusionManagerAddress: tokenExclusionManager,
          _baseRebalancingAddres: rebalancing,
          _baseAssetManagementConfigAddress: assetManagementConfig,
          _feeModuleImplementationAddress: feeModule,
          _baseTokenRemovalVaultImplementation: tokenRemovalVault,
          _baseVelvetGnosisSafeModuleAddress: safe,
          _gnosisSingleton: BSC_GNOSIS_SINGLETON,
          _basePositionManager: address(0), // @todo add base implementation
          _baseExternalPositionStorage: address(0), // @todo add base implementation
          _baseBorrowManager: address(0), // @todo add base implementation
          _gnosisFallbackLibrary: BSC_GNOSIS_FALLBACK_LIB,
          _gnosisMultisendLibrary: BSC_GNOSIS_MULTISEND_LIB,
          _gnosisSafeProxyFactory: BSC_GNOSIS_SAFE_PROXY_FACTORY,
          _protocolConfig: protocolConfig
        })
      )
    );
    portfolioFactory = IPortfolioFactory(address(portfolioFactoryProxy));
  }

  function deployDependencies() internal {
    PriceOracleDeployment priceOracleDeployment = new PriceOracleDeployment();
    priceOracle = address(priceOracleDeployment.deployPriceOracle());

    address velvetTreasury = makeAddr("velvetTreasury");
    ProtocolConfigDeployment protocolConfigDeploy = new ProtocolConfigDeployment(
        velvetTreasury,
        address(priceOracle)
      );
    protocolConfig = protocolConfigDeploy.deployProtocolConfig();
  }

  function createNewPortfolio(
    FunctionParameters.PortfolioCreationInitData memory initData
  ) public returns (address, IPortfolioFactory.PortfoliolInfo memory) {
    init();

    // creates an portfolio in behalf of msg.sender
    vm.prank(msg.sender);
    portfolioFactory.createPortfolioNonCustodial(initData);

    IPortfolioFactory.PortfoliolInfo memory portfolioInfo = portfolioFactory
      .PortfolioInfolList(0);

    return (portfolioFactory.getPortfolioList(0), portfolioInfo);
  }
}
