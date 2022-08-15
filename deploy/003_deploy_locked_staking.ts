import { ethers, upgrades } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {
        AURORA_TOKEN
    } = process.env

    const auroraTokenAddress = AURORA_TOKEN? AURORA_TOKEN : (await hre.ethers.getContract("Token")).address
    const jetStakingV1 = await hre.ethers.getContract("JetStakingV1")
    const LockedStakingTemplate =  await ethers.getContractFactory('LockedStakingSubAccountImplementation')
    // Deploy Locked Staking Template
    const lockedStakingTemplate = await LockedStakingTemplate.deploy()
    console.log(`Deploy LockedStakingSubAccountImpalementation template @ ${lockedStakingTemplate.address}`)
    await new Promise(f => setTimeout(f, 3000))
    // Deploy Locked Staking Factory
    const StakingFactory = await ethers.getContractFactory('StakingStrategyFactory')
    const stakingFactory = await upgrades.deployProxy(
        StakingFactory,
        [
            lockedStakingTemplate.address,
            jetStakingV1.address,
            auroraTokenAddress,
            0
        ],
        {
            initializer: "initialize",
            kind : "uups",
        },
    )
    await stakingFactory.deployed()
    console.log(`Deploy Staking Strategy Factory @ ${stakingFactory.address}`)
}


module.exports = func
module.exports.tags = ["StakingStrategyFactory"]