// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { OwnableCheck } from "./OwnableCheck.sol";

import { ErrorLibrary } from "../../library/ErrorLibrary.sol";

import { Initializable } from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/Initializable.sol";

abstract contract ExternalPositionManagement is OwnableCheck, Initializable {
  event PositionWrapperBaseAddressUpdated(address indexed _newAddress);
  event AllowedRatioDeviationBpsUpdated(uint256 indexed _newDeviationBps);
  event UpgradePositionWrapper(address indexed newImplementation);
  event UpdatedSlippageFeeReinvestment(uint256 indexed _newSlippage);

  /// @notice The maximum allowed deviation from the target ratio for external positions, measured in basis points.
  uint256 public allowedRatioDeviationBps;
  /// @notice The accepted slippage for fee reinvestment, measured in basis points.
  uint256 public acceptedSlippageFeeReinvestment;

  /// @notice A mapping that stores information about enabled protocols.
  mapping(bytes32 => ProtocolInfo) public protocols;

  struct ProtocolInfo {
    address nftManager;
    address swapRouter;
    address positionWrapperBase;
    bool enabled;
  }

  event ProtocolEnabled(
    bytes32 indexed protocolId,
    address nftManager,
    address swapRouter,
    address positionWrapperBase
  );

  function __ExternalPositionManagement_init() internal onlyInitializing {
    allowedRatioDeviationBps = 50;
    acceptedSlippageFeeReinvestment = 100;
  }

  /**
   * @notice Enables a protocol with specified addresses
   * @param protocolId The identifier for the protocol (e.g., keccak256("UNISWAP_V3"))
   * @param nftManager The NFT manager contract address for the protocol
   * @param swapRouter The swap router contract address for the protocol
   * @param positionWrapperBase The position wrapper base implementation address
   */
  function enableProtocol(
    bytes32 protocolId,
    address nftManager,
    address swapRouter,
    address positionWrapperBase
  ) external onlyProtocolOwner {
    if (
      nftManager == address(0) ||
      swapRouter == address(0) ||
      positionWrapperBase == address(0)
    ) revert ErrorLibrary.InvalidAddress();

    protocols[protocolId] = ProtocolInfo({
      nftManager: nftManager,
      swapRouter: swapRouter,
      positionWrapperBase: positionWrapperBase,
      enabled: true
    });

    emit ProtocolEnabled(
      protocolId,
      nftManager,
      swapRouter,
      positionWrapperBase
    );
  }

  /**
   * @notice Disables a protocol
   * @param protocolId The identifier for the protocol
   */
  function disableProtocol(bytes32 protocolId) external onlyProtocolOwner {
    protocols[protocolId].enabled = false;
  }

  /**
   * @notice Gets the protocol addresses
   * @param protocolId The identifier for the protocol
   * @return nftManager The NFT manager contract address
   * @return swapRouter The swap router contract address
   */
  function getProtocolAddresses(
    bytes32 protocolId
  ) external view returns (address nftManager, address swapRouter) {
    ProtocolInfo memory protocol = protocols[protocolId];
    if (!protocol.enabled) revert ErrorLibrary.ProtocolNotEnabled(protocolId);

    return (protocol.nftManager, protocol.swapRouter);
  }

  /**
   * @notice Checks if a protocol is enabled.
   * @param protocolId The identifier for the protocol.
   * @return True if the protocol is enabled, false otherwise.
   */
  function isProtocolEnabled(bytes32 protocolId) external view returns (bool) {
    return protocols[protocolId].enabled;
  }

  /**
   * @notice Gets the position wrapper base implementation address for a protocol.
   * @param protocolId The identifier for the protocol.
   * @return The address of the position wrapper base implementation.
   */
  function getPositionWrapperBaseImplementation(
    bytes32 protocolId
  ) external view returns (address) {
    return protocols[protocolId].positionWrapperBase;
  }

  /**
   * @notice Updates the position wrapper base implementation address for a protocol.
   * @param protocolId The identifier for the protocol.
   * @param newImplementation The new base implementation address to be used for cloning new wrappers.
   */
  function updatePositionWrapperBaseImplementation(
    bytes32 protocolId,
    address newImplementation
  ) external onlyProtocolOwner {
    protocols[protocolId].positionWrapperBase = newImplementation;
  }

  /**
   *
   * @dev Allows the contract's asset manager to update the allowed deviation from the target ratio for external positions.
   * @param _newDeviationBps The new deviation in basis points.
   */
  function updateAllowedRatioDeviationBps(
    uint256 _newDeviationBps
  ) external onlyProtocolOwner {
    // Check if the new deviation is within the allowed range.
    if (_newDeviationBps > 1_000) {
      revert ErrorLibrary.InvalidDeviationBps();
    }
    allowedRatioDeviationBps = _newDeviationBps;

    emit AllowedRatioDeviationBpsUpdated(_newDeviationBps);
  }

  /**
   * @notice Updates the allowed slippage for fee reinvestment.
   * @dev Allows the contract's protocol owner to update the accepted slippage for fee reinvestment.
   *      This function ensures that the new slippage value is within an acceptable range (0-10%).
   * @param _newSlippageFeeReinvestment The new slippage value in basis points (1 bp = 0.01%).
   */

  function updateAllowedSlippage(
    uint256 _newSlippageFeeReinvestment
  ) external onlyProtocolOwner {
    // Check if the new deviation is within the allowed range.
    if (_newSlippageFeeReinvestment > 1_000) {
      revert ErrorLibrary.InvalidDeviationBps();
    }
    acceptedSlippageFeeReinvestment = _newSlippageFeeReinvestment;

    emit UpdatedSlippageFeeReinvestment(_newSlippageFeeReinvestment);
  }
}
