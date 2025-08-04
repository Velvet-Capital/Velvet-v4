// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TESTZEROAPPROVALERC20 is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) {}

    function mint(address account, uint256 value) external {
        _mint(account, value);
    }

    function approve(
        address spender,
        uint256 value
    ) public override returns (bool) {
        require(
            value == 0 || allowance(msg.sender, spender) == 0,
            "value must be 0"
        );
        _approve(msg.sender, spender, value);
        return true;
    }
}
