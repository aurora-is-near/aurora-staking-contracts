// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../IJetStakingV1.sol";
import "./IVoteTokenERC20.sol";
import "./IStakingStrategyTemplate.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract LockedStakingSubAccountImplementation is
    IStakingStrategyTemplate,
    Ownable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;
    address public stakingContract;
    address public voteTokenContract;
    uint256 public lockUpTimestamp;
    bool private initialized = false;

    modifier onlyAfterLockUpPeriod() {
        require(
            block.timestamp > lockUpTimestamp,
            "INVALID_CALL_DURING_LOCKUP_PERIOD"
        );
        _;
    }

    modifier onlyNotInitialized() {
        require(!initialized, "TEMPLATE_ALREADY_INITIALIZED");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {}

    function initialize(
        address stakingContractAddr,
        address instanceOwner,
        uint256 deposit,
        address auroraToken,
        bytes calldata extraInitParameters
    ) external onlyNotInitialized {
        initialized = true;
        // decode _encodedData parameters
        (address _voteToken, uint256 _lockupPeriod) = abi.decode(
            extraInitParameters,
            (address, uint256)
        );
        require(
            deposit > 0 && _lockupPeriod > 0,
            "INVALID_LOCKED_STAKING_PARAMETERS"
        );
        require(
            _voteToken != address(0) && auroraToken != address(0),
            "INVALID_ADDRESS"
        );
        voteTokenContract = _voteToken;
        _transferOwnership(instanceOwner);
        stakingContract = stakingContractAddr;
        IERC20(auroraToken).approve(stakingContract, deposit);
        _stakeWithLockUpPeriod(deposit, _lockupPeriod);
    }

    function unstake(uint256 amount)
        public
        virtual
        onlyOwner
        onlyAfterLockUpPeriod
        nonReentrant
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
        nonReentrant
    {
        IJetStakingV1(stakingContract).moveAllRewardsToPending();
    }

    function moveRewardsToPending(uint256 streamId)
        external
        virtual
        onlyOwner
        onlyAfterLockUpPeriod
        nonReentrant
    {
        IJetStakingV1(stakingContract).moveRewardsToPending(streamId);
    }

    function withdraw(uint256 streamId)
        external
        virtual
        onlyOwner
        onlyAfterLockUpPeriod
        nonReentrant
    {
        IJetStakingV1(stakingContract).withdraw(streamId);
        // move the reward in this subaccount to the owner wallet (EOA)
        IJetStakingV1.Stream memory stream = IJetStakingV1(stakingContract)
            .streams(streamId);
        uint256 amount = IERC20(stream.rewardToken).balanceOf(address(this));
        //if reward token == vote token --> call delegate instead.
        if (stream.rewardToken == voteTokenContract) {
            _transferVoteTokens(amount);
        } else {
            IERC20(stream.rewardToken).safeTransfer(owner(), amount);
        }
    }

    function withdrawAll()
        external
        virtual
        onlyOwner
        onlyAfterLockUpPeriod
        nonReentrant
    {
        IJetStakingV1(stakingContract).withdrawAll();
        // move All rewards in this subaccount to the owner wallet (EOA)
        uint256 streams = IJetStakingV1(stakingContract).getStreamsCount();
        for (uint256 streamId = 0; streamId < streams; streamId++) {
            IJetStakingV1.Stream memory stream = IJetStakingV1(stakingContract)
                .streams(streamId);
            uint256 amount = IERC20(stream.rewardToken).balanceOf(
                address(this)
            );
            //if reward token == vote token --> call delegate(transfer) instead.
            if (stream.rewardToken == voteTokenContract) {
                _transferVoteTokens(amount);
            } else {
                IERC20(stream.rewardToken).safeTransfer(owner(), amount);
            }
        }
    }

    function _stakeWithLockUpPeriod(uint256 amount, uint256 _lockUpPeriod)
        internal
        virtual
    {
        lockUpTimestamp = block.timestamp + _lockUpPeriod;
        IJetStakingV1(stakingContract).stake(amount);
    }

    function _transferVoteTokens(uint256 amount) internal returns (uint256) {
        IVoteTokenERC20(voteTokenContract).delegate(owner(), amount);
    }
}
