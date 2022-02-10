// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (token/ERC20/ERC20.sol)
pragma solidity 0.8.10;
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./AdminControlled.sol";
import "./ERC20Upgradeable.sol";
import "./interfaces/ITreasury.sol";

contract JetStakingV1 is AdminControlled, ERC20Upgradeable {

    uint256 totalAmountOfStakedAurora;
    uint256 touchedAt;
    uint256[] totalShares; // T_{j}
    address[] streams;
    uint256[] weights;
    uint256[] rps; // Reward per share for a stream j>0
    uint256[] tau;

    struct User {
        uint256[] shares; // The amount of shares for user per stream j
        uint256[] pendings; // The amount of tokens pending release for user per stream
        uint256[] releaseTime; // The release moment per stream
        uint256[] rps; // RPS or reward per share during the previous withdrawal
    }

    struct Schedule {
        uint256[] time;
        uint256[] reward;
    }

    mapping(address => User) users;
    mapping(address => uint256) streamToIndex;
    Schedule[] schedules;

    // events
    event Staked(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    event Unstaked(
        address indexed user,
        uint256 amount,
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

    /// @dev initialize the contract and deploys the first stream (AURORA)
    /// @param aurora token contract address
    /// @param scheduleTimes init the schedule time
    /// @param scheduleRewards init the schedule amounts
    /// @param tauPerStream release time constant per stream (e.g AURORA stream)
    function initialize(
        address aurora,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tauPerStream
    ) public initializer {
        require(
            aurora != address(0),
            'JetStakingV1: INVALID_ADDRESS'
        );
        
        streams.push(aurora);
        streamToIndex[aurora] = 0;
        totalShares[0] = 1; //TODO: check the initial value
        weights[0] = 1; //TODO: need to be set
        totalAmountOfStakedAurora = 0;
        schedules[0] = Schedule(scheduleTimes, scheduleRewards);
        tau[0] = tauPerStream;
        touchedAt = block.timestamp;
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
    ) external onlyAdmin {
        require(
            stream != address(0),
            'JetStakingV1: INVALID_ADDRESS'
        );
        require(
            streamToIndex[stream] == 0,
            'JetStakingV1: STREAM_ALREADY_EXISTS'
        );
        streamToIndex[stream] = streams.length;
        streams.push(stream);
        uint256 streamId = streamToIndex[stream];
        totalShares[streamId] = 1; //TODO: check the initial value of shares
        weights[streamId] = weight;
        tau[streamId] = tauPerStream;
        schedules[streamId] = Schedule(scheduleTimes, scheduleRewards);
    }

    /// @dev a user stakes amount of AURORA tokens
    /// The user should approve these tokens to the treasury
    /// contract in order to complete the stake.
    /// @param amount is the AURORA amount.
    function stake(uint256 amount) external {
        _before();
        _stake(amount);
        _after();
        //TODO: change the pay reward by calling the treasury.
        IERC20Upgradeable(streams[0]).transferFrom(msg.sender, address(this), amount);
    }

    /// @dev moves the reward for specific stream Id to pending deposit.
    /// It will require a waiting time untill it get released.
    /// @param streamId stream index
    function moveRewardsToPending(
        uint256 streamId
    ) external {
        _before();
        _moveRewardsToPending(msg.sender, streamId);
        _after();
    }

    /// @dev withdraw amount in the pending. User should wait for
    /// pending time (tau constant) in order to be able to withdraw.
    /// @param streamId stream index
    function withdraw(uint256 streamId) external {
        require(
            block.timestamp > users[msg.sender].releaseTime[streamId],
            'ERR: invalid release time'
        );
        uint256 pendingAmount = users[msg.sender].pendings[streamId];
        users[msg.sender].pendings[streamId] = 0;
        //TODO: change the transfer to happen through the treasury contract
        IERC20Upgradeable(streams[streamId]).transfer(msg.sender, pendingAmount);
        emit Released(streamId, msg.sender, pendingAmount, block.timestamp);
    }

    /// @dev unstake amount of AURORA tokens. It calculates the total amount of
    /// staked tokens based on the amount of shares, moves them to pending withdrawl,
    /// then restake the (total amount - amount) if there is any.
    function unstake(uint256 amount) external {
        uint256 totalAmount = (totalAmountOfStakedAurora * users[msg.sender].shares[0]) / totalShares[0];
        require(
            amount <= totalAmount,
            'JetStakingV1: INVALID_AMOUNT'
        );
        _before();

        users[msg.sender].pendings[0] += amount;
        users[msg.sender].releaseTime[0] = block.timestamp + tau[0];

        // recalculate the shares and move them to pending
        for(uint j = 1; j < streams.length; j++) {
            _moveRewardsToPending(msg.sender, j);
        }

        // remove the shares from everywhere
        for(uint i = 0; i < streams.length; i++){
            totalShares[i] -= users[msg.sender].shares[i];
            users[msg.sender].shares[i] = 0;
        }
        
        // stake totalAmount - amount
        if(totalAmount - amount > 0) {
            _stake(totalAmount - amount);
            //TODO: change the pay reward by calling the treasury.
            IERC20Upgradeable(streams[0]).transferFrom(msg.sender, address(this), totalAmount - amount);
        }
        _after();
        emit Unstaked(msg.sender, amount, block.timestamp);
    }

    /// @dev calculate the total amount of the released tokens
    /// @param streamId the stream index
    /// @param start is the start timestamp within the schedule
    /// @param end is the end timestamp (e.g block.timestamp .. now)
    /// @return amount of the released tokens for that period
    function _schedule(
        uint256 streamId,
        uint256 start,
        uint256 end
    ) private pure returns(uint256) {
        //TODO: update the schedule function
        uint256 oneYearBefore = 31536000;
        require(schedules[streamId].time.length > 0, 'JetStakingV1: NO_SCHEDULE');
        require(
            end > start &&
            start >= schedules[streamId].time[0] - oneYearBefore &&
            end <= schedules[streamId].time[schedules[streamId].time.length - 1],
            "JetStakingV1: INVALID_SCHEDULE_PARAMETERS"
        );
        // find start index and end index
        uint256 startIndex = 0;
        uint256 endIndex = 0;
        for(uint i = 0; i < schedules[streamId].time.length; i++){
            if(start < schedules[streamId].time[i]) startIndex = i;
            if(end < schedules[streamId].time[i]) endIndex = i;
        }

        uint256 rewardScheduledAmount = 0;
        uint256 denominator = 1;
        if(startIndex == endIndex) {
            // start and end in the same schedule period
            if(startIndex != 0) {
                denominator = schedules[streamId].time[startIndex] - schedules[streamId].time[startIndex - 1];
            } else {
                denominator = schedules[streamId].time[startIndex];
            }
            rewardScheduledAmount = ((end - start) * schedules[streamId].reward[startIndex]) / denominator;
        } else {
            // start and end are not in the same schedule period
            if(startIndex != 0) {
                denominator = schedules[streamId].time[startIndex] - schedules[streamId].time[startIndex - 1];
            } else {
                denominator = schedules[streamId].time[startIndex];
            }
            rewardScheduledAmount = ((schedules[streamId].time[startIndex] - start) * schedules[streamId].reward[startIndex]) / denominator;
            for (uint256 i = startIndex; i < schedules[streamId].time.length; i++) {
                if (i != endIndex) {
                    rewardScheduledAmount += schedules[streamId].reward[i];
                } else {
                    denominator = (schedules[streamId].time[i] - schedules[streamId].time[i - 1];
                    rewardScheduledAmount += ((schedules[streamId].time[i] - end) * schedules[streamId].reward[startIndex]) / denominator;
                }
            }
        }
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

    /// @dev called before touching the contract reserves
    function _before() private {
        // touch the contract block
        totalAmountOfStakedAurora += _schedule(0, touchedAt, block.timestamp);
        for (uint256 j = 0; j < streams.length; j++) {
            rps[j] += _schedule(j, touchedAt, block.timestamp) / totalShares[j];
            //TODO: deactivate stream if needed
        }
    }

    /// @dev update last time this contract was touched
    function _after() private {
        touchedAt = block.timestamp;
    }

    /// @dev allocate the collected reward to the pending tokens
    /// @notice TODO: potentially withdraw the released rewards if any
    /// @param user is the staker address
    /// @param streamId the stream index
    function _moveRewardsToPending(
        address user,
        uint256 streamId
    ) private {
        users[user].pendings[streamId] += (rps[streamId] - users[user].rps[streamId]) * users[user].shares[streamId];
        users[user].rps[streamId] = rps[streamId];
        users[user].releaseTime[streamId] = block.timestamp + tau[streamId];
        emit Pending(streamId, msg.sender, users[user].pendings[streamId], block.timestamp);
    }

    /// @dev calculate the shares for a user per AURORA stream and other streams
    /// @param amount the staked amount
    function _stake(uint256 amount) private {
        // recalculation of shares for AURORA
        uint256 _amountOfSharesPerStream = amount * (totalShares[0] / totalAmountOfStakedAurora);
        users[msg.sender].shares[0] += _amountOfSharesPerStream;
        totalShares[0] += _amountOfSharesPerStream;
        totalAmountOfStakedAurora += amount;

        // recalculation of shares for other streams
        for(uint256 i = 1; i < streams.length; i++){
            uint256 weightedAmountOfSharesPerStream = _amountOfSharesPerStream * _weighting(weights[i], block.timestamp);
            users[msg.sender].shares[i] += weightedAmountOfSharesPerStream;
            totalShares[i] += weightedAmountOfSharesPerStream;
        }
        emit Staked(msg.sender, amount, block.timestamp);
    }
}
