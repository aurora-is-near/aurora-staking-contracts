// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Treasury is UUPSUpgradeable, Ownable {

  mapping (address => bool) public isSupportedToken;
  mapping (address => bool) public isManager;

  bool public paused;
  address public dJetStaking;

  event ManagerAdded(address manager, address addedBy, uint256 timestamp);
  event TokenAdded(address token, address addedBy, uint256 timestamp);
 
  constructor(address _dJetStaking, address[] memory _managers, address[] memory _supportedTokens) {
    dJetStaking = _dJetStaking;

    for(uint i = 0; i < _managers.length; i++) {
      isManager[_managers[i]] = true;
    }

    for(uint i = 0; i < _supportedTokens.length; i++) {
      isSupportedToken[_supportedTokens[i]] = true;
    }
  }

  modifier onlyManager() {
    require(isManager[msg.sender], "Pausable: sender is not a manager");
    _;
  }

  modifier isActive() {
    require(!paused, "Pausable: Treasury paused");
    _;
  }

  modifier onlyStaking() {
    require(msg.sender == dJetStaking, "Sender is not a staking");
    _;
  }

  function _authorizeUpgrade(address) internal override onlyOwner {}

  function payRewards(address user, address token, uint256 deposit) external isActive onlyStaking {
    require(isSupportedToken[token], "Token is not supported");
    // to do add calculation;
    IERC20(token).transfer(user, 0);
  }

  function addSupportedToken(address token) external onlyOwner {
    require(!isSupportedToken[token], "Token already added");
    isSupportedToken[token] = true;

    emit ManagerAdded(token, msg.sender, block.timestamp);
  }

  function addManager(address _manager) external onlyOwner {
    require(!isManager[_manager], "Manager already added");
    isManager[_manager] = true;

    emit ManagerAdded(_manager, msg.sender, block.timestamp);
  }

  function pause() external onlyManager {
    require(!paused, "Pausable: Already paused");
    paused = true;
  }
  
  function unpause() external onlyManager {
    require(paused, "Pausable: Not paused");
    paused = false;
  }

}











