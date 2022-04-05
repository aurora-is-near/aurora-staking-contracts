// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

contract AdminControlled is AccessControlUpgradeable {
    address public admin;
    uint256 public paused;

    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");

    modifier pausable(uint256 flag) {
        require(
            (paused & flag) == 0 || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "Paused"
        );
        _;
    }

    function __AdminControlled_init(uint256 _flags) public initializer {
        __AccessControl_init();
        paused = _flags;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSE_ROLE, msg.sender);
    }

    function adminPause(uint256 flags) external onlyRole(PAUSE_ROLE) {
        paused = flags;
    }

    function transferOwnership(address newAdmin)
        external
        virtual
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            newAdmin != address(0),
            "Ownable: new owner is the zero address"
        );
        _grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        _grantRole(PAUSE_ROLE, newAdmin);
        admin = newAdmin;

        _revokeRole(PAUSE_ROLE, _msgSender());
        _revokeRole(DEFAULT_ADMIN_ROLE, _msgSender());
        emit OwnershipTransferred(_msgSender(), newAdmin);
    }

    function adminSstore(uint256 key, uint256 value)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        assembly {
            sstore(key, value)
        }
    }

    function adminSstoreWithMask(
        uint256 key,
        uint256 value,
        uint256 mask
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        assembly {
            let oldval := sload(key)
            sstore(key, xor(and(xor(value, oldval), mask), oldval))
        }
    }

    function adminSendEth(address payable destination, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        destination.transfer(amount);
    }

    function adminReceiveEth() external payable {}

    event OwnershipTransferred(address oldAdmin, address newAdmin);
}
