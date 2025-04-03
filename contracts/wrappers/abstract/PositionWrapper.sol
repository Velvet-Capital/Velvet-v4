// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/UUPSUpgradeable.sol";

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/access/OwnableUpgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/token/ERC20/ERC20Upgradeable.sol";
import { IPositionManager } from "./IPositionManager.sol";
import { ErrorLibrary } from "../../library/ErrorLibrary.sol";

/**
 * @title PositionWrapper
 * @dev Wrapper contract for representing Uniswap V3 positions as ERC20 tokens.
 *      This contract is upgradeable and utilizes OpenZeppelin's Ownable and ERC20 implementations
 *      to provide an ERC20 interface for Uniswap V3 liquidity positions, allowing them to be managed
 *      and interacted with like standard ERC20 tokens.
 */
contract PositionWrapper is
  OwnableUpgradeable,
  ERC20Upgradeable,
  UUPSUpgradeable
{
  address public positionManager; // Address of the Uniswap V3 position manager.

  address public parentPositionManager; // Address of the parent position manager.

  address public token0; // Address of the first token in the Uniswap V3 pair.
  address public token1; // Address of the second token in the Uniswap V3 pair.
  uint256 public tokenId; // ID of the Uniswap V3 position.
  bool public initialMint; // Flag to indicate if the initial mint has occurred, to prevent re-initialization.

  uint24 public initialFee; // Fee of the Uniswap V3 position.
  int24 public initialTickLower; // Lower tick of the Uniswap V3 position.
  int24 public initialTickUpper; // Upper tick of the Uniswap V3 position.

  event TokensMinted(address user, uint256 amount);
  event TokensBurned(address user, uint256 amount);

  error PositionWrapperTokenIdIsTheSame(); // Custom error for trying to set the same token ID.
  error AlreadyInitialized(); // Custom error when ID is already initialized

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice Initializes the PositionWrapper contract with specific token details and ERC20 token metadata.
   * @param _token0 Address of the first token in the Uniswap V3 pair.
   * @param _token1 Address of the second token in the Uniswap V3 pair.
   * @param _name Name of the ERC20 token representing the position.
   * @param _symbol Symbol of the ERC20 token representing the position.
   * @dev Calls initializer functions for Ownable and ERC20 contracts from OpenZeppelin.
   */
  function init(
    address _positionManager,
    address _token0,
    address _token1,
    string memory _name,
    string memory _symbol
  ) external initializer {
    if (
      _positionManager == address(0) ||
      _token0 == address(0) ||
      _token1 == address(0)
    ) revert ErrorLibrary.InvalidAddress();

    __UUPSUpgradeable_init();
    __Ownable_init();
    token0 = _token0;
    token1 = _token1;
    __ERC20_init(_name, _symbol);

    positionManager = _positionManager;

    parentPositionManager = msg.sender;
  }

  function setIntitialParameters(
    uint24 _fee,
    int24 _tickLower,
    int24 _tickUpper
  ) external onlyOwner {
    initialFee = _fee;
    initialTickLower = _tickLower;
    initialTickUpper = _tickUpper;
  }

  /**
   * @notice Sets the token ID of the Uniswap V3 position and marks the contract as initialized.
   * @param _tokenId The ID of the Uniswap V3 position.
   * @dev This function can only be called once per contract instance, enforced by the `initialMint` flag.
   */
  function setTokenId(uint256 _tokenId) external onlyOwner {
    if (initialMint) revert AlreadyInitialized();

    tokenId = _tokenId;
    initialMint = true;
  }

  /**
   * @notice Mints wrapper tokens corresponding to the Uniswap V3 position liquidity.
   * @param to Address to receive the minted tokens.
   * @param amount Amount of tokens to mint.
   * @dev Restricts minting functionality to the contract owner.
   */
  function mint(address to, uint256 amount) external onlyOwner {
    _mint(to, amount);

    emit TokensMinted(to, amount);
  }

  /**
   * @notice Burns wrapper tokens to reduce the representation of the underlying Uniswap V3 position liquidity.
   * @param from Address from which the tokens will be burned.
   * @param amount Amount of tokens to burn.
   * @dev Restricts burning functionality to the contract owner.
   */
  function burn(address from, uint256 amount) external onlyOwner {
    _burn(from, amount);

    emit TokensBurned(from, amount);
  }

  /**
   * @notice Updates the token ID associated with the position wrapper.
   * @param _tokenId New token ID to be set.
   * @dev Prevents setting the same token ID as currently set to avoid redundant operations.
   */
  function updateTokenId(uint256 _tokenId) external onlyOwner {
    if (tokenId == _tokenId) revert PositionWrapperTokenIdIsTheSame();
    tokenId = _tokenId;
  }

  /**
   * @notice Authorizes upgrade for this contract
   * @param newImplementation Address of the new implementation
   */
  function _authorizeUpgrade(address newImplementation) internal override {
    address protocolConfig = IPositionManager(positionManager).protocolConfig();
    if (!(msg.sender == protocolConfig)) revert ErrorLibrary.CallerNotAdmin();

    // Intentionally left empty as required by an abstract contract
  }
}
