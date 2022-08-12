import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import * as constants from '../constants'
import { getEventLogs } from "../testHelper";

describe("LockedStakingTemplate", function () {
    let auroraOwner: any
    let user1: any
    let oneDay: any
    let stakingFactory: any
    let auroraToken: any
    let LockedStakingTemplate: any
    let startTime: any
    let jetStakingV1: any
    let templateInstance: any
    let user1BalanceBefore: any
    let stakingAmount: any
    let lockedStakingSubAccount: any
    let oneYear: any
    let tauPerStream: any
    let scheduleTimes: any
    let scheduleRewards: any
    let streamToken: any
    let treasury: any
    let stakingAdmin: any
    let streamManager: any
    let extraInitParameters: any
    let voteToken: any

    
    before(async () => {
        // deploys all the contracts
        [auroraOwner, stakingAdmin, user1, streamManager] = await ethers.getSigners()
        // jetStakingV1 = await ethers.getContract("JetStakingV1")
        const supply = ethers.utils.parseUnits("10000000000", 18)
        LockedStakingTemplate =  await ethers.getContractFactory('LockedStakingSubAccountImplementation')
        oneDay = 86400
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 10
        const Token = await ethers.getContractFactory("Token")
        auroraToken = await Token.connect(auroraOwner).deploy(supply, "AuroraToken", "AURORA")
        // random example for other reward token contracts
        const SampleVoteToken = await ethers.getContractFactory("SampleVoteToken")
        voteToken = await SampleVoteToken.connect(auroraOwner).deploy(supply, "VoteToken", "VOTE")
        streamToken = await Token.connect(auroraOwner).deploy(supply, "StreamToken", "ST")
        const flags = 0
        const Treasury = await ethers.getContractFactory("Treasury")
        treasury = await upgrades.deployProxy(
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
        // Deploy Locked Staking Template
        const lockedStakingTemplate = await LockedStakingTemplate.deploy()
        await new Promise(f => setTimeout(f, 3000))
        const StakingFactory = await ethers.getContractFactory('StakingStrategyFactory')
        
        oneYear = 31556926
        tauPerStream = 10

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
        scheduleRewards = [
            ethers.utils.parseUnits("1000", 18), // 100M
            ethers.utils.parseUnits("500", 18), // 50M 
            ethers.utils.parseUnits("250", 18),  // 25M
            ethers.utils.parseUnits("125", 18),  // 25M
            // Last amount should be 0 so scheduleTimes[4] marks the end of the stream schedule.
            ethers.utils.parseUnits("0", 18),  // 0
        ]
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
    })

    beforeEach(async () => {
        // fund users wallet
        await auroraToken.connect(auroraOwner).transfer(user1.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(stakingAdmin.address, ethers.utils.parseUnits("100000000", 18))
        await auroraToken.connect(auroraOwner).transfer(streamManager.address, ethers.utils.parseUnits("100000000", 18))
        // transfer 20% of the total supply to the treasury contract
        const twentyPercentOfAuroraTotalSupply = ethers.utils.parseUnits("200000000", 18)
        // const onePercentOfTokenSupply = ethers.utils.parseUnits("1000000", 18)
        await auroraToken.connect(auroraOwner).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)
        await voteToken.connect(auroraOwner).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)
        await streamToken.connect(auroraOwner).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)
        stakingAmount = ethers.utils.parseUnits("1", 18)
        await auroraToken.connect(auroraOwner).transfer(user1.address, stakingAmount)
        user1BalanceBefore = await auroraToken.balanceOf(user1.address)
        extraInitParameters = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256"], 
            [
                voteToken.address,
                oneDay
            ]
        )
        await auroraToken.connect(user1).approve(
            stakingFactory.address,
            stakingAmount
        )
        const tx = await stakingFactory.connect(user1).cloneTemplate(
            0, // template id
            stakingAmount,
            extraInitParameters
        )
        const { instance, owner } = await getEventLogs(tx.hash, constants.eventsABI.templateCloned, 0)
        templateInstance = instance
        expect(owner).to.be.eq(user1.address)
        lockedStakingSubAccount = await ethers.getContractAt('LockedStakingSubAccountImplementation',instance, user1)
        expect(
            await lockedStakingSubAccount.stakingContract()
        ).to.eq(jetStakingV1.address)
        // transfer ownership of the treasury to the jet staking contract
        const defaultAdminRole = await jetStakingV1.DEFAULT_ADMIN_ROLE()
        await treasury.connect(auroraOwner).grantRole(defaultAdminRole, jetStakingV1.address)
    })

    it('should revert if retry to initialize the contract twice', async () => {
        await expect(
            lockedStakingSubAccount.initialize(
                jetStakingV1.address,
                user1.address,
                stakingAmount,
                auroraToken.address,
                extraInitParameters
            )
        ).to.be.reverted
    })
    it('should stake with locked staking by creating a new instance', async () => {
        expect(
            ethers.utils.formatEther(
                await jetStakingV1.getUserTotalDeposit(templateInstance)
            )
        ).to.be.eq(
            ethers.utils.formatEther(
                stakingAmount
            )
        )
    })
    it('should owner able to unstake all', async () => {
        const startTime = (await ethers.provider.getBlock("latest")).timestamp
        const lockedStakingSubAccount = await ethers.getContractAt(
            'LockedStakingSubAccountImplementation',
            templateInstance
        )
        await expect(
            lockedStakingSubAccount.connect(user1).unstakeAll()
        ).to.be.revertedWith('INVALID_CALL_DURING_LOCKUP_PERIOD')
        await network.provider.send("evm_setAutomine", [true])
        await network.provider.send("evm_mine", [startTime + oneDay+1])
        await lockedStakingSubAccount.connect(user1).moveAllRewardsToPending()
        await lockedStakingSubAccount.connect(user1).unstakeAll()
        await network.provider.send("evm_mine", [startTime + 2 * (oneDay+1)])
        const pendingAmount = await jetStakingV1.getPending(0, lockedStakingSubAccount.address)
        expect(
            parseInt(ethers.utils.formatEther(
                pendingAmount
            ))
        ).to.be.greaterThan(
            parseInt(ethers.utils.formatEther(
                stakingAmount
            ))
        )
        await lockedStakingSubAccount.connect(user1).withdrawAll()
        const user1BalanceAfter = pendingAmount.add(user1BalanceBefore)
        expect(
            parseInt(ethers.utils.formatEther(user1BalanceBefore))
        ).to.be.lessThan(
            parseInt(ethers.utils.formatEther(user1BalanceAfter))
        )
    })
    it('should only owner withdraw rewards', async ()=> {
        const startTime = (await ethers.provider.getBlock("latest")).timestamp
        lockedStakingSubAccount = await ethers.getContractAt(
            'LockedStakingSubAccountImplementation',
            templateInstance
        )
        await network.provider.send("evm_setAutomine", [true])
        await network.provider.send("evm_mine", [startTime + 2 * oneDay])
        const rewardAmount = ethers.utils.parseUnits("1.5", 18)
        await lockedStakingSubAccount.connect(user1).moveRewardsToPending(1)
        await lockedStakingSubAccount.connect(user1).unstake(rewardAmount)
        const auroraRewards = await jetStakingV1.getPending(0, lockedStakingSubAccount.address)
        await network.provider.send("evm_mine", [startTime + 4 * oneDay])
        await lockedStakingSubAccount.connect(user1).withdraw(0)
        const voteTokenUser1BalanceBefore = await voteToken.balanceOf(user1.address)
        await lockedStakingSubAccount.connect(user1).withdraw(1)
        const voteTokenUser1BalanceAfter = await voteToken.balanceOf(user1.address)
        const user1BalanceAfter = auroraRewards.add(user1BalanceBefore)
        expect(
            parseInt(ethers.utils.formatEther(user1BalanceBefore))
        ).to.be.lessThan(
            parseInt(ethers.utils.formatEther(user1BalanceAfter))
        )
        expect(
            parseFloat(
                ethers.utils.formatEther(voteTokenUser1BalanceBefore)
            )
        ).to.be.lessThan(
            parseFloat(
                ethers.utils.formatEther(voteTokenUser1BalanceAfter)
            )
        )
    })
})