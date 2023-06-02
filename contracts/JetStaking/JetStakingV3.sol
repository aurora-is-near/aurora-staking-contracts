// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./JetStakingV2.sol";

/**
 * @title JetStakingV3
 * @author Aurora Team
 *
 * @dev Implementation of Jet staking contract
 *
 *      This contract implements the staking mechanics for AURORA ERC20 token.
 *      A user can stake any amount of AURORA tokens, and get rewarded in both
 *      AURORA and other stream tokens based on the rewards schedules.
 *      Stream rewards can be claimed any time however AURORA can't be claimed
 *      unless the user unstakes his full/partial amount of shares.
 *
 *      This contract is AdminControlled which has a tremendous power. However
 *      hopfully it be governed by a community wallet.
 */
contract JetStakingV3 is JetStakingV2 {
    // RPS_MULTIPLIER = Aurora_max_supply x weight(1000) * 10 (large enough to always release rewards) =
    // 10**9 * 10**18 * 10**3 * 10= 10**31
    uint256 public constant RPS_MULTIPLIER = 1e31;
    // we store all the current streams (old streams)
    // in this state variable. The main goal is to avoid
    // mixing old weighted shares stream calculations and the new ones.
    mapping(uint256 => bool) public oldWeightedShareStreams;

    /// @dev set the old weighted share streams
    /// @notice This function must be called prior upgrading the contract.
    /// And the contract must be paused before initializing it.
    function initializeOldWeightedStreams()
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(paused != 0, "E16"); // REQUIRE_PAUSE
        for (uint256 i = 1; i < streams.length; i++) {
            oldWeightedShareStreams[i] = true;
        }
    }

    /// @dev calculates and gets the latest reward per share (RPS) for a stream
    /// @param streamId stream index
    /// @return streams[streamId].rps + scheduled reward up till now
    function getLatestRewardPerShare(uint256 streamId)
        public
        view
        override
        returns (uint256)
    {
        require(streamId != 0, "E29"); // AURORA_REWARDS_COMPOUND
        uint256 totalShares = oldWeightedShareStreams[streamId]
            ? totalStreamShares
            : totalAuroraShares;
        require(totalShares != 0, "E30"); // ZERO_STREAM_SHARES
        return
            streams[streamId].rps +
            (getRewardsAmount(streamId, touchedAt) * RPS_MULTIPLIER) /
            totalShares;
    }

    /// @dev gets the user's stream claimable amount
    /// @param streamId stream index
    /// @return (latesRPS - user.rpsDuringLastClaim) * user.shares
    function getStreamClaimableAmount(uint256 streamId, address account)
        external
        view
        override
        returns (uint256)
    {
        uint256 latestRps = getLatestRewardPerShare(streamId);
        User storage userAccount = users[account];
        uint256 userRps = userAccount.rpsDuringLastClaim[streamId];
        uint256 userShares = oldWeightedShareStreams[streamId]
            ? userAccount.streamShares
            : userAccount.auroraShares;
        return ((latestRps - userRps) * userShares) / RPS_MULTIPLIER;
    }

    /// @dev gets a user stream shares
    /// @param streamId stream index
    /// @param account the user address
    /// @return user stream shares
    function getAmountOfShares(uint256 streamId, address account)
        external
        view
        override
        returns (uint256)
    {
        uint256 userShares = (oldWeightedShareStreams[streamId] &&
            streamId != 0)
            ? users[account].streamShares
            : users[account].auroraShares;
        return userShares;
    }

    /// @dev calculate the total amount of the released tokens within a period (start & end)
    /// @param streamId the stream index
    /// @param start is the start timestamp within the schedule
    /// @param end is the end timestamp (e.g block.timestamp .. now)
    /// @return amount of the released tokens for that period
    function rewardsSchedule(
        uint256 streamId,
        uint256 start,
        uint256 end
    ) public view override returns (uint256) {
        Schedule memory schedule = streams[streamId].schedule;
        uint256 startIndex;
        uint256 endIndex;
        (startIndex, endIndex) = startEndScheduleIndex(streamId, start, end);
        uint256 rewardScheduledAmount = 0;
        uint256 reward = 0;
        if (startIndex == endIndex) {
            // start and end are within the same schedule period
            reward =
                schedule.reward[startIndex] -
                schedule.reward[startIndex + 1];
            rewardScheduledAmount =
                (reward * (end - start)) /
                (schedule.time[startIndex + 1] - schedule.time[startIndex]);
        } else {
            // start and end are not within the same schedule period
            // Reward during the startIndex period
            reward =
                schedule.reward[startIndex] -
                schedule.reward[startIndex + 1];
            rewardScheduledAmount =
                (reward * (schedule.time[startIndex + 1] - start)) /
                (schedule.time[startIndex + 1] - schedule.time[startIndex]);
            // Reward during the period from startIndex + 1  to endIndex - 1
            rewardScheduledAmount +=
                schedule.reward[startIndex + 1] -
                schedule.reward[endIndex];
            // Reward during the endIndex period
            reward = schedule.reward[endIndex] - schedule.reward[endIndex + 1];
            rewardScheduledAmount +=
                (reward * (end - schedule.time[endIndex])) /
                (schedule.time[endIndex + 1] - schedule.time[endIndex]);
        }
        return rewardScheduledAmount;
    }

    /// @dev allocate the collected reward to the pending tokens
    /// Rewards will become withdrawable after the release time.
    /// @param account is the staker address
    /// @param streamId the stream index
    function _moveRewardsToPending(address account, uint256 streamId)
        internal
        override
    {
        require(streamId != 0, "E36"); // AURORA_REWARDS_COMPOUND
        require(streams[streamId].status == StreamStatus.ACTIVE, "E37"); // INACTIVE_OR_PROPOSED_STREAM
        User storage userAccount = users[account];
        uint256 shares = oldWeightedShareStreams[streamId]
            ? userAccount.streamShares
            : userAccount.auroraShares;
        require(userAccount.auroraShares != 0, "E38"); // USER_DOES_NOT_HAVE_ACTUAL_STAKE
        uint256 reward = ((streams[streamId].rps -
            userAccount.rpsDuringLastClaim[streamId]) * shares) /
            RPS_MULTIPLIER;
        if (reward == 0) return; // All rewards claimed or stream schedule didn't start
        userAccount.pendings[streamId] += reward;
        userAccount.rpsDuringLastClaim[streamId] = streams[streamId].rps;
        userAccount.releaseTime[streamId] =
            block.timestamp +
            streams[streamId].tau;
        // If the stream is blacklisted, remaining unclaimed rewards will be transfered out.
        streams[streamId].rewardClaimedAmount += reward;
        emit Pending(streamId, account, userAccount.pendings[streamId]);
    }
}
