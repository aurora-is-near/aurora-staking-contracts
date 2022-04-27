// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./AdminControlled.sol";
import "./ERC20Upgradeable.sol";
import "./interfaces/IStaking.sol";
import "./interfaces/ITreasury.sol";

// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once VOTE is sufficiently
// distributed and the community can show to govern itself.
//

contract JetStaking is AdminControlled, ERC20Upgradeable, IStaking {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public constant BP = 10; // TODO(MarX): require comment
    uint256 public constant DENOMINATOR = 10000; // TODO(MarX): require comment
    uint256 public constant MINIMUM_AURORA_STAKE = 5000000000000000000; // 5 AURORA

    // TODO(MarX): Use immutable to signal that this variable can't change after constructor
    address public immutable auroraToken;
    address public treasury;
    uint256 public totalStaked;
    // TODO(MarX): should't this be seasons.length instead?
    uint256 public seasonAmount;
    uint256 public seasonDuration;
    uint256 public startTime;
    uint256 public decayGracePeriod;
    uint256 public burnGracePeriod;
    uint256 public totalFor0Seasons;

    struct Deposit {
        uint256 amount;
        uint256 startSeason;
        uint256 endSeason;
        uint256 rewardWeight;
        uint256 voteWeight;
    }

    struct Stream {
        uint256 auroraAmountTotal;
        uint256 rewardsTokenAmount;
        uint256 height;
        uint256 lastAuroraClaimed;
        bool initialized;
        bool blacklisted;
        address rewardsToken;
        address tokenOwner;
        uint256[] rewardsScheduleKeys;
        mapping(uint256 => uint256) rewardsSchedule;
        mapping(address => mapping(uint256 => uint256)) lastRewardClaims;
    }

    struct Season {
        uint256 startSeason;
        uint256 applicationStart;
        uint256 applicationEnd;
        uint256 applicationVotingStart;
        uint256 applicationVotingEnd;
        uint256 startVoting;
        uint256 endVoting;
        uint256 endSeason;
        uint256 decayStart;
    }

    Stream[] public streams;
    Season[] public seasons;

    mapping(address => bool) public whitelistedContracts;
    mapping(address => mapping(uint256 => Deposit)) public deposits;
    mapping(address => uint256) public depositIds;
    mapping(address => bool) public supportedRewardTokens;
    mapping(uint256 => uint256) public rewardWeights;
    mapping(uint256 => uint256) public voteWeights;
    mapping(uint256 => uint256) public claimedVoteTokens;
    mapping(address => mapping(uint256 => uint256))
        public userClaimedVoteTokens;
    mapping(address => mapping(uint256 => uint256)) public userUsedVoteTokens;
    mapping(uint256 => uint256) public totalWeightedDepositedAmounts;
    mapping(address => uint256) public rewardsPool;

    event Claimed(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );
    event StreamAdded(
        uint256 indexed streamIndex,
        address indexed rewardsToken,
        address indexed tokenOwner,
        uint256 auroraAmountTotal,
        uint256 rewardsTokenAmount,
        uint256 height,
        uint256 lastAuroraClaimed
    );
    event StreamRemoved(uint256 _index);
    event Deposited(
        address indexed _user,
        uint256 _amount,
        uint256 _seasonsAmount
    );
    event Unstaked(address indexed _user, uint256 _amount);
    event DepositedToRewardPool(
        address indexed _user,
        uint256 _amount,
        uint256 _index
    );
    event AddedToRewardPool(
        address indexed _user,
        uint256 _amount,
        uint256 _index
    );
    event RemovedFromRewardPool(
        address indexed _user,
        uint256 _amount,
        uint256 _index
    );
    event VotesTransfered(
        address indexed _sender,
        address indexed _recipient,
        uint256 _amount
    );

    /// @notice initializator for upgradeable contract
    /// @param _name name for Vote token
    /// @param _symbol symbol for Vote token
    /// @param _seasonAmount season amount for staking period
    /// @param _seasonDuration timestamp duration for one season
    /// @param _startTime timestamp for first season starts
    /// @param _auroraToken staking token, aslo rewards token
    /// @param _treasury treasury contract address for the reward tokens
    /// @param _admin admin of the contract
    /// @param _flags flags determine is contract on paused or unpaused
    /// @param _decayGracePeriod period for each season in which vote tokes don't decay
    /// @param _burnGracePeriod period for each season after which admin is able to burn unused vote tokens
    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _seasonAmount,
        uint256 _seasonDuration,
        uint256 _startTime,
        address _auroraToken,
        address _treasury,
        address _admin,
        uint256 _flags,
        uint256 _decayGracePeriod,
        uint256 _burnGracePeriod
    ) public initializer {
        __ERC20_init(_name, _symbol);

        require(_admin != address(0));
        __AdminControlled_init(_admin, _flags);

        //require(_startTime > block.timestamp, "Invalid start time value");
        require(_seasonDuration > 0, "Invalid zero season duration value");
        require(
            _decayGracePeriod < _seasonDuration,
            "decay grace period should not less than season duration"
        );
        require(_burnGracePeriod < _seasonDuration);
        require(_auroraToken != address(0));
        require(_treasury != address(0));

        startTime = _startTime;
        seasonAmount = _seasonAmount;
        seasonDuration = _seasonDuration;
        auroraToken = _auroraToken;
        treasury = _treasury;
        decayGracePeriod = _decayGracePeriod;
        burnGracePeriod = _burnGracePeriod;

        _initSeasons(_seasonDuration);
    }

    /// @notice Initialize N seasons based on season duration
    /// @dev each new season strarts from start + seasonDuration * i seconds
    /// @param _seasonDuration timestamp duration for one season
    function _initSeasons(uint256 _seasonDuration) private {
        // TODO(MarX): Isn't it better to use the block number as the "time"?
        // Also it is tricky to compute end of seasons in the mid of two blocks! (it can have slightly
        // different behaviors)
        uint256 start = block.timestamp;

        for (uint256 i = 0; i < seasonAmount; i++) {
            uint256 idx = seasons.length;
            seasons.push();
            Season storage season = seasons[idx];

            season.startSeason = start;
            season.applicationStart = start;
            season.applicationEnd = start + _seasonDuration;
            season.applicationVotingStart = start;
            season.applicationVotingEnd = start + _seasonDuration;
            season.startVoting = start;
            season.endVoting = start + _seasonDuration;
            season.endSeason = start + _seasonDuration;
            season.decayStart = start + decayGracePeriod;

            // TODO(MarX): Let's use semi open intervals [start, end).
            // IMO: easier to reason about, less prone to bugs.
            // I learnt this lesson from Dijkstra (https://www.cs.utexas.edu/~EWD/transcriptions/EWD08xx/EWD831.html)
            start += _seasonDuration + 1;
        }
    }

    /// @notice add new season after last existing season
    /// @dev restricted for the admin only
    /// @param _startSeason timestamp which determines starting point for the season
    /// @param _applicationStart timestamp which determines starting point for the application
    /// @param _applicationEnd timestamp which determines ending point for the application
    /// @param _applicationVotingStart timestamp which determines starting point for the application voting during the season
    /// @param _applicationVotingEnd timestamp which determines ending point for the application voting during the season
    /// @param _startVoting timestamp which determines starting point for the voting during the season
    /// @param _endVoting timestamp which determines ending point for the voting during the season
    /// @param _endSeason timestamp which determines ending point for the season
    /// @param _decayStart timestamp period for each season after which vote tokes decay
    function addSeason(
        uint256 _startSeason,
        uint256 _applicationStart,
        uint256 _applicationEnd,
        uint256 _applicationVotingStart,
        uint256 _applicationVotingEnd,
        uint256 _startVoting,
        uint256 _endVoting,
        uint256 _endSeason,
        uint256 _decayStart
    ) external onlyAdmin {
        _validateSeasonParams(
            _startSeason,
            _applicationStart,
            _applicationEnd,
            _applicationVotingStart,
            _applicationVotingEnd,
            _startVoting,
            _endVoting,
            _endSeason,
            _decayStart
        );

        uint256 idx = seasons.length;
        seasons.push();

        // TODO(MarX): use memory, then write to storage? Isn't that cheaper. (Same in _init season)
        Season storage season = seasons[idx];
        season.startSeason = _startSeason;
        season.applicationStart = _applicationStart;
        season.applicationEnd = _applicationEnd;
        season.applicationVotingStart = _applicationVotingStart;
        season.applicationVotingEnd = _applicationVotingEnd;
        season.startVoting = _startVoting;
        season.endVoting = _endVoting;
        season.endSeason = _endSeason;
        season.decayStart = _decayStart;

        seasonAmount += 1;
    }

    /// @notice updates a season by its index
    /// @dev restricted for the admin only
    /// @param _startSeason timestamp which determines starting point for the season
    /// @param _applicationStart timestamp which determines starting point for the application
    /// @param _applicationEnd timestamp which determines ending point for the application
    /// @param _applicationVotingStart timestamp which determines starting point for the application voting during the season
    /// @param _applicationVotingEnd timestamp which determines ending point for the application voting during the season
    /// @param _startVoting timestamp which determines starting point for the voting during the season
    /// @param _endVoting timestamp which determines ending point for the voting during the season
    /// @param _endSeason timestamp which determines ending point for the season
    /// @param _decayStart timestamp period for each season after which vote tokes decay
    /// @param _index index of the configured season
    function configureSeason(
        uint256 _startSeason,
        uint256 _applicationStart,
        uint256 _applicationEnd,
        uint256 _applicationVotingStart,
        uint256 _applicationVotingEnd,
        uint256 _startVoting,
        uint256 _endVoting,
        uint256 _endSeason,
        uint256 _decayStart,
        uint256 _index
    ) external onlyAdmin {
        require(seasons.length > _index, "Out of bound index");
        require(_index != currentSeason(), "Invalid season index");

        _validateSeasonParams(
            _startSeason,
            _applicationStart,
            _applicationEnd,
            _applicationVotingStart,
            _applicationVotingEnd,
            _startVoting,
            _endVoting,
            _endSeason,
            _decayStart
        );

        Season storage season = seasons[_index];
        season.startSeason = _startSeason;
        season.applicationStart = _applicationStart;
        season.applicationEnd = _applicationEnd;
        season.applicationVotingStart = _applicationVotingStart;
        season.applicationVotingEnd = _applicationVotingEnd;
        season.startVoting = _startVoting;
        season.endVoting = _endVoting;
        season.endSeason = _endSeason;
        season.decayStart = _decayStart;
    }

    /// @notice validates season params
    /// @dev private function
    /// @param _startSeason timestamp which determines starting point for the season
    /// @param _applicationStart timestamp which determines starting point for the application
    /// @param _applicationEnd timestamp which determines ending point for the application
    /// @param _applicationVotingStart timestamp which determines starting point for the application voting during the season
    /// @param _applicationVotingEnd timestamp which determines ending point for the application voting during the season
    /// @param _startVoting timestamp which determines starting point for the voting during the season
    /// @param _endVoting timestamp which determines ending point for the voting during the season
    /// @param _endSeason timestamp which determines ending point for the season
    /// @param _decayStart timestamp period for each season after which vote tokes decay
    function _validateSeasonParams(
        uint256 _startSeason,
        uint256 _applicationStart,
        uint256 _applicationEnd,
        uint256 _applicationVotingStart,
        uint256 _applicationVotingEnd,
        uint256 _startVoting,
        uint256 _endVoting,
        uint256 _endSeason,
        uint256 _decayStart
    ) private pure {
        // TODO(MarX): _startSeason should be greater than previous season
        require(_startSeason < _endSeason);
        require(_startVoting < _endVoting);
        require(_applicationStart < _applicationEnd);
        require(_applicationVotingStart < _applicationVotingEnd);
        require(_startSeason <= _applicationStart);
        require(_startSeason <= _applicationVotingStart);
        require(_startSeason <= _startVoting);
        require(_startSeason <= _decayStart);
        require(_startVoting <= _decayStart);
        require(_endSeason >= _endVoting);
        require(_endSeason >= _decayStart);
        require(_endSeason >= _applicationVotingEnd);
    }

    /// @notice adds address to whitelist. Whitelisted addreses only are allowed to call transferFrom function
    /// @dev restricted for the admin only
    /// @param _address address to be added to whitelist
    /// @param _allowance flag determines allowance for the address
    function whitelistContract(address _address, bool _allowance)
        public
        onlyAdmin
    {
        require(_address != address(0), "Whitelist can't be zero address");
        whitelistedContracts[_address] = _allowance;
    }

    /// @notice batch adding address to whitelist. Whitelisted addreses only are allowed to call transferFrom function
    /// @dev restricted for the admin only
    /// @param _addresses addresses to be added to whitelist
    /// @param _allowances flag determines allowances for the addresses
    function batchWhitelistContract(
        address[] memory _addresses,
        bool[] memory _allowances
    ) external onlyAdmin {
        require(
            _addresses.length == _allowances.length,
            "Addresses and allowances length doesn't match"
        );

        for (uint256 i = 0; i < _addresses.length; i++) {
            // TODO(MarX): Redundant check (done inside whitelistContract)
            require(_addresses[i] != address(0), "Zero address");
            whitelistContract(_addresses[i], _allowances[i]);
        }
    }

    /// @notice update decay grace period
    /// @dev restricted for the admin only
    /// @param _decayGracePeriod period for each season in which vote tokes don't decay
    function updateDecayGracePeriod(uint256 _decayGracePeriod)
        external
        onlyAdmin
    {
        require(_decayGracePeriod < seasonDuration);
        decayGracePeriod = _decayGracePeriod;
    }

    /// @notice updates seasons amount
    /// @dev restricted for the admin only
    /// @param _seasonAmount season amount for staking period
    function updateSeasonAmount(uint256 _seasonAmount) external onlyAdmin {
        seasonAmount = _seasonAmount;
    }

    /// @notice updates treasury account
    /// @dev restricted for the admin only
    /// @param _treasury treasury contract address for the reward tokens
    function updateTreasury(address _treasury) external onlyAdmin {
        require(_treasury != address(0), "Zero address");
        treasury = _treasury;
    }

    /// @notice updates aurora token
    /// @dev restricted for the admin only
    /// @param _auroraToken staking token, aslo rewards token
    function updateAuroraToken(address _auroraToken) external onlyAdmin {
        require(_auroraToken != address(0), "Zero address");
        auroraToken = _auroraToken;
    }

    /// @notice updates reward weigths for seasons
    /// @dev restricted for the admin only
    /// @param _keys array of the seasons numbers
    /// @param _values array of the seasons weigths
    function updateRewardWeight(
        uint256[] memory _keys,
        uint256[] memory _values
    ) external onlyAdmin {
        require(_keys.length == _values.length, "Invalid length");

        for (uint256 i = 0; i < _keys.length; i++) {
            // TODO(MarX): Should this be less than (instead of less equal?)
            require(_keys[i] <= seasonAmount, "Invalid params");
            rewardWeights[_keys[i]] = _values[i];
        }
    }

    /// @notice updates vote weigths for seasons
    /// @dev restricted for the admin only
    /// @param _keys array of the seasons numbers
    /// @param _values array of the seasons weigths
    function updateVoteWeight(uint256[] memory _keys, uint256[] memory _values)
        external
        onlyAdmin
    {
        require(_keys.length == _values.length, "Invalid length");

        for (uint256 i = 0; i < _keys.length; i++) {
            require(_keys[i] <= seasonAmount, "Invalid params");
            voteWeights[_keys[i]] = _values[i];
        }
    }

    /// @notice adds new steam that determines rules for rewards allocation
    /// @dev restricted for the admin only
    /// @param _rewardsToken token that will be rewarded to users based on users stakes
    /// @param _tokenOwner project's tokens are expected to be received from
    /// @param _auroraAmountTotal deposited by Admin (AURORA should be transferred through transferFrom method of AURORA ERC-20)
    /// @param _rewardsTokenAmount the upper amount of the token, that should be deposited by the token owne
    /// @param _height timestamp until which this option is active
    /// @param _seasonIndexes piecewise-linear dependency of the decay of the rewards token on the staking contract, indexed
    /// @param _seasonRewards piecewise-linear dependency of the decay of the rewards token on the staking contract, values
    function addStream(
        address _rewardsToken,
        address _tokenOwner,
        uint256 _auroraAmountTotal,
        uint256 _rewardsTokenAmount,
        uint256 _height,
        uint256[] memory _seasonIndexes,
        uint256[] memory _seasonRewards
    ) external onlyAdmin {
        require(_seasonIndexes.length == _seasonRewards.length);
        require(!supportedRewardTokens[_rewardsToken], "Token already added");
        supportedRewardTokens[_rewardsToken] = true;

        uint256 idx = streams.length;
        streams.push();

        Stream storage stream = streams[idx];
        stream.rewardsToken = _rewardsToken;
        stream.tokenOwner = _tokenOwner;
        stream.auroraAmountTotal = _auroraAmountTotal;
        stream.rewardsTokenAmount = _rewardsTokenAmount;
        stream.height = _height;
        Season memory season = seasons[_seasonIndexes[0]];
        stream.lastAuroraClaimed = season.startSeason;

        uint256 rewardsTotalPercent;

        for (uint256 i = 0; i < _seasonIndexes.length; i++) {
            require(_seasonRewards[i] > 0);
            stream.rewardsSchedule[_seasonIndexes[i]] = _seasonRewards[i];
            stream.rewardsScheduleKeys.push(_seasonIndexes[i]);
            rewardsTotalPercent += _seasonRewards[i];
        }

        require(rewardsTotalPercent == 10000, "Invalid total percent");

        IERC20Upgradeable(auroraToken).safeTransferFrom(
            msg.sender,
            treasury,
            _auroraAmountTotal
        );

        emit StreamAdded(
            idx,
            stream.rewardsToken,
            stream.tokenOwner,
            stream.auroraAmountTotal,
            stream.rewardsTokenAmount,
            stream.height,
            stream.lastAuroraClaimed
        );
    }

    /// @notice removes stream by its index
    /// @dev restricted for the admin only. Copies last stream into stream with id = _index, removes last element from sreams array
    /// @param _index the index of the stream to remove
    function removeStream(uint256 _index) external onlyAdmin {
        require(streams.length > _index, "Out of bound index");

        supportedRewardTokens[streams[_index].rewardsToken] = false;

        Stream storage last = streams[streams.length - 1];
        Stream storage operated = streams[_index];

        uint256 auroraAmount = operated.auroraAmountTotal;
        uint256 rewardsAmount = operated.rewardsTokenAmount;
        address rewardsToken = operated.rewardsToken;
        address tokenOwner = operated.tokenOwner;
        bool initialized = operated.initialized;

        operated.rewardsToken = last.rewardsToken;
        operated.tokenOwner = last.tokenOwner;
        operated.auroraAmountTotal = last.auroraAmountTotal;
        operated.rewardsTokenAmount = last.rewardsTokenAmount;
        operated.height = last.height;
        operated.lastAuroraClaimed = last.lastAuroraClaimed;

        for (uint256 i = 0; i < operated.rewardsScheduleKeys.length; i++) {
            operated.rewardsSchedule[operated.rewardsScheduleKeys[i]] = 0;
        }

        operated.rewardsScheduleKeys = new uint256[](
            last.rewardsScheduleKeys.length
        );

        for (uint256 i = 0; i < last.rewardsScheduleKeys.length; i++) {
            operated.rewardsSchedule[last.rewardsScheduleKeys[i]] = last
                .rewardsSchedule[last.rewardsScheduleKeys[i]];
            operated.rewardsScheduleKeys[i] = last.rewardsScheduleKeys[i];
        }

        streams.pop();

        IERC20Upgradeable(auroraToken).safeTransferFrom(
            treasury,
            msg.sender,
            auroraAmount
        );

        if (initialized) {
            IERC20Upgradeable(rewardsToken).safeTransferFrom(
                treasury,
                tokenOwner,
                rewardsAmount
            );
        }

        emit StreamRemoved(_index);
    }

    /// @notice implements the functionality to send the AURORA tokens to the staking of the particular user
    /// @dev can by paused by admin. Initializes last rewerd claim timestamp for each existing stream as current block timestamp
    /// @param _amount amount of AURORA to be deposited for user. Minimal deposit is 5 AURORA
    /// @param _user users address
    function depositOnBehalfOfAnotherUser(
        uint256 _amount,
        address _user,
        uint256 _seasonsAmount
    ) external pausable(1) {
        // TODO(MarX): Suggestion to have the same order of arguments for function and event
        _depositInternal(_amount, _user, _seasonsAmount);
        emit Deposited(_user, _amount, _seasonsAmount);
    }

    /// @notice implements the functionality to send the AURORA tokens to the staking by AURORA holders
    /// @dev can by paused by admin
    /// @param _amount amount of AURORA to be deposited for user. Minimal deposit is 5 AURORA
    /// @param _seasonsAmount determines amount of seasons the stake applicable for, Should be between 0 and 24 seasons
    function stake(uint256 _amount, uint256 _seasonsAmount)
        external
        pausable(1)
    {
        _depositInternal(_amount, msg.sender, _seasonsAmount);
        emit Deposited(msg.sender, _amount, _seasonsAmount);
    }

    function _depositInternal(
        uint256 _amount,
        address _user,
        uint256 _seasonsAmount
    ) private {
        require(_seasonsAmount <= seasonAmount, "Error:seasons");
        require(_amount >= MINIMUM_AURORA_STAKE, "Amount < 5");

        if (_seasonsAmount == 0) {
            if (deposits[_user][0].amount == 0) {
                deposits[_user][0].amount += _amount;
                deposits[_user][0].rewardWeight = rewardWeights[0];
                deposits[_user][0].voteWeight = voteWeights[0];

                for (uint256 i = 0; i < streams.length; i++) {
                    streams[i].lastRewardClaims[_user][0] = block.timestamp;
                }

                totalFor0Seasons += _amount;
            } else {
                deposits[_user][0].amount += _amount;
                totalFor0Seasons += _amount;
            }
        } else {
            depositIds[_user]++;
            deposits[_user][depositIds[_user]].amount = _amount;
            deposits[_user][depositIds[_user]].startSeason =
                currentSeason() +
                1;
            deposits[_user][depositIds[_user]].endSeason =
                currentSeason() +
                _seasonsAmount;
            deposits[_user][depositIds[_user]].rewardWeight = _seasonsAmount > 7
                ? rewardWeights[7]
                : rewardWeights[_seasonsAmount];
            deposits[_user][depositIds[_user]].voteWeight = _seasonsAmount > 7
                ? voteWeights[7]
                : voteWeights[_seasonsAmount];

            for (uint256 i = 0; i < streams.length; i++) {
                streams[i].lastRewardClaims[_user][depositIds[_user]] =
                    block.timestamp +
                    seasonDuration;
            }

            for (
                uint256 i = currentSeason() + 1;
                i <= currentSeason() + _seasonsAmount;
                i++
            ) {
                totalWeightedDepositedAmounts[i] +=
                    _amount *
                    deposits[_user][depositIds[_user]].rewardWeight;
            }
            totalStaked += _amount;
        }

        IERC20Upgradeable(auroraToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
    }

    /// @notice implements the functionality to unstake the AURORA tokens by users. Claims available VOTE tokens and rewards
    /// @dev can by paused by admin
    /// @param _depositId determines deposit id for unstaking from
    function unstake(uint256 _depositId) external pausable(1) {
        Deposit storage deposit = deposits[msg.sender][_depositId];
        require(currentSeason() > deposit.endSeason, "Locked");

        uint256 depositAmount = deposit.amount;

        if (deposit.endSeason - deposit.startSeason > 0) {
            _claimVoteInternal(_depositId, msg.sender);
        }

        if (_depositId == 0) {
            totalFor0Seasons -= depositAmount;
        } else {
            totalStaked -= depositAmount;
        }

        deposit.amount = 0;
        deposit.rewardWeight = 0;
        deposit.voteWeight = 0;

        IERC20Upgradeable(auroraToken).safeTransfer(msg.sender, depositAmount);

        emit Unstaked(msg.sender, depositAmount);
    }

    /// @notice implements the functionality to claim the VOTE tokens by users.
    /// @dev can by paused by admin. external
    /// @param _depositId determines deposit id for unstaking from
    function claimVote(uint256 _depositId) external pausable(1) {
        _claimVoteInternal(_depositId, msg.sender);
    }

    /// @notice implements the functionality to claim the VOTE tokens by users.
    /// @dev private
    /// @param _depositId determines deposit id for unstaking from
    /// @param _user address to claim votes to
    function _claimVoteInternal(uint256 _depositId, address _user) private {
        Deposit storage deposit = deposits[_user][_depositId];

        require(deposit.amount > 0, "Nothing to claim, zero deposit");

        uint256 amountToPay = ((deposit.voteWeight * deposit.amount) / BP) -
            userClaimedVoteTokens[_user][currentSeason()];
        require(amountToPay > 0, "Nothing to claim, zero vote to claim");

        _mint(_user, amountToPay);

        claimedVoteTokens[currentSeason()] += amountToPay;
        userClaimedVoteTokens[_user][currentSeason()] += amountToPay;

        emit Claimed(_user, address(this), amountToPay, block.timestamp);
    }

    /// @notice implements the functionality to claim the reward tokens by users.
    /// @dev private
    /// @param _depositId determines deposit id for unstaking from
    /// @param _index index of the rewards stream
    /// @param _user address to claim votes to
    function claimRewards(
        uint256 _depositId,
        uint256 _index,
        address _user
    ) public pausable(1) {
        require(!streams[_index].blacklisted, "Blacklisted");
        uint256 totalUserRewardToPay = calculateRewards(
            _depositId,
            _index,
            _user
        );
        require(totalUserRewardToPay != 0, "Nothing to pay!");

        streams[_index].lastRewardClaims[_user][_depositId] = block.timestamp;
        ITreasury(treasury).payRewards(
            _user,
            streams[_index].rewardsToken,
            totalUserRewardToPay
        );

        emit Claimed(
            _user,
            streams[_index].rewardsToken,
            totalUserRewardToPay,
            block.timestamp
        );
    }

    /// @notice implements the main logic of calculation rewards per user per stream for specified depositId
    /// @dev can by paused by admin. Calclulates user rewards based on time user being in the seasons
    /// @param _depositId determines deposit id for unstaking from
    /// @param _index index of the rewards stream
    /// @param _user address to claim votes to
    function calculateRewards(
        uint256 _depositId,
        uint256 _index,
        address _user
    ) public view pausable(1) returns (uint256 totalUserRewardToPay) {
        require(
            supportedRewardTokens[streams[_index].rewardsToken],
            "! supported"
        );

        Deposit storage deposit = deposits[_user][_depositId];
        Stream storage stream = streams[_index];

        uint256 lengthOfUserBeingInTheSeasonStartingThePreviousWithdraw;

        // starting points
        uint256 startSeasonIndex = getSeasonByTimestamp(
            stream.lastRewardClaims[_user][_depositId]
        );
        uint256 startSeasonEndTimestamp = seasons[startSeasonIndex].endSeason;

        // ending points
        uint256 endSeasonIndex = currentSeason();
        uint256 endSeasonStartTimestamp = seasons[endSeasonIndex].startSeason;

        uint256 duration = 0;

        for (uint256 i = startSeasonIndex; i <= endSeasonIndex; i++) {
            duration = seasons[i].endSeason - seasons[i].startSeason;

            if (startSeasonIndex == endSeasonIndex) {
                lengthOfUserBeingInTheSeasonStartingThePreviousWithdraw =
                    block.timestamp -
                    stream.lastRewardClaims[_user][_depositId];
            } else {
                if (i == startSeasonIndex) {
                    lengthOfUserBeingInTheSeasonStartingThePreviousWithdraw =
                        startSeasonEndTimestamp -
                        stream.lastRewardClaims[_user][_depositId];
                } else if (i == endSeasonIndex) {
                    lengthOfUserBeingInTheSeasonStartingThePreviousWithdraw =
                        block.timestamp -
                        endSeasonStartTimestamp;
                } else {
                    lengthOfUserBeingInTheSeasonStartingThePreviousWithdraw = duration;
                }
            }

            totalUserRewardToPay +=
                (lengthOfUserBeingInTheSeasonStartingThePreviousWithdraw *
                    deposit.amount *
                    (
                        getSeasonByTimestamp(block.timestamp) >
                            deposit.endSeason
                            ? rewardWeights[0]
                            : deposit.rewardWeight
                    ) *
                    ((stream.rewardsTokenAmount * stream.rewardsSchedule[i]) /
                        DENOMINATOR)) /
                duration /
                ((totalFor0Seasons * rewardWeights[0]) +
                    totalWeightedDepositedAmounts[i]) /
                BP;
        }
    }

    /// @notice implements the main logic of calculation AURORA rewards for token owner specified in the stream
    /// @dev can by paused by admin. Calclulates rewards for stream token owner based on rewards shedule
    /// @param _index index of the rewards stream
    function claimAuroraByTokenOwner(uint256 _index) external pausable(1) {
        Stream storage stream = streams[_index];
        require(!stream.blacklisted, "Blacklisted");
        require(stream.tokenOwner == msg.sender, "! allowed");

        uint256 totalReward = 0;

        for (uint256 i; i < stream.rewardsScheduleKeys.length; i++) {
            if (
                block.timestamp <
                seasons[stream.rewardsScheduleKeys[i]].startSeason
            ) {
                break;
            }

            uint256 duration = seasons[stream.rewardsScheduleKeys[i]]
                .endSeason - seasons[stream.rewardsScheduleKeys[i]].startSeason;

            if (
                (stream.lastAuroraClaimed <=
                    seasons[stream.rewardsScheduleKeys[i]].startSeason) &&
                (block.timestamp >=
                    seasons[stream.rewardsScheduleKeys[i]].endSeason)
            ) {
                totalReward += ((stream.auroraAmountTotal *
                    stream.rewardsSchedule[stream.rewardsScheduleKeys[i]]) /
                    DENOMINATOR);
            } else if (
                (stream.lastAuroraClaimed <=
                    seasons[stream.rewardsScheduleKeys[i]].startSeason) &&
                (block.timestamp <
                    seasons[stream.rewardsScheduleKeys[i]].endSeason)
            ) {
                uint256 start = seasons[stream.rewardsScheduleKeys[i]]
                    .startSeason;
                uint256 end = block.timestamp;

                totalReward +=
                    (((stream.auroraAmountTotal *
                        stream.rewardsSchedule[stream.rewardsScheduleKeys[i]]) /
                        DENOMINATOR) * (end - start)) /
                    duration;
            } else if (
                (stream.lastAuroraClaimed >
                    seasons[stream.rewardsScheduleKeys[i]].startSeason) &&
                stream.lastAuroraClaimed <=
                seasons[stream.rewardsScheduleKeys[i]].endSeason
            ) {
                uint256 start = stream.lastAuroraClaimed;
                uint256 end = seasons[stream.rewardsScheduleKeys[i]].endSeason;

                totalReward +=
                    (((stream.auroraAmountTotal *
                        stream.rewardsSchedule[stream.rewardsScheduleKeys[i]]) /
                        DENOMINATOR) * (end - start)) /
                    duration;
            }
        }

        stream.lastAuroraClaimed = block.timestamp;
        IERC20Upgradeable(auroraToken).safeTransferFrom(
            treasury,
            msg.sender,
            totalReward
        );
        emit Claimed(msg.sender, auroraToken, totalReward, block.timestamp);
    }

    /// @notice implements deposit tokens on the staking contract from stream token owner
    /// @dev can by paused by admin. Msg.sender should be stream.tokenOwner
    /// @param _index index of the rewards stream
    /// @param _amount of rewerd token to be deposited
    function depositTokensToRewardPool(uint256 _index, uint256 _amount)
        external
        pausable(1)
    {
        Stream storage stream = streams[_index];

        require(_amount > 0, "! allowed");
        require(!stream.initialized, "Initialized");
        require(stream.tokenOwner == msg.sender, "! allowed");
        require(stream.rewardsTokenAmount >= _amount, "Too big amount");
        require(stream.height >= block.timestamp, "! allowed");

        rewardsPool[stream.rewardsToken] += _amount;
        stream.rewardsTokenAmount = _amount;
        stream.initialized = true;

        IERC20Upgradeable(stream.rewardsToken).safeTransferFrom(
            msg.sender,
            treasury,
            _amount
        );
        emit DepositedToRewardPool(msg.sender, _amount, _index);
    }

    function addTokensToRewardPool(uint256 _index, uint256 _amount)
        external
        onlyAdmin
    {
        Stream storage stream = streams[_index];

        require(stream.initialized, "! initialized");
        require(!stream.blacklisted, "Blacklisted stream");

        rewardsPool[stream.rewardsToken] += _amount;
        IERC20Upgradeable(stream.rewardsToken).safeTransferFrom(
            msg.sender,
            treasury,
            _amount
        );
        emit AddedToRewardPool(msg.sender, _amount, _index);
    }

    /// @notice removes tokens from the stream with id = _index. Sends tokens back to stream token owner. Adds stream to blacklist
    /// @dev restricted for the admin only.
    /// @param _index index of the rewards stream
    function removeTokensFromRewardPool(uint256 _index) external onlyAdmin {
        Stream storage stream = streams[_index];

        require(stream.initialized, "Stream is not initialized");

        rewardsPool[stream.rewardsToken] = 0;
        stream.blacklisted = true;
        ITreasury(treasury).payRewards(
            stream.tokenOwner,
            stream.rewardsToken,
            IERC20Upgradeable(stream.rewardsToken).balanceOf(treasury)
        );
        emit RemovedFromRewardPool(
            msg.sender,
            IERC20Upgradeable(stream.rewardsToken).balanceOf(treasury),
            _index
        );
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
    /// @dev can called only by whitelisted contracts, implements accessible VOTE cheking based on decay. Can by paused by admin.
    /// @param _sender owner of the VOTE token
    /// @param _recipient tokens transfer to
    /// @param _amount amount of tokens to transfer
    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public override pausable(1) returns (bool) {
        require(whitelistedContracts[msg.sender], "Only whitelisted");

        Season memory season = seasons[currentSeason()];

        uint256 accessibleVOTE;

        if (block.timestamp <= season.decayStart) {
            accessibleVOTE = userClaimedVoteTokens[_sender][currentSeason()];
        } else {
            accessibleVOTE =
                userClaimedVoteTokens[_sender][currentSeason()] -
                ((userClaimedVoteTokens[_sender][currentSeason()] *
                    (block.timestamp - season.decayStart)) /
                    (season.endVoting - season.decayStart));
        }

        require(_amount <= accessibleVOTE, "Tranfser not allowed");

        if (block.timestamp <= season.decayStart) {
            userUsedVoteTokens[_sender][currentSeason()] += _amount;
        } else {
            userUsedVoteTokens[_sender][currentSeason()] +=
                (_amount * (season.endVoting - season.decayStart)) /
                (block.timestamp - season.decayStart);
        }

        _transfer(_sender, _recipient, _amount);

        emit VotesTransfered(_sender, _recipient, _amount);
        return true;
    }

    /// @notice standard ERC20 balanceOf
    /// @dev calculates balance based on decay
    /// @param _account owner of the VOTE token
    /// @return the amount of tokens owned by _account
    function balanceOf(address _account)
        public
        view
        override
        returns (uint256)
    {
        Season memory season = seasons[currentSeason()];

        if (block.timestamp <= season.decayStart) {
            return userClaimedVoteTokens[_account][currentSeason()];
        }

        return
            userClaimedVoteTokens[_account][currentSeason()] -
            ((userClaimedVoteTokens[_account][currentSeason()] *
                (block.timestamp - season.decayStart)) /
                (season.endVoting - season.decayStart));
    }

    function balanceOfWithoutDecay(address _account)
        external
        view
        returns (uint256)
    {
        return _balances[_account];
    }

    function getDepositAmount(uint256 _depositId)
        external
        view
        returns (uint256)
    {
        return deposits[msg.sender][_depositId].amount;
    }

    function getDepositStartSeason(uint256 _depositId)
        external
        view
        returns (uint256)
    {
        return deposits[msg.sender][_depositId].startSeason;
    }

    function getDepositEndSeason(uint256 _depositId)
        external
        view
        returns (uint256)
    {
        return deposits[msg.sender][_depositId].endSeason;
    }

    function getDepositRewardWeight(uint256 _depositId)
        external
        view
        returns (uint256)
    {
        return deposits[msg.sender][_depositId].rewardWeight;
    }

    function getDepositVoteWeight(uint256 _depositId)
        external
        view
        returns (uint256)
    {
        return deposits[msg.sender][_depositId].voteWeight;
    }

    function currentSeason() public view returns (uint256) {
        return getSeasonByTimestamp(block.timestamp);
    }

    /// @notice returns season number by its timestam
    /// @dev cheks if timestamp is between seasons[i].startSeason and seasons[i].endSeason
    /// @param _timestamp timestamp to checko
    /// @return season number
    function getSeasonByTimestamp(uint256 _timestamp)
        public
        view
        returns (uint256 season)
    {
        require(seasons[0].startSeason < _timestamp, "Seasons haven't started");

        // TODO(MarX): Are seasons sorted? Do binary search instead?
        for (uint256 i = 0; i < seasons.length; i++) {
            if (
                seasons[i].startSeason <= _timestamp &&
                _timestamp <= seasons[i].endSeason
            ) {
                // Break early when season is found
                season = i;
                return;
            }
        }

        revert("Season not found");
    }

    /// @notice allows admin to burn user tokens for current season that userd didn't used
    /// @param _user user wich tokens to burn
    function burnUnused(address _user) external onlyAdmin {
        Season memory season = seasons[currentSeason()];
        require(
            block.timestamp >= season.startSeason + burnGracePeriod,
            "! allowed"
        );

        _burn(
            _user,
            _balances[_user] - userClaimedVoteTokens[_user][currentSeason()]
        );
    }

    /// @notice Destroys `amount` tokens from `_user`, reducing the total supply
    /// @param _user user wich tokens to burn
    /// @param _amount of tokens to burn
    function burn(address _user, uint256 _amount) external onlyAdmin {
        _burn(_user, _amount);
    }

    /// @notice Creates `_amount` tokens and assigns them to `_user`, increasing the total supply.
    /// @param _user user address to mint
    /// @param _amount of tokens to mint
    function mint(address _user, uint256 _amount) external onlyAdmin {
        _mint(_user, _amount);
    }

    /// @notice Batch destroys `_amounts` tokens from `_users`, reducing the total supply
    /// @param _users array of users
    /// @param _amounts arrays of amounts
    function burnBatch(address[] memory _users, uint256[] memory _amounts)
        external
        onlyAdmin
    {
        require(_users.length == _amounts.length);

        for (uint256 i = 0; i < _users.length; i++) {
            _burn(_users[i], _amounts[i]);
        }
    }

    /// @notice Batch creates `_amount` tokens and assigns them to `_user`, increasing the total supply.
    /// @param _users array of user address to mint
    /// @param _amounts array of amounts to mint
    function mintBatch(address[] memory _users, uint256[] memory _amounts)
        external
        onlyAdmin
    {
        require(_users.length == _amounts.length);

        for (uint256 i = 0; i < _users.length; i++) {
            _mint(_users[i], _amounts[i]);
        }
    }
}
