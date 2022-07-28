// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IJetStakingV1 {
    function stake(uint256 amount) external;

    function unstake(uint256 amount) external;

    function unstakeAll() external;

    function withdraw(uint256 streamId) external;

    function withdrawAll() external;

    function moveAllRewardsToPending() external;

    function moveRewardsToPending(uint256 streamId) external;
}
