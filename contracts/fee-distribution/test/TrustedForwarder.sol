//SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

contract TrustedForwarder {
    function execute(address to, bytes calldata data) public payable returns (bool, bytes memory) {
        (bool success, bytes memory returndata) = to.call{gas: gasleft(), value: msg.value}(
            abi.encodePacked(data, msg.sender)
        );
        assert(gasleft() > gasleft() / 63);
        return (success, returndata);
    }
}
