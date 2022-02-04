// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Token is ERC20, Ownable {
    constructor(
        uint256 initialSupply,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }

    /// @notice Creates `_amount` token to `_to`. Must only be called by the owner.
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }

    /// @dev this function will only be called by the owner
    /// in which will be used to transfer vote tokens from 
    /// account to another account. This contract should be
    /// whitelisted in the Jet staking contract in order to 
    /// to complete the transfer.
    function transferFromVoteTokens(
        address jetAddress, 
        address _sender,
        address _recipient,
        uint256 _amount
    ) public onlyOwner
    {
        IERC20(jetAddress).transferFrom(_sender, _recipient, _amount);
    }
}
