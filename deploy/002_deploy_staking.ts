import { ethers, upgrades } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {
        FLAGS,
        SCHEDULE_PERIOD,
        TAU_PER_STREAM,
        MIN_WEIGHT,
        MAX_WEIGHT,
        AURORA_STREAM_OWNER,
        SCHEDULE_START_TIME,
        AURORA_TOKEN,
        DEFAULT_ADMIN_ROLE_ADDRESS,
        PAUSER_ROLE_ADDRESS,
        AIRDROP_ROLE_ADDRESS,
        CLAIM_ROLE_ADDRESS,
        STREAM_MANAGER_ROLE_ADDRESS,
        TREASURY_MANAGER_ROLE_ADDRESS
    } = process.env

    const [ deployer ] = await hre.ethers.getSigners()
    const startTime = SCHEDULE_START_TIME ? parseInt(SCHEDULE_START_TIME as string) : Math.floor(Date.now()/ 1000) + 60 
    const flags = 0
    await new Promise(f => setTimeout(f, 1000));
    const auroraAddress = AURORA_TOKEN? AURORA_TOKEN : (await hre.ethers.getContract("Token")).address
    await new Promise(f => setTimeout(f, 1000));
    const Treasury = await ethers.getContractFactory("Treasury")
    const treasury = await upgrades.deployProxy(
        Treasury,
        [
            [ auroraAddress ],
            flags
        ],
        {
            initializer: "initialize",
            kind : "uups",
        },
    )
    console.log(treasury.address)
    await new Promise(f => setTimeout(f, 1000));
    await treasury.deployed()

    await new Promise(f => setTimeout(f, 3000));
    // sleep for 3 seconds
    await new Promise(f => setTimeout(f, 1000));
    const treasuryManagerRole = await treasury.TREASURY_MANAGER_ROLE()
    if(!await treasury.hasRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)) {
        await treasury.connect(deployer).grantRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)
    }
    console.log(
        'Contract: ',
        'Treasury, ',
        'ADDRESS ', 
        TREASURY_MANAGER_ROLE_ADDRESS,
        `Has a role ${treasuryManagerRole}? `,
        await treasury.hasRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)
    )
    const treasuryDefaultAdminRole = await treasury.DEFAULT_ADMIN_ROLE()
    // sleep for 3 seconds
    await new Promise(f => setTimeout(f, 1000));
    if(!await treasury.hasRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)) {
        await treasury.connect(deployer).grantRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
    }
    console.log(
        'Contract: ', 
        'Treasury, ',
        'ADDRESS: ', 
        DEFAULT_ADMIN_ROLE_ADDRESS,
        `Has a role ${treasuryDefaultAdminRole}? `,
        await treasury.hasRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
    )

    console.log(`Treasury address : ${treasury.address}`)
    const scheduleTimes = [
        startTime,
        startTime + parseInt(SCHEDULE_PERIOD as string),
        startTime + 2 * parseInt(SCHEDULE_PERIOD as string),
        startTime + 3 * parseInt(SCHEDULE_PERIOD as string),
        startTime + 4 * parseInt(SCHEDULE_PERIOD as string)
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

    const JetStakingV1 = await ethers.getContractFactory("JetStakingV1")
    const jetStakingV1 = await upgrades.deployProxy(
        JetStakingV1,
        [
            AURORA_TOKEN ? AURORA_TOKEN : (await hre.ethers.getContract("Token")).address,
            AURORA_STREAM_OWNER ? AURORA_STREAM_OWNER : deployer.address,
            scheduleTimes,
            scheduleRewards,
            parseInt(TAU_PER_STREAM as string),
            parseInt(FLAGS as string),
            treasury.address,
            parseInt(MAX_WEIGHT as string),
            parseInt(MIN_WEIGHT as string)
        ],
        {
            initializer: "initialize",
            kind : "uups",
        }
    )
    await new Promise(f => setTimeout(f, 1000));
    await jetStakingV1.deployed()
    console.log(`JetStakingV1 address : ${jetStakingV1.address}`)
    
    // sleep for 3 seconds
    await new Promise(f => setTimeout(f, 3000));
    const claimRole = await jetStakingV1.CLAIM_ROLE()
    const airdropRole = await jetStakingV1.AIRDROP_ROLE()
    const pauseRole = await jetStakingV1.PAUSE_ROLE()
    const streamManagerRole = await jetStakingV1.STREAM_MANAGER_ROLE()
    const defaultAdminRole = await jetStakingV1.DEFAULT_ADMIN_ROLE()
    console.log(`CLAIM_ROLE: ${claimRole}`)
    console.log(`AIRDROP_ROLE: ${airdropRole}`)
    console.log(`PAUSE_ROLE: ${pauseRole}`)
    console.log(`STREAM_MANAGER_ROLE ${streamManagerRole}`)
    console.log(`DEFAULT ADMIN ROLE: ${defaultAdminRole}`)
    // sleep for 1 second
    await new Promise(f => setTimeout(f, 1000));
    if(!await jetStakingV1.hasRole(streamManagerRole, STREAM_MANAGER_ROLE_ADDRESS)) {
        await jetStakingV1.grantRole(streamManagerRole, STREAM_MANAGER_ROLE_ADDRESS)
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        STREAM_MANAGER_ROLE_ADDRESS,
        `Has a role ${streamManagerRole}? `,
        await jetStakingV1.hasRole(streamManagerRole, STREAM_MANAGER_ROLE_ADDRESS)
    )
    // sleep for 1 second
    await new Promise(f => setTimeout(f, 1000));
    if(!await jetStakingV1.hasRole(claimRole, CLAIM_ROLE_ADDRESS)) {
        await jetStakingV1.grantRole(claimRole, CLAIM_ROLE_ADDRESS)
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        CLAIM_ROLE_ADDRESS,
        `Has a role ${claimRole}? `,
        await jetStakingV1.hasRole(claimRole, CLAIM_ROLE_ADDRESS)
    )
    // sleep for 1 second
    await new Promise(f => setTimeout(f, 1000));
    if(!await jetStakingV1.hasRole(airdropRole, AIRDROP_ROLE_ADDRESS)) {
        await jetStakingV1.grantRole(airdropRole, AIRDROP_ROLE_ADDRESS)
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        AIRDROP_ROLE_ADDRESS,
        `Has a role ${airdropRole}? `,
        await jetStakingV1.hasRole(airdropRole, AIRDROP_ROLE_ADDRESS)
    )
    // sleep for 1 second
    await new Promise(f => setTimeout(f, 1000));
    if(!await jetStakingV1.hasRole(pauseRole, PAUSER_ROLE_ADDRESS)) {
        await jetStakingV1.grantRole(pauseRole, PAUSER_ROLE_ADDRESS)
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        PAUSER_ROLE_ADDRESS,
        `Has a role ${pauseRole}? `,
        await jetStakingV1.hasRole(pauseRole, PAUSER_ROLE_ADDRESS)
    )
    // sleep for 1 second
    await new Promise(f => setTimeout(f, 1000));
    if(!await jetStakingV1.hasRole(defaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)) {
        await jetStakingV1.grantRole(defaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        DEFAULT_ADMIN_ROLE_ADDRESS,
        `Has a role ${defaultAdminRole}? `,
        await jetStakingV1.hasRole(defaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
    )
    // assign jet staking address an admin role in the treasury contract
    // sleep for 1 second
    await new Promise(f => setTimeout(f, 1000));
    if(!await treasury.hasRole(treasuryDefaultAdminRole, jetStakingV1.address)) {
        await treasury.connect(deployer).grantRole(treasuryDefaultAdminRole, jetStakingV1.address)
    }
    console.log(
        'Contract: ', 
        'JetStaking, ',
        'ADDRESS: ', 
        jetStakingV1.address,
        `Has a role ${treasuryDefaultAdminRole}? `,
        await treasury.hasRole(treasuryDefaultAdminRole, jetStakingV1.address)
    )
    // treasury
    // drop deployer address from the treasury manager role in the treasury contract
    await new Promise(f => setTimeout(f, 1000));
    if(await treasury.hasRole(treasuryManagerRole, deployer.address)) {
        await treasury.connect(deployer).revokeRole(treasuryManagerRole, deployer.address)
    }
    console.log(
        `Drop deployer address from ${treasuryManagerRole} role in treasury contract`,
        '... Dropped?',
        await treasury.hasRole(treasuryManagerRole, deployer.address) ? false: true
    )

    // drop deployer address from the pause role role in the treasury contract
    await new Promise(f => setTimeout(f, 1000));
    if(await treasury.hasRole(pauseRole, deployer.address)) {
        await treasury.connect(deployer).revokeRole(pauseRole, deployer.address)
    }
    console.log(
        `Drop deployer address from ${pauseRole} role in treasury contract`,
        '... Dropped?',
        await treasury.hasRole(pauseRole, deployer.address) ? false: true
    )
    // drop deployer address from the default admin role in the treasury contract
    await new Promise(f => setTimeout(f, 1000));
    if(await treasury.hasRole(treasuryDefaultAdminRole, deployer.address)) {
        await treasury.connect(deployer).revokeRole(treasuryDefaultAdminRole, deployer.address)
    }
    console.log(
        `Drop deployer address from ${treasuryDefaultAdminRole} role in treasury contract`,
        '... Dropped?',
        await treasury.hasRole(treasuryDefaultAdminRole, deployer.address) ? false: true
    )

    // jetStaking
    // drop deployer address from the pause role in the jet-staking contract
    await new Promise(f => setTimeout(f, 1000));
    if(await jetStakingV1.hasRole(pauseRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(pauseRole, deployer.address)
    }
    console.log(
        `Drop deployer address from ${pauseRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(pauseRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the stream manager role in the jet-staking contract
    await new Promise(f => setTimeout(f, 1000));
    if(await jetStakingV1.hasRole(streamManagerRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(streamManagerRole, deployer.address)
    }
    console.log(
        `Drop deployer address from ${streamManagerRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(streamManagerRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the claim rolein the jet-staking contract
    await new Promise(f => setTimeout(f, 1000));
    if(await jetStakingV1.hasRole(claimRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(claimRole, deployer.address)
    }
    console.log(
        `Drop deployer address from ${claimRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(claimRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the airdrop role in the jet-staking contract
    await new Promise(f => setTimeout(f, 1000));
    if(await jetStakingV1.hasRole(airdropRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(airdropRole, deployer.address)
    }
    console.log(
        `Drop deployer address from ${airdropRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(airdropRole, jetStakingV1.address) ? false: true
    )

    // drop deployer address from the default admin role in the jet-staking contract
    await new Promise(f => setTimeout(f, 1000));
    if(await jetStakingV1.hasRole(defaultAdminRole, deployer.address)) {
        await jetStakingV1.connect(deployer).revokeRole(defaultAdminRole, deployer.address)
    }
    console.log(
        `Drop deployer address from ${defaultAdminRole} role in jet-staking contract`,
        '... Dropped?',
        await jetStakingV1.hasRole(defaultAdminRole, deployer.address) ? false: true
    )
}

module.exports = func
module.exports.tags = ["JetStakingV1"]
