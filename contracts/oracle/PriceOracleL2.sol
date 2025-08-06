// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {PriceOracleAbstract, AggregatorV2V3Interface, ErrorLibrary} from "./PriceOracleAbstract.sol";

/**
 * @title PriceOracleL2
 * @dev Extends PriceOracleAbstract to provide price data specifically for Layer 2 networks,
 * incorporating sequencer uptime feeds to ensure data reliability.
 */
contract PriceOracleL2 is PriceOracleAbstract {
  uint256 public immutable sequencerThreshold;
  AggregatorV2V3Interface public immutable sequencerUptimeFeed;

  /**
   * @dev Initializes the contract with Layer 2 specific settings.
   * @param _WETH Address of the WETH token for price reference.
   * @param _sequencerUptimeFeed Address of the Sequencer Uptime Feed Aggregator.
   */
  constructor(
    address _WETH,
    AggregatorV2V3Interface _sequencerUptimeFeed
  ) PriceOracleAbstract(_WETH) {
    sequencerThreshold = 3600; // 1 hour
    sequencerUptimeFeed = _sequencerUptimeFeed;
  }

  /**
   * @notice Overrides the abstract method to provide the latest round data,
   * taking into account the sequencer uptime for Layer 2 security.
   * @param base The address of the base asset.
   * @param quote The address of the quote asset.
   * @return price The latest price of the token pair.
   */
  function _latestRoundData(
    address base,
    address quote
  ) internal view override returns (int256) {
    // Retrieve the latest round data from the sequencer uptime feed
    (, int256 answer, uint256 startedAt, , ) = sequencerUptimeFeed
      .latestRoundData();

    // Check whether the sequencer is up
    bool isSequencerUp = answer == 0;
    if (!isSequencerUp) revert ErrorLibrary.SequencerIsDown();

    // Validate that startedAt is not zero
    if (startedAt == 0) revert ErrorLibrary.InvalidSequencerTimestamp();

    // Ensure the sequencer's uptime threshold is met
    if (block.timestamp - startedAt <= sequencerThreshold) {
      revert ErrorLibrary.SequencerThresholdNotCrossed();
    }
    
    // Retrieve the latest price data for the given token pair
    (, int256 price, , uint256 updatedAt, ) = tokenPairToAggregator[base]
      .aggregators[quote]
      .latestRoundData();

    // Ensure the price data is not expired
    if (updatedAt + oracleExpirationThreshold < block.timestamp)
      revert ErrorLibrary.PriceOracleExpired();

    if (price <= 0) revert ErrorLibrary.PriceOracleInvalid();

    return price;
  }
}
