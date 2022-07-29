// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../IJetStakingV1.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract LockedStakingSubAccount is OwnableUpgradeable {
    address stakingContract;
    uint256 lockUpTimestamp;

    modifier onlyAfterLockUpPeriod() {
        require(
            block.timestamp > lockUpTimestamp,
            "INVALID_CALL_DURING_LOCKUP_PERIOD"
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _stakingContract,
        uint256 _amount,
        uint256 _lockUpPeriod
    ) external initializer {
        __Ownable_init();
        stakingContract = _stakingContract;
        _stakeWithLockedPeriod(_amount, _lockUpPeriod);
    }

    function unstakeWithLockedPeriod(uint256 amount)
        public
        virtual
        onlyOwner
        onlyAfterLockUpPeriod
    {
        IJetStakingV1(stakingContract).unstake(amount);
    }

    function unstakeAllWithLockedPeriod()
        public
        virtual
        onlyOwner
        onlyAfterLockUpPeriod
    {
        IJetStakingV1(stakingContract).unstakeAll();
    }

    function withdraw(uint256 streamId)
        external
        onlyOwner
        onlyAfterLockUpPeriod
    {
        IJetStakingV1(stakingContract).withdraw(streamId);
        //TODO: move the reward in this subaccount to the owner wallet (EOA)
    }

    function withdrawAll() external onlyOwner onlyAfterLockUpPeriod {
        IJetStakingV1(stakingContract).withdrawAll();
        //TODO: move All rewards in this subaccount to the owner wallet (EOA)
    }

    function _stakeWithLockedPeriod(uint256 amount, uint256 _lockUpPeriod)
        internal
        virtual
    {
        lockUpTimestamp = block.timestamp + _lockUpPeriod;
        IJetStakingV1(stakingContract).stake(amount);
    }
}
