import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    
    const {
        FLAGS,
        ONE_YEAR,
        TAU_PER_STREAM,
        MIN_WEIGHT,
        MAX_WEIGHT,
        AURORA_STREAM_OWNER,
        SCHEDULE_START_TIME
    } = process.env

    const { deploy } = hre.deployments
    let startTime: any
    const { owner } = await hre.getNamedAccounts()
    SCHEDULE_START_TIME ? startTime = parseInt(SCHEDULE_START_TIME as string) :  startTime = Math.floor(Date.now()/ 1000) + 60 
    const treasury = (await hre.ethers.getContract("Treasury")).address
    const aurora = (await hre.ethers.getContract("Token")).address
    const scheduleTimes = [
        startTime,
        startTime + parseInt(ONE_YEAR as string),
        startTime + 2 * parseInt(ONE_YEAR as string),
        startTime + 3 * parseInt(ONE_YEAR as string),
        startTime + 4 * parseInt(ONE_YEAR as string)
    ]
    // TODO: update schedule rewards before the deployment
    const scheduleRewards = [
        hre.ethers.utils.parseUnits("200000000", 18),// 100M
        hre.ethers.utils.parseUnits("100000000", 18), // 50M
        hre.ethers.utils.parseUnits("50000000", 18), // 25M
        hre.ethers.utils.parseUnits("25000000", 18), // 25M
        // Last amount should be 0 so scheduleTimes[4] marks the end of the stream schedule.
        hre.ethers.utils.parseUnits("0", 18), // 0M
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
            AURORA_STREAM_OWNER ? AURORA_STREAM_OWNER : owner,
            scheduleTimes,
            scheduleRewards,
            parseInt(TAU_PER_STREAM as string),
            parseInt(FLAGS as string),
            treasury,
            parseInt(MAX_WEIGHT as string),
            parseInt(MIN_WEIGHT as string)
        ]
    })
    //TODO: transfer ownership to the admin address
    // await jet.transferOwnership(admin)

}

module.exports = func
module.exports.tags = ["staking"]
