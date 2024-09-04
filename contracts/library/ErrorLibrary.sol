// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

/**
 * @title ErrorLibrary
 * @author Velvet.Capital
 * @notice This is a library contract including custom defined errors
 */

library ErrorLibrary {
  /// @notice Thrown when caller is not rebalancer contract
  error CallerNotRebalancerContract();
  /// @notice Thrown when caller is not asset manager
  error CallerNotAssetManager();
  /// @notice Thrown when caller is not asset manager
  error CallerNotSuperAdmin();
  /// @notice Thrown when caller is not whitelist manager
  error CallerNotWhitelistManager();
  /// @notice Thrown when length of tokens array is zero
  error InvalidLength();
  /// @notice Thrown when user is not allowed to deposit
  error UserNotAllowedToDeposit();
  /// @notice Thrown when portfolio token in not initialized
  error PortfolioTokenNotInitialized();
  /// @notice Thrown when caller is not holding enough portfolio token amount to withdraw
  error CallerNotHavingGivenPortfolioTokenAmount();
  /// @notice Thrown when the tokens are already initialized
  error AlreadyInitialized();
  /// @notice Thrown when the token is not whitelisted
  error TokenNotWhitelisted();
  /// @notice Thrown when token address being passed is zero
  error InvalidTokenAddress();
  /// @notice Thrown when transfer is prohibited
  error Transferprohibited();
  /// @notice Thrown when caller is not portfolio manager
  error CallerNotPortfolioManager();
  /// @notice Thrown when offchain handler is not valid
  error InvalidSolver();
  /// @notice Thrown when set time period is not over
  error TimePeriodNotOver();
  /// @notice Thrown when trying to set any fee greater than max allowed fee
  error InvalidFee();
  /// @notice Thrown when zero address is passed for treasury
  error ZeroAddressTreasury();
  /// @notice Thrown when previous address is passed for treasury
  error PreviousTreasuryAddress();
  /// @notice Thrown when zero address is being passed
  error InvalidAddress();
  /// @notice Thrown when caller is not the owner
  error CallerNotOwner();
  /// @notice Thrown when protocol is not paused
  error ProtocolNotPaused();
  /// @notice Thrown when protocol is paused
  error ProtocolIsPaused();
  /// @notice Thrown when token is not enabled
  error TokenNotEnabled();
  /// @notice Thrown when portfolio creation is paused
  error PortfolioCreationIsPause();
  /// @notice Thrown when asset manager is trying to input token which already exist
  error TokenAlreadyExist();
  /// @notice Thrown when cool down period is not passed
  error CoolDownPeriodNotPassed();
  /// @notice Throws when the setup is failed in gnosis
  error ModuleNotInitialised();
  /// @notice Throws when threshold is more than owner length
  error InvalidThresholdLength();
  /// @notice Throws when no owner address is passed while fund creation
  error NoOwnerPassed();
  /// @notice Thorws when the caller does not have a default admin role
  error CallerNotAdmin();
  /// @notice Throws when a public fund is tried to made transferable only to whitelisted addresses
  error PublicFundToWhitelistedNotAllowed();
  /// @notice Generic call failed error
  error CallFailed();
  /// @notice Generic transfer failed error
  error TransferFailed();
  /// @notice Throws when the initToken or updateTokenList function of Portfolio is having more tokens than set by the Registry
  error TokenCountOutOfLimit(uint256 limit);
  /// @notice Throws when the array lenghts don't match for adding price feed or enabling tokens
  error IncorrectArrayLength();
  /// @notice Throws when user calls updateFees function before proposing a new fee
  error NoNewFeeSet();
  /// @notice Throws when sequencer is down
  error SequencerIsDown();
  /// @notice Throws when sequencer threshold is not crossed
  error SequencerThresholdNotCrossed();
  /// @notice Throws when depositAmount and depositToken length does not match
  error InvalidDepositInputLength();
  /// @notice Mint amount smaller than users indended buy amount
  error InvalidMintAmount();
  /// @notice Thorws when zero price is set for min portfolio price
  error InvalidMinPortfolioAmount();
  /// @notice Thorws when min portfolio price is set less then min portfolio price set by protocol
  error InvalidMinPortfolioAmountByAssetManager();
  /// @notice Throws when assetManager set zero or less initial portfolio price then set by protocol
  error InvalidInitialPortfolioAmount();
  /// @notice Throws when zero amount or amount less then protocol minPortfolioAmount is set while updating min Portfolio amount by assetManager
  error InvalidMinPortfolioTokenHoldingAmount();
  /// @notice Throws when assetmanager set min portfolio amount less then acceptable amount set by protocol
  error InvalidMinAmountByAssetManager();
  /// @notice Throws when user is not maintaining min portfolio token amount while withdrawing
  error CallerNeedToMaintainMinTokenAmount();
  /// @notice Throws when user minted amount during deposit is less then set by assetManager
  error MintedAmountIsNotAccepted();
  /// @notice Throws when balance of buyToken after rebalance is zero
  error BalanceOfVaultCannotNotBeZero(address);
  /// @notice Throws when balance of selltoken in handler after swap is not zero
  error BalanceOfHandlerShouldBeZero();
  /// @notice Throws when balance of selltoken in handler after swap is exceeding dust
  error BalanceOfHandlerShouldNotExceedDust();
  /// @notice Throws when swap return value in handler is less then min buy amounts
  error ReturnValueLessThenExpected();
  /// @notice Throws when non portfolio token balance in not zero after rebalance
  error NonPortfolioTokenBalanceIsNotZero();
  /// @notice Throws when the oracle price is not updated under set timeout
  error PriceOracleExpired();
  /// @notice Throws when the oracle price is returned 0
  error PriceOracleInvalid();
  /// @notice Thrown when oracle address is zero address
  error InvalidOracleAddress();
  /// @notice Thrown when token is not in price oracle
  error TokenNotInPriceOracle();
  /// @notice Throws when token is not removed and user is trying to claim
  error NoTokensRemoved();
  /// @notice Throws when assetManager tries to remove portfolioToken
  error IsPortfolioToken();
  /// @notice Throws when disabled tokens are used in protocol
  error NotPortfolioToken();
  /// @notice Thrown when balance of vault is zero
  error BalanceOfVaultIsZero();
  /// @notice Thrown when max asset limit is set zero
  error InvalidAssetLimit();
  /// @notice Thrown when max whitelist limit is set zero
  error InvalidWhitelistLimit();
  /// @notice Thrown when withdrawal amount is too small and tokenBalance in return is zero
  error WithdrawalAmountIsSmall();
  /// @notice Thrown when deposit amount is zero
  error AmountCannotBeZero();
  // @notice Thrown when percentage of token to remove is invalid
  error InvalidTokenRemovalPercentage();
  // @notice Thrown when user passes the wrong buy token list (not equal to buy tokens in calldata)
  error InvalidBuyTokenList();
  /// @notice Thrown when permitted to wrong spender
  error InvalidSpender();
  /// @notice Thrown when claiming reward tokens failed
  error ClaimFailed();
  /// @notice Thrown when protocol owner passed invalid protocol streaming fee
  error InvalidProtocolStreamingFee();
  /// @notice Thrown when protocol owner passed invalid protocol fee
  error InvalidProtocolFee();
  /// @notice Thrown when protocol is emergency paused
  error ProtocolEmergencyPaused();
  /// @notice Thrown when batchHandler balance diff is zero
  error InvalidBalanceDiff();
  ///@notice Error thrown when the user tries to withdraw or transfer an amount greater than their balance.
  error InsufficientBalance();
  // @notice Thrown when an unpause action is attempted too soon after the last unpause.
  error TimeSinceLastUnpauseNotElapsed();
  // @notice Thrown when an invalid cooldown period is set.
  error InvalidCooldownPeriod();
  // @notice Thrown when the division by zero occurs
  error DivisionByZero();
  // @notice Thrown when the token whitelist length is zero
  error InvalidTokenWhitelistLength();
  // @notice Thrown when the reward target is not enabled
  error RewardTargetNotEnabled();
  // @notice Thrown when the allowance is insufficient
  error InsufficientAllowance();
  // @notice Thrown when user tries to claim for invalid Id
  error InvalidId();
  // @notice Thrown when exemption does match token to withdraw
  error InvalidExemptionTokens();
  // @notice Thrown when exemption tokens length is greater then portfolio tokens length
  error InvalidExemptionTokensLength();
  // @notice Thrown when the dust tolerance input is invalid
  error InvalidDustTolerance();
  // @notice Thrown when the target address is not whitelisted
  error InvalidTargetAddress();
  // @notice Thrown when the ETH balance sent is zero
  error InvalidBalance();
  // @notice Thrown when the swap amount is invalid
  error InvalidSwapAmount();
  // @notice Thrown when the passed deviation bps is invalid
  error InvalidDeviationBps();
  // @notice Thrown when the increase liquidity call fails
  error IncreaseLiquidityFailed();
  // @notice Thrown when the decrease liquidity call fails
  error DecreaseLiquidityFailed();
}
