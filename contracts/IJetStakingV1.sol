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

    function getStreamsCount() external view returns (uint256);

    function getStream(uint256 streamId)
        external
        view
        returns (
            address streamOwner,
            address rewardToken,
            uint256 auroraDepositAmount,
            uint256 auroraClaimedAmount,
            uint256 rewardDepositAmount,
            uint256 rewardClaimedAmount,
            uint256 maxDepositAmount,
            uint256 lastTimeOwnerClaimed,
            uint256 rps,
            uint256 tau,
            uint256 status
        );
}
