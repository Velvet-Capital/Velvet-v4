// SPDX-License-Identifier: BUSL-1.1

/**
 * @title VelvetSafeModule for a particular Portfolio
 * @author Velvet.Capital
 * @notice This contract is used for creating a bridge between the contract and the gnosis safe vault
 * @dev This contract includes functionalities:
 *      1. Add a new owner of the vault
 *      2. Transfer BNB and other tokens to and fro from vault
 */
pragma solidity 0.8.17;

import { Module, Enum } from "@gnosis.pm/zodiac/contracts/core/Module.sol";
import { ErrorLibrary } from "../library/ErrorLibrary.sol";

contract VelvetSafeModule is Module {
  address public multiSendLibrary;

  /**
   * @notice This function transfers module ownership
   * @param initializeParams Encoded data having the init parameters
   */
  function setUp(bytes memory initializeParams) public override initializer {
    __Ownable_init();
    (address _safeAddress, address _portfolio, address _multiSendLib) = abi
      .decode(initializeParams, (address, address, address));
    multiSendLibrary = _multiSendLib;
    setAvatar(_safeAddress);
    setTarget(_safeAddress);
    transferOwnership(_portfolio);
  }

  /**
   * @notice This function executes to get non derivative tokens back to vault
   * @param handlerAddresses Address of the handler to be used
   * @param value Ether value of the transaction
   * @param encodedCalls Encoded calldata for the `executeWallet` function
   */
  function executeWallet(
    address handlerAddresses,
    uint256 value,
    bytes calldata encodedCalls
  ) external onlyOwner returns (bool isSuccess, bytes memory data) {
    (isSuccess, data) = execAndReturnData(
      handlerAddresses,
      value,
      encodedCalls,
      Enum.Operation.Call
    );
    if (!isSuccess) revert ErrorLibrary.CallFailed();
  }
}
