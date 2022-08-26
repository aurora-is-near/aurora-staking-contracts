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
/// test code.

contract Setup is Test {
    // JetStaking 
    JetStakingV1 jetStaking;
    // Treasury
    Treasury treasury;
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
        bytes32 claimRole = jetStaking.CLAIM_ROLE();
        bytes32 airdropRole = jetStaking.AIRDROP_ROLE();
        bytes32 pauseRole = jetStaking.PAUSE_ROLE();
        bytes32 streamManagerRole = jetStaking.STREAM_MANAGER_ROLE();
        jetStaking.grantRole(claimRole, address(this));
        jetStaking.grantRole(airdropRole, address(this));
        jetStaking.grantRole(pauseRole, address(this));
        jetStaking.grantRole(streamManagerRole, address(this));

        treasury.grantRole(defaultAdminRole, address(jetStaking));
        vm.startPrank(address(treasury));
        aurora.approve(address(jetStaking), 2**256 - 1);
        vm.stopPrank();
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
