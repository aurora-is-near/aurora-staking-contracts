// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/ITreasury.sol";

contract Treasury is ITreasury, Initializable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(address => bool) public isSupportedToken;
    mapping(address => bool) public isManager;

    bool public paused;

    event ManagerAdded(address manager, address addedBy, uint256 timestamp);
    event ManagerRemoved(address manager, address removedBy, uint256 timestamp);
    event TokenAdded(address token, address addedBy, uint256 timestamp);

    /// @notice initializes ownable Treasury with list of managers and supported tokens
    /// @param _managers list of managers
    /// @param _supportedTokens list of supported tokens
    function initialize(
        address[] memory _managers,
        address[] memory _supportedTokens
    ) public initializer {
        __Ownable_init();

        for (uint256 i = 0; i < _managers.length; i++) {
            isManager[_managers[i]] = true;
        }

        for (uint256 i = 0; i < _supportedTokens.length; i++) {
            isSupportedToken[_supportedTokens[i]] = true;
        }
    }

    /// @notice allows operator to transfer supported tokens on befalf of Treasury
    /// @dev used to allow jet staking contract to pay reverds from Treasury balance
    /// @param _operator operator
    /// @param _supportedTokens list of supported tokens to approve
    function approveTokensTo(
        address[] memory _supportedTokens,
        uint256[] memory _amounts,
        address _operator
    ) public onlyManager {
        require(
            _amounts.length == _supportedTokens.length,
            'Treasury: Invalid approve tokens paramerters'
        );
        for (uint256 i = 0; i < _supportedTokens.length; i++) {
            IERC20Upgradeable(_supportedTokens[i]).safeIncreaseAllowance(
                _operator,
                _amounts[i]
            );
        }
    }

    /// @dev Throws if called by any account other than the owner
    modifier onlyManager() {
        require(isManager[msg.sender], "Sender is not a manager");
        _;
    }

    /// @dev Throws if called when contract is paused
    modifier isActive() {
        require(!paused, "Pausable: Treasury paused");
        _;
    }

    /// @notice transfers token amount from Treasury balance to user.
    /// @dev Used by jet staking contracts
    /// @param _user user to transfer tokens to
    /// @param _token token to transfer to user
    /// @param _amount token to transfer to user
    function payRewards(
        address _user,
        address _token,
        uint256 _amount
    ) external isActive onlyOwner {
        require(isSupportedToken[_token], "Token is not supported");
        IERC20Upgradeable(_token).transfer(_user, _amount);
    }

    /// @notice adds token as supproted rewards token by Treasury
    /// @param _token ERC20 token address
    function addSupportedToken(address _token) external onlyManager {
        require(!isSupportedToken[_token], "Token already added");
        isSupportedToken[_token] = true;

        emit TokenAdded(_token, msg.sender, block.timestamp);
    }

    /// @notice adds address to list of owners
    /// @param _manager any ethereum account
    function addManager(address _manager) external onlyManager {
        require(!isManager[_manager], "Manager already added");
        isManager[_manager] = true;

        emit ManagerAdded(_manager, msg.sender, block.timestamp);
    }

    /// @notice removes address from list of owners
    /// @param _manager any active manager
    function removeManager(address _manager) external onlyManager {
        require(isManager[_manager], "Manager already added");
        isManager[_manager] = false;

        emit ManagerRemoved(_manager, msg.sender, block.timestamp);
    }

    /// @notice makes Treasury contract inactive
    function pause() external onlyManager {
        require(!paused, "Pausable: Already paused");
        paused = true;
    }

    /// @notice makes Treasury contract active
    function unpause() external onlyManager {
        require(paused, "Pausable: Not paused");
        paused = false;
    }
}
