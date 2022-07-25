// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "../src/Treasury.sol";
import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

import "forge-std/Test.sol";

contract TreasuryTest is Test {
    Treasury treasury;
    ERC20 token1 = new ERC20("token1", "token1");
    ERC20 token2 = new ERC20("token2", "token2");
    ERC20 token3 = new ERC20("token3", "token3");
    address[] tokens = new address[](2);
    address admin = address(100);
    address user1 = address(1);
    address user2 = address(2);
    address user3 = address(3);
    

    function setUp() public {
        vm.startPrank(admin);
        treasury = new Treasury();
        tokens[0] = address(token1);
        tokens[1] = address(token2);
        treasury.initialize(tokens, 0);
        deal(address(token1), address(treasury), 1000);
        deal(address(token2), address(treasury), 1000);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////////////////
                                    SENDING TOKENS
    //////////////////////////////////////////////////////////////////////////*/

    function testSendTokens() public {
        vm.startPrank(admin);
        treasury.payRewards(user1, address(token1), 100);
    }

    function testCannotSendUnsupportedToken() public {
        vm.startPrank(admin);
        vm.expectRevert("TOKEN_IS_NOT_SUPPORTED");
        treasury.payRewards(user1, address(token3), 100);
    }

    function testFailCannotSendTokensIfNotAdmin() public {
        vm.startPrank(user1);
        treasury.payRewards(user1, address(token1), 100);
    }

    function testPayRewards(uint256 amount) public {
        vm.assume(amount <= 1000);
        vm.startPrank(admin);
        treasury.payRewards(user1, address(token1), amount);
    }

    /*//////////////////////////////////////////////////////////////////////////
                                    ADD / REMOVE TOKENS
    //////////////////////////////////////////////////////////////////////////*/

   function testRemoveToken() public {
        vm.startPrank(admin);
        treasury.removeSupportedToken(address(token1));
    }

    function testCannotSendMoreTokensThanInTreasury() public {
        vm.startPrank(admin);
        vm.expectRevert("ERC20: transfer amount exceeds balance");
        treasury.payRewards(user1, address(token2), 2000);
    }

    function testFailCannotAddTokenIfNotAdmin() public {
        vm.startPrank(user1);
        treasury.addSupportedToken(address(token3));
    }

    function testAddToken(address token) public {
        vm.assume(token != address(0));
        vm.startPrank(admin);
        treasury.addSupportedToken(token);
    }

    function testFailCannotAddToken(address user, address token) public {
        vm.assume(user != address(0));
        vm.assume(token != address(0));

        vm.startPrank(user);
        treasury.addSupportedToken(token);
    }

    /*//////////////////////////////////////////////////////////////////////////
                                   ADMIN CONTROLS
    //////////////////////////////////////////////////////////////////////////*/

    function testCannotPayWhenPaused() public {
        vm.startPrank(admin);

        treasury.adminPause(1);
        vm.expectRevert("CONTRACT_IS_PAUSED");
        treasury.addSupportedToken(address(token3));
    }



}
