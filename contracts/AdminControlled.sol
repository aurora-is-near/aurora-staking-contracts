// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract AdminControlled is Initializable {
    address public admin;
    uint256 public paused;

    // solhint-disable-next-line
    function __AdminControlled_init(address _admin, uint256 flags)
        public
        initializer
    {
        admin = _admin;
        paused = flags;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin);
        _;
    }

    modifier pausable(uint256 flag) {
        require((paused & flag) == 0 || msg.sender == admin);
        _;
    }

    function adminPause(uint256 flags) public onlyAdmin {
        paused = flags;
    }

    function adminSstore(uint256 key, uint256 value) public onlyAdmin {
        assembly {
            sstore(key, value)
        }
    }

    function adminSstoreWithMask(
        uint256 key,
        uint256 value,
        uint256 mask
    ) public onlyAdmin {
        assembly {
            let oldval := sload(key)
            sstore(key, xor(and(xor(value, oldval), mask), oldval))
        }
    }

    function adminSendEth(address payable destination, uint256 amount)
        public
        onlyAdmin
    {
        destination.transfer(amount);
    }

    // TODO(MarX): Can you explain this better please?
    function adminReceiveEth() public payable onlyAdmin {}
    // function adminDelegatecall(address target, bytes memory data) public payable onlyAdmin returns (bytes memory) {
    //     /// @custom:oz-upgrades-unsafe-allow delegatecall
    //     (bool success, bytes memory rdata) = target.delegatecall(data);
    //     //TODO: This function has unsafe upgrade. It should apply OnlyDelegateCall which allows
    //     // calling this function only throw proxy not the implementation. For more details:
    //     // https://docs.openzeppelin.com/upgrades-plugins/1.x/faq#delegatecall-selfdestruct
    //     require(success);
    //     return rdata;
    // }
}
