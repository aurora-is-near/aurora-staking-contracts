// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
import '../JetStakingV1.sol';

contract JetStakingTesting is JetStakingV1 {
    function before(
        uint256 startTime,
        uint256 endTime
    )
    public
    view
    returns(uint256 total, uint256 rewardPerShareAurora, uint256 scheduleCalculated) {
        total = _schedule(0, startTime, endTime);
        scheduleCalculated = _schedule(0, startTime, endTime) / 1000000000000000000;
        if(totalShares[0] != 0) {
            rewardPerShareAurora = total / (totalShares[0]);
        } else {
            rewardPerShareAurora = total;
        }
    }

    function updateUserCalculation() external {
        _before();
    }

    function getTotalUserReward() external view returns(uint256 totalReward) {
        totalReward = users[msg.sender].shares[0] * (totalAmountOfStakedAurora / totalShares[0]);
    }

    function calculateReward(address account) public view returns(uint256) {
        uint256 userShares = users[account].shares[0];
        return (totalAmountOfStakedAurora * userShares) / totalShares[0];
    }
}