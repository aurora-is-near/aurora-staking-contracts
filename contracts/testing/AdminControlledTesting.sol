// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
import "../AdminControlled.sol";

contract AdminControlledTesting is AdminControlled {
    // you can get the full storage layout using https://github.com/aurora-is-near/hardhat-storage-layout
    uint256 public changeMe; // storage slot 153

    function initialize(uint256 flags) public initializer {
        __AdminControlled_init(flags);
    }

    function pauseMe() public pausable(1) returns (uint256) {
        return paused;
    }

    function getSignatureForTokenMinting() public returns (bytes memory) {
        return abi.encodeWithSignature("targetFunction(string)", "Testname");
    }
}

contract TargetContract {
    uint256 public value;
    address public sender;
    string public name;

    function targetFunction(string memory _nameTarget) public payable {
        value = msg.value;
        sender = msg.sender;
        name = _nameTarget;
    }
}
