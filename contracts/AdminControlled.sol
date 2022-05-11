// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

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
 *      - Delegating contract calls to trusted targets (only managed by the default admin role)
 *      - Changing state variable value using its storage slot
 *      - Role management using AccessControlled ABIs
 */
contract AdminControlled is AccessControlUpgradeable {
    uint256 public paused;
    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");

    modifier pausable(uint256 flag) {
        require(
            (paused & flag) == 0 || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "CONTRACT_IS_PAUSED"
        );
        _;
    }

    /// @dev __AdminControlled_init initializes this contract, setting pause flags
    /// and granting admin and pause roles.
    /// @param _flags flags variable will be used for pausing this contract.
    /// the default flags value is zero.
    function __AdminControlled_init(uint256 _flags) internal {
        __AccessControl_init();
        paused = _flags;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSE_ROLE, msg.sender);
    }

    /// @dev adminPause pauses this contract. Only pause role or default
    /// admin role can access this function.
    /// @param flags flags variable is used for pausing this contract.
    function adminPause(uint256 flags) external onlyRole(PAUSE_ROLE) {
        // pause role can pause the contract, however only default admin role can unpause
        require(
            (paused & flags) != 0 || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ONLY_DEFAULT_ADMIN_CAN_UNPAUSE"
        );
        paused = flags;
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
        returns (bytes memory)
    {
        require(target != address(0), "ZERO_ADDRESS");
        (bool success, bytes memory rdata) = target.delegatecall(data);
        require(success);
        return rdata;
    }
}
