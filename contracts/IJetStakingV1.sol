// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IJetStakingV1 {
    enum StreamStatus {
        INACTIVE,
        PROPOSED,
        ACTIVE
    }

    struct User {
        uint256 deposit;
        uint256 auroraShares;
        uint256 streamShares;
        mapping(uint256 => uint256) pendings; // The amount of tokens pending release for user per stream
        mapping(uint256 => uint256) releaseTime; // The release moment per stream
        mapping(uint256 => uint256) rpsDuringLastClaim; // RPS or reward per share during the previous rewards claim
    }

    struct Schedule {
        uint256[] time;
        uint256[] reward;
    }

    struct Stream {
        address owner; // stream owned by the ERC-20 reward token owner
        address manager; // stream manager handled by AURORA stream manager role
        address rewardToken;
        uint256 auroraDepositAmount;
        uint256 auroraClaimedAmount;
        uint256 rewardDepositAmount;
        uint256 rewardClaimedAmount;
        uint256 maxDepositAmount;
        uint256 minDepositAmount;
        uint256 lastTimeOwnerClaimed;
        uint256 tau; // pending time prior reward release
        uint256 rps; // Reward per share for a stream j>0
        Schedule schedule;
        StreamStatus status;
    }

    function stake(uint256 amount) external;

    function unstake(uint256 amount) external;

    function unstakeAll() external;

    function withdraw(uint256 streamId) external;

    function withdrawAll() external;

    function moveAllRewardsToPending() external;

    function moveRewardsToPending(uint256 streamId) external;

    function streams(uint256 streamId) external view returns (Stream memory);

    function getStreamsCount() external view returns (uint256);
}
