// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./IJetStaking.sol";
// import "./Staking/IStaking.sol";
import "./Pausable.sol";
// import "./JetStaking.sol";
// import "hardhat/console.sol";


/// @title A VotingManager contract for projects
/// @author hanzel.anchia
/// @notice Contract for voting projects using fungible tokens
/// @dev It uses an extention of ERC20 to represent the vote tokens,
/// this contract has dependencies on JetStaking contract
contract VotingManager is Initializable, Pausable {
    // using SafeERC20Upgradeable for JetStaking;

    IJetStaking public jetStaking;
    uint256 public decimals; //1e18 decimals
    
    struct Kpi {
        uint256 percentageOfReward;
        uint256 obtainedPercentage;
        bool previouslyUpdated;
    }

    struct Project {
        string name;
        address ownerWallet;
        uint256 requestedWeightedBudget;
        uint256 numberOfVotes;
        uint256 seasonId;
        uint256 numberOfKpis; // from 1 to any
        mapping(uint256 => Kpi) kpis; //[0x1=> 12, 0x2=>33]
        mapping(address => uint256) votesPerUser; //[0x1=> 12, 0x2=>33]
        address[] usersVoted; // [0x1,0x2]
        uint256[] grantParts; // [0=>80%(prepayment), 1=> 10%. 2=> 10%]
        uint256[] grantPartDates; // [0=>prepayment, 1=> 01/02/2022. 01/05/2022]
    }

    struct Coefficient {
        uint256 operationalBudget;
        uint256 marketingBudget;
        uint256 longTermIncentives;
        uint256 protocolSpecificIncentives;
        uint256 liquity; // For each 3 months
        uint256 creationDate;
    }

    struct Season {
        uint256 totalVotes;
        uint256 totalAllocation; // It changes for each eason, not stored in a struct in JetStaking
        uint256 rewardPercentage; // NEW - % of the allocation for the payment of rewards
        uint256 grantPool; // Available for projects: totalAllocation - (totalAllocation * rewardPercentage)
        uint256 rewardPool; // Available for projects: totalAllocation * rewardPercentage
        uint256[] projectsInSeason; // with the length we can get all the available projects
        // uint256 totalAllocatedBudget; // NEW - PROJECTS THAT SUCCEEDED better to calculate it
        // uint256 allocationEfficiency; // NEW - totalAllocatedBudget/totalAllocation
        uint256 conditionalRewardPercentage;
        uint256 unconditionalRewardPercentage;
        uint256 coefficientInUse; // refers to the version number of the coefficient
    }

    struct ProjectResult {
        uint256 projectId;
        uint256 neededPercentage;
        uint256 neededNumberOfVotes;
        uint256 obtainedNumberOfVotes;
        bool reachedGoal;
    }
    
    uint256 public projectCounterId;
    uint256 public coefficientCounterId;
    uint256[] public seasonsVotedIds; // All the voted seasons
    mapping(uint256 => Season) public seasonsVoted; // Information of the voted seasons
    mapping(uint256 => Project) public projects; // Available projects
    mapping(uint256 => Coefficient) public coefficients;

    event ProjectPublished(uint256 indexed seasonId, uint256 indexed projectId, address publisher, uint256 time);
    event VoteEmitted(uint256 indexed seasonId, uint256 indexed projectId, address indexed voter, uint256 numberOfVotes);
    event KpiUpdated(uint256 indexed projectId, address indexed publisher, uint256 kpiNumber, uint256 value);
    event SeasonAllocationChanged(
        uint256 indexed seasonId,
        address indexed publisher,
        uint256 oldAllocation,
        uint256 newAllocation,
        uint256 time
    );
    event SeasonRewardDistributionChanged(
        uint256 indexed seasonId,
        address indexed publisher,
        uint256 oldConditional,
        uint256 newConditional,
        uint256 oldUnconditional,
        uint256 newUnconditional,
        uint256 time
    );

    function initialize(address _jetStaking) public
    initializer {
        jetStaking = IJetStaking(_jetStaking);
        __Ownable_init(); // Sets deployer address as owner
        __Pausable_init();
        decimals = 1 ether; // 1e18 decimals
        projectCounterId = 1;
        _setInitialCoefficients();
    }

    /// @notice To be called by the curators. Requires the project information and publishes it to the current season.
    /// @dev The numeric values come formatted to 1E18.
    /// @param _name The project name
    /// @param _ownerWallet Address of the owner
    /// @param _grantStructure uint256 operationalBudget=0  marketingBudget = 1; longTermIncentives = 2;
    /// protocolSpecificIncentives = 3; liquity = 4; numberOfMonths = 5;
    /// @param _grantParts Percentage in which the parts will be distributed.
    /// @param _grantPartDates The different dates in which the payments should be done. The first one is the prepayment.
    /// example [prepaymentDate, milestone1Date, milestone2Date]
    function publishProject(
        string memory _name,
        address _ownerWallet,
        uint256[6] calldata _grantStructure,
        uint256[] calldata _grantParts,
        uint256[] calldata _grantPartDates
    ) public onlyCurator
    returns (uint256 projectId) {
        _validateProjectParams(_name, _ownerWallet, _grantParts, _grantPartDates);
        uint256 seasonId = getCurrentSeasonId();
        validateAplicationVotingPeriod(seasonId);
        Season storage season = seasonsVoted[seasonId];
        if(season.projectsInSeason.length == 0) {
            seasonsVotedIds.push(seasonId); // Saving available options
        }
        Project storage project = projects[projectCounterId];
        project.name = _name;
        project.ownerWallet = _ownerWallet;
        project.requestedWeightedBudget = _getProjectRequestedWeightedBudget(_grantStructure, seasonId);
        project.numberOfKpis = _grantParts.length - 1; // not counting the prepayment
        project.grantParts = _grantParts;
        project.grantPartDates = _grantPartDates;
        project.seasonId = seasonId;
        _setKpiPercentages(project, _grantParts);
        season.projectsInSeason.push(projectCounterId);
        emit ProjectPublished(seasonId, projectCounterId, msg.sender, block.timestamp);
        projectCounterId++;
        projectId = projectCounterId;
    }

    /// @notice To be called by any user. Allows users to vote for a project
    /// @dev (Transfers VOTE tokens to this contract)
    /// @param _projectId Id of the project to vote
    /// @param _numberOfVotes votes to provide to the project
    function vote(uint256 _projectId, uint256 _numberOfVotes) public whenNotPaused {
        require(_numberOfVotes > 0, "No votes provided");
        uint256 seasonId = getCurrentSeasonId();
        validateVotingPeriod(seasonId);
        Project storage project = projects[_projectId];
        require(bytes(project.name).length > 0, "ProjectId does not exist in the current season");
        // It should be previously approved by the VOTE token to transferfrom the tokens
        bool success = jetStaking.transferFrom(msg.sender, address(this), _numberOfVotes);
        require(success, "Error in transfer from");
        project.numberOfVotes += _numberOfVotes;
        if (project.votesPerUser[msg.sender] == 0) {
            project.usersVoted.push(msg.sender);
        }
        project.votesPerUser[msg.sender] += _numberOfVotes;
        seasonsVoted[seasonId].totalVotes += _numberOfVotes;
        emit VoteEmitted(seasonId, _projectId, msg.sender, _numberOfVotes); // May not be necessary
    }

    /// @notice To be called by curators. Allows curators to specify the kpi percentage obtained in a specific kpi number.
    /// @param _projectId Id of the project to vote
    /// @param _kpiNumber Number of kpi to be assigned
    /// @param _obtainedPercentage percentage obtained in the kpi formatted to 1E18.
    function updateKpi(
        uint256 _projectId,
        uint256 _kpiNumber,
        uint256 _obtainedPercentage
        ) public onlyCurator {
            // Missing restriction for a certain period
            Project storage project = projects[_projectId];
            require(bytes(project.name).length > 0, "ProjectId does not exist");
            require(_kpiNumber > 0 && _kpiNumber <= project.numberOfKpis, "Kpi number does not exist");
            require(_obtainedPercentage <= decimals, "Obtained Kpi percentage out of bounds");
            require(project.kpis[_kpiNumber].previouslyUpdated == false, "Unable to update kpi again");
            project.kpis[_kpiNumber].obtainedPercentage = _obtainedPercentage;
            project.kpis[_kpiNumber].previouslyUpdated = true;
            emit KpiUpdated(_projectId, msg.sender, _kpiNumber, _obtainedPercentage);
    }

    /// @notice To be called by anyone. Get the results of the voting process for all the projects of the season.
    /// @param _seasonId Id of the season
    // Returns the projectId, the needed number of votes, the obtained number of votes, and if they reached the goal
    // Also, includes information about the current season like the total number of votes, allocation total allocated budget, and allocation efficiency
    function getSeasonVotingResults(uint256 _seasonId) public view returns (
        Season memory season,
        ProjectResult[] memory projectResults,
        uint256 totalAllocatedBudget,
        uint256 allocationEfficiency){
        season = seasonsVoted[_seasonId];
        uint256 amountOfProjects = season.projectsInSeason.length;
        require(amountOfProjects > 0, "No projects in this season");
        projectResults = new ProjectResult[](amountOfProjects);
        for(uint256 i = 0; i < amountOfProjects; i++) {
            uint256 _projectId = season.projectsInSeason[i];
            Project storage project = projects[_projectId];
            (uint256 _neededPercentage,
            uint256 _neededNumberOfVotes,
            uint256 _obtainedNumberOfVotes,
            bool _reachedGoal) = getProjectVotingResult(season, project);
            if(_reachedGoal) {
                totalAllocatedBudget += project.requestedWeightedBudget;
            }
            ProjectResult memory projectResult = ProjectResult({
                projectId: _projectId,
                neededPercentage: _neededPercentage,
                neededNumberOfVotes: _neededNumberOfVotes,
                obtainedNumberOfVotes: _obtainedNumberOfVotes,
                reachedGoal: _reachedGoal
            });
            projectResults[i] = projectResult;
        }
        allocationEfficiency = (totalAllocatedBudget * decimals) / season.grantPool;
    }

    /// @notice Used internally to calculate results.
    /// @param _season season struct to be used
    /// @param _project project struct to be used
    /// @dev return values need to be formatted to 1E18
    function getProjectVotingResult(Season memory _season, Project storage _project) internal view returns (  
        uint256 neededPercentage, 
        uint256 neededNumberOfVotes, 
        uint256 obtainedNumberOfVotes, 
        bool reachedGoal) {
        neededPercentage = (_project.requestedWeightedBudget * decimals) / _season.grantPool;
        neededNumberOfVotes = neededPercentage * _season.totalVotes;
        obtainedNumberOfVotes = _project.numberOfVotes * decimals;
        reachedGoal = obtainedNumberOfVotes >= neededNumberOfVotes;
    }

    /// @notice Returns the obtained condional reward amount for a Kpi in a specific project
    /// @dev return values need to be formatted to 1E18
    /// @param _projectId Id of the project to get the conditional rewards 
    /// @param _kpiNumber kpi to calculate results
    function getProjectConditionalRewardForKpi(uint256 _projectId, uint256 _kpiNumber) external view returns (
        uint256 totalConditionalAmount,
        uint256 maximumObtainableConditional,
        uint256 obtainedConditionalRewardAmount,
        uint256 kpiDate,
        bool reachedGoal
    ){
        Project storage project = projects[_projectId];
        require(bytes(project.name).length > 0, "ProjectId does not exist");
        require(_kpiNumber > 0 && _kpiNumber <= project.numberOfKpis, "Invalid kpi number");
        Season memory season = seasonsVoted[project.seasonId];
        (,,, reachedGoal) = getProjectVotingResult(season, project);
        (,,uint256 totalAllocatedBudget, uint256 allocationEfficiency) = getSeasonVotingResults(project.seasonId);
        totalConditionalAmount = (season.rewardPool * season.conditionalRewardPercentage * allocationEfficiency) / decimals**2;
        kpiDate = project.grantPartDates[_kpiNumber];
        if(reachedGoal){
            uint256 conditionalRewardsMax = (((project.requestedWeightedBudget * decimals) / totalAllocatedBudget) * totalConditionalAmount) / decimals;
            maximumObtainableConditional = (conditionalRewardsMax * project.kpis[_kpiNumber].percentageOfReward) / decimals;
            obtainedConditionalRewardAmount = (maximumObtainableConditional * project.kpis[_kpiNumber].obtainedPercentage) / decimals;
        }
    }

    /// @notice  Returns the uncondional reward amount to be distributed to a project
    /// @dev return values need to be formatted to 1E18
    /// @param _projectId Id of the project to get the unconditional rewards
    function getProjectUnconditionalRewards(uint256 _projectId) external view returns (
        uint256 totalUnconditionalReward,
        uint256 obtainedPercentageOfVotes,
        uint256 projectUnconditionalReward){
        Project storage project = projects[_projectId];
        require(bytes(project.name).length > 0, "Invalid project");
        Season memory season = seasonsVoted[project.seasonId];
        totalUnconditionalReward = (season.rewardPool * season.unconditionalRewardPercentage) / decimals;
        obtainedPercentageOfVotes = (project.numberOfVotes * decimals) / season.totalVotes;
        projectUnconditionalReward = (totalUnconditionalReward * obtainedPercentageOfVotes) / decimals;
    }

    /// @notice Access to grant information of a project
    /// @param  _projectId Id of the project to get the unconditional rewards
    function getProjectGrantInformation(uint256 _projectId) external view returns (
        uint256 requestedWeightedBudget,
        uint256[] memory grantParts,
        uint256[] memory grantPartDates){
        Project storage project = projects[_projectId];
        require(bytes(project.name).length > 0, "ProjectId does not exist");
        requestedWeightedBudget = project.requestedWeightedBudget;
        grantParts = new uint256[](project.grantParts.length);
        grantPartDates = new uint256[](project.grantParts.length);
        grantParts = project.grantParts;
        grantPartDates = project.grantPartDates;
    }

    /// @notice Gets the information of all the kpis of a project
    /// @param _projectId Id of the project to get the kpis
    function getProjectObtainedKpis(uint256 _projectId) external view returns (Kpi[] memory kpis) {
        Project storage project = projects[_projectId];
        kpis = new Kpi[](project.numberOfKpis);
        uint256 numberOfKpi = 1;
        for(uint256 i = 0; i < project.numberOfKpis; i++) {
            kpis[i] = project.kpis[numberOfKpi];
            numberOfKpi++;
        }
    }

    /// @notice get current season reference id, change over time
    /// @dev combined with the seasons public array can get the current season information
    function getCurrentSeasonId() public view returns (uint256) {
        return jetStaking.currentSeason();
    }

    // @notice shows the available project ids in a season
    function getProjectsInSeason(uint256 _seasonId) external view returns (uint256[] memory) {
        return seasonsVoted[_seasonId].projectsInSeason;
    }

    /// @notice To be called by administrators. Allows the editability of the Season Allocation.
    /// @dev This can modify previous, current and upcoming seasons.
    /// It recalculates the grant and reward pool each time it is used.
    /// @param _seasonId id of the season to update
    /// @param _totalAllocation new total allocation of the season
    function setSeasonAllocation(
        uint256 _seasonId,
        uint256 _totalAllocation)
        public onlyAdmin {
        Season storage season = seasonsVoted[_seasonId];
        uint256 oldAllocation = season.totalAllocation;
        season.totalAllocation = _totalAllocation;
        season.rewardPool = (season.totalAllocation * season.rewardPercentage) / decimals;
        season.grantPool = season.totalAllocation - season.rewardPool;
        emit SeasonAllocationChanged(_seasonId, msg.sender, oldAllocation, _totalAllocation, block.timestamp);
    }
    
    /// @notice To be called by administrators. Sets the reward percentage of the season, not editable.
    /// @dev It recalculates the grant and reward pool when it is used.
    /// This can modify previous, current and upcoming seasons.
    /// @param _seasonId id of the season to update
    /// @param _rewardPercentage new reward percentage of the season
    function setSeasonRewardPercentage(
        uint256 _seasonId,
        uint256 _rewardPercentage)
        public onlyAdmin {
        Season storage season = seasonsVoted[_seasonId];
        require(season.rewardPercentage == 0, "Season reward percentage has alredy been set");
        require(_rewardPercentage <= decimals, "Season reward percentage out of bounds");
        season.rewardPercentage = _rewardPercentage;
        season.rewardPool = (season.totalAllocation * season.rewardPercentage) / decimals;
        season.grantPool = season.totalAllocation - season.rewardPool;

        // Set default reward distribution
        if(season.conditionalRewardPercentage == 0 && season.unconditionalRewardPercentage == 0){
            season.conditionalRewardPercentage = 8E17;
            season.unconditionalRewardPercentage = 2E17;
        }
    }

    /// @notice Allows to change the portion of the reward for conditional and unconditional rewards of the season.
    /// @dev To be called by an administrator
    /// @param _seasonId id of the season to update
    /// @param _conditionalRewardPercentage percentage of reward pool for conditional rewards
    /// @param _unconditionalRewardPercentage percentage of reward pool for unconditional rewards
    function changeSeasonRewardDistribution(
        uint256 _seasonId, 
        uint256 _conditionalRewardPercentage, 
        uint256 _unconditionalRewardPercentage) 
        external onlyAdmin {
        Season storage season = seasonsVoted[_seasonId];
        require(_conditionalRewardPercentage > 0, "Error conditional reward percentage equals 0");
        require(_unconditionalRewardPercentage > 0, "Error unconditional reward percentage equals 0");
        require((_conditionalRewardPercentage + _unconditionalRewardPercentage) <= decimals, "Percentages out of bounds");
        uint256 oldConditional = season.conditionalRewardPercentage;
        uint256 oldUnconditional = season.unconditionalRewardPercentage;
        season.conditionalRewardPercentage =  _conditionalRewardPercentage;
        season.unconditionalRewardPercentage = _unconditionalRewardPercentage;
        emit SeasonRewardDistributionChanged(
            _seasonId, 
            msg.sender, 
            oldConditional, 
            _conditionalRewardPercentage, 
            oldUnconditional, 
            _unconditionalRewardPercentage,
            block.timestamp
        );
    }

    /// @notice Private function, Received the grant distribution and calculates the requested weighted budget using the stored coefficients
    /// @param grantStructure stucture with the categories of distribution to calculate the requested weighted budget
    /// @param _seasonId id of the seaon to be calculated
    function _getProjectRequestedWeightedBudget(uint256[6] calldata grantStructure, uint256 _seasonId) private view  
        returns (uint256 requestedWeightedBudget){
        uint256 operationalBudget = grantStructure[0];
        uint256 marketingBudget = grantStructure[1];
        uint256 longTermIncentives = grantStructure[2];
        uint256 protocolSpecificIncentives = grantStructure[3];
        uint256 liquity = grantStructure[4];
        uint256 numberOfMonths = grantStructure[5]; // TODO: Validate this param, if possible
        uint256 coefficientmultiplier = _getCoefficientMultiplier(numberOfMonths);
        uint256 coefficientId = getSuitableCoefficientId(_seasonId);
        Coefficient memory coefficient = coefficients[coefficientId];
        requestedWeightedBudget += (operationalBudget * coefficient.operationalBudget) / decimals;
        requestedWeightedBudget += (marketingBudget * coefficient.marketingBudget) / decimals;
        requestedWeightedBudget += (longTermIncentives * coefficient.longTermIncentives) / decimals;
        requestedWeightedBudget += (protocolSpecificIncentives * coefficient.protocolSpecificIncentives) / decimals;
        requestedWeightedBudget += (liquity * coefficientmultiplier * coefficient.liquity) / decimals;
    }

    /// @notice Private function, Used to calculate how many times the coefficient has to be applied depending on the number of months
    /// @dev returns the coefficient multipler to be used to calculate the liquity requested weighted budget 
    function _getCoefficientMultiplier(uint256 _numberOfMonths) private pure returns (uint256){
        uint256 divider = 3;
        if(_numberOfMonths % divider == 0) return _numberOfMonths / divider;
        return (_numberOfMonths + (divider - (_numberOfMonths % divider))) / divider;
    }

    /// @notice Validates that the a season period to vote is allowed
    function validateVotingPeriod(uint256 seasonId) internal view {
        (,,,,, uint256 startVoting, uint256 endVoting,,) = jetStaking.seasons(seasonId);
        require(startVoting < block.timestamp && endVoting > block.timestamp, "Voting period not allowed");
    }

    /// @notice Validates that the season period to publish projects is allowed
    function validateAplicationVotingPeriod(uint256 seasonId) internal view {
        (,uint256 applicationStart,,, uint256 applicationVotingEnd,,,,) = jetStaking.seasons(seasonId);
        require(applicationStart < block.timestamp && applicationVotingEnd > block.timestamp, "Voting period not allowed");
        require(seasonsVoted[seasonId].grantPool > 0, "Season grant pool has not been established");
        require(seasonsVoted[seasonId].rewardPool > 0, "Season reward pool has not been established");
    }
    
    /// @notice Validates that the inputs of the project are valid
    function _validateProjectParams(
        string memory _name,
        address _ownerWallet,
        uint256[] calldata _grantParts,
        uint256[] calldata _grantPartDates)
        private view {
        require(bytes(_name).length > 0, "Invalid project name");
        require(_ownerWallet != address(0), "Invalid project owner wallet");
        require(_grantPartDates.length == _grantParts.length, "Grant part and dates length must be the same");
        _validateGrantParts(_grantParts);
    }

    /// @notice Validates that grant distribution is in the correct format
    function _validateGrantParts(uint256[] calldata _grantParts) private view {
        uint256 totalPercentages;
        for(uint256 i = 0; i < _grantParts.length; i++) {
            require(_grantParts[i] > 0 && _grantParts[i] <= decimals, "Part distribution percentage out of bounds");
            totalPercentages += _grantParts[i];
            require(totalPercentages <= decimals, "Total percentages are greater than 100 percent");
        }
        require(totalPercentages == decimals, "Total percentages are less than 100 percent");
    }

    /// @notice  Allows to change the default coefficients to be used by the seasons that have not started.
    /// @dev To be called by Administrators. Changes the new default coefficients for upcoming seasons
    function changeCoefficients (
        uint256 _operationalBudget,
        uint256 _marketingBudget,
        uint256 _longTermIncentives,
        uint256 _protocolSpecificIncentives,
        uint256 _liquity
        ) external onlyAdmin {
        _changeCoefficients(_operationalBudget, _marketingBudget, _longTermIncentives, _protocolSpecificIncentives, _liquity);
    }

    /// @notice Private fuction, Sets the initial default values for the coefficients when the contract is deployed
    function _setInitialCoefficients() private {
        uint256 _operationalBudget = 1.5E18;
        uint256 _marketingBudget = 5E17;
        uint256 _longTermIncentives = 5E17;
        uint256 _protocolSpecificIncentives = 1E18;
        uint256 _liquity = 2.5E17;
        _changeCoefficients(_operationalBudget, _marketingBudget, _longTermIncentives, _protocolSpecificIncentives, _liquity);
    }
    
    /// @notice Private fuction,  Allows to change the default coefficients to be used by the seasons that have not started.
    function _changeCoefficients(
        uint256 _operationalBudget,
        uint256 _marketingBudget,
        uint256 _longTermIncentives,
        uint256 _protocolSpecificIncentives,
        uint256 _liquity
        ) private {
        coefficientCounterId++;
        Coefficient storage coefficient = coefficients[coefficientCounterId];
        coefficient.operationalBudget = _operationalBudget;
        coefficient.marketingBudget = _marketingBudget;
        coefficient.longTermIncentives = _longTermIncentives;
        coefficient.protocolSpecificIncentives = _protocolSpecificIncentives;
        coefficient.liquity = _liquity;
        coefficient.creationDate = block.timestamp;
    }

    /// @notice Gets the most recent and applicable coefficient to be used in a season depending on the creation date.
    /// @dev Everytime the coefficients are updated the coefficient id changes, this function gets the correct id for a season
    /// @param _seasonId id of the season to be used to look for the coefficient creation date
    function getSuitableCoefficientId(uint256 _seasonId) public view returns (uint256){
        (uint256 startSeason,,,,,,,,) = jetStaking.seasons(_seasonId);
        for(uint256 i = coefficientCounterId; i >= 1; i--) {
            if (startSeason > coefficients[i].creationDate){
                return i;
            }
        }
        return 1; // If not suitable coefficient found use the initial default
    }

    /// @notice Private function, sets the kpi reward percentages to be allocated for each number of kpi
    /// @param _project project reference to be modified
    function _setKpiPercentages(Project storage _project, uint256[] calldata grantParts) private {
        uint256 divider = decimals - grantParts[grantParts.length-1];
        for(uint256 i = 1; i < grantParts.length; i++) {
            _project.kpis[i].percentageOfReward = (grantParts[i-1] * decimals) / divider;
        }
    }

    /// @notice Sets the kpi reward percentages to be allocated for each number of kpi and how the project should receive the grant
    /// @param _projectId id of the project to be modified
    /// @param _grantParts new grant distribution percentages
    function updateGrantParts(uint256 _projectId, uint256[] calldata _grantParts) external onlyCurator {
        Project storage project = projects[_projectId];
        require(bytes(project.name).length > 0, "ProjectId does not exist");
        require(_grantParts.length == project.grantParts.length, "Unable to modify the grant parts length");
        _validateGrantParts(_grantParts);
        _setKpiPercentages(project, _grantParts);
        project.grantParts = _grantParts;
        project.numberOfKpis = _grantParts.length-1;
    }

    /// @notice Returns the users who voted for a project and the amount of votes per user
    /// @param _projectId id of the project to be requested
    function getVotesPerProject(uint256 _projectId) external view returns (
        uint256 totalNumberOfVotes,
        address[] memory users,
        uint256[] memory votes) {
        Project storage project = projects[_projectId];
        totalNumberOfVotes = project.numberOfVotes;
        uint256 amountOfUsers = project.usersVoted.length;
        users = new address[](amountOfUsers);
        votes = new uint256[](amountOfUsers);
        users = project.usersVoted;
        for(uint256 i = 0; i < amountOfUsers; i++) {
            votes[i] = project.votesPerUser[users[i]];
        }
    }
}