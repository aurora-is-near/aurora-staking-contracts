// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
import "../JetStakingV1.sol";

contract JetStakingTesting is JetStakingV1 {
    function before(uint256 startTime, uint256 endTime)
        public
        view
        returns (
            uint256 total,
            uint256 rewardPerShareAurora,
            uint256 scheduleCalculated
        )
    {
        total = rewardsSchedule(0, startTime, endTime);
        scheduleCalculated =
            rewardsSchedule(0, startTime, endTime) /
            1000000000000000000;
        if (totalAuroraShares != 0) {
            rewardPerShareAurora = total / (totalAuroraShares);
        } else {
            rewardPerShareAurora = total;
        }
    }

    function updateUserCalculation() external {
        _before();
    }

    function calculateWeightedShares(uint256 shares, uint256 timestamp)
        public
        view
        returns (uint256)
    {
        return _weightedShares(shares, timestamp);
    }

    function tempMoveRewardsToPending(address account, uint256 streamId)
        public
    {
        _moveRewardsToPending(account, streamId);
    }

    function callBeforeTwice() public {
        _before();
        _before();
    }

    function unstakeAllOnBehalfOfOthers(address[] memory accounts) external {
        for (uint256 i = 0; i < accounts.length; i++) {
            _unstakeAllOnBehalfOfAnotherUser(accounts[i]);
        }
    }

    function _unstakeAllOnBehalfOfAnotherUser(address account) internal {
        // this is used for testing purposes.
        // the intension is to check whether the shares calculation is correct
        _before();
        uint256 stakeValue = (totalAmountOfStakedAurora *
            users[account].auroraShares) / totalAuroraShares;
        User storage userAccount = users[account];
        // move rewards to pending
        // remove the shares from everywhere
        totalAuroraShares -= userAccount.auroraShares;
        totalStreamShares -= userAccount.streamShares;
        userAccount.auroraShares = 0;
        userAccount.streamShares = 0;
        // update the total Aurora staked and deposits
        totalAmountOfStakedAurora -= stakeValue;
        userAccount.deposit = 0;
        // move unstaked AURORA to pending.
        userAccount.pendings[0] += stakeValue;
        userAccount.releaseTime[0] = block.timestamp + streams[0].tau;
        emit Pending(0, account, userAccount.pendings[0], block.timestamp);
        emit Unstaked(account, stakeValue, block.timestamp);
    }
}
