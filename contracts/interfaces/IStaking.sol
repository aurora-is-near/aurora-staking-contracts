// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IStaking {
    function stake(uint256 amount, uint256 seasonAmount) external;

    function unstake(uint256 depositId) external;

    function claimVote(uint256 depositId) external;

    function claimRewards(
        uint256 depositId,
        uint256 index,
        address user
    ) external;

    function burn(address user, uint256 amount) external;
}
