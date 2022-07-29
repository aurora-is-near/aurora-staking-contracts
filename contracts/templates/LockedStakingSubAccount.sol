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
        uint256 _amount,
        uint256 _lockUpPeriod,
        address _stakingContract
    ) external initializer {
        __Ownable_init();
        stakingContract = _stakingContract;
        _stakeWithLockUpPeriod(_amount, _lockUpPeriod);
    }

    function unstake(uint256 amount)
        public
        virtual
        onlyOwner
        onlyAfterLockUpPeriod
    {
        IJetStakingV1(stakingContract).unstake(amount);
    }

    function unstakeAll() public virtual onlyOwner onlyAfterLockUpPeriod {
        IJetStakingV1(stakingContract).unstakeAll();
    }

    function moveAllRewardsToPending()
        external
        onlyOwner
        onlyAfterLockUpPeriod
    {
        IJetStakingV1(stakingContract).moveAllRewardsToPending();
    }

    function moveRewardsToPending(uint256 streamId)
        external
        onlyOwner
        onlyAfterLockUpPeriod
    {
        IJetStakingV1(stakingContract).moveRewardsToPending(streamId);
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

    function _stakeWithLockUpPeriod(uint256 amount, uint256 _lockUpPeriod)
        internal
        virtual
    {
        lockUpTimestamp = block.timestamp + _lockUpPeriod;
        IJetStakingV1(stakingContract).stake(amount);
    }
}
