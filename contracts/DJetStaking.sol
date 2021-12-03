// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "./AuroraToken.sol";
import "./interfaces/IStaking.sol";

// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once VOTE is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.

contract DJetStaking is Ownable, ERC20, IStaking, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function pause() external {}
    function unpause() external {}

    function stake(uint256 amount, uint256 endSeason) external {}
    function unstake (uint256 depositId) external {}

    function claimVote(uint256 depositId) external {}
    function claimRewards(uint256 depositId, address token) external {}

    function updateSeasonDuration(uint256 newDuration) external {}
    function burn(address user, uint256 amount) external {}
}
