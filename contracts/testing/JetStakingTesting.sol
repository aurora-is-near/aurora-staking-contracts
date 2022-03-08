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
        total = totalAmountOfStakedAurora;
        total += _schedule(0, startTime, endTime);
        scheduleCalculated = _schedule(0, startTime, endTime) / 1000000000000000000;
        if(totalShares[0] != 0) {
            rewardPerShareAurora = _schedule(0, startTime, endTime) / (totalShares[0]);
        } else {
            rewardPerShareAurora = _schedule(0, startTime, endTime);
        }
    }

    function updateUserCalculation() external {
        _before();
        //_recalculateUnclaimedShares(msg.sender, 0);
        _after();
    }

    function getTotalUserReward() external view returns(uint256 totalReward) {
        totalReward = users[msg.sender].shares[0] * (totalAmountOfStakedAurora / totalShares[0]);
    }

    function calculateReward(address account, uint256 streamId) public view returns(uint256) {
        User storage userAccount = users[account];
        return (totalAmountOfStakedAurora / totalShares[0]) * userAccount.shares[0];
    }
}