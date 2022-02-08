// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (token/ERC20/ERC20.sol)
pragma solidity 0.8.10;
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./AdminControlled.sol";
import "./ERC20Upgradeable.sol";
import "./interfaces/ITreasury.sol";

contract Staking is AdminControlled, ERC20Upgradeable {

    address[] streams; // By default AURORA stream index is 0
    mapping(address => uint256) streamToIndex;
    uint256[] totalSharesPerStream; // T_{j}
    uint256 totalAmountOfStakedAurora;

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
    // address[] usersList;
    uint256[] weights; // Decreasing function (starts with 1) which creates the leverage for the early stakers
    Schedule[] schedules; // A function that allow computing the amount of tokens released throught the stream to all users
    uint256[] rps; // Reward per share for a stream j>0
    uint256 lastTimestampThisContractWasTouched;
    uint256[] tau; // release time per stream

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

    function initialize(
        address aurora,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tauPerStream
    ) public initializer {
        // deploys the first stream (AURORA)
        require(
            aurora != address(0),
            'ERR: Invalid address'
        );
        streams.push(aurora);
        streamToIndex[aurora] = 0;
        totalSharesPerStream[0] = 1; //TODO: check the initial value
        weights[0] = 1; //TODO: need to be set
        totalAmountOfStakedAurora = 0;
        schedules[0] = Schedule(scheduleTimes, scheduleRewards);
        tau[0] = tauPerStream;
        lastTimestampThisContractWasTouched = block.timestamp;
    }

    function deployStream(
        address stream,
        uint256 weight,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tauPerStream
    ) external onlyAdmin {
        require(
            stream != address(0),
            'ERR: Invalid address'
        );
        require(
            streamToIndex[stream] == 0,
            'ERR: stream does exist!'
        );
        streamToIndex[stream] = streams.length;
        streams.push(stream);
        uint256 id = streamToIndex[stream];
        totalSharesPerStream[id] = 1; //TODO: check the initial value of shares
        weights[id] = weight;
        tau[id] = tauPerStream;
        schedules[id] = Schedule(scheduleTimes, scheduleRewards);
    }

    
    function stake(uint256 amount) external {
        // touch the contract block
        _beforeTouchingThisContract();
        _stake(amount);
    }

    function moveRewardToPending(
        address user,
        uint256 streamId
    ) external {
        // touch the contract block
        _beforeTouchingThisContract();
        _moveRewardToPending(user, streamId);
    }


    function withdraw(address user, uint256 streamId) external {
        if(block.timestamp > users[user].releaseTime[streamId]) {
            uint256 pendingAmount = users[user].pendings[streamId];
            users[user].pendings[streamId] = 0;
            IERC20Upgradeable(streams[streamId]).transfer(user, pendingAmount);
        }
    }

    function unstake(uint256 amount) external {
        uint256 totalAmount = (totalAmountOfStakedAurora * users[msg.sender].shares[0]) / totalSharesPerStream[0];
        require(
            amount <= totalAmount,
            'ERR: Invalid unstaking amount'
        );
        // touch the contract block
        _beforeTouchingThisContract();

        users[msg.sender].pendings[0] += amount;
        users[msg.sender].releaseTime[0] = block.timestamp + tau[0];

        // recalculate the shares and move them to pending
        for(uint j = 1; j < streams.length; j++) {
            _moveRewardToPending(msg.sender, j);
        }

        // remove the shares from everywhere
        for(uint i = 0; i < streams.length; i++){
            totalSharesPerStream[i] -= users[msg.sender].shares[i];
            users[msg.sender].shares[i] = 0;
        }
        
        // stake totalAmount - amount
        if(totalAmount - amount > 0) {
            _stake(totalAmount - amount);
        }
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
    ) private pure returns(uint256 amount) {
        //TODO: update the schedule function
        amount = 1;
    }

    function _weighting(
        uint256 weight,
        uint256 timestamp
    ) private pure returns(uint256 finalWeight) {
        //TODO: update the weighting function
        finalWeight = 1;
    }

    function _beforeTouchingThisContract() private {
        // touch the contract block
        totalAmountOfStakedAurora += _schedule(0, lastTimestampThisContractWasTouched, block.timestamp);
        for (uint256 j = 0; j < streams.length; j++) {
            rps[j] += _schedule(j, lastTimestampThisContractWasTouched, block.timestamp) / totalSharesPerStream[j];
            // deactivate stream if needed
        }
    }

    function _moveRewardToPending(
        address user,
        uint256 streamId
    ) private {
        // allocate the collected reward to the pending tokens
        //TODO: potentially withdraw the released rewards if any
        users[user].pendings[streamId] += (rps[streamId] - users[user].rps[streamId]) * users[user].shares[streamId];
        users[user].rps[streamId] = rps[streamId];
        users[user].releaseTime[streamId] = block.timestamp + tau[streamId];
        // update last time this contract was touched
        lastTimestampThisContractWasTouched = block.timestamp;
    }

    function _stake(uint256 amount) private {
        // recalculation of shares for AURORA
        uint256 _amountOfSharesPerStream = amount * (totalSharesPerStream[0] / totalAmountOfStakedAurora);
        users[msg.sender].shares[0] += _amountOfSharesPerStream;
        totalSharesPerStream[0] += _amountOfSharesPerStream;
        totalAmountOfStakedAurora += amount;

        // recalculation of shares for other streams
        for(uint256 i = 1; i < streams.length; i++){
            uint256 weightedAmountOfSharesPerStream = _amountOfSharesPerStream * _weighting(weights[i], block.timestamp);
            users[msg.sender].shares[i] += weightedAmountOfSharesPerStream;
            totalSharesPerStream[i] += weightedAmountOfSharesPerStream;
        }
        // update last time this contract was touched
        lastTimestampThisContractWasTouched = block.timestamp;
        IERC20Upgradeable(streams[0]).transferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, block.timestamp);
    }
}