// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable-4.9.6/access/OwnableUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import { ErrorLibrary } from "../library/ErrorLibrary.sol";

/**
 * @title TokenRemovalVault
 * @notice This contract acts as a vault for tokens that have been removed from a portfolio.
 * It allows the owner to withdraw the tokens to a specified address.
 */
contract TokenRemovalVault is OwnableUpgradeable {
  /**
   * @notice Initializes the TokenRemovalVault contract.
   * @dev This function is called only once during the deployment of the contract.
   */
  function init() external initializer {
    __Ownable_init();
  }

  /**
   * @notice Withdraws a specified amount of tokens to a specified address.
   * @dev This function can only be called by the owner of the contract.
   * @param _token The address of the token to withdraw.
   * @param _to The address to which the tokens will be sent.
   * @param _amount The amount of tokens to withdraw.
   */
  function withdrawTokens(
    address _token,
    address _to,
    uint256 _amount
  ) external onlyOwner {
    if (_amount == 0) {
      revert ErrorLibrary.AmountCannotBeZero();
    }
    TransferHelper.safeTransfer(_token, _to, _amount);
  }
}
