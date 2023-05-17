// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
import "../../JetStakingTestingV1.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract JetStakingV1ExtraFunctionality is JetStakingTestingV1 {
    function dummy() public view returns (uint256) {
        return 1;
    }
}
