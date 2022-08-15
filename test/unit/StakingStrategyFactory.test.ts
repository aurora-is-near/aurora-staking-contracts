import { expect, use } from "chai";
import { ethers, network, deployments, upgrades } from "hardhat";
import * as constants from './constants'
import { getEventLogs } from "./testHelper";

describe("LockedStakingFactory", function () {
    let auroraOwner: any
    let user1: any
    let oneDay: any
    let stakingFactory: any
    let auroraToken: any
    let LockedStakingTemplate: any
    let startTime: any
    let jetStakingV1: any
    let voteToken: any
    let streamToken: any
    let scheduleTimes: any
    let scheduleRewards: any
    let stakingAdmin: any
    let streamManager: any

    before(async () => {
        // deploys all the contracts
        [auroraOwner, stakingAdmin, user1, streamManager] = await ethers.getSigners()
        LockedStakingTemplate =  await ethers.getContractFactory('LockedStakingSubAccountImplementation')
        oneDay = 86400
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 10
        const Token = await ethers.getContractFactory("Token")
        const supply = ethers.utils.parseUnits("10000000000", 18)
        auroraToken = await Token.connect(auroraOwner).deploy(supply, "AuroraToken", "AURORA")
        voteToken = await Token.connect(auroraOwner).deploy(supply, "VoteToken", "VOTE")
        streamToken = await Token.connect(auroraOwner).deploy(supply, "StreamToken", "ST")
        const flags = 0
        const Treasury = await ethers.getContractFactory("Treasury")
        const treasury = await upgrades.deployProxy(
            Treasury, 
            [
                [
                    auroraToken.address,
                    voteToken.address,
                    streamToken.address
                ],
                flags
            ]
        )
        await treasury.deployed()
        const oneYear = 31556926
        const tauPerStream = 10

        startTime = (await ethers.provider.getBlock("latest")).timestamp + 10
        const JetStakingV1 = await ethers.getContractFactory('JetStakingTesting')
        const minWeight = 256
        const maxWeight = 1024
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        scheduleRewards = [
            ethers.utils.parseUnits("200000000", 18), // 100M
            ethers.utils.parseUnits("100000000", 18), // 50M 
            ethers.utils.parseUnits("50000000", 18),  // 25M
            ethers.utils.parseUnits("25000000", 18),  // 25M
            // Last amount should be 0 so scheduleTimes[4] marks the end of the stream schedule.
            ethers.utils.parseUnits("0", 18),  // 0
        ]
        jetStakingV1 = await upgrades.deployProxy(
            JetStakingV1,
            [
                auroraToken.address,
                auroraOwner.address, // aurora stream owner
                scheduleTimes,
                scheduleRewards,
                tauPerStream,
                0,
                treasury.address,
                maxWeight,
                minWeight
            ]
        )
        await jetStakingV1.deployed()
        // create a vote token stream
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("1000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("1000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("1000", 18)

        await auroraToken.connect(auroraOwner).approve(jetStakingV1.address, auroraProposalAmountForAStream)
        // propose a stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        scheduleRewards = [
            ethers.utils.parseUnits("1000", 18), // 100M
            ethers.utils.parseUnits("500", 18), // 50M 
            ethers.utils.parseUnits("250", 18),  // 25M
            ethers.utils.parseUnits("125", 18),  // 25M
            // Last amount should be 0 so scheduleTimes[4] marks the end of the stream schedule.
            ethers.utils.parseUnits("0", 18),  // 0
        ]
        await jetStakingV1.connect(auroraOwner).proposeStream(
            auroraOwner.address,
            voteToken.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward (vote) tokens
        await voteToken.connect(auroraOwner).approve(jetStakingV1.address, maxRewardProposalAmountForAStream)
        // create a stream
        const tx = await jetStakingV1.connect(auroraOwner).createStream(id, maxRewardProposalAmountForAStream)
        const claimRole = await jetStakingV1.CLAIM_ROLE()
        const airdropRole = await jetStakingV1.AIRDROP_ROLE()
        const pauseRole = await jetStakingV1.PAUSE_ROLE()
        const defaultAdminRole = await jetStakingV1.DEFAULT_ADMIN_ROLE()
        const streamManagerRole = await jetStakingV1.STREAM_MANAGER_ROLE()
        const deployer = auroraOwner
        expect(await jetStakingV1.hasRole(claimRole, stakingAdmin.address)).to.be.eq(false)
        expect(await jetStakingV1.hasRole(airdropRole, stakingAdmin.address)).to.be.eq(false)
        expect(await jetStakingV1.hasRole(pauseRole, stakingAdmin.address)).to.be.eq(false)
        expect(await jetStakingV1.hasRole(defaultAdminRole, stakingAdmin.address)).to.be.eq(false)
        await jetStakingV1.connect(deployer).grantRole(claimRole, stakingAdmin.address)
        await jetStakingV1.connect(deployer).grantRole(airdropRole, stakingAdmin.address)
        await jetStakingV1.connect(deployer).grantRole(airdropRole, user1.address)
        await jetStakingV1.connect(deployer).grantRole(pauseRole, stakingAdmin.address)
        await jetStakingV1.connect(deployer).grantRole(streamManagerRole, streamManager.address)
        await jetStakingV1.connect(deployer).grantRole(defaultAdminRole, stakingAdmin.address)
        
        expect(await jetStakingV1.hasRole(claimRole, stakingAdmin.address)).to.be.eq(true)
        expect(await jetStakingV1.hasRole(airdropRole, stakingAdmin.address)).to.be.eq(true)
        expect(await jetStakingV1.hasRole(pauseRole, stakingAdmin.address)).to.be.eq(true)
        expect(await jetStakingV1.hasRole(defaultAdminRole, stakingAdmin.address)).to.be.eq(true)
        expect(await jetStakingV1.hasRole(streamManagerRole, streamManager.address)).to.be.eq(true)
        // Deploy Locked Staking Template
        const lockedStakingTemplate = await LockedStakingTemplate.deploy()
        await new Promise(f => setTimeout(f, 3000))
        const StakingFactory = await ethers.getContractFactory('StakingStrategyFactory')
        stakingFactory = await upgrades.deployProxy(
            StakingFactory,
            [
                lockedStakingTemplate.address,
                jetStakingV1.address,
                auroraToken.address,
                0
            ],
            {
                initializer: "initialize",
                kind : "uups",
            },
        )
        await stakingFactory.deployed()
    })

    it('should allow anyone to deploy a new locked staking instance', async () => {
        const amount = ethers.utils.parseUnits("1", 18)
        const extraInitParameters = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256"], 
            [
                voteToken.address,
                oneDay
            ]
        )
        await auroraToken.connect(auroraOwner).approve(
            stakingFactory.address,
            amount
        )
        const tx = await stakingFactory.connect(auroraOwner).cloneTemplate(
            0, // template id
            amount,
            extraInitParameters
        )
        const { instance, owner } = await getEventLogs(tx.hash, constants.eventsABI.templateCloned, 0)
        expect(owner).to.be.eq(auroraOwner.address)
        const lockedStakingSubAccount = await ethers.getContractAt('LockedStakingSubAccountImplementation',instance)
        expect(
            await lockedStakingSubAccount.stakingContract()
        ).to.eq(jetStakingV1.address)
        expect(
            await stakingFactory.clonesCount()
        ).to.be.eq(1)
        const templatesCount = await stakingFactory.getTemplatesCount()
        expect(
            await stakingFactory.getUserClones(owner)
        ).to.deep.eq(
            [
                [
                    ethers.BigNumber.from(templatesCount.toNumber() - 1),
                    instance
                ]
            ]
        )
    })
    it('should only default admin role add new templates', async () => {
        const NewTemplate =  await ethers.getContractFactory('LockedStakingSubAccountImplementation')
        // Deploy the template
        const templateId = await stakingFactory.getTemplatesCount()
        const newTemplate = await NewTemplate.deploy()
        await stakingFactory.connect(auroraOwner).addTemplate(newTemplate.address)
        expect(
            newTemplate.address
        ).be.eq(
            await stakingFactory.templates(templateId)
        )
        await expect(
            stakingFactory.connect(user1).addTemplate(newTemplate.address)
        ).to.be.reverted
    })
})
