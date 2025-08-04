// SPDX-License-Identifier: BUSL-1.1

/**
 * @title Portfolio for the Portfolio
 * @author Velvet.Capital
 * @notice This contract is used by the user to deposit and withdraw from the portfolio
 * @dev This contract includes functionalities:
 *      1. Deposit in the particular fund
 *      2. Withdraw from the fund
 */

pragma solidity 0.8.17;

import {FunctionParameters} from "../../FunctionParameters.sol";

import {IPriceOracle} from "../../oracle/IPriceOracle.sol";
import {IAllowanceTransfer} from "./IAllowanceTransfer.sol";

interface IPortfolio {
  function vault() external view returns (address);

  function feeModule() external view returns (address);

  function protocolConfig() external view returns (address);

  function tokenExclusionManager() external view returns (address);

  function accessController() external view returns (address);

  function paused() external view returns (bool);

  function assetManagementConfig() external view returns (address);

  /**
   * @dev Emitted when `value` tokens are moved from one account (`from`) to
   * another (`to`).
   *
   * Note that `value` may be zero.
   */
  event Transfer(address indexed from, address indexed to, uint256 value);

  /**
   * @dev Emitted when the allowance of a `spender` for an `owner` is set by
   * a call to {approve}. `value` is the new allowance.
   */
  event Approval(address indexed owner, address indexed spender, uint256 value);

  /**
   * @dev Returns the amount of tokens in existence.
   */
  function totalSupply() external view returns (uint256);

  /**
   * @dev Returns the amount of tokens owned by `account`.
   */
  function balanceOf(address account) external view returns (uint256);

  /**
   * @dev Moves `amount` tokens from the caller's account to `to`.
   *
   * Returns a boolean value indicating whether the operation succeeded.
   *
   * Emits a {Transfer} event.
   */
  function transfer(address to, uint256 amount) external returns (bool);

  /**
   * @dev Returns the remaining number of tokens that `spender` will be
   * allowed to spend on behalf of `owner` through {transferFrom}. This is
   * zero by default.
   *
   * This value changes when {approve} or {transferFrom} are called.
   */
  function allowance(
    address owner,
    address spender
  ) external view returns (uint256);

  /**
   * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
   *
   * Returns a boolean value indicating whether the operation succeeded.
   *
   * IMPORTANT: Beware that changing an allowance with this method brings the risk
   * that someone may use both the old and the new allowance by unfortunate
   * transaction ordering. One possible solution to mitigate this race
   * condition is to first reduce the spender's allowance to 0 and set the
   * desired value afterwards:
   * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
   *
   * Emits an {Approval} event.
   */
  function approve(address spender, uint256 amount) external returns (bool);

  /**
   * @dev Moves `amount` tokens from `from` to `to` using the
   * allowance mechanism. `amount` is then deducted from the caller's
   * allowance.
   *
   * Returns a boolean value indicating whether the operation succeeded.
   *
   * Emits a {Transfer} event.
   */
  function transferFrom(
    address from,
    address to,
    uint256 amount
  ) external returns (bool);

  function init(
    FunctionParameters.PortfolioInitData calldata initData
  ) external;

  /**
   * @dev Sets up the initial assets for the pool.
   * @param tokens Underlying tokens to initialize the pool with
   */
  function initToken(address[] calldata tokens) external;

  // For Minting Shares
  function mintShares(address _to, uint256 _amount) external;

  function pullFromVault(address _token, uint256 _amount, uint256 _value, address _to) external;

  /**
     * @notice The function swaps BNB into the portfolio tokens after a user makes an deposit
     * @dev The output of the swap is converted into USD to get the actual amount after slippage to calculate 
            the portfolio token amount to mint
     * @dev (tokenBalance, vaultBalance) has to be calculated before swapping for the _mintShareAmount function 
            because during the swap the amount will change but the portfolio token balance is still the same 
            (before minting)
     */
  function multiTokenDeposit(
    uint256[] calldata depositAmounts,
    uint256 _minMintAmount,
    IAllowanceTransfer.PermitBatch calldata _permit,
    bytes calldata _signature
  ) external;

  /**
   * @notice Allows a specified depositor to deposit tokens into the fund through a multi-token deposit.
   *         The deposited tokens are added to the vault, and the user is minted portfolio tokens representing their share.
   * @param _depositFor The address of the user the deposit is being made for.
   * @param depositAmounts An array of amounts corresponding to each token the user wishes to deposit.
   * @param _minMintAmount The minimum amount of portfolio tokens the user expects to receive for their deposit, protecting against slippage.
   */
  function multiTokenDepositFor(
    address _depositFor,
    uint256[] calldata depositAmounts,
    uint256 _minMintAmount
  ) external;

  /**
     * @notice The function swaps the amount of portfolio tokens represented by the amount of portfolio token back to 
               BNB and returns it to the user and burns the amount of portfolio token being withdrawn
     * @param _portfolioTokenAmount The portfolio token amount the user wants to withdraw from the fund
     */
  function multiTokenWithdrawal(
    uint256 _portfolioTokenAmount,
    FunctionParameters.withdrawRepayParams calldata repayData
  ) external;

  /**
   * @notice Allows an approved user to withdraw portfolio tokens on behalf of another user.
   * @param _withdrawFor The address of the user for whom the withdrawal is being made.
   * @param _portfolioTokenAmount The amount of portfolio tokens to withdraw.
   */
  function multiTokenWithdrawalFor(
    address _withdrawFor,
    address _tokenReceiver,
    uint256 _portfolioTokenAmount,
    FunctionParameters.withdrawRepayParams calldata repayData
  ) external;

  /**
    @notice The function returns lastRebalanced time
  */
  function getLastRebalance() external view returns (uint256);

  /**
    @notice The function returns lastPaused time
  */
  function getLastPaused() external view returns (uint256);

  function getTokens() external view returns (address[] memory);

  function updateTokenList(address[] memory tokens) external;

  function userLastDepositTime(address owner) external view returns (uint256);

  function _checkCoolDownPeriod(address _user) external view;

  function getTokenBalancesOf(
    address[] memory,
    address
  ) external view returns (uint256[] memory);

  function getVaultValueInUSD(
    IPriceOracle,
    address[] memory,
    uint256,
    address
  ) external view returns (uint256);

  function _calculateMintAmount(uint256, uint256) external returns (uint256);

  function vaultInteraction(
    address _target,
    uint256 _value,
    bytes memory _claimCalldata
  ) external;
}
