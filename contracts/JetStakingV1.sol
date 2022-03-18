// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./ITreasury.sol";
import "./IJetStakingV1.sol";
import "./AdminControlled.sol";
import "./VotingERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";


contract JetStakingV1 is IJetStakingV1, AdminControlled, VotingERC20Upgradeable {
    uint256 constant DENOMINATOR = 31556926; //1Year
    uint256 constant SEASON_PERIOD = 5260000; //2Months
    uint256 public totalAmountOfStakedAurora;
    uint256 private _currentSeason;
    uint256 touchedAt;
    uint256[] weights;
    uint256[] public tau;
    uint256[] public totalShares;
    address[] public streams;
    address public treasury;
    uint256[] seasons;
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

    struct Vote {
        uint256 count;
        uint256 validAt;
    }

    mapping(address => User) users;
    mapping(address => uint256) public streamToIndex;
    mapping(uint256 => uint256) public rps; // Reward per share for a stream j>0
    mapping(address => bool) whitelistedContracts;
    mapping(address => Vote) public futureVotes;

    Schedule[] schedules;

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

    event StreamActivated(
        address indexed stream,
        uint256 index,
        uint256 timestamp
    );

    event StreamDeactivated(
        address indexed stream,
        uint256 index,
        uint256 timestamp
    );

    event VotesTransfered(
        address indexed _sender,
        address indexed _recipient,
        uint256 _amount
    );

    modifier onlyValidSchedule() {
        require(
            block.timestamp < schedules[0].time[schedules[0].time.length -1],
            "INVALID_SCHEDULE"
        );
        _;
    }

    /// @dev initialize the contract and deploys the first stream (AURORA)
    /// @param aurora token contract address
    /// @param scheduleTimes init the schedule time
    /// @param scheduleRewards init the schedule amounts
    /// @param tauAuroraStream release time constant per stream (e.g AURORA stream)
    /// @param _flags admin controlled contract flags
    /// @param _treasury the Aurora treasury contract address
    function initialize(
        address aurora,
        string memory voteTokenName,
        string memory voteTokenSymbol,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tauAuroraStream,
        uint256 _flags,
        address _treasury,
        uint256 seasons_count
    ) public initializer {
        require(
            aurora != address(0) &&
            _treasury != address(0),
            "INVALID_ADDRESS"
        );
        __ERC20_init(voteTokenName, voteTokenSymbol);
        __AdminControlled_init(_flags);
        treasury = _treasury;
        streams.push(aurora);
        streamToIndex[aurora] = 0;
        totalShares.push(0);
        weights.push(1); //TODO: need to be set
        totalAmountOfStakedAurora = 0;
        schedules.push(
            Schedule(scheduleTimes, scheduleRewards)
        );
        tau.push(tauAuroraStream);
        // set season 0 start time
        _currentSeason = 0;
        for(uint256 i = 0; i <= seasons_count; i++){
            seasons.push(block.timestamp + SEASON_PERIOD * i);
        }
        // default stream added (AURORA with an index 0)
        emit StreamActivated(
            aurora,
            streamToIndex[aurora],
            block.timestamp
        );
    }

    /// @dev deploys new stream
    /// @param stream token contract address
    /// @param weight the stream weight constant
    /// @param scheduleTimes init the schedule time for a stream
    /// @param scheduleRewards init the schedule amounts for a stream
    /// @param tauPerStream release time constant per stream (e.g AURORA stream)
    function deployStream(
        address stream,
        uint256 weight,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tauPerStream
    ) external onlyRole(DEFAULT_ADMIN_ROLE) onlyValidSchedule {
        require(
            stream != address(0),
            "INVALID_ADDRESS"
        );
        require(
            streamToIndex[stream] == 0 && streams.length > 0,
            "STREAM_ALREADY_EXISTS"
        );
        streamToIndex[stream] = streams.length;
        streams.push(stream);
        totalShares.push(0);
        weights.push(weight);
        tau.push(tauPerStream);
        schedules.push(
            Schedule(scheduleTimes, scheduleRewards)
        );
        emit StreamActivated(
            stream,
            streamToIndex[stream],
            block.timestamp
        );
    }

    function removeStream(
        address stream,
        address streamOwner
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _before();
        //TODO: distribute all reward to users
        // using pull pattern instead of push.
        // totalReward_j = rps_j * totalShares_j
        // where j is the stream Id
        emit StreamDeactivated(
            stream,
            streamToIndex[stream],
            block.timestamp
        );
        //TODO: transfer back the rest of tokens to the stream owner
        // transfer the (IERC20Upgradeable(streams[j]).balanceOf(address(this)) - totalReward_j) > 0
    }

    /// @notice updates treasury account
    /// @dev restricted for the admin only
    /// @param _treasury treasury contract address for the reward tokens
    function updateTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        //TODO: should pause this contract
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

    /// @notice Creates `amount` vote tokens and assigns them to `user`,
    /// increasing the total supply. Only admin role has this privilege.
    /// @param user user address to mint
    /// @param amount of tokens to mint
    function mint(address user, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _mint(user, amount);
    }

    /// @notice burns `amount` vote tokens.
    /// Only admin role has this privilege.
    /// @param user user address to mint
    /// @param amount of tokens to mint
    function burn(address user, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _burn(user, amount);
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
        _currentSeason = currentSeason();
        _burnOldVotesAndMintCurrentVotes(msg.sender);
        require(
            _amount <= _balances[msg.sender],
            'INSUFFICIENT_VOTES'
        );
        _transfer(_sender, _recipient, _amount);
        emit VotesTransfered(_sender, _recipient, _amount);
        return true;
    }

    function currentSeason() public view returns(uint256) {
        for(uint256 i = seasons.length - 1; i >= 0; i--) {
            if (block.timestamp > seasons[i]) return i;
        }
    }

    function batchStakeOnBehalfOfOtherUsers(
        address[] memory accounts,
        uint256[] memory amounts,
        uint256 batchAmount
    ) external onlyValidSchedule {
        require(accounts.length == amounts.length, "INVALID_ARRAY_LENGTH");
        uint256 totalAmount = 0;
        for(uint256 i = 0; i < amounts.length; i++){
            totalAmount += amounts[i];
            _stakeOnBehalfOfAnotherUser(accounts[i], amounts[i]);
            _updateFutureVotes(msg.sender);
        }
        require(totalAmount == batchAmount, "INVALID_BATCH_AMOUNT");
        IERC20Upgradeable(streams[0]).transferFrom(msg.sender, address(this), batchAmount);
    }

    /// @dev it is called for airdropping Aurora users
    /// @param account the account address
    /// @param amount in AURORA tokens
    function stakeOnBehalfOfAnotherUser(
        address account,
        uint256 amount
    ) public onlyValidSchedule {
        _stakeOnBehalfOfAnotherUser(account, amount);
        _updateFutureVotes(msg.sender);
        IERC20Upgradeable(streams[0]).transferFrom(msg.sender, address(this), amount);
    }

    /// @dev moves the reward for specific stream Id to pending rewards.
    /// It will require a waiting time untill it get released. Users call
    /// this in function in order to claim rewards.
    /// @param streamId stream index
    function moveRewardsToPending(
        uint256 streamId
    ) external {
        _before();
        _moveRewardsToPending(msg.sender, streamId);
    }

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
        _updateFutureVotes(msg.sender);
        //TODO: change the pay reward by calling the treasury.
        IERC20Upgradeable(streams[0]).transferFrom(msg.sender, address(this), amount);
    }

    /// @dev withdraw amount in the pending. User should wait for
    /// pending time (tau constant) in order to be able to withdraw.
    /// @param streamId stream index
    function withdraw(uint256 streamId) external {
        require(
            block.timestamp > users[msg.sender].releaseTime[streamId],
            "INVALID_RELEASE_TIME"
        );
        uint256 pendingAmount = users[msg.sender].pendings[streamId];
        users[msg.sender].pendings[streamId] = 0;
        //TODO: change the transfer to happen through the treasury contract
        ITreasury(treasury).payRewards(msg.sender, streams[streamId], pendingAmount);
        // IERC20Upgradeable(streams[streamId]).transfer(msg.sender, pendingAmount);
        emit Released(streamId, msg.sender, pendingAmount, block.timestamp);
    }

    function getUserTotalDeposit(address account) external view returns(uint256) {
        return users[account].deposit;
    }

    function getUserShares(address account) external view returns(uint256) {
        return users[account].shares[0];
    }

    /// @dev unstake amount of user shares. It calculates the total amount of
    /// staked tokens based on the amount of shares, moves them to pending withdrawl,
    /// then restake the (total user staked amount - shares value) if there is any.
    function unstake(uint256 shares) external {
        //TODO: allow unstaking after schedule end
        // this edge case does not allow users to unstake
        // if the schedules end becaues it reverts with
        // INVALID_SCHEDULE_PARAMETERS
        // Also no restaking after ending of schedule
        _before();
        require(
            totalAmountOfStakedAurora != 0,
            "NOTHING_TO_UNSTAKE"
        );
        uint256 userShares = users[msg.sender].shares[0];
        require(
            shares <= userShares &&
            shares != 0 &&
            userShares != 0,
            'INVALID_SHARES_AMOUNT'
        );
        uint256 userSharesValue = (totalAmountOfStakedAurora * shares) / totalShares[0];
        uint256 totalUserSharesValue = (totalAmountOfStakedAurora * userShares) / totalShares[0];
        // move rewards to pending
        _moveAllRewardsToPending(msg.sender);
        // remove the shares from everywhere
        for(uint256 i = 0; i < streams.length; i++){
            totalShares[i] -= users[msg.sender].shares[i];
            users[msg.sender].shares[i] = 0;
        }
        // update the total Aurora staked and deposits
        totalAmountOfStakedAurora -= userSharesValue;
        users[msg.sender].deposit = 0;
        // move unstaked AURORA to pending.
        users[msg.sender].pendings[0] += userSharesValue;
        users[msg.sender].releaseTime[0] = block.timestamp + tau[0];
        emit Pending(0, msg.sender, users[msg.sender].pendings[0], block.timestamp);
        emit Unstaked(msg.sender, userSharesValue, userShares, block.timestamp);
        // restake the rest
        uint256 amountToRestake = totalUserSharesValue - userSharesValue;
        if(amountToRestake > 0) {
            _stake(msg.sender, amountToRestake);
            _updateFutureVotes(msg.sender);
        }
    }

    function getAmountOfShares(
        address user,
        uint256 streamId
    ) external view returns(uint256) {
        return users[user].shares[streamId];
    }

    function getRewardPerShare(uint256 streamId) external view returns(uint256) {
        return rps[streamId];
    }

    function getRewardPerShareForUser(uint256 streamId, address account) external view returns(uint256) {
        return users[account].rps[streamId];
    }

    function getPending(
        address user,
        uint256 streamId
    ) external view returns(uint256) {
        return users[user].pendings[streamId];
    }

    function getSchedule(
        uint256 streamId
    )
    external
    view
    returns(uint256[] memory, uint256[] memory) {
        return(schedules[streamId].time, schedules[streamId].reward);
    }

    function startEndScheduleIndex(
        uint256 streamId,
        uint256 start,
        uint256 end
    )
    public
    view
    returns(uint256 startIndex, uint256 endIndex) {
        Schedule storage schedule = schedules[streamId];
        require(schedule.time.length > 0, "NO_SCHEDULE");
        require(
            end > start &&
            start >= schedule.time[0] &&
            end <= schedule.time[schedule.time.length - 1],
            "INVALID_SCHEDULE_PARAMETERS"
        );
        // find start index and end index
        for(uint i = 0; i < schedule.time.length - 1; i++){
            if(start < schedule.time[i]) {
                startIndex = i-1;
                break;
            }
        }

        for(uint i = schedule.time.length - 1; i > 0; i--){
            if(end >= schedule.time[i]) {
                endIndex = i;
                break;
            }
        }
    }

    /// @dev calculate the total amount of the released tokens
    /// @param streamId the stream index
    /// @param start is the start timestamp within the schedule
    /// @param end is the end timestamp (e.g block.timestamp .. now)
    /// @return amount of the released tokens for that period
    function schedule(
        uint256 streamId,
        uint256 start,
        uint256 end
    ) public view returns(uint256) {
        uint256 startIndex;
        uint256 endIndex;
        (startIndex, endIndex) = startEndScheduleIndex(streamId, start, end);
        Schedule storage schedule = schedules[streamId];
        uint256 rewardScheduledAmount = 0;
        uint256 reward = 0;
        if(startIndex == endIndex) {
            // start and end are within the same schedule period
            reward = schedule.reward[startIndex] - schedule.reward[startIndex+1];
            rewardScheduledAmount = (reward / DENOMINATOR) * (end - start);
        } else {
            // start and end are not within the same schedule period
            // Reward during the startIndex period
            reward = (schedule.reward[startIndex] - schedule.reward[startIndex + 1]);
            rewardScheduledAmount = (reward / DENOMINATOR) * (schedule.time[startIndex + 1] - start);
            // Reward during the period from startIndex + 1  to endIndex - 1
            for (uint256 i = startIndex + 1; i < endIndex; i++) {
                reward = schedule.reward[i] - schedule.reward[i+1];
                rewardScheduledAmount += reward;
            }
            // Reward during the endIndex period
            if(end > schedule.time[endIndex]){
                reward = schedule.reward[endIndex] - schedule.reward[endIndex + 1];
                rewardScheduledAmount += (reward / DENOMINATOR) * (end - schedule.time[endIndex]);
            } else if(end == schedule.time[schedule.time.length - 1]) {
                rewardScheduledAmount += schedule.reward[schedule.time.length - 1];
            }
        }
        //TODO: phantom overflow/underflow check
        return rewardScheduledAmount;
    }

    /// @dev calculate the weight per stream based on the the timestamp.
    /// @param weightFactor is the weight constant per stream.
    /// @param timestamp the timestamp refering to the current or older timestamp
    function _weighting(
        uint256 weightFactor,
        uint256 timestamp
    ) private pure returns(uint256 result) {
        //TODO: update the weighting function
        result = 1;
    }

    /// @dev called before touching the contract reserves (stake/unstake)
    function _before() internal {
        // release rewards once per block after 1st stake
        if(touchedAt != 0 && touchedAt != block.timestamp){
            totalAmountOfStakedAurora += schedule(0, touchedAt, block.timestamp);
            // AURORA rps is not used because rewards are split among staker shares (compound?)
            for (uint256 i = 1; i < streams.length; i++) {
                rps[i] += schedule(i, touchedAt, block.timestamp) / totalShares[i];
                //TODO: deactivate stream if needed
            }
            touchedAt = block.timestamp;
        }
    }

    /// @dev allocate the collected reward to the pending tokens
    /// @notice TODO: potentially withdraw the released rewards if any
    /// @param account is the staker address
    /// @param streamId the stream index
    function _moveRewardsToPending(
        address account,
        uint256 streamId
    ) private {
        //TODO: phantom overflow/underflow check
        require(streamId != 0, "AURORA_REWARDS_COMPOUND");
        User storage userAccount = users[account];
        uint256 reward = (rps[streamId] - userAccount.rps[streamId]) * userAccount.shares[streamId];
        userAccount.pendings[streamId] += reward;
        userAccount.rps[streamId] = rps[streamId];
        userAccount.releaseTime[streamId] = block.timestamp + tau[streamId];
        emit Pending(streamId, account, userAccount.pendings[streamId], block.timestamp);
    }

    function _moveAllRewardsToPending(address account) private {
        for(uint256 i = 1; i < streams.length; i++) {
            _moveRewardsToPending(account, i);
        }
    }


    /// @dev internal function for airdropping Aurora users
    /// @param account the account address
    /// @param amount in AURORA tokens
    function  _stakeOnBehalfOfAnotherUser(
        address account,
        uint256 amount
    ) internal {
        _before();
        _stake(account, amount);
    }

    /// @dev calculate the shares for a user per AURORA stream and other streams
    /// @param amount the staked amount
    function _stake(address account, uint256 amount) private {
        // recalculation of shares for user
        User storage userAccount = users[account];
        uint256 _amountOfShares = 0;
        if(totalShares[0] == 0){
            // initialize the number of shares (_amountOfShares) owning 100% of the stake (amount)
            _amountOfShares = amount;
            // start rewards release
            touchedAt = block.timestamp;
        } else {
            _amountOfShares = amount * totalShares[0] / totalAmountOfStakedAurora;
        }
        if(userAccount.shares[0] != 0) {
            // move rewards to pending: new shares should not claim previous rewards.
            _moveAllRewardsToPending(account);
        }
        userAccount.shares[0] += _amountOfShares;
        totalShares[0] += _amountOfShares;
        totalAmountOfStakedAurora += amount;
        userAccount.deposit += amount;

        // Calculate stream shares
        for(uint256 i = 1; i < streams.length; i++){
            uint256 weightedAmountOfSharesPerStream = _amountOfShares * _weighting(weights[i], block.timestamp);
            userAccount.shares[i] += weightedAmountOfSharesPerStream;
            totalShares[i] += weightedAmountOfSharesPerStream;
        }
        emit Staked(account, amount, _amountOfShares, block.timestamp);
    }

    function  _updateFutureVotes(address account) internal {
        uint256 timeDiff;
        uint256 currentTimestamp = block.timestamp;
        if(currentTimestamp > seasons[_currentSeason]) _currentSeason = currentSeason();
        currentTimestamp == seasons[_currentSeason] ?  timeDiff = 1 : timeDiff = currentTimestamp - seasons[_currentSeason];
        futureVotes[account].count = users[account].shares[0] / timeDiff;
        futureVotes[account].validAt = _currentSeason + 1;
    }

    function _burnOldVotesAndMintCurrentVotes(address account) internal {
        _currentSeason = currentSeason();
        if(_currentSeason == futureVotes[account].validAt) {
            if(_balances[account] > 0) {
                _burn(account, _balances[account]);
            }
            _mint(account, futureVotes[account].count);
            _updateFutureVotes(account);
        }
    }
}
