// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
interface IJetStakingV1 {
    // staking
    function stake(uint256 amount) external;
    function unstake (uint256 shares) external;
    function moveRewardsToPending(uint256 streamId) external;
    // vote tokens
    function burn(address user, uint256 amount) external;
    function mint(address user, uint256 amount) external;
    function currentSeason() external view returns(uint256);
}
