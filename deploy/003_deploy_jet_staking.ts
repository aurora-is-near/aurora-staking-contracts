import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {

    const { deploy } = hre.deployments
    const { owner } = await hre.getNamedAccounts()
    const startTime = Math.floor(Date.now()/ 1000) + 60 // starts after 60 seconds from now.
    const treasury = (await hre.ethers.getContract("Treasury")).address
    const aurora = (await hre.ethers.getContract("Token")).address

    const name = "Jet Staking V1" 
    const symbol = "VOTE"
    const flags = 0
    const oneYear = 31536000
    const tauPerStream = 1000
    const decayGracePeriod = 86400 // one day
    const burnGracePeriod = 86400 // one day
    const seasonDuration = 2592000 // 2 months (60 days)
    const scheduleTimes = [startTime, startTime + oneYear, startTime + 2 * oneYear, startTime + 3 * oneYear, startTime + 4 * oneYear]
    // TODO: update schedule rewards
    const scheduleRewards = [
        hre.ethers.utils.parseUnits("200000000", 18),// 100M
        hre.ethers.utils.parseUnits("100000000", 18), // 50M
        hre.ethers.utils.parseUnits("50000000", 18), // 25M
        hre.ethers.utils.parseUnits("25000000", 18), // 12.5M
        hre.ethers.utils.parseUnits("12500000", 18), // 0M
    ]

    await deploy('JetStakingV1', {
        log: true,
        from: owner,
        proxy: {
            owner: owner,
            proxyContract: 'OpenZeppelinTransparentProxy',
            methodName: 'initialize',    
        },
        args: [
            aurora,
            name,
            symbol,
            scheduleTimes,
            scheduleRewards,
            tauPerStream,
            flags,
            treasury,
            decayGracePeriod,
            burnGracePeriod,
            seasonDuration
        ]
    })
    //TODO: transfer ownership to the admin address
    // await jet.transferOwnership(admin)

}

module.exports = func
module.exports.tags = ["staking"]
