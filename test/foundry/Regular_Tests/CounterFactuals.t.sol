// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "./Setup.sol";

/**
 * @title JetStakingV1 foundry counterfactual tests
 * @author Lance Henderson
 *
 * @dev Tests suite for JetStakingV1 written in solidity using Foundry
 * 
 *      CounterFactuals is a suite of tests that checks that counterfactuals
 *      don't pass. In other words, a user without an admin role shouldn't
 *      have access to restricted functions, a user shouldn't be able to unstake
 *      another user's tokens, etc.
 */

contract StakingTestV2 is Setup {

    /*/////////////////////////////////////////////////////////////
                    STAKE / UNSTAKE COUNTERFACTUALS
    /////////////////////////////////////////////////////////////*/

    /**
     * @dev Stake aurora and immediately attempt to unstake more tokens than 
     *      were staked. 
     */
    function testStakeAndWithdraw() public {
        uint256 amount = 100 ether;
        aurora.approve(address(jetStaking), amount);
        jetStaking.stake(amount);
        vm.expectRevert("NOT_ENOUGH_STAKE_BALANCE");
        jetStaking.unstake(amount + 1);
    }

    /**
     * @dev Stakes 10**19 aurora tokens for user1 and user2. waits 10 weeks, and 
     *      unstakes all tokens for both users. This test checks that both users
     *      will end up with the same amount of aurora (ie. withdrawal order has
     *      no effect).   
     */
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

    /**
     * @dev Stakes 10**19 aurora tokens for user2, waits 10 weeks, then stakes MUCH
     *      more aurora on behalf of user3 (10**30). Then unstakes for user1. This 
     *      test ensures that a "whale sniper" cannot affect the rewards of other 
     *      people 
     */
    function testWhaleSniper() public { 
        stakeFor(user2, 10 ether);
        vm.warp(block.timestamp + 10 weeks);
        stakeFor(user3, 10**30); // No matter how much is staked rewards arent diluted
        vm.startPrank(user2);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(aurora.balanceOf(user2) > 10 ether);
    }    

     /**
     * @dev Stakes 100 aurora on behalf of address(this). Then stakes 1 aurora on behalf 
     *      of user1. Then immediately unstakes and checks that the balance of user1 is
     *      greater than 1 (should technically be 1). This is because as the share price 
     *      goes up, a user can pocket the difference between the share price and 1 aurora.
     *      However, given we are speaking about 0.(17 zeroes later)1 aurora tokens, the 
     *      value is hugely outweighed by gas cost.  
     */
    function testStake1Aurora() public {
        uint256 amount = 100 ether;
        aurora.approve(address(jetStaking), amount);
        jetStaking.stake(amount);
        vm.warp(block.timestamp + 10 weeks);
        uint256 balanceBefore = aurora.balanceOf(user1);
        stakeFor(user1, 1);
        vm.startPrank(user1);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        assert(aurora.balanceOf(user1) > balanceBefore);
    }

    /*/////////////////////////////////////////////////////////////
                        TESTING CORRECT ROLES
    /////////////////////////////////////////////////////////////*/

     /**
     * @dev Testing airdrop role - this role gives an address the ability to stake on 
     *      behalf of another address
     */
    function testAirdropRole() public {
        address[] memory accounts = new address[](2);
        accounts[0] = user1;
        accounts[1] = user2;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10 ether;
        amounts[1] = 10 ether;
        uint256 batchAmount = 20 ether;
        deal(address(aurora), address(this), batchAmount);
        aurora.approve(address(jetStaking), batchAmount);
        jetStaking.stakeOnBehalfOfOtherUsers(accounts, amounts, batchAmount);
        assert(jetStaking.getUserTotalDeposit(user1) + jetStaking.getUserTotalDeposit(user2) == amounts[0] + amounts[1]);
    }

     /**
     * @dev Testing stream manager role - this role gives an address the ability to propose a new
     *      reward token stream
     */
    function testStreamManagerRole() public {
        address newToken = address(8);
        uint256[] memory scheduleTimes = new uint256[](2);
        scheduleTimes[0] = block.timestamp + 1000;
        scheduleTimes[1] = block.timestamp + 2000;
        uint256[] memory scheduleRewards = new uint256[](2);
        scheduleRewards[0] = 1000;
        scheduleRewards[1] = 0;
        vm.expectRevert("INVALID_SUPPORTED_TOKEN_ADDRESS"); 
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
     */
    function testClaimRole() public {
        stakeFor(user1, 10 ether);
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.claimAllOnBehalfOfAnotherUser(user1);
        vm.warp(block.timestamp + 1 weeks);
        vm.stopPrank();
        jetStaking.claimAllOnBehalfOfAnotherUser(user1);
    }

    /**
     * @dev Testing adming manager role - this role gives an address the ability to pause the contract
     *      and updating the treasury address
     */
    function testUpdateTreasury() public {
        jetStaking.adminPause(1);
        jetStaking.updateTreasury(address(10));
        vm.stopPrank();
        jetStaking.updateTreasury(address(11));
    }
}
