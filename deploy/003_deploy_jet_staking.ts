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
        SCHEDULE_START_TIME,
        TESTING,
        AURORA_TOKEN,
        DEFAULT_ADMIN_ROLE_ADDRESS,
        PAUSER_ROLE_ADDRESS,
        AIRDROP_ROLE_ADDRESS,
        CLAIM_ROLE_ADDRESS,
        STREAM_MANAGER_ROLE_ADDRESS
    } = process.env

    const { deploy } = hre.deployments
    let startTime: any
    let aurora: any
    const { owner } = await hre.getNamedAccounts()
    SCHEDULE_START_TIME ? startTime = parseInt(SCHEDULE_START_TIME as string) :  startTime = Math.floor(Date.now()/ 1000) + 60 
    const treasury = (await hre.ethers.getContract("Treasury")).address
    TESTING ? aurora = (await hre.ethers.getContract("Token")).address: aurora = AURORA_TOKEN
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
    if(!TESTING) {
        const jetStakingV1 = await hre.ethers.getContract("JetStakingV1")
        await jetStakingV1.deployed()
        const claimRole = await jetStakingV1.CLAIM_ROLE()
        const airdropRole = await jetStakingV1.AIRDROP_ROLE()
        const pauseRole = await jetStakingV1.PAUSE_ROLE()
        // const streamManagerRole = await jetStakingV1.STREAM_MANAGER_ROLE()
        const defaultAdminRole = await jetStakingV1.DEFAULT_ADMIN_ROLE()
        console.log(`CLAIM_ROLE: ${claimRole}`)
        console.log(`AIRDROP_ROLE: ${airdropRole}`)
        console.log(`PAUSE_ROLE: ${pauseRole}`)
        console.log(`DEFAULT ADMIN ROLE: ${defaultAdminRole}`)
        // // await jetStakingV1.connect(owner).grantRole(streamManagerRole, STREAM_MANAGER_ROLE_ADDRESS)
        await jetStakingV1.grantRole(claimRole, CLAIM_ROLE_ADDRESS)
        console.log(
            'ADDRESS ', 
            CLAIM_ROLE_ADDRESS,
            `Has a role ${claimRole}? `,
            await jetStakingV1.hasRole(claimRole, CLAIM_ROLE_ADDRESS)
        )
        await jetStakingV1.grantRole(airdropRole, AIRDROP_ROLE_ADDRESS)
        console.log(
            'ADDRESS ', 
            AIRDROP_ROLE_ADDRESS,
            `Has a role ${airdropRole}? `,
            await jetStakingV1.hasRole(airdropRole, AIRDROP_ROLE_ADDRESS)
        )
        await jetStakingV1.grantRole(pauseRole, PAUSER_ROLE_ADDRESS)
        console.log(
            'ADDRESS ', 
            PAUSER_ROLE_ADDRESS,
            `Has a role ${pauseRole}? `,
            await jetStakingV1.hasRole(pauseRole, PAUSER_ROLE_ADDRESS)
        )
        await jetStakingV1.transferOwnership(DEFAULT_ADMIN_ROLE_ADDRESS)
        console.log(
            'ADDRESS ', 
            DEFAULT_ADMIN_ROLE_ADDRESS,
            `Has a role ${defaultAdminRole}? `,
            await jetStakingV1.hasRole(defaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
        )

    }
}

module.exports = func
module.exports.tags = ["staking"]
