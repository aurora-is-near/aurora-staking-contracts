import { ethers, upgrades } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {
        AURORA_TOKEN,
        SCHEDULE_START_TIME,
        SCHEDULE_PERIOD
    } = process.env

    const auroraTokenAddress = AURORA_TOKEN? AURORA_TOKEN : (await hre.ethers.getContract("Token")).address
    const startTime = SCHEDULE_START_TIME ? parseInt(SCHEDULE_START_TIME as string) : Math.floor(Date.now()/ 1000) + 60
    const [ deployer ] = await hre.ethers.getSigners()
    const treasury = await hre.ethers.getContract("Treasury")
    const jetStakingV1 = await hre.ethers.getContract("JetStakingV1")
    const LockedStakingTemplate =  await ethers.getContractFactory('LockedStakingSubAccountImplementation')
    const amount = ethers.utils.parseUnits("1", 18) // 1 AURORA
    const extraInitParameters = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256"], 
        [
            auroraTokenAddress,
            startTime + parseInt(SCHEDULE_PERIOD as string)
        ]
    )

    // Deploy Locked Staking Template
    const lockedStakingTemplate = await upgrades.deployProxy(
        LockedStakingTemplate,
        [
            jetStakingV1.address,
            deployer.address,
            amount,
            true,
            extraInitParameters
        ],
        {
            initializer: "initialize",
            kind : "uups",
        },
    )
    console.log(`Deploy LockedStakingSubAccountImpalementation template @ ${lockedStakingTemplate.address}`)
    await new Promise(f => setTimeout(f, 3000))
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