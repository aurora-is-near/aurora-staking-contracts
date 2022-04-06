// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./ITreasury.sol";
import "./AdminControlled.sol";
import "./VotingERC20Upgradeable.sol";
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
 *      It also defines the voting tokens (minting/burning) mechanics based
 *      on the user actions (stake/unstake) during voting season. A season is
 *      the period (defined by this contract admin) where a user can vote for
 *      a project. Vote tokens are ERC20 compatible with some limits in transfering,
 *      approving, minting and burning vote tokens. Only whitelisted contracts
 *      (e.g vote manager) is allowed to call transferFrom on behalf of the user
 *      in order to transfer these tokens for voting.
 *
 *      This contract is AdminControlled which has a tremendous power. However
 *      hopfully it be governed by a community wallet.
 */
contract JetStakingV1 is AdminControlled, VotingERC20Upgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    uint256 constant DENOMINATOR = 31556926; //1Year
    // RPS_MULTIPLIER = Aurora_max_supply x weight(1000) * 10 (large enough to always release rewards) =
    // 10**9 * 10**18 * 10**3 * 10= 10**31
    uint256 constant RPS_MULTIPLIER = 1e31;
    uint256 public totalAmountOfStakedAurora;
    uint256 public touchedAt;
    uint256[] public tau;
    uint256[] public totalShares;
    uint256 public decayGracePeriod;
    uint256 public burnGracePeriod;
    uint256 public seasonDuration;
    uint256 public streamsCount;
    address public treasury;
    address public auroraToken;

    struct User {
        uint256 deposit;
        mapping(uint256 => uint256) shares; // The amount of shares for user per stream j
        mapping(uint256 => uint256) pendings; // The amount of tokens pending release for user per stream
        mapping(uint256 => uint256) releaseTime; // The release moment per stream
        mapping(uint256 => uint256) rps; // RPS or reward per share during the previous withdrawal
    }

    struct Schedule {
        uint256[] time;
        uint256[] reward;
    }

    struct Stream {
        address streamOwner;
        address rewardToken;
        uint256 auroraDepositAmount;
        uint256 auroraClaimedAmount;
        uint256 rewardDepositAmount;
        uint256 rewardClaimedAmount;
        uint256 maxDepositAmount;
        uint256 lastClaimedTime;
        uint256 proposalExpiresAt;
        bool isProposed;
        bool isActive;
    }

    mapping(address => User) users;
    mapping(address => uint256) public streamToIndex;
    mapping(uint256 => uint256) public rps; // Reward per share for a stream j>0
    mapping(address => bool) public whitelistedContracts;
    Schedule[] schedules;
    Stream[] streams;

    // events
    event Staked(
        address indexed user,
        uint256 amount,
        uint256 shares,
        uint256 timestamp
    );

    event Unstaked(
        address indexed user,
        uint256 amount,
        uint256 shares,
        uint256 timestamp
    );

    event Pending(
        uint256 indexed streamId,
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    event Released(
        uint256 indexed streamId,
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    event StreamProposed(
        uint256 indexed streamId,
        address indexed owner,
        uint256 timestamp
    );

    event StreamCreated(
        uint256 indexed streamId,
        address indexed owner,
        uint256 timestamp
    );

    event StreamRemoved(
        uint256 indexed streamId,
        address indexed owner,
        uint256 timestamp
    );

    event VotesTransfered(
        address indexed _sender,
        address indexed _recipient,
        uint256 _amount
    );

    modifier onlyValidSchedule() {
        require(
            block.timestamp < schedules[0].time[schedules[0].time.length - 1],
            "INVALID_SCHEDULE"
        );
        _;
    }

    modifier onlyActiveStream(uint256 streamId) {
        require(streams[streamId].isActive, "INACTIVE_STREAM");
        _;
    }

    /// @dev initialize the contract and deploys the first stream (AURORA)
    /// @param aurora token contract address
    /// @param scheduleTimes init the schedule time
    /// @param scheduleRewards init the schedule amounts
    /// @param tauAuroraStream release time constant per stream (e.g AURORA stream)
    /// @param _flags admin controlled contract flags
    /// @param _treasury the Aurora treasury contract address
    /// @param _decayGracePeriod period for each season in which vote tokes don't decay
    /// @param _burnGracePeriod period for each season after which admin is able to burn unused vote tokens
    function initialize(
        address aurora,
        string memory voteTokenName,
        string memory voteTokenSymbol,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tauAuroraStream,
        uint256 _flags,
        address _treasury,
        uint256 _decayGracePeriod,
        uint256 _burnGracePeriod,
        uint256 _seasonDuration
    ) public initializer {
        require(
            aurora != address(0) && _treasury != address(0),
            "INVALID_ADDRESS"
        );
        __ERC20_init(voteTokenName, voteTokenSymbol);
        __AdminControlled_init(_flags);
        require(_seasonDuration > 0, "INVALID_SEASON_DURATION");
        require(
            _decayGracePeriod < _seasonDuration,
            "INVALID_DECAY_GRACE_PERIOD"
        );
        require(
            _burnGracePeriod < _seasonDuration,
            "INVALID_BURN_GRACE_PERIOD"
        );
        seasonDuration = _seasonDuration;
        treasury = _treasury;
        auroraToken = aurora;
        totalShares.push(0);
        totalAmountOfStakedAurora = 0;
        schedules.push(Schedule(scheduleTimes, scheduleRewards));
        tau.push(tauAuroraStream);
        decayGracePeriod = _decayGracePeriod;
        burnGracePeriod = _burnGracePeriod;
        //init AURORA default stream
        uint256 streamId = 0;
        streams.push();
        Stream storage stream = streams[streamId];
        stream.streamOwner = msg.sender;
        stream.rewardToken = aurora;
        stream.auroraDepositAmount = 0;
        stream.auroraClaimedAmount = 0;
        stream.maxDepositAmount = 0;
        stream.rewardDepositAmount = 0;
        stream.rewardClaimedAmount = 0;
        stream.lastClaimedTime = 0;
        stream.proposalExpiresAt = 0;
        stream.isProposed = true;
        stream.isActive = true;
        emit StreamProposed(streamId, msg.sender, block.timestamp);
        emit StreamCreated(streamId, msg.sender, block.timestamp);
    }

    /// @notice updates decay grace period
    /// @dev restricted for the admin only
    /// @param _decayGracePeriod period for each season in which vote tokes don't decay
    function updateDecayGracePeriod(uint256 _decayGracePeriod)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_decayGracePeriod < seasonDuration);
        decayGracePeriod = _decayGracePeriod;
    }

    /// @notice updates burn grace period
    /// @dev restricted for the admin only
    /// @param _burnGracePeriod period for each season in which vote tokes don't decay
    function updateBurnGracePeriod(uint256 _burnGracePeriod)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_burnGracePeriod < seasonDuration);
        burnGracePeriod = _burnGracePeriod;
    }

    /// @dev An admin of the staking contract can whitelist a stream.
    ///Whitelisting of the stream provides the option for the stream
    ///creator (presumably the issuing party of a specific token) to
    ///deposit some ERC-20 tokens on the staking contract and potentially
    ///get in return some AURORA tokens. Deposited ERC-20 tokens will be
    ///distributed to the stakers over some period of time.
    /// @param streamOwner only this account would be able to create a stream
    /// @param rewardToken the address of the ERC-20 tokens to be deposited in the stream
    /// @param auroraDepositAmount Amount of the AURORA deposited by the Admin.
    /// @param maxDepositAmount The upper amount of the tokens that should be deposited by the stream owner
    /// @param expiresAt max block height, until which the option to create the stream is active
    /// @param scheduleTimes array of block heights for each schedule time
    /// @param scheduleRewards array of reward amounts that are kept on the staking contract at each block height
    /// @param tauPerStream a constant release time per stream (e.g 1 day in seconds)
    function proposeStream(
        address streamOwner,
        address rewardToken,
        uint256 auroraDepositAmount,
        uint256 maxDepositAmount,
        uint256 expiresAt,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tauPerStream
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _validateStreamParameters(
            streamOwner,
            rewardToken,
            auroraDepositAmount,
            maxDepositAmount,
            expiresAt,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        );
        totalShares.push(totalShares[0] * _weighting(block.timestamp));
        tau.push(tauPerStream);
        schedules.push(Schedule(scheduleTimes, scheduleRewards));
        uint256 streamId = streams.length;
        streams.push();
        Stream storage stream = streams[streamId];
        stream.streamOwner = streamOwner;
        stream.rewardToken = rewardToken;
        stream.auroraDepositAmount = auroraDepositAmount;
        stream.auroraClaimedAmount = 0;
        stream.maxDepositAmount = maxDepositAmount;
        stream.rewardDepositAmount = 0;
        stream.rewardClaimedAmount = 0;
        stream.lastClaimedTime = schedules[streamId].time[0];
        stream.proposalExpiresAt = expiresAt;
        stream.isProposed = true;
        stream.isActive = false;
        emit StreamProposed(streamId, streamOwner, block.timestamp);
        IERC20Upgradeable(auroraToken).safeTransferFrom(
            msg.sender,
            address(this),
            auroraDepositAmount
        );
    }

    /// @dev create new stream (only stream owner)
    /// stream owner must approve reward tokens to this contract.
    /// @param streamId stream id
    function createStream(uint256 streamId, uint256 rewardTokenAmount)
        external
    {
        Stream storage stream = streams[streamId];
        require(stream.isProposed, "STREAM_NOT_PROPOSED");
        require(stream.streamOwner == msg.sender, "INVALID_STREAM_OWNER");
        require(!stream.isActive, "STREAM_ALREADY_EXISTS");
        require(
            stream.proposalExpiresAt >= block.timestamp,
            "STREAM_PROPOSAL_EXPIRED"
        );
        stream.isActive = true;
        streamsCount++;
        emit StreamCreated(streamId, msg.sender, block.timestamp);
        if (rewardTokenAmount < stream.maxDepositAmount) {
            // refund staking admin if deposited reward tokens less than the upper limit of deposit
            uint256 refundAuroraAmount = ((stream.maxDepositAmount -
                rewardTokenAmount) * stream.auroraDepositAmount) /
                stream.maxDepositAmount;
            IERC20Upgradeable(auroraToken).safeTransfer(
                admin,
                refundAuroraAmount
            );
            stream.auroraDepositAmount -= refundAuroraAmount;
            // update stream reward schedules
            _updateStreamRewardSchedules(streamId, rewardTokenAmount);
        }

        stream.rewardDepositAmount = rewardTokenAmount;
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

    /// @dev removes a stream (only admin role)
    /// @param streamId contract address
    function removeStream(uint256 streamId)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Stream storage stream = streams[streamId];
        require(stream.isActive, "STREAM_ALREADY_REMOVED");
        stream.isActive = false;
        stream.isProposed = false;
        emit StreamRemoved(streamId, stream.streamOwner, block.timestamp);
        uint256 releaseAuroraAmount = stream.auroraDepositAmount -
            stream.auroraClaimedAmount;
        uint256 releaseRewardAmount = stream.rewardDepositAmount -
            stream.rewardClaimedAmount;
        // check enough treasury balance
        _checkTreasuryBalance(auroraToken, releaseAuroraAmount);
        _checkTreasuryBalance(stream.rewardToken, releaseRewardAmount);
        // move rest of the unclaimed aurora to the admin
        ITreasury(treasury).payRewards(admin, auroraToken, releaseAuroraAmount);
        // move the rest of rewards to the stream owner
        ITreasury(treasury).payRewards(
            stream.streamOwner,
            stream.rewardToken,
            releaseRewardAmount
        );
    }

    /// @dev the release of AURORA tokens to the stream creator is subjected to the same schedule as rewards.
    /// Thus if for a specific moment in time 30% of the rewards are distributed, then it means that 30% of
    /// the AURORA deposit can be withdrawn by the stream creator too.
    /// called by the stream owner
    /// @param streamId the stream index
    function releaseAuroraRewardsToStreamOwner(uint256 streamId) public {
        Stream storage stream = streams[streamId];
        require(msg.sender == stream.streamOwner, "INVALID_STREAM_OWNER");
        require(stream.isActive, "INACTIVE_STREAM");
        uint256 scheduledReward = rewardsSchedule(
            streamId,
            stream.lastClaimedTime,
            block.timestamp
        );
        uint256 auroraStreamOwnerReward = (scheduledReward *
            stream.auroraDepositAmount) / stream.rewardDepositAmount;
        stream.lastClaimedTime = block.timestamp;
        stream.auroraClaimedAmount += auroraStreamOwnerReward;
        stream.rewardClaimedAmount += scheduledReward;
        // check enough treasury balance
        _checkTreasuryBalance(auroraToken, auroraStreamOwnerReward);
        ITreasury(treasury).payRewards(
            stream.streamOwner,
            auroraToken,
            auroraStreamOwnerReward
        );
    }

    /// @dev get the stream data
    /// @param streamId the stream index
    function getStream(uint256 streamId)
        public
        view
        returns (
            address streamOwner,
            address rewardToken,
            uint256 auroraDepositAmount,
            uint256 rewardDepositAmount,
            uint256 maxDepositAmount,
            uint256 expiresAt,
            bool isProposed,
            bool isActive
        )
    {
        Stream storage stream = streams[streamId];
        return (
            stream.streamOwner,
            stream.rewardToken,
            stream.auroraDepositAmount,
            stream.rewardDepositAmount,
            stream.maxDepositAmount,
            stream.proposalExpiresAt,
            stream.isProposed,
            stream.isActive
        );
    }

    /// @notice updates treasury account
    /// @dev restricted for the admin only
    /// @param _treasury treasury contract address for the reward tokens
    function updateTreasury(address _treasury)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        //TODO: should pause this contract before changing the treasury contract address.
        require(_treasury != address(0), "INVALID_ADDRESS");
        treasury = _treasury;
    }

    /// @notice adds address to whitelist. Whitelisted addreses only are allowed to call transferFrom function
    /// @dev restricted for the admin only
    /// @param _address address to be added to whitelist
    /// @param _allowance flag determines allowance for the address
    function whitelistContract(address _address, bool _allowance)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_address != address(0), "INVALID_ADDRESS");
        whitelistedContracts[_address] = _allowance;
    }

    /// @notice batch adding address to whitelist. Whitelisted addreses only are allowed to call transferFrom function
    /// @dev restricted for the admin only
    /// @param _addresses addresses to be added to whitelist
    /// @param _allowances flag determines allowances for the addresses
    function batchWhitelistContract(
        address[] memory _addresses,
        bool[] memory _allowances
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_addresses.length == _allowances.length, "INVALID_LENGTH");

        for (uint256 i = 0; i < _addresses.length; i++) {
            require(_addresses[i] != address(0), "INVALID_ADDRESS");
            whitelistContract(_addresses[i], _allowances[i]);
        }
    }

    /// @notice Creates `_amount` tokens and assigns them to `_user`, increasing the total supply.
    /// @param _user user address to mint
    /// @param _amount of tokens to mint
    function mint(address _user, uint256 _amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _mint(_user, _amount);
    }

    /// @notice standard ERC20 transfer
    /// @dev reverts on any token transfer
    function transfer(address, uint256) public override returns (bool) {
        revert();
    }

    /// @notice standard ERC20 approve
    /// @dev reverts on any call
    function approve(address, uint256) public virtual override returns (bool) {
        revert();
    }

    /// @notice standard ERC20 transfer from
    /// @dev can called only by whitelisted contracts, implements accessible
    /// VOTE cheking based on decay. Can by paused by admin.
    /// @param _sender owner of the VOTE token
    /// @param _recipient tokens transfer to
    /// @param _amount amount of tokens to transfer
    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public override pausable(1) returns (bool) {
        require(whitelistedContracts[msg.sender], "ONLY_WHITELISTED_CONTRACT");
        _transfer(_sender, _recipient, _amount);
        emit VotesTransfered(_sender, _recipient, _amount);
        return true;
    }

    /// @dev batchStakeOnBehalfOfOtherUsers called for airdropping Aurora users
    /// @param accounts the account address
    /// @param amounts in AURORA tokens
    /// @param batchAmount equals to the sum of amounts
    function batchStakeOnBehalfOfOtherUsers(
        address[] memory accounts,
        uint256[] memory amounts,
        uint256 batchAmount
    ) external onlyValidSchedule {
        require(accounts.length == amounts.length, "INVALID_ARRAY_LENGTH");
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
            _stakeOnBehalfOfAnotherUser(accounts[i], amounts[i]);
            // mint and update the user's voting tokens balance
            //TODO: mint voting tokens
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
    function stakeOnBehalfOfAnotherUser(address account, uint256 amount)
        public
        onlyValidSchedule
    {
        _stakeOnBehalfOfAnotherUser(account, amount);
        // mint and update the user's voting tokens balance
        //TODO: mint voting tokens
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
    function moveRewardsToPending(uint256 streamId)
        external
        onlyActiveStream(streamId)
    {
        _before();
        _moveRewardsToPending(msg.sender, streamId);
    }

    /// @dev moves all the user rewards to pending reward.
    function moveAllRewardsToPending() external {
        _before();
        _moveAllRewardsToPending(msg.sender);
    }

    /// @dev a user stakes amount of AURORA tokens
    /// The user should approve these tokens to the treasury
    /// contract in order to complete the stake.
    /// @param amount is the AURORA amount.
    function stake(uint256 amount) public onlyValidSchedule {
        _before();
        _stake(msg.sender, amount);
        User storage userAccount = users[msg.sender];
        // mint and update the user's voting tokens balance
        //TODO: mint voting tokens
        _balances[msg.sender] += userAccount.shares[0];
        IERC20Upgradeable(auroraToken).safeTransferFrom(
            msg.sender,
            address(treasury),
            amount
        );
    }

    /// @dev withdraw amount in the pending. User should wait for
    /// pending time (tau constant) in order to be able to withdraw.
    /// @param streamId stream index
    function withdraw(uint256 streamId) external {
        User storage userAccount = users[msg.sender];
        require(
            block.timestamp > userAccount.releaseTime[streamId],
            "INVALID_RELEASE_TIME"
        );
        uint256 pendingAmount = userAccount.pendings[streamId];
        userAccount.pendings[streamId] = 0;
        // check treasury balance before moving funds
        _checkTreasuryBalance(streams[streamId].rewardToken, pendingAmount);
        ITreasury(treasury).payRewards(
            msg.sender,
            streams[streamId].rewardToken,
            pendingAmount
        );
        emit Released(streamId, msg.sender, pendingAmount, block.timestamp);
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
        return users[account].shares[0];
    }

    /// @dev unstake amount of user shares. It calculates the total amount of
    /// staked tokens based on the amount of shares, moves them to pending withdrawl,
    /// then restake the (total user staked amount - shares value) if there is any.
    function unstake(uint256 shares) external {
        // Also no restaking after ending of schedule
        User storage userAccount = users[msg.sender];
        _before();
        require(totalAmountOfStakedAurora != 0, "NOTHING_TO_UNSTAKE");
        uint256 userShares = userAccount.shares[0];
        require(
            shares <= userShares && shares != 0 && userShares != 0,
            "INVALID_SHARES_AMOUNT"
        );
        uint256 userSharesValue = (totalAmountOfStakedAurora * shares) /
            totalShares[0];
        uint256 totalUserSharesValue = (totalAmountOfStakedAurora *
            userShares) / totalShares[0];
        // move rewards to pending
        _moveAllRewardsToPending(msg.sender);
        // remove the shares from everywhere
        for (uint256 i = 0; i < streams.length; i++) {
            totalShares[i] -= userAccount.shares[i];
            userAccount.shares[i] = 0;
        }
        // update the total Aurora staked and deposits
        totalAmountOfStakedAurora -= totalUserSharesValue;
        userAccount.deposit = 0;
        // move unstaked AURORA to pending.
        userAccount.pendings[0] += userSharesValue;
        userAccount.releaseTime[0] = block.timestamp + tau[0];
        emit Pending(0, msg.sender, userAccount.pendings[0], block.timestamp);
        emit Unstaked(msg.sender, userSharesValue, userShares, block.timestamp);
        // restake the rest
        uint256 amountToRestake = totalUserSharesValue - userSharesValue;
        if (amountToRestake > 0) {
            _stake(msg.sender, amountToRestake);
        }
        // update the user's voting tokens balance
        // TODO: burn tokens
        _balances[msg.sender] = userAccount.shares[0];
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
        return users[account].shares[streamId];
    }

    /// @dev gets reward per share (RPS) for a stream
    /// @param streamId stream index
    /// @return rps[streamId]
    function getRewardPerShare(uint256 streamId)
        external
        view
        returns (uint256)
    {
        return rps[streamId];
    }

    /// @dev calculates and gets the latest released rewards.
    /// @param streamId stream index
    /// @return rewards released since last update.
    function getRewardsAmount(uint256 streamId) public view returns (uint256) {
        uint256 streamStart = schedules[streamId].time[0];
        if (block.timestamp <= streamStart) return 0; // Stream didn't start
        uint256 streamEnd = schedules[streamId].time[
            schedules[streamId].time.length - 1
        ];
        if (touchedAt >= streamEnd) return 0; // Stream schedule ended, all rewards released
        uint256 start;
        uint256 end;
        if (touchedAt > streamStart) {
            start = touchedAt;
        } else {
            // Release rewards from stream start.
            start = schedules[streamId].time[0];
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
    /// @return rps[streamId] + scheduled reward up till now
    function getLatestRewardPerShare(uint256 streamId)
        public
        view
        returns (uint256)
    {
        require(streamId != 0, "AURORA_REWARDS_COMPOUND");
        require(totalShares[streamId] != 0, "ZERO_STREAM_SHARES");
        return
            rps[streamId] +
            (getRewardsAmount(streamId) * RPS_MULTIPLIER) /
            totalShares[streamId];
    }

    /// @dev gets the user's reward per share (RPS) for a stream
    /// @param streamId stream index
    /// @return user.rps[streamId]
    function getRewardPerShareForUser(uint256 streamId, address account)
        external
        view
        returns (uint256)
    {
        return users[account].rps[streamId];
    }

    /// @dev gets the user's stream claimable amount
    /// @param streamId stream index
    /// @return (latesRPS - user.rps) * user.shares
    function getStreamClaimableAmount(uint256 streamId, address account)
        external
        view
        returns (uint256)
    {
        if (totalShares[streamId] == 0) return 0;
        uint256 latestRps = getLatestRewardPerShare(streamId);
        User storage userAccount = users[account];
        uint256 userRps = userAccount.rps[streamId];
        uint256 userShares = userAccount.shares[streamId];
        if (userShares == 0 && userAccount.shares[0] != 0) {
            // User staked before stream was added so initialize shares with the weight when the stream was created.
            userShares =
                userAccount.shares[0] *
                _weighting(schedules[streamId].time[0]);
        }
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

    /// @dev gets the stream schedule time and reward
    /// @param streamId stream index
    /// @return schedule.time, schedule.reward
    function getSchedule(uint256 streamId)
        external
        view
        returns (uint256[] memory, uint256[] memory)
    {
        return (schedules[streamId].time, schedules[streamId].reward);
    }

    /// @dev gets the total amount of staked aurora
    /// @return totalAmountOfStakedAurora + latest reward schedule
    function getTotalAmountOfStakedAurora() external view returns (uint256) {
        if (touchedAt == 0) return 0;
        return
            totalAmountOfStakedAurora +
            rewardsSchedule(0, touchedAt, block.timestamp);
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
        Schedule storage schedule = schedules[streamId];
        require(schedule.time.length > 0, "NO_SCHEDULE");
        require(
            end > start &&
                start >= schedule.time[0] &&
                end <= schedule.time[schedule.time.length - 1],
            "INVALID_SCHEDULE_PARAMETERS"
        );
        // find start index and end index
        for (uint256 i = 0; i < schedule.time.length - 1; i++) {
            if (start < schedule.time[i]) {
                startIndex = i - 1;
                break;
            }
        }

        for (uint256 i = schedule.time.length - 1; i > 0; i--) {
            if (end >= schedule.time[i]) {
                endIndex = i;
                break;
            }
        }
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
        uint256 startIndex;
        uint256 endIndex;
        (startIndex, endIndex) = startEndScheduleIndex(streamId, start, end);
        Schedule storage schedule = schedules[streamId];
        uint256 rewardScheduledAmount = 0;
        uint256 reward = 0;
        if (startIndex == endIndex) {
            // start and end are within the same schedule period
            reward =
                schedule.reward[startIndex] -
                schedule.reward[startIndex + 1];
            rewardScheduledAmount = (reward / DENOMINATOR) * (end - start);
        } else {
            // start and end are not within the same schedule period
            // Reward during the startIndex period
            reward = (schedule.reward[startIndex] -
                schedule.reward[startIndex + 1]);
            rewardScheduledAmount =
                (reward / DENOMINATOR) *
                (schedule.time[startIndex + 1] - start);
            // Reward during the period from startIndex + 1  to endIndex - 1
            for (uint256 i = startIndex + 1; i < endIndex; i++) {
                reward = schedule.reward[i] - schedule.reward[i + 1];
                rewardScheduledAmount += reward;
            }
            // Reward during the endIndex period
            if (end > schedule.time[endIndex]) {
                reward =
                    schedule.reward[endIndex] -
                    schedule.reward[endIndex + 1];
                rewardScheduledAmount +=
                    (reward / DENOMINATOR) *
                    (end - schedule.time[endIndex]);
            } else if (end == schedule.time[schedule.time.length - 1]) {
                rewardScheduledAmount += schedule.reward[
                    schedule.time.length - 1
                ];
            }
        }
        //TODO: phantom overflow/underflow check
        return rewardScheduledAmount;
    }

    /// @dev called before touching the contract reserves (stake/unstake)
    function _before() internal {
        if (touchedAt == block.timestamp) return; // Already updated by previous tx in same block.
        if (totalShares[0] != 0) {
            // Don't release rewards if there are no stakers.
            totalAmountOfStakedAurora += getRewardsAmount(0);
            for (uint256 i = 1; i < streams.length; i++) {
                rps[i] = getLatestRewardPerShare(i);
            }
        }
        touchedAt = block.timestamp;
    }

    /// @dev internal function for airdropping Aurora users
    /// @param account the account address
    /// @param amount in AURORA tokens
    function _stakeOnBehalfOfAnotherUser(address account, uint256 amount)
        internal
    {
        _before();
        _stake(account, amount);
    }

    /// @dev calculate the weight per stream based on the the timestamp.
    /// @param timestamp the timestamp refering to the current or older timestamp
    function _weighting(uint256 timestamp)
        private
        pure
        returns (uint256 result)
    {
        //TODO: update the weighting function
        result = 1;
    }

    /// @dev allocate the collected reward to the pending tokens
    /// @notice TODO: potentially withdraw the released rewards if any
    /// @param account is the staker address
    /// @param streamId the stream index
    function _moveRewardsToPending(address account, uint256 streamId) private {
        //TODO: phantom overflow/underflow check
        require(streamId != 0, "AURORA_REWARDS_COMPOUND");
        User storage userAccount = users[account];
        if (userAccount.shares[streamId] == 0 && userAccount.shares[0] != 0) {
            // User staked before stream was added so initialize shares with the weight when the stream was created.
            userAccount.shares[streamId] =
                userAccount.shares[0] *
                _weighting(schedules[streamId].time[0]);
        }
        uint256 reward = ((rps[streamId] - userAccount.rps[streamId]) *
            userAccount.shares[streamId]) / RPS_MULTIPLIER;
        require(reward != 0, "ZERO_REWARD");
        userAccount.pendings[streamId] += reward;
        userAccount.rps[streamId] = rps[streamId];
        userAccount.releaseTime[streamId] = block.timestamp + tau[streamId];
        emit Pending(
            streamId,
            account,
            userAccount.pendings[streamId],
            block.timestamp
        );
    }

    /// @dev move all the streams rewards for a user to the pending tokens
    /// @param account is the staker address
    function _moveAllRewardsToPending(address account) private {
        for (uint256 i = 1; i < streams.length; i++) {
            if (streams[i].isActive) _moveRewardsToPending(account, i);
        }
    }

    /// @dev calculate the shares for a user per AURORA stream and other streams
    /// @param amount the staked amount
    function _stake(address account, uint256 amount) private {
        // recalculation of shares for user
        User storage userAccount = users[account];
        uint256 _amountOfShares = 0;
        if (totalShares[0] == 0) {
            // initialize the number of shares (_amountOfShares) owning 100% of the stake (amount)
            _amountOfShares = amount;
        } else {
            // Round up (+1) so users don't get less sharesValue than their staked amount
            _amountOfShares =
                (amount * totalShares[0]) /
                totalAmountOfStakedAurora +
                1;
        }
        if (userAccount.shares[0] != 0) {
            // move rewards to pending: new shares should not claim previous rewards.
            _moveAllRewardsToPending(account);
        }
        userAccount.shares[0] += _amountOfShares;
        totalShares[0] += _amountOfShares;
        totalAmountOfStakedAurora += amount;
        userAccount.deposit += amount;

        // Calculate stream shares
        for (uint256 i = 1; i < streams.length; i++) {
            uint256 weightedAmountOfSharesPerStream = _amountOfShares *
                _weighting(block.timestamp);
            userAccount.shares[i] += weightedAmountOfSharesPerStream;
            userAccount.rps[i] = rps[i]; // The new shares should not claim old rewards
            totalShares[i] += weightedAmountOfSharesPerStream;
        }
        emit Staked(account, amount, _amountOfShares, block.timestamp);
    }

    /// @dev validates the stream parameters prior proposing it.
    /// @param streamOwner stream owner address
    /// @param rewardToken stream reward token address
    /// @param auroraDepositAmount the amount of Aurora token deposit by the admi.
    /// @param maxDepositAmount the max reward token deposit
    /// @param expiresAt the streams expiry date.
    /// @param scheduleTimes the stream schedule time list
    /// @param scheduleRewards the stream schedule reward list
    /// @param tauPerStream the tau per stream for this stream (e.g one day)
    function _validateStreamParameters(
        address streamOwner,
        address rewardToken,
        uint256 auroraDepositAmount,
        uint256 maxDepositAmount,
        uint256 expiresAt,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tauPerStream
    ) private {
        require(streamOwner != address(0), "INVALID_STREAM_OWNER_ADDRESS");
        require(rewardToken != address(0), "INVALID_REWARD_TOKEN_ADDRESS");
        require(
            auroraDepositAmount <= maxDepositAmount,
            "INVALID_DEPOSITED_AURORA_PARAMETERS"
        );
        require(expiresAt > block.timestamp, "INVALID_STREAM_EXPIRATION_DATE");
        require(
            scheduleTimes.length == scheduleRewards.length,
            "INVALID_SCHEDULE_VALUES"
        );
        require(tauPerStream != 0, "INVALID_TAU_PERIOD");
    }

    /// @dev updates the stream reward schedule if the reward token amount is less than
    /// the max deposit amount.
    /// @param streamId the stream index
    /// @param rewardTokenAmount the stream reward token amount
    function _updateStreamRewardSchedules(
        uint256 streamId,
        uint256 rewardTokenAmount
    ) private {
        for (uint256 i = 0; i < schedules[streamId].reward.length; i++) {
            if (i == 0) {
                schedules[streamId].reward[i] = rewardTokenAmount;
            } else if (i == schedules[streamId].reward.length - 1) {
                schedules[streamId].reward[i] = 0;
            } else {
                schedules[streamId].reward[i] =
                    schedules[streamId].reward[i - 1] /
                    2;
            }
        }
    }

    /// @dev check whether the treasury contract has enough funds
    /// @param token the token address
    /// @param amount the amount of tokens
    function _checkTreasuryBalance(address token, uint256 amount) private {
        require(
            IERC20Upgradeable(token).balanceOf(treasury) >= amount,
            "INSUFFICIENT_FUNDS"
        );
    }
}
