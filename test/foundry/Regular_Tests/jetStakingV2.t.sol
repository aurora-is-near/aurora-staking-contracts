// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "../Contracts/F_JetStakingV1.sol";
import "../Contracts/F_Treasury.sol";
import "./Setup.t.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

import "forge-std/Test.sol";

/// @title JetStaking Foundry Tests
/// @author Lance Henderson
/// 
/// @notice The following contract provides a suite of tests for JetStaking.sol
/// contract. Further detail of what each tests does is provided above the actual
/// test code.

contract StakingTestV2 is Test, Setup {
    /* ===================================
            TESTING BASIC FUNCTIONALITY
    ==================================== */

    // @notice Steps in the following test:
    // - Stakes 1000 ether
    // - Immediately moves rewards to pending
    // - Waits 2 days + 1 second - Waiting is achieved by warping block.timestamp using vm.warp
    // - Unstakes aurora
    // - Check that balance withdrawn is equal to deposited
    function testStakeAndWithdraw() public {
        uint256 balanceBefore = aurora.balanceOf(address(this));
        aurora.approve(address(jetStaking), 1000 ether);
        jetStaking.stake(1000 ether);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(balanceBefore == aurora.balanceOf(address(this)));
    }

    // @notice Steps in the following test:
    // - Stakes 1000 ether
    // - Waits 1 week
    // - Moves rewards to pending
    // - Waits 2 days + 1 second - Waiting is achieved by warping block.timestamp using vm.warp
    // - Unstakes aurora
    // - Check that balance withdrawn is greater than deposited
    function testStakeWaitAndWithdraw() public {
        aurora.approve(address(jetStaking), 1000 ether);
        jetStaking.stake(1000 ether);
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(aurora.balanceOf(address(this)) > 1000 ether);
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
    // - Assert that balance after is not greater than 10000
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
        assert(!(balanceAfter > balanceBefore));
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
    }

    
}
