// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "./jetStakingV2.t.sol";

contract FuzzingTests is Setup {

    function testStakeAmount(uint256 x) public {
        vm.assume(x < aurora.balanceOf(address(this)));
        aurora.approve(address(jetStaking), x);
        jetStaking.stake(x);
    }
    
    // Returns: too many global rejects
    // function testStakeExceedBalance(uint256 x) public {
    //     vm.assume(x > aurora.balanceOf(address(this)));
    //     vm.assume(x < aurora.totalSupply());
    //     aurora.approve(address(jetStaking), x);
    //     vm.expectRevert("ERC20: transfer amount exceeds balance");
    //     jetStaking.stake(x);
    // }

    function testStakeAddress(address x) public {
        vm.assume(x != address(0));
        deal(address(aurora), x, 100 ether);
        vm.startPrank(x);
        aurora.approve(address(jetStaking), 100 ether);
        jetStaking.stake(100 ether);
    }

    function testStakeWithdrawTime(uint256 x) public {
        vm.assume(x < 315360000); // seconds in 10 years
        aurora.approve(address(jetStaking), 100 ether);
        jetStaking.stake(100 ether);
        vm.warp(block.timestamp + x);
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
    }

    function testStakeWithdrawAmount(uint256 x) public {
        vm.assume(x < 100 ether); 
        vm.assume(x != 0);
        aurora.approve(address(jetStaking), 100 ether);
        jetStaking.stake(100 ether);
        jetStaking.unstake(x);
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
    }

    function testProfitSeeker(uint256 x) public {
        uint256 minProfitMargin = 10**17;
        uint256 balanceBefore = aurora.balanceOf(address(this));
        vm.assume(x < balanceBefore);
        vm.assume(x > 0);
        aurora.approve(address(jetStaking), x);
        jetStaking.stake(x);
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        uint256 balanceAfter = aurora.balanceOf(address(this));
        assert(balanceAfter < balanceBefore + minProfitMargin);
    }

    function testUpdateTreasury(address t) public {
        vm.assume(t != address(0));
        jetStaking.adminPause(1);
        jetStaking.updateTreasury(t);
    }

    function testStreamManagerRole() public {
        deal(address(rewardToken1), address(this), 100 ether);
        rewardToken1.approve(address(jetStaking), 100 ether);
        aurora.approve(address(jetStaking), 1000 ether);
        uint256[] memory scheduleTimes = new uint256[](2);
        scheduleTimes[0] = block.timestamp + 1000;
        scheduleTimes[1] = block.timestamp + 2000;
        uint256[] memory scheduleRewards = new uint256[](2);
        scheduleRewards[0] = 1000;
        scheduleRewards[1] = 0;
        jetStaking.proposeStream(
            user1, 
            address(rewardToken1), 
            100, 
            1000, 
            100, 
            scheduleTimes, 
            scheduleRewards, 
            1 days
            );
    }



}