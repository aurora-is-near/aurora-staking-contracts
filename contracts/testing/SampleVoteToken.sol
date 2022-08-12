// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev THIS IS A SAMPLE CONTRACT AND MEANT TO
 *      BE USED ONLY FOR TESTING PURPOSES.
 */
contract SampleVoteToken is ERC20 {
    constructor(
        uint256 initialSupply,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }

    function delegate(address to, uint256 amount)
        public
        virtual
        returns (bool)
    {
        return super.transfer(to, amount);
    }
}
