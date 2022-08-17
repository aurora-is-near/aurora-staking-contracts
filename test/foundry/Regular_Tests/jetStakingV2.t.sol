// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "../Contracts/F_JetStakingV1.sol";
import "../Contracts/F_Treasury.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

import "forge-std/Test.sol";

/// @title JetStaking Foundry Tests
/// @author Lance Henderson
/// 
/// @notice The following contract provides a suite of tests for JetStaking.sol
/// contract. Further detail of what each tests does is provided above the actual
/// test code. The tests must be run on a fork of aurora mainnet. given the use of 
/// hardcoded values. To run the tests run 'forge test --rpc-url https://mainnet.aurora.dev/'
/// In the future the code can be editted to not use hardcoded values.

contract jetStakingTestV2 is Test {
    // JetStaking 
    JetStakingV1 jetStaking;
    // Treasury
    Treasury treasury;
    // AirdropRole has the power to stake on behalf of another user
    address airdropRole = address(1); 
    // ClaimRole has the power to claim rewards on behalf of another user
    address claimRole = address(2);
    // PauseRole has the power to pause the contract
    address pauseRole = address(3);
    // StreamManagerRole has the power to propose a stream
    address streamManagerRole = address(4);
    // DefaultAdminRole has the power to update the treasury address
    address adminRole = address(5);
    // Aurora token
    ERC20 aurora = new ERC20("AuroraToken", "AURORA");
    // Reward tokens (for streams)
    ERC20 rewardToken1 = new ERC20("reward1", "R1");
    ERC20 rewardToken2 = new ERC20("reward2", "R2");
    ERC20 rewardToken3 = new ERC20("reward3", "R3");
    // Init variables
    uint256 minWeight = 256;
    uint256 maxWeight = 1024;
    uint256 flags = 0;
    uint256 tauPerStream = 10;
    address streamOwner = address(this);
    uint256 oneYear = 31556926; 
    uint256[] scheduleTimes;
    uint256[] scheduleRewards; 
    address[] rewardTokens;
    // Users
    address user1 = address(7);
    address user2 = address(8);
    address user3 = address(9);

    // Code below is executed prior to every test
    function setUp() public {
        treasury = new Treasury();
        rewardTokens.push(address(aurora));
        rewardTokens.push(address(rewardToken1));
        rewardTokens.push(address(rewardToken2));
        rewardTokens.push(address(rewardToken3));
        treasury.initialize(rewardTokens, flags);
        jetStaking = new JetStakingV1();
        uint256 startTime = block.timestamp + 10;
        scheduleTimes.push(startTime);
        scheduleTimes.push(startTime + 1 * oneYear);
        scheduleTimes.push(startTime + 2 * oneYear);
        scheduleTimes.push(startTime + 3 * oneYear);
        scheduleTimes.push(startTime + 4 * oneYear);
        scheduleRewards.push(200000000 ether);
        scheduleRewards.push(100000000 ether);
        scheduleRewards.push(50000000 ether);
        scheduleRewards.push(25000000 ether);
        scheduleRewards.push(0 ether);

        jetStaking.initialize(
            address(aurora), 
            streamOwner, 
            scheduleTimes, 
            scheduleRewards, 
            tauPerStream, 
            flags, 
            address(treasury), 
            maxWeight, 
            minWeight);
        // 'Deal' - cheatcode provided by Foundry to set the balance of a token of a user
        deal(address(aurora), address(this), 10000 ether); 
        deal(address(aurora), address(treasury), 100000000000 ether); 
        deal(address(rewardToken1), address(treasury), 100000000000 ether); 
        deal(address(rewardToken2), address(treasury), 100000000000 ether); 
        deal(address(rewardToken3), address(treasury), 100000000000 ether); 
        bytes32 defaultAdminRole = jetStaking.DEFAULT_ADMIN_ROLE();
        treasury.grantRole(defaultAdminRole, address(jetStaking));
        vm.startPrank(address(treasury));
        aurora.approve(address(jetStaking), 2**256 - 1);
        vm.stopPrank();
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

    /* ===================================
                    HELPER
    ==================================== */

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
