// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IVoteTokenERC20 is IERC20 {
    function delegate(address to, uint256 amount) external returns (bool);
}
