// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";

/**
 * @title IPositionWrapper
 * @dev Interface for the PositionWrapper contract, which encapsulates Uniswap V3 positions as tradable ERC20 tokens.
 * This interface allows interaction with a PositionWrapper contract, enabling operations such as initialization,
 * minting, and burning of tokens, along with access to associated token data.
 */
interface IPositionWrapper is IERC20Upgradeable, IERC20MetadataUpgradeable {
  /**
   * @notice Initializes the contract with Uniswap V3 position tokens and ERC20 token details.
   * @param _token0 Address of the first token in the Uniswap V3 pair.
   * @param _token1 Address of the second token in the Uniswap V3 pair.
   * @param _name Name of the ERC20 token representing the position.
   * @param _symbol Symbol of the ERC20 token representing the position.
   * @dev This function is typically called once to configure the token pair and metadata for the ERC20 representation.
   */
  function init(
    address _positionManager,
    address _token0,
    address _token1,
    string memory _name,
    string memory _symbol
  ) external;

  function setIntitialParameters(
    uint24 _fee,
    int24 _tickLower,
    int24 _tickUpper
  ) external;

  /**
   * @notice Sets the token ID of the Uniswap V3 position after initializing the contract.
   * @param _tokenId The unique identifier of the Uniswap V3 position.
   */
  function setTokenId(uint256 _tokenId) external;

  /**
   * @notice Mints ERC20 tokens representing a proportional share of the Uniswap V3 position.
   * @param to The address to receive the minted tokens.
   * @param amount The quantity of tokens to mint.
   */
  function mint(address to, uint256 amount) external;

  /**
   * @notice Burns ERC20 tokens to decrease the representation of the underlying Uniswap V3 position.
   * @param from The address from which the tokens will be burned.
   * @param amount The quantity of tokens to burn.
   */
  function burn(address from, uint256 amount) external;

  /**
   * @notice Updates the token ID associated with the ERC20 tokens, typically during adjustments in the position.
   * @param _tokenId The new Uniswap V3 position ID.
   */
  function updateTokenId(uint256 _tokenId) external;

  /**
   * @notice Retrieves the token ID of the Uniswap V3 position.
   * @return The Uniswap V3 position ID.
   */
  function tokenId() external returns (uint256);

  /**
   * @notice Returns the address of the first token in the Uniswap V3 pair.
   * @return Address of the first token.
   */
  function token0() external returns (address);

  /**
   * @notice Returns the address of the second token in the Uniswap V3 pair.
   * @return Address of the second token.
   */
  function token1() external returns (address);

  /**
   * @notice Indicates whether the initial minting has been performed.
   * @return Boolean status of initial mint completion.
   */
  function initialMint() external returns (bool);

  function initialFee() external returns (uint24);

  function initialTickLower() external returns (int24);

  function initialTickUpper() external returns (int24);

  function positionManager() external returns (address);

  function parentPositionManager() external returns (address);
}
