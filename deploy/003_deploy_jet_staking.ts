import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {

    const { deploy } = hre.deployments
    const { owner } = await hre.getNamedAccounts()

    const name = "Jet Staking" 
    const symbol = "VOTE"
    const seasonAmount = 24
    const seasonDuration = 5270400 // 61 days in seconds (two month)
    const startTime = Math.floor(Date.now()/ 1000) + 60 // starts after 60 seconds from now.
    const treasury = (await hre.ethers.getContract("Treasury")).address
    const aurora = (await hre.ethers.getContract("Token")).address
    const admin = owner
    const flags = 0
    const decayGracePeriod = 86400
    const burnGracePeriod = decayGracePeriod * 55

    await deploy('JetStaking', {
        log: true,
        from: owner,
        proxy: {
            owner: owner,
            proxyContract: 'OpenZeppelinTransparentProxy',
            methodName: 'initialize',    
        },
        args: [
            name, 
            symbol,
            seasonAmount,
            seasonDuration,
            startTime,
            aurora,
            treasury,
            admin,
            flags,
            decayGracePeriod,
            burnGracePeriod
        ]
    })
}

module.exports = func
module.exports.tags = ["staking"]
