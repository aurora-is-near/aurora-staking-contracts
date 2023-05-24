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
    uint256 private constant RPS_MULTIPLIER = 1e31;
    // we store all the current streams (old streams)
    // in this state variable. The main goal is to avoid
    // mixing old weighted shares stream calculations and the new ones.
    mapping(uint256 => bool) public oldWeightedShareStreams;

    /// @dev set the old weighted share streams
    /// @notice This function must be called prior upgrading the contract.
    /// And the contract must be paused before initializing it.
    function initializeOldWeightedStreams() public initializer {
        require(paused != 0, "E16"); // REQUIRE_PAUSE
        for (uint256 i = 1; i < streams.length; i++) {
            oldWeightedShareStreams[i] = true;
        }
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
