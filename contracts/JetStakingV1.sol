// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./ITreasury.sol";
import "./AdminControlled.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

/**
 * @title JetStakingV1
 * @author Aurora Team
 *
 * @dev Implementation of Jet staking contract
 *
 *      This contract implements the staking mechanics for AURORA ERC20 token.
 *      A user can stake any amount of AURORA tokens, and get rewarded in both
 *      AURORA and other stream tokens based on the rewards schedules.
 *      Stream rewards can be claimed any time however AURORA can't be claimed
 *      unless the user unstakes his full/partial amount of shares.
 *
 *      This contract is AdminControlled which has a tremendous power. However
 *      hopfully it be governed by a community wallet.
 */
contract JetStakingV1 is AdminControlled {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bytes32 public constant AIRDROP_ROLE = keccak256("AIRDROP_ROLE");
    bytes32 public constant CLAIM_ROLE = keccak256("CLAIM_ROLE");
    bytes32 public constant STREAM_MANAGER_ROLE =
        keccak256("STREAM_MANAGER_ROLE");
    uint256 public constant ONE_MONTH = 2629746;
    uint256 public constant FOUR_YEARS = 126227808;
    // RPS_MULTIPLIER = Aurora_max_supply x weight(1000) * 10 (large enough to always release rewards) =
    // 10**9 * 10**18 * 10**3 * 10= 10**31
    uint256 private constant RPS_MULTIPLIER = 1e31;
    uint256 public totalAmountOfStakedAurora;
    uint256 public touchedAt;
    uint256 public totalAuroraShares;
    uint256 public totalStreamShares;
    address public treasury;
    address public auroraToken;
    uint256 public maxWeight;
    uint256 public minWeight;

    enum StreamStatus {
        INACTIVE,
        PROPOSED,
        ACTIVE
    }

    struct User {
        uint256 deposit;
        uint256 auroraShares;
        uint256 streamShares;
        mapping(uint256 => uint256) pendings; // The amount of tokens pending release for user per stream
        mapping(uint256 => uint256) releaseTime; // The release moment per stream
        mapping(uint256 => uint256) rpsDuringLastClaim; // RPS or reward per share during the previous rewards claim
    }

    struct Schedule {
        uint256[] time;
        uint256[] reward;
    }

    struct Stream {
        address owner; // stream owned by the ERC-20 reward token owner
        address manager; // stream manager handled by AURORA stream manager role
        address rewardToken;
        uint256 auroraDepositAmount;
        uint256 auroraClaimedAmount;
        uint256 rewardDepositAmount;
        uint256 rewardClaimedAmount;
        uint256 maxDepositAmount;
        uint256 minDepositAmount;
        uint256 lastTimeOwnerClaimed;
        uint256 tau; // pending time prior reward release
        uint256 rps; // Reward per share for a stream j>0
        Schedule schedule;
        StreamStatus status;
    }

    mapping(address => User) public users;
    Stream[] streams;

    // events
    event Staked(address indexed user, uint256 amount, uint256 shares);

    event Unstaked(address indexed user, uint256 amount);

    event Pending(
        uint256 indexed streamId,
        address indexed user,
        uint256 amount
    );

    event Released(
        uint256 indexed streamId,
        address indexed user,
        uint256 amount
    );

    event StreamOwnerRewardReleased(
        uint256 indexed streamId,
        address indexed owner,
        uint256 amount
    );

    event StreamProposed(
        uint256 indexed streamId,
        address indexed owner,
        address indexed token,
        uint256 maxDepositAmount,
        uint256 auroraDepositAmount
    );

    event StreamProposalCancelled(
        uint256 indexed streamId,
        address indexed owner,
        address indexed token
    );

    event StreamCreated(
        uint256 indexed streamId,
        address indexed owner,
        address indexed token,
        uint256 tokenAmount,
        uint256 auroraAmount
    );

    event StreamRemoved(
        uint256 indexed streamId,
        address indexed owner,
        address indexed token
    );

    modifier onlyValidSharesAmount() {
        require(totalAuroraShares != 0, "ZERO_TOTAL_AURORA_SHARES");
        require(users[msg.sender].auroraShares != 0, "ZERO_USER_SHARES");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /// @dev initialize the contract and deploys the first stream (AURORA)
    /// @notice By calling this function, the deployer of this contract must
    /// make sure that the AURORA reward amount was deposited to the treasury
    /// contract before initializing of the default AURORA stream.
    /// @param aurora token contract address
    /// @param scheduleTimes init the schedule time
    /// @param scheduleRewards init the schedule amounts
    /// @param tauAuroraStream release time constant per stream (e.g AURORA stream)
    /// @param _flags admin controlled contract flags
    /// @param _treasury the Aurora treasury contract address
    /// @param _maxWeight max stream reward weighting coefficient
    /// @param _minWeight min stream reward weighting coefficient
    function initialize(
        address aurora,
        address streamOwner,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tauAuroraStream,
        uint256 _flags,
        address _treasury,
        uint256 _maxWeight,
        uint256 _minWeight
    ) external initializer {
        require(_maxWeight > _minWeight, "INVALID_WEIGHTS");
        require(_treasury != address(0), "INVALID_ADDRESS");
        _validateStreamParameters(
            streamOwner,
            aurora,
            scheduleRewards[0],
            scheduleRewards[0],
            scheduleTimes,
            scheduleRewards,
            tauAuroraStream
        );
        // check aurora token address is supportedToken in the treasury
        require(
            ITreasury(_treasury).isSupportedToken(aurora),
            "INVALID_SUPPORTED_TOKEN_ADDRESS"
        );
        __AdminControlled_init(_flags);
        _grantRole(AIRDROP_ROLE, msg.sender);
        _grantRole(CLAIM_ROLE, msg.sender);
        _grantRole(STREAM_MANAGER_ROLE, msg.sender);
        treasury = _treasury;
        auroraToken = aurora;
        maxWeight = _maxWeight;
        minWeight = _minWeight;
        //init AURORA default stream
        // This is a special stream where the reward token is the aurora token itself.
        uint256 streamId = 0;
        Schedule memory schedule = Schedule(scheduleTimes, scheduleRewards);
        streams.push(
            Stream({
                owner: streamOwner,
                manager: streamOwner,
                rewardToken: aurora,
                auroraDepositAmount: 0,
                auroraClaimedAmount: 0,
                maxDepositAmount: 0,
                minDepositAmount: 0,
                rewardDepositAmount: 0,
                rewardClaimedAmount: 0,
                lastTimeOwnerClaimed: block.timestamp,
                schedule: schedule,
                status: StreamStatus.ACTIVE,
                tau: tauAuroraStream,
                rps: 0
            })
        );
        emit StreamProposed(
            streamId,
            streamOwner,
            aurora,
            scheduleRewards[0],
            scheduleRewards[0]
        );
        emit StreamCreated(
            streamId,
            streamOwner,
            aurora,
            scheduleRewards[0],
            scheduleRewards[0]
        );
    }

    /// @dev An admin of the staking contract can whitelist (propose) a stream.
    /// Whitelisting of the stream provides the option for the stream
    /// owner (presumably the issuing party of a specific token) to
    /// deposit some ERC-20 tokens on the staking contract and potentially
    /// get in return some AURORA tokens. Deposited ERC-20 tokens will be
    /// distributed to the stakers over some period of time.
    /// @notice treasury manager must call
    /// @param streamOwner only this account would be able to create a stream
    /// @param rewardToken the address of the ERC-20 tokens to be deposited in the stream
    /// @param auroraDepositAmount Amount of the AURORA deposited by the Admin.
    /// @param maxDepositAmount The upper amount of the tokens that should be deposited by the stream owner
    /// @param scheduleTimes timestamp denoting the start of each scheduled interval. Last element is the end of the stream.
    /// @param scheduleRewards remaining rewards to be delivered at the beginning of each scheduled interval. Last element is always zero.
    /// First value (in scheduleRewards) from array is supposed to be a total amount of rewards for stream.
    /// @param tau the tau is (pending release period) for this stream (e.g one day)
    function proposeStream(
        address streamOwner,
        address rewardToken,
        uint256 auroraDepositAmount,
        uint256 maxDepositAmount,
        uint256 minDepositAmount,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tau
    ) external onlyRole(STREAM_MANAGER_ROLE) {
        _validateStreamParameters(
            streamOwner,
            rewardToken,
            maxDepositAmount,
            minDepositAmount,
            scheduleTimes,
            scheduleRewards,
            tau
        );
        // check aurora token address is supportedToken in the treasury
        require(
            ITreasury(treasury).isSupportedToken(rewardToken),
            "INVALID_SUPPORTED_TOKEN_ADDRESS"
        );
        Schedule memory schedule = Schedule(scheduleTimes, scheduleRewards);
        uint256 streamId = streams.length;
        streams.push(
            Stream({
                owner: streamOwner,
                manager: msg.sender,
                rewardToken: rewardToken,
                auroraDepositAmount: auroraDepositAmount,
                auroraClaimedAmount: 0,
                maxDepositAmount: maxDepositAmount,
                minDepositAmount: minDepositAmount,
                rewardDepositAmount: 0,
                rewardClaimedAmount: 0,
                lastTimeOwnerClaimed: scheduleTimes[0],
                schedule: schedule,
                status: StreamStatus.PROPOSED,
                tau: tau,
                rps: 0
            })
        );
        emit StreamProposed(
            streamId,
            streamOwner,
            rewardToken,
            maxDepositAmount,
            auroraDepositAmount
        );
        IERC20Upgradeable(auroraToken).safeTransferFrom(
            msg.sender,
            address(this),
            auroraDepositAmount
        );
    }

    /// @dev cancelStreamProposal cancels a proposal any time before the stream
    /// becomes active (created).
    /// @param streamId the stream index
    function cancelStreamProposal(uint256 streamId)
        external
        onlyRole(STREAM_MANAGER_ROLE)
    {
        Stream storage stream = streams[streamId];
        require(stream.status == StreamStatus.PROPOSED, "STREAM_NOT_PROPOSED");
        // cancel the proposal
        stream.status = StreamStatus.INACTIVE;
        uint256 refundAmount = stream.auroraDepositAmount;
        stream.auroraDepositAmount = 0;
        emit StreamProposalCancelled(
            streamId,
            stream.owner,
            stream.rewardToken
        );
        // refund stream manager wallet with the stream aurora deposit
        IERC20Upgradeable(auroraToken).safeTransfer(
            stream.manager,
            refundAmount
        );
    }

    /// @dev create new stream (only stream owner)
    /// stream owner must approve reward tokens to this contract.
    /// @param streamId stream id
    function createStream(uint256 streamId, uint256 rewardTokenAmount)
        external
        pausable(1)
    {
        Stream storage stream = streams[streamId];
        require(stream.status == StreamStatus.PROPOSED, "STREAM_NOT_PROPOSED");
        require(stream.owner == msg.sender, "INVALID_STREAM_OWNER");
        require(
            stream.schedule.time[0] >= block.timestamp,
            "STREAM_PROPOSAL_EXPIRED"
        );
        require(
            rewardTokenAmount <= stream.maxDepositAmount,
            "REWARD_TOO_HIGH"
        );
        require(rewardTokenAmount >= stream.minDepositAmount, "REWARD_TOO_LOW");
        stream.status = StreamStatus.ACTIVE;
        stream.rewardDepositAmount = rewardTokenAmount;
        if (rewardTokenAmount < stream.maxDepositAmount) {
            // refund staking admin if deposited reward tokens less than the upper limit of deposit
            uint256 newAuroraDepositAmount = (rewardTokenAmount *
                stream.auroraDepositAmount) / stream.maxDepositAmount;
            uint256 refundAuroraAmount = stream.auroraDepositAmount -
                newAuroraDepositAmount;
            stream.auroraDepositAmount = newAuroraDepositAmount;
            // update stream reward schedules
            _updateStreamRewardSchedules(streamId, rewardTokenAmount);
            IERC20Upgradeable(auroraToken).safeTransfer(
                stream.manager,
                refundAuroraAmount
            );
        }
        emit StreamCreated(
            streamId,
            stream.owner,
            stream.rewardToken,
            rewardTokenAmount,
            stream.auroraDepositAmount
        );
        require(
            stream.schedule.reward[0] == stream.rewardDepositAmount,
            "INVALID_STARTING_REWARD"
        );
        // move Aurora tokens to treasury
        IERC20Upgradeable(auroraToken).safeTransfer(
            address(treasury),
            stream.auroraDepositAmount
        );
        // move reward tokens to treasury
        IERC20Upgradeable(stream.rewardToken).safeTransferFrom(
            msg.sender,
            address(treasury),
            rewardTokenAmount
        );
    }

    /// @dev Get the treasury balance
    /// @param token the token address
    function getTreasuryBalance(address token) public view returns (uint256) {
        return IERC20Upgradeable(token).balanceOf(treasury);
    }

    /// @dev removes a stream (only default admin role)
    /// @param streamId stream index
    /// @param streamFundReceiver receives the rest of the reward tokens in the stream
    function removeStream(uint256 streamId, address streamFundReceiver)
        external
        onlyRole(STREAM_MANAGER_ROLE)
    {
        require(streamId != 0, "AURORA_STREAM_NOT_REMOVABLE");
        Stream storage stream = streams[streamId];
        require(stream.status == StreamStatus.ACTIVE, "STREAM_ALREADY_REMOVED");
        stream.status = StreamStatus.INACTIVE;
        emit StreamRemoved(streamId, stream.owner, stream.rewardToken);
        uint256 releaseAuroraAmount = stream.auroraDepositAmount -
            stream.auroraClaimedAmount;
        uint256 releaseRewardAmount = stream.rewardDepositAmount -
            stream.rewardClaimedAmount;
        // check enough treasury balance
        uint256 auroraTreasury = getTreasuryBalance(auroraToken);
        uint256 rewardTreasury = getTreasuryBalance(stream.rewardToken);
        // move rest of the unclaimed aurora to the stream manager
        ITreasury(treasury).payRewards(
            stream.manager,
            auroraToken,
            releaseAuroraAmount <= auroraTreasury
                ? releaseAuroraAmount
                : auroraTreasury // should not happen
        );
        // move the rest of rewards to the stream owner
        ITreasury(treasury).payRewards(
            streamFundReceiver,
            stream.rewardToken,
            releaseRewardAmount <= rewardTreasury
                ? releaseRewardAmount
                : rewardTreasury // should not happen
        );
    }

    /// @dev Stream owner claimable AURORA.
    /// @param streamId the stream index
    function getStreamOwnerClaimableAmount(uint256 streamId)
        public
        view
        returns (uint256)
    {
        Stream storage stream = streams[streamId];
        if (stream.status != StreamStatus.ACTIVE) return 0;
        uint256 scheduledReward = getRewardsAmount(
            streamId,
            stream.lastTimeOwnerClaimed
        );
        return
            (scheduledReward * stream.auroraDepositAmount) /
            stream.rewardDepositAmount;
    }

    /// @dev the release of AURORA tokens to the stream owner is subjected to the same schedule as rewards.
    /// Thus if for a specific moment in time 30% of the rewards are distributed, then it means that 30% of
    /// the AURORA deposit can be withdrawn by the stream owner too.
    /// called by the stream owner
    /// @param streamId the stream index
    function releaseAuroraRewardsToStreamOwner(uint256 streamId)
        external
        pausable(1)
    {
        require(streamId != 0, "AURORA_STREAM_NA");
        Stream storage stream = streams[streamId];
        require(msg.sender == stream.owner, "INVALID_STREAM_OWNER");
        require(
            stream.status == StreamStatus.ACTIVE,
            "INACTIVE_OR_PROPOSED_STREAM"
        );
        uint256 auroraStreamOwnerReward = getStreamOwnerClaimableAmount(
            streamId
        );
        require(auroraStreamOwnerReward > 0, "ZERO_REWARDS");
        stream.lastTimeOwnerClaimed = block.timestamp;
        stream.auroraClaimedAmount += auroraStreamOwnerReward;
        // check enough treasury balance
        emit StreamOwnerRewardReleased(
            streamId,
            stream.owner,
            auroraStreamOwnerReward
        );
        ITreasury(treasury).payRewards(
            stream.owner,
            auroraToken,
            auroraStreamOwnerReward
        );
    }

    /// @dev get the stream data
    /// @notice this function doesn't return the stream
    /// schedule due to some stake slots limitations. To
    /// get the stream schedule, refer to getStreamSchedule
    /// @param streamId the stream index
    function getStream(uint256 streamId)
        external
        view
        returns (
            address streamOwner,
            address rewardToken,
            uint256 auroraDepositAmount,
            uint256 auroraClaimedAmount,
            uint256 rewardDepositAmount,
            uint256 rewardClaimedAmount,
            uint256 maxDepositAmount,
            uint256 lastTimeOwnerClaimed,
            uint256 rps,
            uint256 tau,
            StreamStatus status
        )
    {
        Stream storage stream = streams[streamId];
        return (
            stream.owner,
            stream.rewardToken,
            stream.auroraDepositAmount,
            stream.auroraClaimedAmount,
            stream.rewardDepositAmount,
            stream.rewardClaimedAmount,
            stream.maxDepositAmount,
            stream.lastTimeOwnerClaimed,
            stream.rps,
            stream.tau,
            stream.status
        );
    }

    /// @dev get the stream schedule data
    /// @param streamId the stream index
    function getStreamSchedule(uint256 streamId)
        external
        view
        returns (
            uint256[] memory scheduleTimes,
            uint256[] memory scheduleRewards
        )
    {
        return (
            streams[streamId].schedule.time,
            streams[streamId].schedule.reward
        );
    }

    /// @dev get the streams count
    /// @return streams.length
    function getStreamsCount() external view returns (uint256) {
        return streams.length;
    }

    /// @notice updates treasury account
    /// @dev restricted for the admin only. Admin should pause this
    /// contract before changing the treasury address by setting the
    /// pause =1 (for changing this variable, call adminPause(1))
    /// @param _treasury treasury contract address for the reward tokens
    function updateTreasury(address _treasury)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        // enforce pausing this contract before updating the address.
        // This mitigates the risk of future invalid reward claims
        require(paused != 0, "REQUIRE_PAUSE");
        require(_treasury != address(0), "INVALID_ADDRESS");
        require(_treasury != treasury, "SAME_ADDRESS");
        treasury = _treasury;
    }

    /// @dev stakeOnBehalfOfOtherUsers called for airdropping Aurora users
    /// @param accounts the account address
    /// @param amounts in AURORA tokens
    /// @param batchAmount equals to the sum of amounts
    /// WARNING: rewards are not claimed during stake. Airdrop script must claim or
    /// only distribute to accounts without stake
    function stakeOnBehalfOfOtherUsers(
        address[] calldata accounts,
        uint256[] calldata amounts,
        uint256 batchAmount
    ) external pausable(1) onlyRole(AIRDROP_ROLE) {
        uint256 accountsLength = accounts.length;
        require(accountsLength == amounts.length, "INVALID_ARRAY_LENGTH");
        _before();
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < accountsLength; i++) {
            totalAmount += amounts[i];
            _stake(accounts[i], amounts[i]);
        }
        require(totalAmount == batchAmount, "INVALID_BATCH_AMOUNT");
        IERC20Upgradeable(auroraToken).safeTransferFrom(
            msg.sender,
            address(treasury),
            batchAmount
        );
    }

    /// @dev stakeOnBehalfOfAnotherUser is called for airdropping Aurora users
    /// @param account the account address
    /// @param amount in AURORA tokens
    /// WARNING: rewards are not claimed during stake. Airdrop script must claim or
    /// only distribute to accounts without stake
    function stakeOnBehalfOfAnotherUser(address account, uint256 amount)
        external
        pausable(1)
        onlyRole(AIRDROP_ROLE)
    {
        _before();
        _stake(account, amount);
        IERC20Upgradeable(auroraToken).safeTransferFrom(
            msg.sender,
            address(treasury),
            amount
        );
    }

    /// @dev moves the reward for specific stream Id to pending rewards.
    /// It will require a waiting time untill it get released. Users call
    /// this in function in order to claim rewards.
    /// @param streamId stream index
    function moveRewardsToPending(uint256 streamId) external pausable(1) {
        _before();
        _moveRewardsToPending(msg.sender, streamId);
    }

    /// @dev moves all the user rewards to pending reward.
    function moveAllRewardsToPending() external pausable(1) {
        _before();
        // Claim all streams while skipping inactive streams.
        _moveAllRewardsToPending(msg.sender);
    }

    /// @dev moves a set of stream Id rewards to pending.
    /// Allows user to select stream ids to claim from UI.
    /// @param streamIds stream indexes
    function batchMoveRewardsToPending(uint256[] calldata streamIds)
        external
        pausable(1)
    {
        _before();
        _batchClaimRewards(msg.sender, streamIds);
    }

    /// @dev Claim a stream's rewards on behalf of another user.
    /// @param account the user account address.
    /// @param streamId to claim.
    function claimOnBehalfOfAnotherUser(address account, uint256 streamId)
        external
        pausable(1)
        onlyRole(CLAIM_ROLE)
    {
        _before();
        _moveRewardsToPending(account, streamId);
    }

    /// @dev Claim all stream rewards on behalf of another user.
    /// @param account the user account address.
    function claimAllOnBehalfOfAnotherUser(address account)
        external
        pausable(1)
        onlyRole(CLAIM_ROLE)
    {
        _before();
        _moveAllRewardsToPending(account);
    }

    /// @dev Claim all stream rewards on behalf of other users.
    /// @param accounts the user account addresses.
    function claimAllOnBehalfOfOtherUsers(address[] calldata accounts)
        external
        pausable(1)
        onlyRole(CLAIM_ROLE)
    {
        _before();
        uint256 accountsLength = accounts.length;
        for (uint256 i = 0; i < accountsLength; i++) {
            _moveAllRewardsToPending(accounts[i]);
        }
    }

    /// @dev batchClaimOnBehalfOfAnotherUser when gas limits prevent users from claiming all.
    /// @param account the user account address.
    /// @param streamIds to claim.
    function batchClaimOnBehalfOfAnotherUser(
        address account,
        uint256[] calldata streamIds
    ) external pausable(1) onlyRole(CLAIM_ROLE) {
        _before();
        _batchClaimRewards(account, streamIds);
    }

    /// @dev Claim all stream rewards on behalf of other users.
    /// @param accounts the user account addresses.
    function batchClaimOnBehalfOfOtherUsers(
        address[] calldata accounts,
        uint256[] calldata streamIds
    ) external pausable(1) onlyRole(CLAIM_ROLE) {
        _before();
        uint256 accountsLength = accounts.length;
        for (uint256 i = 0; i < accountsLength; i++) {
            _batchClaimRewards(accounts[i], streamIds);
        }
    }

    /// @dev a user stakes amount of AURORA tokens
    /// The user should approve these tokens to the treasury
    /// contract in order to complete the stake.
    /// @param amount is the AURORA amount.
    function stake(uint256 amount) external pausable(1) {
        _before();
        _stake(msg.sender, amount);
        IERC20Upgradeable(auroraToken).safeTransferFrom(
            msg.sender,
            address(treasury),
            amount
        );
    }

    /// @dev withdraw amount in the pending pool. User should wait for
    /// pending time (tau constant) in order to be able to withdraw.
    /// @param streamId stream index
    function withdraw(uint256 streamId) external pausable(1) {
        require(
            block.timestamp > users[msg.sender].releaseTime[streamId],
            "INVALID_RELEASE_TIME"
        );
        _withdraw(streamId);
    }

    /// @dev withdraw all claimed balances which have passed pending periode.
    /// This function will reach gas limit with too many streams,
    /// so the frontend will allow individual stream withdrawals and disable withdrawAll.
    function withdrawAll() external pausable(1) {
        User storage userAccount = users[msg.sender];
        uint256 streamsLength = streams.length;
        for (uint256 i = 0; i < streamsLength; i++) {
            if (
                userAccount.pendings[i] != 0 &&
                block.timestamp > userAccount.releaseTime[i]
            ) {
                _withdraw(i);
            }
        }
    }

    /// @dev withdraw a set of stream Ids.
    /// Allows user to select stream ids to withdraw from UI.
    /// @param streamIds to withdraw.
    function batchWithdraw(uint256[] calldata streamIds) external pausable(1) {
        User storage userAccount = users[msg.sender];
        for (uint256 i = 0; i < streamIds.length; i++) {
            if (
                userAccount.pendings[streamIds[i]] != 0 &&
                block.timestamp > userAccount.releaseTime[streamIds[i]]
            ) {
                _withdraw(streamIds[i]);
            }
        }
    }

    /// @dev gets the total user deposit
    /// @param account the user address
    /// @return user total deposit in (AURORA)
    function getUserTotalDeposit(address account)
        external
        view
        returns (uint256)
    {
        return users[account].deposit;
    }

    /// @dev gets the user shares
    /// @param account the user address
    /// @return user shares
    function getUserShares(address account) external view returns (uint256) {
        return users[account].auroraShares;
    }

    /// @dev unstake amount from user shares value. The rest is re-staked
    /// @param amount to unstake
    function unstake(uint256 amount)
        external
        pausable(1)
        onlyValidSharesAmount
    {
        _before();
        uint256 stakeValue = (totalAmountOfStakedAurora *
            users[msg.sender].auroraShares) / totalAuroraShares;
        _unstake(amount, stakeValue);
    }

    /// @dev unstake all the user's shares
    function unstakeAll() external pausable(1) onlyValidSharesAmount {
        _before();
        uint256 stakeValue = (totalAmountOfStakedAurora *
            users[msg.sender].auroraShares) / totalAuroraShares;
        _unstake(stakeValue, stakeValue);
    }

    /// @dev gets a user stream shares
    /// @param streamId stream index
    /// @param account the user address
    /// @return user stream shares
    function getAmountOfShares(uint256 streamId, address account)
        external
        view
        returns (uint256)
    {
        if (streamId == 0) return users[account].auroraShares;
        return users[account].streamShares;
    }

    /// @dev gets reward per share (RPS) for a stream
    /// @param streamId stream index
    /// @return streams[streamId].rps
    function getRewardPerShare(uint256 streamId)
        external
        view
        returns (uint256)
    {
        return streams[streamId].rps;
    }

    /// @dev calculates and gets the latest released rewards.
    /// @param streamId stream index
    /// @return rewards released since last update.
    function getRewardsAmount(uint256 streamId, uint256 lastUpdate)
        public
        view
        returns (uint256)
    {
        require(lastUpdate <= block.timestamp, "INVALID_LAST_UPDATE");
        if (lastUpdate == block.timestamp) return 0; // No more rewards since last update
        uint256 streamStart = streams[streamId].schedule.time[0];
        if (block.timestamp <= streamStart) return 0; // Stream didn't start
        uint256 streamEnd = streams[streamId].schedule.time[
            streams[streamId].schedule.time.length - 1
        ];
        if (lastUpdate >= streamEnd) return 0; // Stream schedule ended, all rewards released
        uint256 start;
        uint256 end;
        if (lastUpdate > streamStart) {
            start = lastUpdate;
        } else {
            // Release rewards from stream start.
            start = streamStart;
        }
        if (block.timestamp < streamEnd) {
            end = block.timestamp;
        } else {
            // The stream already finished between the last update and now.
            end = streamEnd;
        }
        return rewardsSchedule(streamId, start, end);
    }

    /// @dev calculates and gets the latest reward per share (RPS) for a stream
    /// @param streamId stream index
    /// @return streams[streamId].rps + scheduled reward up till now
    function getLatestRewardPerShare(uint256 streamId)
        public
        view
        returns (uint256)
    {
        require(streamId != 0, "AURORA_REWARDS_COMPOUND");
        require(totalStreamShares != 0, "ZERO_STREAM_SHARES");
        return
            streams[streamId].rps +
            (getRewardsAmount(streamId, touchedAt) * RPS_MULTIPLIER) /
            totalStreamShares;
    }

    /// @dev gets the user's reward per share (RPS) for a stream
    /// @param streamId stream index
    /// @return user.rpsDuringLastClaim[streamId]
    function getRewardPerShareForUser(uint256 streamId, address account)
        external
        view
        returns (uint256)
    {
        return users[account].rpsDuringLastClaim[streamId];
    }

    /// @dev gets the user's stream claimable amount
    /// @param streamId stream index
    /// @return (latesRPS - user.rpsDuringLastClaim) * user.shares
    function getStreamClaimableAmount(uint256 streamId, address account)
        external
        view
        returns (uint256)
    {
        uint256 latestRps = getLatestRewardPerShare(streamId);
        User storage userAccount = users[account];
        uint256 userRps = userAccount.rpsDuringLastClaim[streamId];
        uint256 userShares = userAccount.streamShares;
        return ((latestRps - userRps) * userShares) / RPS_MULTIPLIER;
    }

    /// @dev gets the user's stream pending reward
    /// @param streamId stream index
    /// @param account user account
    /// @return user.pendings[streamId]
    function getPending(uint256 streamId, address account)
        external
        view
        returns (uint256)
    {
        return users[account].pendings[streamId];
    }

    /// @dev gets the user's stream reward release time
    /// @param streamId stream index
    /// @param account user account
    /// @return user.releaseTime[streamId]
    function getReleaseTime(uint256 streamId, address account)
        external
        view
        returns (uint256)
    {
        return users[account].releaseTime[streamId];
    }

    /// @dev gets the total amount of staked aurora
    /// @return totalAmountOfStakedAurora + latest reward schedule
    function getTotalAmountOfStakedAurora() external view returns (uint256) {
        if (touchedAt == 0) return 0;
        return totalAmountOfStakedAurora + getRewardsAmount(0, touchedAt);
    }

    /// @dev gets start index and end index in a stream schedule
    /// @param streamId stream index
    /// @param start start time (in seconds)
    /// @param end end time (in seconds)
    function startEndScheduleIndex(
        uint256 streamId,
        uint256 start,
        uint256 end
    ) public view returns (uint256 startIndex, uint256 endIndex) {
        Schedule storage schedule = streams[streamId].schedule;
        uint256 scheduleTimeLength = schedule.time.length;
        require(scheduleTimeLength > 0, "NO_SCHEDULE");
        require(end > start, "INVALID_REWARD_QUERY_PERIOD");
        require(start >= schedule.time[0], "QUERY_BEFORE_SCHEDULE_START");
        require(
            end <= schedule.time[scheduleTimeLength - 1],
            "QUERY_AFTER_SCHEDULE_END"
        );
        // find start index
        for (uint256 i = 1; i < scheduleTimeLength; i++) {
            if (start < schedule.time[i]) {
                startIndex = i - 1;
                break;
            }
        }
        // find end index
        if (end == schedule.time[scheduleTimeLength - 1]) {
            endIndex = scheduleTimeLength - 2;
        } else {
            for (uint256 i = startIndex + 1; i < scheduleTimeLength; i++) {
                if (end < schedule.time[i]) {
                    // Users most often claim rewards within the same index which can last several months.
                    endIndex = i - 1;
                    break;
                }
            }
        }
        require(startIndex <= endIndex, "INVALID_INDEX_CALCULATION");
    }

    /// @dev calculate the total amount of the released tokens within a period (start & end)
    /// @param streamId the stream index
    /// @param start is the start timestamp within the schedule
    /// @param end is the end timestamp (e.g block.timestamp .. now)
    /// @return amount of the released tokens for that period
    function rewardsSchedule(
        uint256 streamId,
        uint256 start,
        uint256 end
    ) public view returns (uint256) {
        Schedule storage schedule = streams[streamId].schedule;
        uint256 startIndex;
        uint256 endIndex;
        (startIndex, endIndex) = startEndScheduleIndex(streamId, start, end);
        uint256 rewardScheduledAmount = 0;
        uint256 reward = 0;
        if (startIndex == endIndex) {
            // start and end are within the same schedule period
            reward =
                schedule.reward[startIndex] -
                schedule.reward[startIndex + 1];
            rewardScheduledAmount =
                (reward * (end - start)) /
                (schedule.time[startIndex + 1] - schedule.time[startIndex]);
        } else {
            // start and end are not within the same schedule period
            // Reward during the startIndex period
            reward =
                schedule.reward[startIndex] -
                schedule.reward[startIndex + 1];
            rewardScheduledAmount =
                (reward * (schedule.time[startIndex + 1] - start)) /
                (schedule.time[startIndex + 1] - schedule.time[startIndex]);
            // Reward during the period from startIndex + 1  to endIndex - 1
            rewardScheduledAmount +=
                schedule.reward[startIndex + 1] -
                schedule.reward[endIndex];
            // Reward during the endIndex period
            reward = schedule.reward[endIndex] - schedule.reward[endIndex + 1];
            rewardScheduledAmount +=
                (reward * (end - schedule.time[endIndex])) /
                (schedule.time[endIndex + 1] - schedule.time[endIndex]);
        }
        return rewardScheduledAmount;
    }

    /// @dev called before touching the contract reserves (stake/unstake)
    function _before() internal {
        if (touchedAt == block.timestamp) return; // Already updated by previous tx in same block.
        if (totalAuroraShares != 0) {
            // Don't release rewards if there are no stakers.
            totalAmountOfStakedAurora += getRewardsAmount(0, touchedAt);
            uint256 streamsLength = streams.length;
            for (uint256 i = 1; i < streamsLength; i++) {
                if (streams[i].status == StreamStatus.ACTIVE) {
                    // If stream becomes blacklisted, no more rewards are released.
                    streams[i].rps = getLatestRewardPerShare(i);
                }
            }
        }
        touchedAt = block.timestamp;
    }

    /// @dev calculate the weighted stream shares at given timeshamp.
    /// @param timestamp the timestamp refering to the current or older timestamp
    function _weightedShares(uint256 shares, uint256 timestamp)
        internal
        view
        returns (uint256)
    {
        uint256 slopeStart = streams[0].schedule.time[0] + ONE_MONTH;
        uint256 slopeEnd = slopeStart + FOUR_YEARS;
        if (timestamp <= slopeStart) return shares * maxWeight;
        if (timestamp >= slopeEnd) return shares * minWeight;
        return
            shares *
            minWeight +
            (shares * (maxWeight - minWeight) * (slopeEnd - timestamp)) /
            (slopeEnd - slopeStart);
    }

    /// @dev allocate the collected reward to the pending tokens
    /// Rewards will become withdrawable after the release time.
    /// @param account is the staker address
    /// @param streamId the stream index
    function _moveRewardsToPending(address account, uint256 streamId) internal {
        require(streamId != 0, "AURORA_REWARDS_COMPOUND");
        require(
            streams[streamId].status == StreamStatus.ACTIVE,
            "INACTIVE_OR_PROPOSED_STREAM"
        );
        User storage userAccount = users[account];
        require(
            userAccount.auroraShares != 0,
            "USER_DOES_NOT_HAVE_ACTUAL_STAKE"
        );
        uint256 reward = ((streams[streamId].rps -
            userAccount.rpsDuringLastClaim[streamId]) *
            userAccount.streamShares) / RPS_MULTIPLIER;
        if (reward == 0) return; // All rewards claimed or stream schedule didn't start
        userAccount.pendings[streamId] += reward;
        userAccount.rpsDuringLastClaim[streamId] = streams[streamId].rps;
        userAccount.releaseTime[streamId] =
            block.timestamp +
            streams[streamId].tau;
        // If the stream is blacklisted, remaining unclaimed rewards will be transfered out.
        streams[streamId].rewardClaimedAmount += reward;
        emit Pending(streamId, account, userAccount.pendings[streamId]);
    }

    /// @dev move all the streams rewards for a user to the pending tokens
    /// @param account is the staker address
    function _moveAllRewardsToPending(address account) internal {
        uint256 streamsLength = streams.length;
        for (uint256 i = 1; i < streamsLength; i++) {
            if (streams[i].status == StreamStatus.ACTIVE)
                _moveRewardsToPending(account, i);
        }
    }

    /// @dev moves a set of stream Id rewards to pending.
    /// `_before` must be called before to update the streams rps.
    /// @param account the user account address.
    /// @param streamIds to claim.
    function _batchClaimRewards(address account, uint256[] calldata streamIds)
        internal
    {
        for (uint256 i = 0; i < streamIds.length; i++) {
            if (streams[streamIds[i]].status == StreamStatus.ACTIVE)
                _moveRewardsToPending(account, streamIds[i]);
        }
    }

    /// @dev calculate the shares for a user per AURORA stream and other streams
    /// @param amount the staked amount
    /// WARNING: rewards are not claimed during stake.
    /// The UI must make sure to claim rewards before adding more stake.
    /// Unclaimed rewards will be lost.
    /// `_before()` must be called before `_stake` to update streams rps
    /// compounded AURORA rewards.
    function _stake(address account, uint256 amount) internal {
        // recalculation of shares for user
        User storage userAccount = users[account];
        uint256 _amountOfShares = 0;
        if (totalAuroraShares == 0) {
            // initialize the number of shares (_amountOfShares) owning 100% of the stake (amount)
            _amountOfShares = amount;
        } else {
            uint256 numerator = amount * totalAuroraShares;
            _amountOfShares = numerator / totalAmountOfStakedAurora;
            // check that rounding is needed (result * denominator < numerator).
            if (_amountOfShares * totalAmountOfStakedAurora < numerator) {
                // Round up so users don't get less sharesValue than their staked amount
                _amountOfShares += 1;
            }
        }
        userAccount.auroraShares += _amountOfShares;
        totalAuroraShares += _amountOfShares;
        totalAmountOfStakedAurora += amount;
        userAccount.deposit += amount;

        // Calculate stream shares
        uint256 weightedAmountOfSharesPerStream = _weightedShares(
            _amountOfShares,
            block.timestamp
        );
        totalStreamShares += weightedAmountOfSharesPerStream;
        userAccount.streamShares += weightedAmountOfSharesPerStream;
        uint256 streamsLength = streams.length;
        for (uint256 i = 1; i < streamsLength; i++) {
            userAccount.rpsDuringLastClaim[i] = streams[i].rps; // The new shares should not claim old rewards
        }
        emit Staked(account, amount, _amountOfShares);
    }

    /// WARNING: rewards are not claimed during unstake.
    /// The UI must make sure to claim rewards before unstaking.
    /// Unclaimed rewards will be lost.
    /// `_before()` must be called before `_unstake` to update streams rps
    function _unstake(uint256 amount, uint256 stakeValue) internal {
        require(amount != 0, "ZERO_AMOUNT");
        require(amount <= stakeValue, "NOT_ENOUGH_STAKE_BALANCE");
        User storage userAccount = users[msg.sender];
        // move rewards to pending
        // remove the shares from everywhere
        totalAuroraShares -= userAccount.auroraShares;
        totalStreamShares -= userAccount.streamShares;
        userAccount.auroraShares = 0;
        userAccount.streamShares = 0;
        // update the total Aurora staked and deposits
        totalAmountOfStakedAurora -= stakeValue;
        userAccount.deposit = 0;
        // move unstaked AURORA to pending.
        userAccount.pendings[0] += amount;
        userAccount.releaseTime[0] = block.timestamp + streams[0].tau;
        emit Pending(0, msg.sender, userAccount.pendings[0]);
        emit Unstaked(msg.sender, amount);
        // restake the rest
        uint256 amountToRestake = stakeValue - amount;
        if (amountToRestake > 0) {
            _stake(msg.sender, amountToRestake);
        }
    }

    /// @dev validates the stream parameters prior proposing it.
    /// @param streamOwner stream owner address
    /// @param rewardToken stream reward token address
    /// @param maxDepositAmount the max reward token deposit
    /// @param minDepositAmount the min reward token deposit
    /// @param scheduleTimes the stream schedule time list
    /// @param scheduleRewards the stream schedule reward list
    /// @param tau the tau is (pending release period) for this stream (e.g one day)
    function _validateStreamParameters(
        address streamOwner,
        address rewardToken,
        uint256 maxDepositAmount,
        uint256 minDepositAmount,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tau
    ) internal view {
        require(streamOwner != address(0), "INVALID_STREAM_OWNER_ADDRESS");
        require(rewardToken != address(0), "INVALID_REWARD_TOKEN_ADDRESS");
        require(maxDepositAmount > 0, "ZERO_MAX_DEPOSIT");
        require(minDepositAmount > 0, "ZERO_MIN_DEPOSIT");
        require(minDepositAmount <= maxDepositAmount, "INVALID_MIN_DEPOSIT");
        require(
            maxDepositAmount == scheduleRewards[0],
            "MAX_DEPOSIT_MUST_EQUAL_SCHEDULE"
        );
        // scheduleTimes[0] == proposal expiration time
        require(
            scheduleTimes[0] > block.timestamp,
            "INVALID_STREAM_EXPIRATION_DATE"
        );
        require(
            scheduleTimes.length == scheduleRewards.length,
            "INVALID_SCHEDULE_VALUES"
        );
        require(scheduleTimes.length >= 2, "SCHEDULE_TOO_SHORT");
        require(tau != 0 && tau < ONE_MONTH, "INVALID_TAU_PERIOD");
        for (uint256 i = 1; i < scheduleTimes.length; i++) {
            require(
                scheduleTimes[i] > scheduleTimes[i - 1],
                "INVALID_SCHEDULE_TIMES"
            );
            require(
                scheduleRewards[i] <= scheduleRewards[i - 1],
                "INVALID_SCHEDULE_REWARDS"
            );
        }
        require(
            scheduleRewards[scheduleRewards.length - 1] == 0,
            "INVALID_SCHEDULE_END_REWARD"
        );
    }

    /// @dev updates the stream reward schedule if the reward token amount is less than
    /// the max deposit amount.
    /// @param streamId the stream index
    /// @param rewardTokenAmount the stream reward token amount
    function _updateStreamRewardSchedules(
        uint256 streamId,
        uint256 rewardTokenAmount
    ) internal {
        uint256 streamScheduleRewardLength = streams[streamId]
            .schedule
            .reward
            .length;
        for (uint256 i = 0; i < streamScheduleRewardLength; i++) {
            streams[streamId].schedule.reward[i] =
                (streams[streamId].schedule.reward[i] * rewardTokenAmount) /
                streams[streamId].maxDepositAmount;
        }
    }

    /// @dev withdraw stream rewards after the release time.
    /// @param streamId the stream index
    function _withdraw(uint256 streamId) internal {
        User storage userAccount = users[msg.sender];
        uint256 pendingAmount = userAccount.pendings[streamId];
        userAccount.pendings[streamId] = 0;
        emit Released(streamId, msg.sender, pendingAmount);
        ITreasury(treasury).payRewards(
            msg.sender,
            streams[streamId].rewardToken,
            pendingAmount
        );
    }
}
