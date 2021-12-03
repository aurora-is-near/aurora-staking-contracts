
// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

interface IStaking {
  function pause() external;
  function unpause() external;

  struct Deposit {
    address user;
    uint256 amount;
    uint256 startSeason;
    uint256 endSeason;
    uint256 weight;
  }

  function stake(uint256 amount, uint256 endSeason) external;
  function unstake (uint256 depositId) external;

  function claimVote(uint256 depositId) external;
  function claimRewards(uint256 depositId, address token) external;

  function updateSeasonDuration(uint256 newDuration) external;
  function burn(address user, uint256 amount) external;
}