// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "./Setup.sol";

/**
 * @title JetStakingV1 foundry fuzzing tests
 * @author Lance Henderson
 *
 * @dev Fuzzing test suite for JetStakingV1 written in solidity using Foundry
 * 
 *      FuzzingTests implements a testing technique known  as "fuzzing". This technique 
 *      involves testing a specific scenario with a wide array of test values, with the 
 *      goal of finding values which create unexepcted behaviour in the system.
 *    
 *      A detailed description of  what each test does is provided in  the space  above 
 *      the test itself.
 */

contract FuzzingTests is Setup {

    /*/////////////////////////////////////////////////////////////
                    STAKE / UNSTAKE (PARAM: AMOUNT)
    /////////////////////////////////////////////////////////////*/

    /**
     * @dev Stake and immediately unstake from the jetStaking contract. No reward 
     *      tokens nor aurora tokens should accrue. This is checked in the assert.
     *
     * @param x Amount of aurora tokens to stake
     */
    function testStakeAndWithdrawInTheSameBlock(uint256 x) public {
        uint256 balanceBefore = aurora.balanceOf(address(this));
        vm.assume(x > 0 && x < balanceBefore);
        aurora.approve(address(jetStaking), x);
        jetStaking.stake(x);
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(balanceBefore == aurora.balanceOf(address(this)));
    }

    /**
     * @dev Stake and unstake after waiting 1 week from the jetStaking contract. Due
     *      to the one week waiting time rewards should have accrued.
     *
     * @param x Amount of aurora tokens to stake
     */
    function testStakeWaitAndWithdraw(uint256 x) public {
        uint256 balanceBefore = aurora.balanceOf(address(this));
        vm.assume(x > 0 && x < balanceBefore);
        aurora.approve(address(jetStaking), x);
        jetStaking.stake(x);
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(balanceBefore < aurora.balanceOf(address(this)));
    }

    /**
     * @dev Stake and unstake after waiting 1 week from the jetStaking contract. Batch
     *      withdraw allows withdraw several stream tokens in one transaction. Here we
     *      are testing the withdrawal of two streams (0 & 1), and making sure our balance
     *      of both tokens has increased since the time of staking.
     *
     * @param x Amount of aurora tokens to stake
     */
    function testStakeAndBatchWithdraw(uint256 x) public {
        uint256 balanceBefore = aurora.balanceOf(address(this));
        vm.assume(x > 0 && x < balanceBefore);
        aurora.approve(address(jetStaking), x);
        jetStaking.stake(x);
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        uint256[] memory streamIds = new uint256[](2);
        streamIds[0] = 0;
        streamIds[1] = 1;
        jetStaking.batchWithdraw(streamIds);
        assert(balanceBefore < aurora.balanceOf(address(this)));
    }

    /*/////////////////////////////////////////////////////////////
                    STAKE / UNSTAKE (PARAM: TIME)
    /////////////////////////////////////////////////////////////*/

    /**
     * @dev Stake and unstake after waiting x time from the jetStaking contract. Due
     *      to the waiting time rewards should have accrued.
     *
     * @param x Number of seconds to wait before unstaking
     */
    function testStakeWaitAndWithdraw2(uint256 x) public {
        // @dev 50 seconds is high enough for rewards to have accrued
        vm.assume(x > 50);
        uint256 amount = 100 ether;
        vm.assume(x > 0 && x < 31536000); // seconds in 1 years
        uint256 balanceBefore = aurora.balanceOf(address(this));
        aurora.approve(address(jetStaking), amount);
        jetStaking.stake(amount);
        vm.warp(block.timestamp + x);
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(balanceBefore < aurora.balanceOf(address(this)));
        
    }

    /**
     * @dev Stake and unstake after waiting x time from the jetStaking contract. Batch
     *      withdraw allows withdraw several stream tokens in one transaction. Here we
     *      are testing the withdrawal of two streams (0 & 1), and making sure our balance
     *      of both tokens has increased since the time of staking.
     *
     * @param x Number of seconds to wait before unstaking
     */
    function testStakeAndBatchWithdraw2(uint256 x) public {
        uint256 amount = 100 ether;
        vm.assume(x > 0 && x < 31536000); // seconds in 1 years
        uint256 balanceBefore = aurora.balanceOf(address(this));
        aurora.approve(address(jetStaking), amount);
        jetStaking.stake(amount);
        vm.warp(block.timestamp + x);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        uint256[] memory streamIds = new uint256[](2);
        streamIds[0] = 0;
        streamIds[1] = 1;
        jetStaking.batchWithdraw(streamIds);
        if(x > 50) {
             assert(balanceBefore < aurora.balanceOf(address(this)));
        }
    }

    /*/////////////////////////////////////////////////////////////
                    STAKE / UNSTAKE (PARAM: ADDRESS)
    /////////////////////////////////////////////////////////////*/

    /**
     * @dev Stake and immediately unstake from the jetStaking contract. No reward 
     *      tokens nor aurora tokens should accrue. This is checked in the assert.
     *
     * @param x Address that will stake aurora tokens
     */
    function testStakeAndWithdraw3(address x) public {
        uint256 amount = 100 ether;
        vm.assume(x != address(0) && x != address(treasury));
        stakeFor(x, amount);
        vm.startPrank(x);
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(amount == aurora.balanceOf(x));
    }

    /**
     * @dev Stake and unstake after waiting 1 week from the jetStaking contract. Due
     *      to the one week waiting time rewards should have accrued.
     *
     * @param x Address that will stake aurora tokens
     */
    function testStakeWaitAndWithdraw3(address x) public {
        uint256 amount = 100 ether;
        vm.assume(x != address(0) && x != address(treasury));
        stakeFor(x, amount);
        vm.startPrank(x);
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(amount < aurora.balanceOf(x));
    }

    /**
     * @dev Stake and unstake after waiting 1 week from the jetStaking contract. Batch
     *      withdraw allows withdraw several stream tokens in one transaction. Here we
     *      are testing the withdrawal of two streams (0 & 1), and making sure our balance
     *      of both tokens has increased since the time of staking.
     *
     * @param x Address that will stake aurora tokens
     */
    function testStakeAndBatchWithdraw3(address x) public {
        uint256 amount = 100 ether;
        vm.assume(x != address(0) && x != address(treasury));
        stakeFor(x, amount);
        vm.startPrank(x);
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        uint256[] memory streamId = new uint256[](2);
        streamId[0] = 0;
        streamId[1] = 1;
        jetStaking.batchWithdraw(streamId);
        assert(amount < aurora.balanceOf(x));
    }

    /*/////////////////////////////////////////////////////////////
                STAKE / UNSTAKE (PARAM: AMOUNT+TIME+ADDRESS)
    /////////////////////////////////////////////////////////////*/

    /**
     * @dev Stake and immediately unstake from the jetStaking contract. No reward 
     *      tokens nor aurora tokens should accrue. This is checked in the assert.
     *
     * @param x Amount of aurora tokens to stake
     * @param y Number of seconds to wait before unstaking
     * @param z Address that will stake aurora tokens
     */
    function testStakeAndWithdraw4(uint256 x, uint256 y, address z) public {
        vm.assume(x > 0 && x < maxSupply);
        vm.assume(y > 0 && y < 315360000); // seconds in 10 years
        vm.assume(z != address(0) && z != address(treasury));
        stakeFor(z, x);
        vm.startPrank(z);
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(x == aurora.balanceOf(z));
    }

    /**
     * @dev Stake and unstake after waiting y time from the jetStaking contract. Due
     *      to the waiting time rewards should have accrued.
     *
     * @param x Amount of aurora tokens to stake
     * @param y Number of seconds to wait before unstaking
     * @param z Address that will stake aurora tokens
     */
    function testStakeWaitAndWithdraw4(uint256 x, uint256 y, address z) public {
        vm.assume(x > 0 && x < maxSupply);
        vm.assume(y > 0 && y < 315360000); // seconds in 10 years
        vm.assume(z != address(0) && z != address(treasury));
        uint256 balanceBefore = aurora.balanceOf(z);
        stakeFor(z, x);
        vm.startPrank(z);
        vm.warp(block.timestamp + y);
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(balanceBefore < aurora.balanceOf(z));
    }

    /*/////////////////////////////////////////////////////////////
                    ROLES COUNTERFACTUAL TESTING
    /////////////////////////////////////////////////////////////*/

    /**
     * @dev Testing airdrop role - Testing airdrop role - this role gives an address the ability to stake on 
     *      behalf of another address
     *
     * @param x address that will call restricted function
     */
    function testFailAirdropRole(address x) public {
        vm.assume(x != address(this));
        address[] memory accounts = new address[](2);
        accounts[0] = user1;
        accounts[1] = user2;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10 ether;
        amounts[1] = 10 ether;
        uint256 batchAmount = 20 ether;
        deal(address(aurora), address(this), batchAmount);
        vm.startPrank(x);
        aurora.approve(address(jetStaking), batchAmount);
        jetStaking.stakeOnBehalfOfOtherUsers(accounts, amounts, batchAmount);
        assert(jetStaking.getUserTotalDeposit(user1) + jetStaking.getUserTotalDeposit(user2) == 20 ether);
    }

    /**
     * @dev Testing stream manager role - this role gives an address the ability to propose a new
     *      reward token stream
     *
     * @param x address that will call restricted function
     */
    function testFailStreamManagerRole(address x) public {
        vm.assume(x != address(this));
        address newToken = address(8);
        uint256[] memory scheduleTimes = new uint256[](2);
        scheduleTimes[0] = block.timestamp + 1000;
        scheduleTimes[1] = block.timestamp + 2000;
        uint256[] memory scheduleRewards = new uint256[](2);
        scheduleRewards[0] = 1000;
        scheduleRewards[1] = 0;
        vm.startPrank(x);
        jetStaking.proposeStream(
            user1, 
            newToken, 
            100, 
            1000, 
            100, 
            scheduleTimes, 
            scheduleRewards, 
            1 days
            );
    }

    /**
     * @dev Testing claim manager role - this role gives an address the ability to claim reward
     *      tokens on behalf of another address
     *
     * @param x address that will call restricted function
     */
    function testFailClaimRole(address x) public {
        vm.assume(x != address(this));
        stakeFor(user1, 10 ether);
        vm.warp(block.timestamp + 1 weeks);
        vm.startPrank(x);
        jetStaking.claimAllOnBehalfOfAnotherUser(user1);
    }

    /**
     * @dev Testing adming manager role - this role gives an address the ability to pause the contract
     *      and updating the treasury address
     *
     * @param x address that will call restricted function
     */
    function testFailUpdateTreasury(address x) public {
        vm.assume(x != address(this));
        vm.startPrank(x);
        jetStaking.adminPause(1);
        jetStaking.updateTreasury(address(10));
    }
}