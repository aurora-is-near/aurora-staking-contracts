// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../IJetStakingV1.sol";
import "./IStakingStrategyTemplate.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract LockedStakingSubAccountImplementation is
    IStakingStrategyTemplate,
    OwnableUpgradeable
{
    //TODO: should have a predefined interface which
    // allow enforcing the setup of an owner for the
    // clone/instance
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

    //TODO: move the contract from upgradeable
    // to non-upgradeable contract
    function initialize(
        address stakingContractAddr,
        address instanceOwner,
        bytes calldata extraInitParameters
    ) external initializer {
        // decode _encodedData parameters
        (uint256 _amount, uint256 _lockupPeriod) = abi.decode(
            extraInitParameters,
            (uint256, uint256)
        );
        require(
            _amount > 0 && _lockupPeriod > 0,
            "INVALID_LOCKED_STAKING_PARAMETERS"
        );
        _transferOwnership(instanceOwner);
        stakingContract = stakingContractAddr;
        _stakeWithLockUpPeriod(_amount, _lockupPeriod);
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
