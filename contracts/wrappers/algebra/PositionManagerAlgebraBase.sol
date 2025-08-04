// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { PositionManagerAbstract, IPositionWrapper, WrapperFunctionParameters, ErrorLibrary, IERC20Upgradeable, IProtocolConfig } from "../abstract/PositionManagerAbstract.sol";
import { INonfungiblePositionManager } from "./INonfungiblePositionManager.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IFactory } from "./IFactory.sol";
import { IPool } from "../interfaces/IPool.sol";
import { IPriceOracle } from "../../oracle/IPriceOracle.sol";

/**
 * @title PositionManagerAbstractAlgebra
 * @dev Extension of PositionManagerAbstract for managing Algebra (several versions) positions with added features like custom token swapping.
 */
abstract contract PositionManagerAlgebraBase is PositionManagerAbstract {
  address router;
  /**
   * @dev Initializes the contract with additional protocol configuration and swap router addresses.
   * @param _nonFungiblePositionManagerAddress Address of the Algebra V3 Non-Fungible Position Manager.
   * @param _swapRouter Address of the swap router.
   * @param _protocolConfig Address of the protocol configuration.
   * @param _assetManagerConfig Address of the asset management configuration.
   * @param _accessController Address of the access controller.
   * @param _protocolId Protocol ID.
   */
  function PositionManagerAbstractAlgebra_init(
    address _externalPositionStorage,
    address _nonFungiblePositionManagerAddress,
    address _swapRouter,
    address _protocolConfig,
    address _assetManagerConfig,
    address _accessController,
    bytes32 _protocolId
  ) internal {
    PositionManagerAbstract__init(
      _externalPositionStorage,
      _nonFungiblePositionManagerAddress,
      _protocolConfig,
      _assetManagerConfig,
      _accessController,
      _protocolId
    );

    router = _swapRouter;
  }

  /**
   * @dev Retrieves tokens in the correct pool order.
   * @param _token0 First token address.
   * @param _token1 Second token address.
   * @return token0 Token address that is token0 in the pool.
   * @return token1 Token address that is token1 in the pool.
   */
  function _getTokensInPoolOrder(
    address _token0,
    address _token1
  ) internal view returns (address token0, address token1) {
    IFactory factory = IFactory(
      INonfungiblePositionManager(address(uniswapV3PositionManager)).factory()
    );
    IPool pool = IPool(factory.poolByPair(_token0, _token1));

    token0 = pool.token0();
    token1 = pool.token1();
  }

  function _getTokensOwed(
    uint256
  ) internal view virtual returns (uint128, uint128);
}
