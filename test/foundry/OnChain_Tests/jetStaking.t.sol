// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "contracts/JetStakingV1.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import "forge-std/Test.sol";

/// @title JetStaking Foundry Tests
/// @author Lance Henderson
/// 
/// @notice The following contract provides a suite of tests for JetStaking.sol
/// contract. Further detail of what each tests does is provided above the actual
/// test code. The tests must be run on a fork of aurora mainnet. given the use of 
/// hardcoded values. To run the tests run 'forge test --rpc-url https://mainnet.aurora.dev/'
/// In the future the code can be editted to not use hardcoded values.

contract jetStakingTest is Test {
    // JetStaking proxy contract address (ie. the one users interact with)
    JetStakingV1 jetStaking = JetStakingV1(0xccc2b1aD21666A5847A804a73a41F904C4a4A0Ec);
    // JetStaking implementation contract address (ie. the one containing the logic)
    JetStakingV1 implementation = JetStakingV1(0x852F139Dd31D2cdc669470880700037Cb3790934);
    // AirdropRole has the power to stake on behalf of another user
    address airdropRole = address(0x88e21E0CeE6FbdAa1E7BBd2f7e25554144CDCE42); 
    // ClaimRole has the power to claim rewards on behalf of another user
    address claimRole = address(0x88e21E0CeE6FbdAa1E7BBd2f7e25554144CDCE42);
    // PauseRole has the power to pause the contract
    address pauseRole = address(0x88e21E0CeE6FbdAa1E7BBd2f7e25554144CDCE42);
    // StreamManagerRole has the power to propose a stream
    address streamManagerRole = address(0x61c8f8f192C345424a0836d722892231CE7a47b8);
    // DefaultAdminRole has the power to update the treasury address
    address defaultAdminRole = address(0x88e21E0CeE6FbdAa1E7BBd2f7e25554144CDCE42);
    // Aurora token
    IERC20 aurora = IERC20(0x8BEc47865aDe3B172A928df8f990Bc7f2A3b9f79);
    // Reward tokens - will be initialized in the constructor by pulling them from jetStaking
    address[] rewardTokens;
    // Accounts - useful for setting up potential scenarios between several users
    address user1 = address(1);
    address user2 = address(2);
    address user3 = address(3);
    address user4 = address(4);

    // Code below is executed prior to every test
    function setUp() public {
        // 'Deal' - cheatcode provided by Foundry to set the balance of a token of a user
        deal(address(aurora), address(this), 10000 ether); 
        uint256 length = jetStaking.getStreamsCount();
        // Loop to pull tokens from jetStaking, and push into our array of reward tokens
        for(uint256 i; i < length; ++i) {
            (,address token,,,,,,,,,) = jetStaking.getStream(i);
            rewardTokens.push(token);
        }
    } 

    /* ===================================
            TESTING BASIC FUNCTIONALITY
    ==================================== */

    // @notice Steps in the following test:
    // - Stakes 1000 ether
    // - Waits 1 week
    // - Moves rewards to pending
    // - Waits 2 days + 1 second - Waiting is achieved by warping block.timestamp using vm.warp
    // - Unstakes aurora
    // - Check that balance withdrawn is greater than deposited
    function testStakeAndWithdraw() public {
        aurora.approve(address(jetStaking), 1000 ether);
        jetStaking.stake(1000 ether);
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(aurora.balanceOf(address(this)) > 1000 ether);
        // logUserBalances(address(this)); // Optional to check balances manually
    }

    // @notice Steps in the following test:
    // - Stakes 1000 ether
    // - Waits 1 week
    // - Moves rewards to pending
    // - Waits 2 days + 1 second
    // - Unstakes aurora + stream token 1
    // - Check that balance withdrawn is greater than deposited (of both tokens)
    function testStakeAndBatchWithdraw() public {
        aurora.approve(address(jetStaking), 1000 ether);
        jetStaking.stake(1000 ether);
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        uint256[] memory streamId = new uint256[](2);
        streamId[0] = 0;
        streamId[1] = 1;
        jetStaking.batchWithdraw(streamId);
        assert(aurora.balanceOf(address(this)) > 1000 ether);
        assert(IERC20(rewardTokens[1]).balanceOf(address(this)) > 0);
        // logUserBalances(address(this)); // Should only have balances for stream 0 & 1
    }

    // @notice Steps in the following test:
    // - Setup random scheduleTimes
    // - Setup random scheduleRewards
    // - Attempt to initialize the implementation contract
    // - Expect a revert with the comment below
    function testCannotInitializeImplementation() public {
        uint256[] memory scheduleTimes = new uint256[](1);
        scheduleTimes[0] = 1;
        uint256[] memory scheduleRewards = new uint256[](1);
        scheduleRewards[0] = 1;
        vm.expectRevert("Initializable: contract is already initialized");
        implementation.initialize(
            address(aurora), 
            address(this), 
            scheduleTimes, 
            scheduleRewards, 
            5, 
            0, 
            address(this), 
            100, 
            50
            );
    }

    /* ===================================
                EDGE CASES
    ==================================== */

    // @notice Steps in the following test:
    // - Stake 1 aurora
    // - Immediately withdraw 1 aurora
    // - Check that balance after is greater than before (due to rounding)
    function testStake1Aurora() public {
        // uint256 sharesPrice = jetStaking.getTotalAmountOfStakedAurora() * 1000 / jetStaking.totalAuroraShares();
        aurora.approve(address(jetStaking), 1);
        jetStaking.stake(1);
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(aurora.balanceOf(address(this)) > 1);
    }

    // @notice Steps in the following test:
    // - Deal 10000 aurora tokens to user1
    // - Impersonate user1 using vm.startPrank cheatcode
    // - Rather than staking all 10000 tokens at once, we stake iteratively in single quantities
    // - Immediately unstake
    // - Assert that balance after is greater than 10000
    // - Output profit generate (balanceAfter - balanceBefore)
    function testGameSystem() public {
        deal(address(aurora), user1, 10000);
        // Useful Foundry cheatcode to impersonate an address (user1)
        vm.startPrank(user1);
        uint256 balanceBefore = aurora.balanceOf(user1);
        aurora.approve(address(jetStaking), 10000);
        for(uint256 i; i < 10000; i++) {
            jetStaking.stake(1);
        }
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        uint256 balanceAfter = aurora.balanceOf(user1);
        emit log_named_uint("Aurora profit = ", balanceAfter - balanceBefore);
    }

    // @notice Steps in the following test:
    // - Stake 10 aurora for user1 using the stakeFor function
    // - Stake 10 aurora for user2
    // - Wait 10 weeks
    // - Move rewards to pending and unstake for both users
    // - Make sure that the order in which users unstake doesnt affect their rewards
    function testWithdrawalOrder() public {
        stakeFor(user1, 10 ether);
        stakeFor(user2, 10 ether);
        vm.warp(block.timestamp + 10 weeks);
        vm.startPrank(user1);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.stopPrank();
        vm.startPrank(user2);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days + 1);
        vm.prank(user1);
        jetStaking.withdrawAll();
        vm.prank(user2);
        jetStaking.withdrawAll();
        assert(aurora.balanceOf(user1) == aurora.balanceOf(user2));
        logUserBalances(user1);
        logUserBalances(user2);
    }

    // @notice Steps in the following test:
    // - Stake 2 aurora on behalf of user2
    // - Wait 10 weeks (user2 should accumulate rewards)
    // - Whale (user3) stakes 10^12 auroras
    // - User2 unstakes and withdraws
    // - User2 should not be robbed of rewards by whale sniper
    function testWhaleSniper() public { 
        stakeFor(user2, 10 ether);
        vm.warp(block.timestamp + 10 weeks);
        stakeFor(user3, 10**30); // No matter how much is staked rewards arent diluted
        vm.startPrank(user2);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(aurora.balanceOf(user2) > 0);
        assert(IERC20(rewardTokens[1]).balanceOf(user2) > 0);
        assert(IERC20(rewardTokens[2]).balanceOf(user2) > 0);
        assert(IERC20(rewardTokens[3]).balanceOf(user2) > 0);
        logUserBalances(user2); 
    }

    // @notice Steps in the following test:
    // - Stake 2 aurora on behalf of user1
    // - Move timestamp 1 week back
    // - Try moving rewards to pending
    // - Expect a revert with the message below
    function testTimeTravel() public {
        stakeFor(user1, 10 ether);
        vm.warp(block.timestamp - 1 weeks);
        vm.startPrank(user1);
        vm.expectRevert("INVALID_LAST_UPDATE");
        jetStaking.moveAllRewardsToPending();
    }


    /* ===================================
             JetStaking view
    ==================================== */

    // @notice This function aims at getting general data from the staking contract:
    // - Number of active streams
    // - Treasury balance of each stream
    // - How much aurora the owner of each stream has available to claim
    // - RPS (rewards per share)
    // - Latest rewards per share
    // - Reward Amount
    function testProbeContractStatus() public {
        emit log("General info");
        emit log_named_uint("Stream count", jetStaking.getStreamsCount());
        for(uint256 i; i < rewardTokens.length; i++) {
            emit log_named_uint("Stream", i);
            emit log_named_uint("Treasury balance", jetStaking.getTreasuryBalance(rewardTokens[i]) / 1 ether);
            if(i > 0) {
                emit log_named_uint("Stream ownerClaimable amount", jetStaking.getStreamOwnerClaimableAmount(i) / 1 ether);
                emit log_named_uint("Rewards per share (RPS)", jetStaking.getRewardPerShare(i) / 1 ether);
                emit log_named_uint("Latest reward per share (RPS)", jetStaking.getLatestRewardPerShare(i) / 1 ether);
            }  
            emit log_named_uint("Reward amount", jetStaking.getRewardsAmount(i, block.timestamp - 1) / 1 ether);
        }
    }

    /* ===================================
                    HELPER
    ==================================== */

    // @notice Helper function to log user balances of each stream token
    // @param user Address of user to log balances of
    function logUserBalances(address user) public {
        emit log_named_address("Balances for", user);
        uint256 length = rewardTokens.length;
        for(uint256 i; i < length; ++i) {
            emit log_named_uint("Stream balance: ", IERC20(rewardTokens[i]).balanceOf(user));
        }
    } 

    // @notice Helper function to stake aurora tokens 
    // @param account Address of account to stake for
    // @param amount Amount of aurora to stake
    function stakeFor(address account, uint256 amount) public {
        deal(address(aurora), account, amount);
        vm.startPrank(account);
        aurora.approve(address(jetStaking), amount);
        jetStaking.stake(amount);
        vm.stopPrank();
    }
}
