import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {

    const { deploy } = hre.deployments
    const { owner } = await hre.getNamedAccounts()
    const startTime = Math.floor(Date.now()/ 1000) + 60 // starts after 60 seconds from now.
    const treasury = (await hre.ethers.getContract("Treasury")).address
    const aurora = (await hre.ethers.getContract("Token")).address
    const admin = owner

    const name = "Jet Staking V1" 
    const symbol = "VOTE"
    const flags = 0
    const oneYear: number = 31536000
    const tauPerStream = 1000
    const scheduleTimes = [startTime, startTime + oneYear, startTime + 2 * oneYear, startTime + 3 * oneYear, startTime + 4 * oneYear]
    const scheduleRewards = [0, 100, 50, 25, 25]

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
            treasury
        ]
    })
    //TODO: transfer ownership to the admin address
    // await jet.transferOwnership(admin)

}

module.exports = func
module.exports.tags = ["staking"]
