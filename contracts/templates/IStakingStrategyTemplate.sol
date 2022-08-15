// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IStakingStrategyTemplate {
    function initialize(
        address stakingContract,
        address instanceOwner,
        uint256 deposit,
        address token,
        bytes calldata extraInitParameters
    ) external;
}
