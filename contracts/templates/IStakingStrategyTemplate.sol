// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IStakingStrategyTemplate {
    function initialize(address stakingContract, bytes calldata _encodedData)
        external;
}
