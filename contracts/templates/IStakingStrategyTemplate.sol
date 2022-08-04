// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IStakingStrategyTemplate {
    function initialize(
        address stakingContract,
        address instanceOwner,
        bool isTemplate,
        bytes calldata extraInitParameters
    ) external;
}
