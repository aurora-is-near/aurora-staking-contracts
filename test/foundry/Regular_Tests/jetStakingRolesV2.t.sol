// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "./jetStakingV2.t.sol";

contract StakingRolesV2 is Setup {
    // @notice Steps in the following test:
    // - Create an array of account
    // - Create an array of amount (uints)
    // - Deal 20 aurora to airdrop role address
    // - Impersonate airdrop role address
    // - Use airdrop role to stake 10 aurora on behalf of user1 and user2 (10 each)
    // - Assert that the recorded deposits of user1 and user2 in jetStaking is 10 aurora
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
        assert(jetStaking.getUserTotalDeposit(user1) + jetStaking.getUserTotalDeposit(user2) == 20 ether);
    }

    // @notice Steps in the following test:
    // - Impersonate streamManager address
    // - Attempt to propose a stream
    // - Should revert given the token is not supported by the treasury
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

    // @notice Steps in the following test:
    // - Stake 10 aurora for user1
    // - Impersonate claimRole address
    // - Claim rewards on behalf of user1
    // - Try claiming using a random address (user2)
    // - Expect the revert message below
    function testClaimRole() public {
        stakeFor(user1, 10 ether);
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.claimAllOnBehalfOfAnotherUser(user1);
        vm.warp(block.timestamp + 1 weeks);
        vm.stopPrank();
        vm.startPrank(user2);
        vm.expectRevert("AccessControl: account 0x0000000000000000000000000000000000000008 is missing role 0xf7db13299c8a9e501861f04c20f69a2444829a36a363cfad4b58864709c75560");
        jetStaking.claimAllOnBehalfOfAnotherUser(user1);
    }

    // @notice Steps in the following test:
    // - Impersonate adminRole address
    // - Pause the contract
    // - Update the Treasury
    // - Attempt the same with a non-admin account
    // - Expect revert
    function testUpdateTreasury() public {
        jetStaking.adminPause(1);
        jetStaking.updateTreasury(address(10));
        vm.stopPrank();
        vm.startPrank(user1);
        vm.expectRevert("AccessControl: account 0x0000000000000000000000000000000000000007 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000");
        jetStaking.updateTreasury(address(10));
    }
}