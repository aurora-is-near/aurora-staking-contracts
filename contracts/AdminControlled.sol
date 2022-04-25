// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "./DelegateCallGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @title AdminControlled
 * @author Aurora Team
 *
 * @dev Implementation of Admin controlled contract
 *
 *      This contract implements inherits access control upgradeable contract,
 *      in which provides a role based access control (RBAC) for admin priveleges.
 *      It also provides other privileges such as:
 *      - Pausing the contract
 *      - Sending and receiving ETH to/from this contract
 *      - Delegating contract calls
 *      - Changing state variable value using its storage slot
 *      - Transfering its ownership to a new admin
 */
contract AdminControlled is DelegateCallGuard, AccessControlUpgradeable {
    address public admin;
    uint256 public paused;

    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");
    event OwnershipTransferred(address oldAdmin, address newAdmin);

    modifier pausable(uint256 flag) {
        require(
            (paused & flag) == 0 || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "Paused"
        );
        _;
    }

    /// @dev __AdminControlled_init initializes this contract, setting pause flags
    /// and granting admin roles.
    /// @param _flags flags variable will be used for pausing this contract.
    function __AdminControlled_init(uint256 _flags) public initializer {
        __AccessControl_init();
        paused = _flags;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSE_ROLE, msg.sender);
    }

    /// @dev adminPause pauses this contract. Only pause role or default
    /// admin role can access this function.
    /// @param flags flags variable is used for pausing this contract.
    function adminPause(uint256 flags) external onlyRole(PAUSE_ROLE) {
        paused = flags;
    }

    /// @dev transferOwnership updates the current admin address with a new
    /// one. This admin is used for colleting dust tokens,
    /// and releasing some locked funds. It is used
    /// by the staking contract. It must be assinged to the community
    /// treasury wallet that will be governed by DAO.
    /// @param newAdmin new admin address.
    function transferOwnership(address newAdmin)
        external
        virtual
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newAdmin != address(0), "INVALID_ADDRESS");
        require(admin != newAdmin, "SAME_ADMIN_ADDRESS");
        _grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        admin = newAdmin;
        _revokeRole(DEFAULT_ADMIN_ROLE, _msgSender());
        emit OwnershipTransferred(_msgSender(), newAdmin);
    }

    /// @dev adminSstore updates the state variable value.
    /// only default admin role can call this function.
    /// @param key is the storage slot of the state variable
    /// @param value is the state variable value
    function adminSstore(uint256 key, uint256 value)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        assembly {
            sstore(key, value)
        }
    }

    /// @dev adminSstoreWithMask similar to adminSstore except
    /// it updates the state variable value after xor-ing this value
    /// with the old value and the mask, so the new value should be
    /// a result of xor(and(xor(value, oldval), mask), oldval).
    /// Only default admin role can call this function.
    /// @param key is the storage slot of the state variable
    /// @param value is the state variable value
    /// @param mask this value is used in calculating the new value
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

    /// @dev adminSendEth sends ETH from this contract to destination
    /// only default admin role can call this function
    /// @param destination is the receiver address
    /// @param amount of ETH
    function adminSendEth(address payable destination, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        //slither-disable-next-line arbitrary-send
        destination.transfer(amount);
    }

    /// @dev adminReceiveEth allows this contract to receive ETH
    /// anyone can call this function
    function adminReceiveEth() external payable {}

    /// @dev adminDelegatecall allows this contract to delegate calls
    /// to a target contract and execute it in the context of this
    /// contract. Only default admin role can call this function.
    /// @param target the target contract address
    /// @param data is the ABI encoded function signature and its values.
    /// @custom:oz-upgrades-unsafe-allow delegatecall
    function adminDelegatecall(address target, bytes memory data)
        external
        payable
        onlyRole(DEFAULT_ADMIN_ROLE)
        onlyDelegateCall
        returns (bytes memory)
    {
        (bool success, bytes memory rdata) = target.delegatecall(data);
        require(success);
        return rdata;
    }
}
