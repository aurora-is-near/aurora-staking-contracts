// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../IJetStakingV1.sol";
import "./IStakingStrategyTemplate.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract LockedStakingSubAccountImplementation is
    UUPSUpgradeable,
    IStakingStrategyTemplate,
    OwnableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    address stakingContract;
    address voteTokenContract;
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
    // to non-upgradeable contract if it is not needed
    function initialize(
        address stakingContractAddr,
        address instanceOwner,
        uint256 deposit,
        bool isTemplate,
        bytes calldata extraInitParameters
    ) external initializer {
        __UUPSUpgradeable_init();
        // decode _encodedData parameters
        (address _voteToken, uint256 _lockupPeriod) = abi.decode(
            extraInitParameters,
            (address, uint256)
        );
        require(
            deposit > 0 && _lockupPeriod > 0,
            "INVALID_LOCKED_STAKING_PARAMETERS"
        );
        require(_voteToken != address(0), "INVALID_ADDRESS");
        voteTokenContract = _voteToken;
        _transferOwnership(instanceOwner);
        stakingContract = stakingContractAddr;
        if (!isTemplate) {
            _stakeWithLockUpPeriod(deposit, _lockupPeriod);
        }
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
        virtual
        onlyOwner
        onlyAfterLockUpPeriod
    {
        IJetStakingV1(stakingContract).moveAllRewardsToPending();
    }

    function moveRewardsToPending(uint256 streamId)
        external
        virtual
        onlyOwner
        onlyAfterLockUpPeriod
    {
        IJetStakingV1(stakingContract).moveRewardsToPending(streamId);
    }

    function withdraw(uint256 streamId)
        external
        virtual
        onlyOwner
        onlyAfterLockUpPeriod
    {
        IJetStakingV1(stakingContract).withdraw(streamId);
        // move the reward in this subaccount to the owner wallet (EOA)
        IJetStakingV1.Stream memory stream = IJetStakingV1(stakingContract)
            .streams(streamId);
        uint256 amount = IERC20Upgradeable(stream.rewardToken).balanceOf(
            address(this)
        );
        //TODO: if reward token == vote token --> call delegate instead.
        IERC20Upgradeable(stream.rewardToken).safeTransfer(owner(), amount);
    }

    function withdrawAll() external virtual onlyOwner onlyAfterLockUpPeriod {
        IJetStakingV1(stakingContract).withdrawAll();
        // move All rewards in this subaccount to the owner wallet (EOA)
        uint256 streams = IJetStakingV1(stakingContract).getStreamsCount();
        for (uint256 streamId = 0; streamId < streams; streamId++) {
            IJetStakingV1.Stream memory stream = IJetStakingV1(stakingContract)
                .streams(streamId);
            uint256 amount = IERC20Upgradeable(stream.rewardToken).balanceOf(
                address(this)
            );
            //TODO: if reward token == vote token --> call delegate instead.
            IERC20Upgradeable(stream.rewardToken).safeTransfer(owner(), amount);
        }
    }

    function _stakeWithLockUpPeriod(uint256 amount, uint256 _lockUpPeriod)
        internal
        virtual
    {
        lockUpTimestamp = block.timestamp + _lockUpPeriod;
        IJetStakingV1(stakingContract).stake(amount);
    }

    ///@dev required by the OZ UUPS module
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
