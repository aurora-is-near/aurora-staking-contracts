import { Contract } from "ethers";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {deploySubProxy, upgradeSubProxy} from "../scripts/middleware_utils"

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
        TREASURY_MANAGER_ROLE_ADDRESS,
        ONLY_DEPLOY_UPGRADE_V2,
        ONLY_DEPLOY_UPGRADE_V3
    } = process.env
    if(!ONLY_DEPLOY_UPGRADE_V2 &&  !ONLY_DEPLOY_UPGRADE_V3) {
        const tri = "0xFa94348467f64D5A457F75F8bc40495D33c65aBB"
        const bastion = "0x9f1f933c660a1dc856f0e0fe058435879c5ccef0"
        const wnear = "0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d"
        const usn = "0x5183e1b1091804bc2602586919e6880ac1cf2896"
        const ply = "0x09c9d464b58d96837f8d8b6f4d9fe4ad408d3a4f"

        console.log(`AURORA staking contracts deployment @ ${new Date().toLocaleString()}`)
        const { save } = hre.deployments;
        const [ deployer ] = await hre.ethers.getSigners()
        const startTime = SCHEDULE_START_TIME ? parseInt(SCHEDULE_START_TIME as string) : Math.floor(Date.now()/ 1000) + 60
        console.log(`Main AURORA stream will start @ ${new Date(startTime * 1000).toLocaleString()}`)
        const flags = 0
        console.log(`Getting Aurora token address`);
        let auroraAddress = "";
        if (AURORA_TOKEN?.toString().startsWith("0x")){
            auroraAddress = AURORA_TOKEN.toString();
        } else {
            const token = await hre.ethers.getContract("Token");
            const auroraToken = await hre.ethers.getContractAt("Token", token.address);
            auroraAddress = auroraToken.address;
        }
        console.log(`Aurora token address is: ${auroraAddress}`)

        // Deploy JetStakingV3.
        // ====================
        let treasury: Contract
        try {
            treasury = await hre.ethers.getContract("Treasury")
            console.log("Reusing deployed Treasury from ./deployments")
        } catch(error) {
            const Treasury = await ethers.getContractFactory("Treasury")
            treasury = await deploySubProxy(
                Treasury,
                [
                    [
                        auroraAddress,
                        tri,
                        bastion,
                        wnear,
                        usn,
                        ply
                    ],
                    flags
                ],
            )
            console.log('Deploy Treasury Proxy done @ ' + treasury.address)
            await new Promise(f => setTimeout(f, 3000));
            const treasuryImpl = await upgradeSubProxy(treasury, Treasury)
            console.log('Deploy Treasury Implementation  done @ ' + treasuryImpl.address)
            const treasuryArtifact = await hre.deployments.getExtendedArtifact('Treasury');
            const treasuryProxyDeployments = {
                address: treasury.address,
                ...treasuryArtifact
            }
            await save('Treasury', treasuryProxyDeployments)
            await new Promise(f => setTimeout(f, 3000));
        }
        await treasury.deployed()

        const treasuryManagerRole = await treasury.TREASURY_MANAGER_ROLE()
        if(!await treasury.hasRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)) {
            await treasury.connect(deployer).grantRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'Treasury, ',
            'ADDRESS ',
            TREASURY_MANAGER_ROLE_ADDRESS,
            `Has a role (Treasury manager role) ${treasuryManagerRole}? `,
            await treasury.hasRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)
        )
        const treasuryDefaultAdminRole = await treasury.DEFAULT_ADMIN_ROLE()
        if(!await treasury.hasRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)) {
            await treasury.connect(deployer).grantRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'Treasury, ',
            'ADDRESS: ',
            DEFAULT_ADMIN_ROLE_ADDRESS,
            `Has a role (Default admin role) ${treasuryDefaultAdminRole}? `,
            await treasury.hasRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
        )

        const treasuryPauseRole = await treasury.PAUSE_ROLE()
        if(!await treasury.hasRole(treasuryPauseRole, DEFAULT_ADMIN_ROLE_ADDRESS)) {
            await treasury.connect(deployer).grantRole(treasuryPauseRole, DEFAULT_ADMIN_ROLE_ADDRESS)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'Treasury, ',
            'ADDRESS: ',
            DEFAULT_ADMIN_ROLE_ADDRESS,
            `Has a role (Pause role) ${treasuryPauseRole}? `,
            await treasury.hasRole(treasuryPauseRole, DEFAULT_ADMIN_ROLE_ADDRESS)
        )

        // Deploy JetStakingV3.
        // ====================
        // TODO: SCHEDULE_PERIOD=7890000 // 3 months
        const scheduleTimes = [
            startTime,
            startTime + parseInt(SCHEDULE_PERIOD as string),
            startTime + 2 * parseInt(SCHEDULE_PERIOD as string),
            startTime + 3 * parseInt(SCHEDULE_PERIOD as string),
            startTime + 4 * parseInt(SCHEDULE_PERIOD as string)
        ]
        // TODO: update schedule rewards before the deployment
        const scheduleRewards = [
            hre.ethers.utils.parseUnits("6000000", 18),// 900k
            hre.ethers.utils.parseUnits("5100000", 18), // 1.2M
            hre.ethers.utils.parseUnits("3900000", 18), // 1.8M
            hre.ethers.utils.parseUnits("2100000", 18), // 2.1M
            // Last amount should be 0 so scheduleTimes[4] marks the end of the stream schedule.
            hre.ethers.utils.parseUnits("0", 18), // 0M
        ]

        let jetStakingV3: Contract
        try {
            jetStakingV3 = await hre.ethers.getContract("JetStakingV3")
            console.log("Reusing deployed JetStakingV3 from ./deployments")
        } catch(error) {
            const JetStakingV3 = await ethers.getContractFactory("JetStakingV3")
            jetStakingV3 = await deploySubProxy(
                JetStakingV3,
                [
                    auroraAddress,
                    AURORA_STREAM_OWNER ? AURORA_STREAM_OWNER : deployer.address,
                    scheduleTimes,
                    scheduleRewards,
                    parseInt(TAU_PER_STREAM as string),
                    parseInt(FLAGS as string),
                    treasury.address,
                    parseInt(MAX_WEIGHT as string),
                    parseInt(MIN_WEIGHT as string)
                ]
            )

            console.log('Deploy JetStakingV3 Proxy done @ ' + jetStakingV3.address)
            await new Promise(f => setTimeout(f, 3000));
            const jetStakingV3Impl = await upgradeSubProxy(jetStakingV3, JetStakingV3)
            console.log('Deploy JetStakingV3 Implementation  done @ ' + jetStakingV3Impl.address)
            const jetStakingV3Artifact = await hre.deployments.getExtendedArtifact('JetStakingV3');
            const jetStakingV3ProxyDeployments = {
                address: jetStakingV3.address,
                ...jetStakingV3Artifact
            }
            await save('JetStakingV3', jetStakingV3ProxyDeployments)
            await new Promise(f => setTimeout(f, 3000));
        }

        await jetStakingV3.deployed()
        console.log(`JetStakingV3 address : ${jetStakingV3.address}`)

        const claimRole = await jetStakingV3.CLAIM_ROLE()
        const airdropRole = await jetStakingV3.AIRDROP_ROLE()
        const pauseRole = await jetStakingV3.PAUSE_ROLE()
        const streamManagerRole = await jetStakingV3.STREAM_MANAGER_ROLE()
        const defaultAdminRole = await jetStakingV3.DEFAULT_ADMIN_ROLE()
        console.log(`CLAIM_ROLE: ${claimRole}`)
        console.log(`AIRDROP_ROLE: ${airdropRole}`)
        console.log(`PAUSE_ROLE: ${pauseRole}`)
        console.log(`STREAM_MANAGER_ROLE ${streamManagerRole}`)
        console.log(`DEFAULT ADMIN ROLE: ${defaultAdminRole}`)

        if(!await jetStakingV3.hasRole(streamManagerRole, STREAM_MANAGER_ROLE_ADDRESS)) {
            await jetStakingV3.grantRole(streamManagerRole, STREAM_MANAGER_ROLE_ADDRESS)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'JetStaking, ',
            'ADDRESS: ',
            STREAM_MANAGER_ROLE_ADDRESS,
            `Has a role (Stream manager role) ${streamManagerRole}? `,
            await jetStakingV3.hasRole(streamManagerRole, STREAM_MANAGER_ROLE_ADDRESS)
        )
        if(!await jetStakingV3.hasRole(claimRole, CLAIM_ROLE_ADDRESS)) {
            await jetStakingV3.grantRole(claimRole, CLAIM_ROLE_ADDRESS)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'JetStaking, ',
            'ADDRESS: ',
            CLAIM_ROLE_ADDRESS,
            `Has a role (claim role) ${claimRole}? `,
            await jetStakingV3.hasRole(claimRole, CLAIM_ROLE_ADDRESS)
        )
        if(!await jetStakingV3.hasRole(airdropRole, AIRDROP_ROLE_ADDRESS)) {
            await jetStakingV3.grantRole(airdropRole, AIRDROP_ROLE_ADDRESS)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'JetStaking, ',
            'ADDRESS: ',
            AIRDROP_ROLE_ADDRESS,
            `Has a role (Airdrop role) ${airdropRole}? `,
            await jetStakingV3.hasRole(airdropRole, AIRDROP_ROLE_ADDRESS)
        )
        if(!await jetStakingV3.hasRole(pauseRole, PAUSER_ROLE_ADDRESS)) {
            await jetStakingV3.grantRole(pauseRole, PAUSER_ROLE_ADDRESS)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'JetStaking, ',
            'ADDRESS: ',
            PAUSER_ROLE_ADDRESS,
            `Has a role (Pauser role) ${pauseRole}? `,
            await jetStakingV3.hasRole(pauseRole, PAUSER_ROLE_ADDRESS)
        )
        if(!await jetStakingV3.hasRole(defaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)) {
            await jetStakingV3.grantRole(defaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'JetStaking, ',
            'ADDRESS: ',
            DEFAULT_ADMIN_ROLE_ADDRESS,
            `Has a role (Default admin role) ${defaultAdminRole}? `,
            await jetStakingV3.hasRole(defaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
        )
        // assign jet staking address an admin role in the treasury contract
        if(!await treasury.hasRole(treasuryDefaultAdminRole, jetStakingV3.address)) {
            await treasury.connect(deployer).grantRole(treasuryDefaultAdminRole, jetStakingV3.address)
            await new Promise(f => setTimeout(f, 1000));
        }
        console.log(
            'Contract: ',
            'Treasury, ',
            'ADDRESS: ',
            jetStakingV3.address,
            `Has a role (Default admin role) ${treasuryDefaultAdminRole}? `,
            await treasury.hasRole(treasuryDefaultAdminRole, jetStakingV3.address)
        )

        return

        // AIRDROP_ROLE_ADDRESS and CLAIM_ROLE_ADDRESS are general purpose.
        // Other addresses used by airdrop script:
        const airdropScriptAddresses = [
            "0xdffE60f55e1Ba75A34FbB54c99556B00Eb5EF83b",
            "0x6C663023EbD9e2444a9565E376a75336C77DE381",
            "0x82AEA31BdeBd16F6D45F61f7308fb2945A25343a",
            "0x1D2b71e9603BAA407D6F3985e987Be579b9Ff7cA",
            "0x3A7a8cf8FF006a00Cc1501a64D133abBabf23210",
            "0x945D345037d64a00F7c56e42A4c7e8Bc6F6951c5",
            "0xe75Dd5eE444ec4CeaF916D6b8c0DE89bE498300B",
            "0x474BD268aEE638F9F64a3549725B4Eb40955B72F",
            "0x05C69cf96C618D9CA81e615C683c0E768f9Eb00C",
            "0xE886BE87ecFC67F17A7b18bA73e0Ab64bB54cF85",
        ]
        console.log("Grant CLAIM_ROLE and AIRDROP_ROLE to airdrop script addresses.")
        // airdropScriptAddresses.forEach(async (addr) => {
        for (const addr of airdropScriptAddresses) {
            if(!await jetStakingV3.hasRole(claimRole, addr)) {
                await jetStakingV3.grantRole(claimRole, addr)
                await new Promise(f => setTimeout(f, 1000));
            }
            console.log(
                'Contract: ',
                'JetStaking, ',
                'ADDRESS: ',
                addr,
                `Has a role (Claim role) ${claimRole}? `,
                await jetStakingV3.hasRole(claimRole, addr)
            )
            if(!await jetStakingV3.hasRole(airdropRole, addr)) {
                await jetStakingV3.grantRole(airdropRole, addr)
                await new Promise(f => setTimeout(f, 1000));
            }
            console.log(
                'Contract: ',
                'JetStaking, ',
                'ADDRESS: ',
                addr,
                `Has a role (Airdrop role) ${airdropRole}? `,
                await jetStakingV3.hasRole(airdropRole, addr)
            )
        }
    }
}

module.exports = func
module.exports.tags = ["JetStakingV3"]
