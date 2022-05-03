import { expect, use } from "chai";
import { ethers, network, deployments, upgrades } from "hardhat";
import * as constants from './constants'
import { getEventLogs } from "./testHelper";

describe("JetStakingV1", function () {
    let auroraOwner: any
    let stakingAdmin: any
    let streamToken1: any
    let streamToken2: any
    let auroraToken: any
    let user1: any
    let user2: any
    let user3: any
    let user4: any
    let user5: any
    let spender: any
    let streamOwner: any
    let treasury: any
    let jet: any
    let oneYear: number
    let tauPerStream: number
    let scheduleTimes: any
    let scheduleRewards: any
    let oneDay: any
    let startTime: any
    let treasuryAdmin: any
    let streamManager: any
    
    before(async () => {
        // deploys all the contracts
        [auroraOwner, stakingAdmin, user1, user2, user3, user4, user5, spender, streamOwner, streamManager] = await ethers.getSigners()
        const supply = ethers.utils.parseUnits("10000000000", 18)
        oneDay = 86400
        const Token = await ethers.getContractFactory("Token")
        auroraToken = await Token.connect(auroraOwner).deploy(supply, "AuroraToken", "AURORA")
        // random example for other reward token contracts
        streamToken1 = await Token.connect(user1).deploy(supply, "StreamToken1", "ST1")
        streamToken2 = await Token.connect(user2).deploy(supply, "StreamToken2", "ST2")
        const flags = 0
        const Treasury = await ethers.getContractFactory("Treasury")
        treasury = await upgrades.deployProxy(
            Treasury, 
            [
                [
                    auroraToken.address,
                    streamToken1.address,
                    streamToken2.address
                ],
                flags
            ]
        )
        // transfer 20% of the total supply to the treasury contract
        const twentyPercentOfAuroraTotalSupply = ethers.utils.parseUnits("200000000", 18)
        // const onePercentOfTokenSupply = ethers.utils.parseUnits("1000000", 18)
        await auroraToken.connect(auroraOwner).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)

        oneYear = 31556926
        tauPerStream = 10

        startTime = (await ethers.provider.getBlock("latest")).timestamp
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
        jet = await upgrades.deployProxy(
            JetStakingV1,
            [
                auroraToken.address,
                auroraOwner.address, // aurora stream owner
                scheduleTimes,
                scheduleRewards,
                tauPerStream,
                flags,
                treasury.address,
                maxWeight,
                minWeight
            ]
        )
        const claimRole = await jet.CLAIM_ROLE()
        const airdropRole = await jet.AIRDROP_ROLE()
        const pauseRole = await jet.PAUSE_ROLE()
        const defaultAdminRole = await jet.DEFAULT_ADMIN_ROLE()
        const streamManagerRole = await jet.STREAM_MANAGER_ROLE()
        const deployer = auroraOwner
        expect(await jet.hasRole(claimRole, stakingAdmin.address)).to.be.eq(false)
        expect(await jet.hasRole(airdropRole, stakingAdmin.address)).to.be.eq(false)
        expect(await jet.hasRole(pauseRole, stakingAdmin.address)).to.be.eq(false)
        expect(await jet.hasRole(defaultAdminRole, stakingAdmin.address)).to.be.eq(false)
        await jet.connect(deployer).grantRole(claimRole, stakingAdmin.address)
        await jet.connect(deployer).grantRole(airdropRole, stakingAdmin.address)
        await jet.connect(deployer).grantRole(pauseRole, stakingAdmin.address)
        await jet.connect(deployer).grantRole(streamManagerRole, streamManager.address)
        await jet.connect(deployer).grantRole(defaultAdminRole, stakingAdmin.address)
        
        expect(await jet.hasRole(claimRole, stakingAdmin.address)).to.be.eq(true)
        expect(await jet.hasRole(airdropRole, stakingAdmin.address)).to.be.eq(true)
        expect(await jet.hasRole(pauseRole, stakingAdmin.address)).to.be.eq(true)
        expect(await jet.hasRole(defaultAdminRole, stakingAdmin.address)).to.be.eq(true)
        expect(await jet.hasRole(streamManagerRole, streamManager.address)).to.be.eq(true)
    })

    beforeEach(async () => {        
        await deployments.fixture()
        // fund users wallet
        await auroraToken.connect(auroraOwner).transfer(user1.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user2.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user3.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user4.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(stakingAdmin.address, ethers.utils.parseUnits("100000000", 18))
        await auroraToken.connect(auroraOwner).transfer(streamManager.address, ethers.utils.parseUnits("100000000", 18))
        // console.log(balanceOfAurorOwner)
        const balanceOfAurorOwner = await auroraToken.balanceOf(auroraOwner.address)
        await auroraToken.connect(auroraOwner).transfer(user5.address, balanceOfAurorOwner)
        // transfer ownership of the treasury to the jet staking contract
        const defaultAdminRole = await jet.DEFAULT_ADMIN_ROLE()
        await treasury.connect(auroraOwner).grantRole(defaultAdminRole, jet.address)
    })

    it("should return treasury account", async () => {
        expect(await jet.treasury()).to.eq(treasury.address)
    })

    it('should allow admin to propose new stream', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        const tx = await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // console.log(tx)
        const {streamId, owner, } = await getEventLogs(tx.hash, constants.eventsABI.streamProposed, 0)
        // console.log(streamId, owner)
        expect(owner).to.be.eq(user1.address)
        expect(streamId.toNumber()).to.be.eq(id)
    })
    it('should allow stream owner to create a stream', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        const tx = await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        const {streamId, owner, } = await getEventLogs(tx.hash, constants.eventsABI.streamCreated, 0)
        expect(owner).to.be.eq(user1.address)
        expect(streamId.toNumber()).to.be.eq(id)
        expect(await jet.getStreamsCount()).to.be.eq(2)
    })
    it('should create stream and refund staking admin if deposit reward is less than the upper amount', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens (50% of the max reward proposal amount for a stream)
        const RewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
        await streamToken1.connect(user1).approve(jet.address, RewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, RewardProposalAmountForAStream)
        const stream = await jet.getStream(id)
        expect(stream.rewardDepositAmount).to.be.eq(
            RewardProposalAmountForAStream
        )
        expect(
            parseInt(ethers.utils.formatEther(maxRewardProposalAmountForAStream))
        ).to.be.greaterThan(
            parseInt(ethers.utils.formatEther(stream.rewardDepositAmount))
        )
        const expectedAuroraDeposit = parseInt(ethers.utils.formatEther(stream.rewardDepositAmount)) * parseInt(ethers.utils.formatEther(auroraProposalAmountForAStream)) / parseInt(ethers.utils.formatEther(maxRewardProposalAmountForAStream))
        expect(
            parseInt(ethers.utils.formatEther(auroraProposalAmountForAStream))
        ).to.be.greaterThan(
            parseInt(ethers.utils.formatEther(stream.auroraDepositAmount))
        )
        expect(expectedAuroraDeposit).to.be.eq(parseInt(ethers.utils.formatEther(stream.auroraDepositAmount)))
        const rewardSchedule = await jet.getStreamSchedule(id)
        for (let i = 0; i < rewardSchedule[1].length; i++) {
            i != rewardSchedule[1].length - 1 ? expect(parseInt(ethers.utils.formatEther(rewardSchedule[1][i]))).to.be.eq(parseInt(ethers.utils.formatEther(scheduleRewards[i]))/2) :
            expect(parseInt(ethers.utils.formatEther(rewardSchedule[1][i]))).to.be.eq(0)
        }
    })
    it('should release aurora rewards to stream owner', async () => {
        const user1BalanceBefore = parseInt(ethers.utils.formatEther(await auroraToken.balanceOf(user1.address)))
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // release aurora reward after ~ 1 year
        await network.provider.send("evm_increaseTime", [365 * oneDay])
        await network.provider.send("evm_mine")
        const claimableBefore = await jet.getStreamOwnerClaimableAmount(id)
        await jet.connect(user1).releaseAuroraRewardsToStreamOwner(id)
        const user1BalanceAfter = parseInt(ethers.utils.formatEther(await auroraToken.balanceOf(user1.address)))
        expect(user1BalanceBefore).to.be.lessThanOrEqual(user1BalanceAfter)
        const actualReward = user1BalanceAfter - user1BalanceBefore
        const expectedReward = parseInt(ethers.utils.formatEther(auroraProposalAmountForAStream)) * 0.5
        expect(actualReward).to.be.within(expectedReward - 10, expectedReward + 10)
        await network.provider.send("evm_mine") // Prevent RangeError: Maximum call stack size exceeded
        const claimableAfter = await jet.getStreamOwnerClaimableAmount(id)
        expect(claimableAfter).to.be.lt(claimableBefore)
    })
    it('should stake aurora tokens', async () => {
        const amountStaked = ethers.utils.parseUnits("10", 18)
        await auroraToken.connect(user1).approve(jet.address, amountStaked)
        const tx = await jet.connect(user1).stake(amountStaked)
        const {amount, } = await getEventLogs(tx.hash, constants.eventsABI.staked, 0)
        expect(amount).to.be.eq(amountStaked)
    })
    it('should not release new rewards in the same block', async () => {
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        const touchedAt = await jet.touchedAt()
        const rewards = await jet.getRewardsAmount(0, touchedAt)
        expect(rewards.isZero()).to.be.eq(true)
    })
    it('user stakes and never claims', async () => {
        const amountStaked1 = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amountStaked1)
        await jet.connect(user1).stake(amountStaked1)
        const currentTime = (await ethers.provider.getBlock("latest")).timestamp
        const timeDiff = currentTime - startTime
        await network.provider.send("evm_increaseTime", [4 * oneYear - timeDiff - 1])
        await network.provider.send("evm_mine")
        await jet.connect(user1).updateUserCalculation()
        const expectedReward = 
        ((parseInt(scheduleRewards[0]) - parseInt(scheduleRewards[1])) / 1e18) * (oneYear - timeDiff) / oneYear + 
        ((parseInt(scheduleRewards[1]) - parseInt(scheduleRewards[2])) / 1e18) + 
        ((parseInt(scheduleRewards[2]) - parseInt(scheduleRewards[3])) / 1e18) + 
        ((parseInt(scheduleRewards[3]) - parseInt(scheduleRewards[4])) / 1e18) + 
        parseInt(scheduleRewards[4]) / 1e18 +
        parseInt(ethers.utils.formatEther(amountStaked1))
        expect(parseInt(ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))).to.be.lessThanOrEqual(
            parseInt(expectedReward.toString())
        )
        expect(parseInt(ethers.utils.formatUnits(amountStaked1, 0))).to.be.eq(
            parseInt(ethers.utils.formatUnits(await jet.totalAuroraShares(), 0))
        )
    })
    it('should able to get schedule times per stream', async () => {
        const schedules = await jet.getStreamSchedule(0)
        expect(schedules[0][0]).to.be.eq(scheduleTimes[0])
    })
    it('should be able to get reward per share', async () => {
        expect(
            ethers.utils.formatEther(await jet.getRewardPerShare(0))
        ).to.be.eq("0.0")
    })
    it('should schedule from 0 to 4 years', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0], scheduleTimes[4])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0], scheduleTimes[4])
        const expectedScheduleReward = scheduleRewards[0]/1e18
        expect(Math.round(parseFloat(ethers.utils.formatUnits(total)))).to.be.eq(parseFloat(expectedScheduleReward.toString()))
        expect(Math.round(parseFloat(ethers.utils.formatUnits(rewardPerShareAurora)))).to.be.eq(parseFloat(expectedScheduleReward.toString()))
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(4)
    })
    it('should schedule from 1 to 2 years', async () => {
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[1], scheduleTimes[2])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[1], scheduleTimes[2])
        const expectedScheduledReward = parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))
        expect(Math.round(parseFloat(ethers.utils.formatUnits(total)))).to.be.eq(expectedScheduledReward)
        // expect(Math.round(parseFloat((scheduleCalculated.toNumber())))).to.be.eq(parseFloat(expectedScheduledReward.toString()))
        expect(Math.round(parseFloat(ethers.utils.formatUnits(rewardPerShareAurora)))).to.be.eq(parseFloat(expectedScheduledReward.toString()))
        expect(startIndex.toNumber()).to.be.eq(1)
        expect(endIndex.toNumber()).to.be.eq(2)
    })
    it('should schedule from 1 to 3', async () => {
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[1], scheduleTimes[3])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[1], scheduleTimes[3])
        const expectedScheduledReward = 
            (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))) + 
            (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3])))
        expect(Math.round(parseFloat(ethers.utils.formatUnits(total)))).to.be.eq(expectedScheduledReward)
        // expect(Math.round(parseFloat((scheduleCalculated.toNumber())))).to.be.eq(parseFloat(expectedScheduledReward.toString()))
        expect(Math.round(parseFloat(ethers.utils.formatUnits(rewardPerShareAurora)))).to.be.eq(parseFloat(expectedScheduledReward.toString()))
        expect(startIndex.toNumber()).to.be.eq(1)
        expect(endIndex.toNumber()).to.be.eq(3)
    })
    it('should schedule from 0 to 1', async () => {
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], scheduleTimes[1])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0], scheduleTimes[1])
        const expectedScheduledReward = parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))
        expect(Math.round(parseFloat(ethers.utils.formatUnits(total)))).to.be.eq(expectedScheduledReward)
        // expect(Math.round(parseFloat((scheduleCalculated.toNumber())))).to.be.eq(parseFloat(expectedScheduledReward.toString()))
        expect(Math.round(parseFloat(ethers.utils.formatUnits(rewardPerShareAurora)))).to.be.eq(parseFloat(expectedScheduledReward.toString()))
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(1)
    })
    it('should schedule from 0 to now (200 days)', async () => {
        const startTime = (await ethers.provider.getBlock("latest")).timestamp
        await network.provider.send("evm_increaseTime", [200 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const currentTime = (await ethers.provider.getBlock("latest")).timestamp + 19
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const timeDiff = currentTime - startTime
        const expectedScheduledReward = 
            (parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))) * (timeDiff) / oneYear
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.within(parseInt(expectedScheduledReward.toString()) - 100, parseInt(expectedScheduledReward.toString()) + 100)
        expect(parseInt(scheduleCalculated.toNumber())).to.be.within(parseInt(expectedScheduledReward.toString()) - 100, parseInt(expectedScheduledReward.toString()) + 100)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.within(parseInt(expectedScheduledReward.toString()) - 100, parseInt(expectedScheduledReward.toString()) + 100)
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(0)
    })
    it('should schedule from 0 to now (400 days)', async () => {
        const startTime = (await ethers.provider.getBlock("latest")).timestamp
        await network.provider.send("evm_increaseTime", [400 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const currentTime = (await ethers.provider.getBlock("latest")).timestamp + 19
        const timeDiff = currentTime - startTime
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const expectedScheduledReward1 = 
            (parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1])))
        const expectedScheduledReward2 = (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))) * (timeDiff - oneYear) / oneYear
        const expectedScheduledReward = parseInt(expectedScheduledReward1.toString()) + parseInt(expectedScheduledReward2.toString())
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.within(expectedScheduledReward - 50, expectedScheduledReward + 50)
        expect(scheduleCalculated.toNumber()).to.be.within(expectedScheduledReward - 50, expectedScheduledReward + 50)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.within(expectedScheduledReward - 50, expectedScheduledReward + 50)
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(1)
    })
    it('should schedule from 0 to now (750 days)', async () => {
        const startTime = (await ethers.provider.getBlock("latest")).timestamp
        await network.provider.send("evm_increaseTime", [750 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const currentTime = (await ethers.provider.getBlock("latest")).timestamp + 18.5
        const timeDiff = currentTime - startTime
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const expectedScheduledReward1 = 
            (parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))) + 
            (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2])))
        const expectedScheduledReward2 = (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3]))) * (timeDiff - 2 * oneYear) / oneYear
        const expectedScheduledReward = parseInt(expectedScheduledReward1.toString()) + parseInt(expectedScheduledReward2.toString())
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.within(expectedScheduledReward - 50, expectedScheduledReward + 50)
        expect(scheduleCalculated.toNumber()).to.be.within(expectedScheduledReward - 50, expectedScheduledReward + 50)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.within(expectedScheduledReward - 50, expectedScheduledReward + 50)
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(2)
    })
    it('should schedule from 200 to now (750 days)', async () => {
        const startTime = (await ethers.provider.getBlock("latest")).timestamp
        await network.provider.send("evm_increaseTime", [750 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const currentTime = (await ethers.provider.getBlock("latest")).timestamp
        const timeDiff = currentTime - startTime
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0] + 200 * oneDay, (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, startTime, currentTime)
        const expectedScheduledReward1 = (parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))) * (oneYear - 200 * oneDay) / oneYear
        const expectedScheduledReward2 = (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2])))
        const expectedScheduledReward3 = (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3]))) * (timeDiff - 2 * oneYear) / oneYear
        const expectedScheduledReward = parseInt(expectedScheduledReward1.toString()) + parseInt(expectedScheduledReward2.toString()) + parseInt(expectedScheduledReward3.toString())
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.greaterThanOrEqual(parseInt(expectedScheduledReward.toString()))
        expect(parseInt(scheduleCalculated.toNumber())).to.be.greaterThanOrEqual(parseInt(expectedScheduledReward.toString()))
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.greaterThanOrEqual(parseInt(expectedScheduledReward.toString()))
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(2)
    })
    it('should schedule from 200 to end (4 years)', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0] + 200 * oneDay, scheduleTimes[4])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0] + 200 * oneDay, scheduleTimes[4])
        const expectedScheduledReward1 = (parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))) * (oneYear - 200 * oneDay) / oneYear
        const expectedScheduledReward2 = (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))) + 
                (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3]))) +
                (parseInt(ethers.utils.formatEther(scheduleRewards[3])) - parseInt(ethers.utils.formatEther(scheduleRewards[4]))) + 
                parseInt(ethers.utils.formatEther(scheduleRewards[4]))
        const expectedScheduledReward = parseInt(expectedScheduledReward1.toString()) + parseInt(expectedScheduledReward2.toString())
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.eq(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(expectedScheduledReward)
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(4)
    })
    it('should schedule from 200 to end (3 years)', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0] + 200 * oneDay, scheduleTimes[3])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0] + 200 * oneDay, scheduleTimes[3])
        const expectedScheduledReward1 = (parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))) * (oneYear - 200 * oneDay) / oneYear
        const expectedScheduledReward2 = (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))) + 
            (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3])))
        const expectedScheduledReward = parseInt(expectedScheduledReward1.toString()) + parseInt(expectedScheduledReward2.toString())
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.eq(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(expectedScheduledReward)
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(3)
    })
    it('should schedule from 400 to end (3 years)', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0] + 400 * oneDay, scheduleTimes[3])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0] + 400 * oneDay, scheduleTimes[3])
        const expectedScheduledReward1 = (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))) * (2 * oneYear - 400 * oneDay) / oneYear +
            (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3])))
        const expectedScheduledReward = parseInt(expectedScheduledReward1.toString())
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.eq(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(expectedScheduledReward)
        expect(startIndex.toNumber()).to.be.eq(1)
        expect(endIndex.toNumber()).to.be.eq(3)
    })
    it('should schedule from 400 to end of (3rd year) + 2 day', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0] + 400 * oneDay, scheduleTimes[3] + 2 * oneDay)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0] + 400 * oneDay, scheduleTimes[3] + 2 * oneDay)
        const expectedScheduledReward1 = 
            (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))) * (2 * oneYear - 400 * oneDay) / oneYear +
            (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3]))) + 
            (parseInt(ethers.utils.formatEther(scheduleRewards[3])) - parseInt(ethers.utils.formatEther(scheduleRewards[4]))) * 2 * oneDay / oneYear
        const expectedScheduledReward = parseInt(expectedScheduledReward1.toString())
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.eq(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(expectedScheduledReward)
        expect(startIndex.toNumber()).to.be.eq(1)
        expect(endIndex.toNumber()).to.be.eq(3)
    })
    it('should stake on behalf of another user', async () => {
        const amount = ethers.utils.parseUnits("5", 18)
        await auroraToken.connect(auroraOwner).mint(auroraOwner.address, amount)
        await auroraToken.connect(auroraOwner).approve(jet.address, amount)
        await expect(jet.connect(user1).stakeOnBehalfOfAnotherUser(
            user1.address,
            amount
        )).to.be.reverted
        await jet.connect(auroraOwner).stakeOnBehalfOfAnotherUser(
            user1.address,
            amount
        )
        expect(amount).to.be.eq(
            await jet.getUserTotalDeposit(user1.address)
        )
    })
    it('should batch stake on bahalf of another users', async () => {
        const amount = ethers.utils.parseUnits("5", 18)
        const batchAmount = ethers.utils.parseUnits("10", 18)
        await auroraToken.connect(auroraOwner).mint(auroraOwner.address, batchAmount)
        await auroraToken.connect(auroraOwner).approve(jet.address, batchAmount)
        await expect(jet.connect(user1).stakeOnBehalfOfOtherUsers(
            [
                user1.address,
                user2.address
            ],
            [
                amount,
                amount
            ],
            batchAmount
        )).to.be.reverted
        await jet.connect(auroraOwner).stakeOnBehalfOfOtherUsers(
            [
                user1.address,
                user2.address
            ],
            [
                amount,
                amount
            ],
            batchAmount
        )
        expect(amount).to.be.eq(
            await jet.getUserTotalDeposit(user1.address)
        )
        expect(amount).to.be.eq(
            await jet.getUserTotalDeposit(user2.address)
        )
    })
    it('should get user shares', async () => {
        expect(await jet.getUserShares(user1.address)).to.be.eq(0)
    })
    it('should get release time', async () => {
        // stake 
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        // unstake
        await network.provider.send("evm_increaseTime", [1])
        await network.provider.send("evm_mine")
        await jet.connect(user1).unstake(amount)
        // get released time
        expect(parseInt(await jet.getReleaseTime(0, user1.address))).to.be.greaterThan(
            (await ethers.provider.getBlock("latest")).timestamp
        )
    })
    it('should withdraw rewards after release time', async () => {
         // stake 
         const amount = ethers.utils.parseUnits("1000", 18)
         const user1BalanceBefore = parseInt(await auroraToken.balanceOf(user1.address))
         await auroraToken.connect(user1).approve(jet.address, amount)
         await jet.connect(user1).stake(amount)
         // unstake
         await network.provider.send("evm_increaseTime", [1])
         await network.provider.send("evm_mine")
         await jet.connect(user1).unstake(amount)
 
         // withdraw
         await network.provider.send("evm_increaseTime", [tauPerStream + 1])
         await network.provider.send("evm_mine")
         const streamId = 0 // main aurora rewards
         await jet.connect(user1).withdraw(streamId)
         const user1BalanceAfter = parseInt(await auroraToken.balanceOf(user1.address))
         expect(user1BalanceAfter).to.eq(user1BalanceBefore)
    })
    it('should withdraw all rewards after release time', async () => {
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
        const Ids = [1, 2, 3]
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = scheduleRewards[0]
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime,
            startTime + oneYear,
            startTime + 2 * oneYear,
            startTime + 3 * oneYear,
            startTime + 4 * oneYear
        ]
        // propose stream 1
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // propose stream 2
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )

        // propose stream 3
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens & create streams
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        await jet.connect(user1).createStream(Ids[0], maxRewardProposalAmountForAStream)
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        await jet.connect(user1).createStream(Ids[1], maxRewardProposalAmountForAStream)
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        await jet.connect(user1).createStream(Ids[2], maxRewardProposalAmountForAStream)

        // stake
        const user2BalanceBefore = parseInt(await auroraToken.balanceOf(user2.address))
        await auroraToken.connect(user2).approve(jet.address, amount)
        await jet.connect(user2).stake(amount)
        await network.provider.send("evm_increaseTime", [101])
        await network.provider.send("evm_mine")

        // claim rewards
        await jet.connect(user2).batchMoveRewardsToPending([...Ids])
        expect(parseInt(await jet.getPending(Ids[0], user2.address))).to.be.greaterThan(0)

        // unstake
        await network.provider.send("evm_increaseTime", [1])
        await network.provider.send("evm_mine")
        await jet.connect(user2).unstake(amount)

        // withdraw batch and withdraw all
        await network.provider.send("evm_increaseTime", [tauPerStream + 1])
        await network.provider.send("evm_mine")
        await jet.connect(user2).batchWithdraw([0, 1])
        const user2BalanceAfter = parseInt(await auroraToken.balanceOf(user1.address))
        expect(user2BalanceAfter).to.be.eq(user2BalanceBefore)
        const withdrawnBalance = parseInt(await streamToken1.balanceOf(user2.address))
        expect(withdrawnBalance).to.be.greaterThan(0)
        await jet.connect(user2).withdrawAll()
        expect(parseInt(await streamToken1.balanceOf(user2.address))).to.be.greaterThan(withdrawnBalance)
    })
    it('should claim on behalf of another user', async() => {
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
        const Id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = scheduleRewards[0]
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime,
            startTime + oneYear,
            startTime + 2 * oneYear,
            startTime + 3 * oneYear,
            startTime + 4 * oneYear
        ]
        // propose stream 1
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens & create streams
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        await jet.connect(user1).createStream(Id, maxRewardProposalAmountForAStream)

        // stake
        await auroraToken.connect(user2).approve(jet.address, amount)
        await jet.connect(user2).stake(amount)
        await network.provider.send("evm_increaseTime", [101])
        await network.provider.send("evm_mine")

        // claim rewards on behald of another user
        await jet.connect(stakingAdmin).claimOnBehalfOfAnotherUser(user2.address, Id)
        expect(parseInt(await jet.getPending(Id, user2.address))).to.be.greaterThan(0)
    })
    it('should batch claim on behalf of other users', async() => {
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
        const Ids = [1, 2]
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = scheduleRewards[0]
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime,
            startTime + oneYear,
            startTime + 2 * oneYear,
            startTime + 3 * oneYear,
            startTime + 4 * oneYear
        ]
        // propose stream 1
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens & create streams
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        await jet.connect(user1).createStream(Ids[0], maxRewardProposalAmountForAStream)

         // propose stream 1
         await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
         await jet.connect(streamManager).proposeStream(
             user1.address,
             streamToken1.address,
             auroraProposalAmountForAStream,
             maxRewardProposalAmountForAStream,
             scheduleTimes,
             scheduleRewards,
             tauPerStream
         )
         // approve reward tokens & create streams
         await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
         await jet.connect(user1).createStream(Ids[1], maxRewardProposalAmountForAStream)

        // stake
        await auroraToken.connect(user2).approve(jet.address, amount)
        await jet.connect(user2).stake(amount)
        await network.provider.send("evm_increaseTime", [101])
        await network.provider.send("evm_mine")
        // stake
        await auroraToken.connect(user3).approve(jet.address, amount)
        await jet.connect(user3).stake(amount)
        await network.provider.send("evm_increaseTime", [101])
        await network.provider.send("evm_mine")

        // claim rewards on behald of another user
        await jet.connect(stakingAdmin).batchClaimOnBehalfOfOtherUsers(
            [
                user2.address,
                user3.address,
            ],
            Ids
        )
        expect(parseInt(await jet.getPending(Ids[0], user2.address))).to.be.greaterThan(0)
        expect(parseInt(await jet.getPending(Ids[0], user3.address))).to.be.greaterThan(0)
        expect(parseInt(await jet.getPending(Ids[1], user2.address))).to.be.greaterThan(0)
        expect(parseInt(await jet.getPending(Ids[1], user3.address))).to.be.greaterThan(0)
    })
    it('should get zero stream owner claimable amount if stream is inactive', async() => {
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
        const Ids = [1]
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = scheduleRewards[0]
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime,
            startTime + oneYear,
            startTime + 2 * oneYear,
            startTime + 3 * oneYear,
            startTime + 4 * oneYear
        ]
        // propose stream 1
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        expect(await jet.getStreamOwnerClaimableAmount(Ids[0])).to.be.eq(0)
    })
    it('should return aurora stream user shares if stream is zero', async () => {
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
        const Ids = [1]
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = scheduleRewards[0]
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime,
            startTime + oneYear,
            startTime + 2 * oneYear,
            startTime + 3 * oneYear,
            startTime + 4 * oneYear
        ]
        // propose stream 1
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // stake
        await auroraToken.connect(user2).approve(jet.address, amount)
        await jet.connect(user2).stake(amount)
        await network.provider.send("evm_increaseTime", [101])
        await network.provider.send("evm_mine")

        // 
        expect(await jet.getAmountOfShares(0, user2.address)).to.be.eq(amount)

    })
    it('should return total amount of staked aurora', async () => {
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
         // stake
         await auroraToken.connect(user2).approve(jet.address, amount)
         await jet.connect(user2).stake(amount)
         await network.provider.send("evm_increaseTime", [101])
         await network.provider.send("evm_mine")
         expect(
             parseInt(ethers.utils.formatEther(await jet.getTotalAmountOfStakedAurora()))
        ).to.be.greaterThan(parseInt(ethers.utils.formatEther(amount)))
    })
    it('should get zero reward amount before stream start and stream end', async () => {
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
        const Ids = [1]
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = scheduleRewards[0]
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + oneDay
        const scheduleTimes = [
            startTime,
            startTime + oneYear,
            startTime + 2 * oneYear,
            startTime + 3 * oneYear,
            startTime + 4 * oneYear
        ]
        // propose stream 1
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        expect(await jet.getRewardsAmount(Ids[0], (await ethers.provider.getBlock("latest")).timestamp)).to.be.eq(0)
        await network.provider.send("evm_increaseTime", [5 * oneYear])
        await network.provider.send("evm_mine")
        expect(await jet.getRewardsAmount(Ids[0], (await ethers.provider.getBlock("latest")).timestamp)).to.be.eq(0)
    })
    it('should claim zero reward if stream did not start', async() => {
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
        const Ids = [1]
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = scheduleRewards[0]
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + oneDay
        const scheduleTimes = [
            startTime,
            startTime + oneYear,
            startTime + 2 * oneYear,
            startTime + 3 * oneYear,
            startTime + 4 * oneYear
        ]
        // propose stream 1
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        await expect(jet.tempMoveRewardsToPending(user2.address, Ids[0]))
        .to.be.revertedWith("USER_DOES_NOT_HAVE_ACTUAL_STAKE")
    })
    it('should return if _before called twice whithin the same block', async() => {
        await jet.callBeforeTwice()
    })
    it('should unstake all', async () => {
         // stake
         const amount = ethers.utils.parseUnits("1000", 18)
         const user1BalanceBefore = parseInt(await auroraToken.balanceOf(user1.address))
         await auroraToken.connect(user1).approve(jet.address, amount)
         await jet.connect(user1).stake(amount)
         // unstake
         await network.provider.send("evm_increaseTime", [1])
         await network.provider.send("evm_mine")
         await jet.connect(user1).unstakeAll()

         // withdraw
         await network.provider.send("evm_increaseTime", [tauPerStream + 1])
         await network.provider.send("evm_mine")
         const streamId = 0 // main aurora rewards
         await jet.connect(user1).withdraw(streamId)
         const user1BalanceAfter = parseInt(await auroraToken.balanceOf(user1.address))
         expect(user1BalanceAfter).to.greaterThan(user1BalanceBefore)
    })
    it('should claim all rewards', async () => {
        // deploy stream
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // stake 
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        await network.provider.send("evm_increaseTime", [oneDay])
        await network.provider.send("evm_mine")
        await jet.connect(user1).moveAllRewardsToPending()
        expect(
            parseInt(await jet.getPending(id, user1.address))
        ).to.be.greaterThan(0)
    })
    it('should get reward per share for user', async () => {
        const id = 1
        expect(parseInt(await jet.getRewardPerShareForUser(id, user1.address))).to.be.eq(0)
         // deploy stream
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        expect(amount.mul(1024)).to.be.eq(
            await jet.getAmountOfShares(id, user1.address)
        )
    })
    it('should calculate weighted shares', async () => {
        const shares = 1000
        let timestamp = scheduleTimes[2]
        const minWeight = 256
        const maxWeight = 1024
        const oneMonth = 2629746
        const slopeStart = scheduleTimes[0] + oneMonth;
        const slopeEnd = slopeStart + 4 * oneYear;
        const expectedWeightedShares = shares * minWeight + ((shares * (maxWeight - minWeight) * (slopeEnd - timestamp)) / (slopeEnd - slopeStart))
        expect(
            parseInt(
                await jet.calculateWeightedShares(shares, timestamp)
            )
        ).to.be.lessThanOrEqual(expectedWeightedShares)
        timestamp = scheduleTimes[0]
        expect(
            parseInt(
                await jet.calculateWeightedShares(shares, timestamp)
            )
        ).to.be.eq(maxWeight * shares)
        timestamp = scheduleTimes[4] + oneMonth
        expect(
            parseInt(
                await jet.calculateWeightedShares(shares, timestamp)
            )
        ).to.be.eq(minWeight * shares)

    })
    it('should get reward per share for a user', async () => {
        const id = 1
        const user1RPSBefore = parseInt(await jet.getRewardPerShareForUser(id, user1.address))
        expect(user1RPSBefore).to.be.eq(0)
        expect(parseInt(await jet.getRewardPerShareForUser(id, user1.address))).to.be.eq(0)
        // deploy stream
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        await network.provider.send("evm_increaseTime", [oneDay])
        await network.provider.send("evm_mine")
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        const user1RPSAfter = parseInt(await jet.getRewardPerShareForUser(id, user1.address))
        expect(user1RPSAfter).to.be.greaterThan(user1RPSBefore)
    })
    it('should get claimable amount', async() => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // stake 
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        await network.provider.send("evm_increaseTime", [oneDay])
        await network.provider.send("evm_mine")
        // get stream claimable amount
        const userRPS = await jet.getRewardPerShareForUser(id, user1.address)
        const latestRPS = await jet.getLatestRewardPerShare(id)
        const userShares = await jet.getAmountOfShares(id, user1.address)
        const expectedClaimableAmount = (latestRPS.sub(userRPS)).mul(userShares).div("1" + "0".repeat(31))
        expect(await jet.getStreamClaimableAmount(id, user1.address)).to.be.eq(expectedClaimableAmount)
    })
    it('should restake the rest of aurora tokens', async () => {
        // deploy stream
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // stake 
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user5).approve(jet.address, amount)
        await jet.connect(user5).stake(amount)
        const userDepositBefore = parseInt(await jet.getUserTotalDeposit(user5.address))
        await network.provider.send("evm_increaseTime", [oneDay])
        await network.provider.send("evm_mine")
        const fiftyPercentOfShares = ethers.utils.parseUnits("500", 18)
        await jet.connect(user5).unstake(fiftyPercentOfShares)
        // get stream claimable amount
        const userRPS = parseInt(ethers.utils.formatEther(await jet.getRewardPerShareForUser(id, user5.address)))
        await network.provider.send("evm_increaseTime", [1000])
        await network.provider.send("evm_mine")
        const userDepositAfter = parseInt(await jet.getUserTotalDeposit(user5.address))
        expect(userDepositBefore).to.be.lessThan(userDepositAfter)
    })
    it('should return zero total aurora staked if touchedAt equals zero', async () => {
        expect(
            await jet.getTotalAmountOfStakedAurora()
        ).to.be.eq(0)
    })
    it('should release rewards from stream start', async () => {
        // release rewards from stream start if user staked before 
        // deploying a stream
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        await network.provider.send("evm_increaseTime", [30 * oneDay])
        await network.provider.send("evm_mine")
        // deploy stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        await network.provider.send("evm_increaseTime", [100])
        await network.provider.send("evm_mine")
        expect(
            parseInt(await jet.getLatestRewardPerShare(id)) / 1e31
        ).to.be.greaterThan(0)
    })
    it('should calculate stream claimable rewards from stream start', async () => {
        // User staked before stream was added so initialize shares with the weight when the stream was created.
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        await network.provider.send("evm_increaseTime", [30 * oneDay])
        await network.provider.send("evm_mine")
        // deploy stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        await network.provider.send("evm_increaseTime", [100])
        await network.provider.send("evm_mine")
       expect(
            parseInt(await jet.getStreamClaimableAmount(id, user1.address))
        ).to.be.greaterThan(0)
    })
    it('should claim rewards for a stream even if user staked before stream deployment', async () => {
        // stake
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        await network.provider.send("evm_increaseTime", [30 * oneDay])
        await network.provider.send("evm_mine")
        // deploy stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        await network.provider.send("evm_increaseTime", [30 * oneDay])
        await network.provider.send("evm_mine")
        await jet.connect(user1).moveRewardsToPending(id)
        const pending = ((scheduleRewards[0] - scheduleRewards[1])/ 1e18) * (30 * oneDay) / oneYear
        expect(parseInt(ethers.utils.formatEther(await jet.getPending(id, user1.address)))).to.be.lessThanOrEqual(
            parseInt(pending.toString())
        )
    })
    it('should be able to unstake and withdraw even if after the schedule ends', async () => {
        // stake 
        const amount = ethers.utils.parseUnits("1000", 18)
        const user1BalanceBefore = parseInt(await auroraToken.balanceOf(user1.address))
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)
        // unstake
        await network.provider.send("evm_increaseTime", [5 * oneYear])
        await network.provider.send("evm_mine")
        await jet.connect(user1).unstake(amount)
        // withdraw
        await network.provider.send("evm_increaseTime", [tauPerStream + 1])
        await network.provider.send("evm_mine")
        const streamId = 0 // main aurora rewards
        await jet.connect(user1).withdraw(streamId)
        const user1BalanceAfter = parseInt(await auroraToken.balanceOf(user1.address))
        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore)
    })
    it('should only admin update the treasury address', async () => {
        // deploy new treasury contract
        const Treasury = await ethers.getContractFactory("Treasury")
        const newTreasury = await upgrades.deployProxy(
            Treasury,
            [
                [
                    auroraToken.address,
                    streamToken1.address,
                    streamToken2.address
                ],
                0 // flags
            ]
        )
        await jet.connect(stakingAdmin).updateTreasury(newTreasury.address)
        expect(newTreasury.address).to.be.eq(await jet.treasury())
    })
    it('should admin remove stream', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        await jet.connect(streamManager).removeStream(id, user5.address)
        expect(await streamToken1.balanceOf(user5.address)).to.be.eq(maxRewardProposalAmountForAStream)
    })
    it('should admin cancel stream proposal after expiry date', async() => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // wait for the expiry date
        await network.provider.send("evm_increaseTime", [oneDay])
        await network.provider.send("evm_mine")
        // cancel stream proposal
        await jet.connect(streamManager).cancelStreamProposal(id)
        const stream = await jet.getStream(id)
        expect(stream.isProposed).to.be.eq(false)
    })
    it('admin can claim streams on behalf of another user', async() => {
        const Ids = [1, 2, 3]
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = scheduleRewards[0]
        // propose a stream
        const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        const scheduleTimes = [
            startTime,
            startTime + oneYear,
            startTime + 2 * oneYear,
            startTime + 3 * oneYear,
            startTime + 4 * oneYear
        ]
        // propose stream 1
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // propose stream 2
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )

        // propose stream 3
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens & create streams
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        await jet.connect(user1).createStream(Ids[0], maxRewardProposalAmountForAStream)
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        await jet.connect(user1).createStream(Ids[1], maxRewardProposalAmountForAStream)
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        await jet.connect(user1).createStream(Ids[2], maxRewardProposalAmountForAStream)

        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user2).approve(jet.address, amount)
        await jet.connect(user2).stake(amount)
        await network.provider.send("evm_increaseTime", [101])
        await network.provider.send("evm_mine")
        
        const pauser = auroraOwner
        await jet.connect(pauser).batchClaimOnBehalfOfAnotherUser(
            user2.address,
            [Ids[0], Ids[2]]
        )
        expect(parseInt(await jet.getPending(Ids[0], user2.address))).to.be.greaterThan(0)
        expect(parseInt(await jet.getPending(Ids[1], user2.address))).to.be.eq(0)
        expect(parseInt(await jet.getPending(Ids[2], user2.address))).to.be.greaterThan(0)
    })
    it('estimageGas staking with multiple streams', async () => {
        // deploy streams
        const streamCount = 20
        console.log("====================================================")
        console.log("Deploying", streamCount, "streams...")
        for (let id = 1; id <= streamCount; id++) {
            // approve aurora tokens to the stream proposal
            const auroraProposalAmountForAStream = ethers.utils.parseUnits("10", 18)
            const maxRewardProposalAmountForAStream = scheduleRewards[0]
            await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
            // propose a stream
            startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
            scheduleTimes = [
                startTime,
                startTime + oneYear,
                startTime + 2 * oneYear,
                startTime + 3 * oneYear,
                startTime + 4 * oneYear
            ]
            await jet.connect(streamManager).proposeStream(
                user1.address,
                streamToken1.address,
                auroraProposalAmountForAStream,
                maxRewardProposalAmountForAStream,
                scheduleTimes,
                scheduleRewards,
                tauPerStream
            )
            // approve reward tokens
            await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
            // create a stream
            await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        }
        await network.provider.send("evm_increaseTime", [101])
        await network.provider.send("evm_mine")
        const amount = ethers.utils.parseUnits("1000", 18)

        await auroraToken.connect(user1).approve(jet.address, amount)
        let tx = await jet.connect(user1).stake(amount)
        console.log("User1 stake 1st time (without _before):", (await tx.wait()).cumulativeGasUsed.toNumber(), "gas")
        await network.provider.send("evm_increaseTime", [1])
        await network.provider.send("evm_mine")
        await auroraToken.connect(user1).approve(jet.address, amount)
        // NOTE: Claiming rewards the 1st time is more expensive due to new storage allocation in _moveRewardsToPending.
        // This is also the case calling _before the 1st time.
        tx = await jet.connect(user1).stake(amount)
        console.log("User1 stake 2nd time (init _before + init rps):", (await tx.wait()).cumulativeGasUsed.toNumber(), "gas")
        await network.provider.send("evm_increaseTime", [1])
        await network.provider.send("evm_mine")
        await auroraToken.connect(user1).approve(jet.address, amount)
        tx = await jet.connect(user1).stake(amount)
        console.log("User1 stake 3rd time:", (await tx.wait()).cumulativeGasUsed.toNumber(), "gas")
        await network.provider.send("evm_increaseTime", [1])
        await network.provider.send("evm_mine")

        await auroraToken.connect(user2).approve(jet.address, amount)
        tx = await jet.connect(user2).stake(amount)
        console.log("User2 stake 1st time (init rps):", (await tx.wait()).cumulativeGasUsed.toNumber(), "gas")
        await network.provider.send("evm_increaseTime", [1])
        await network.provider.send("evm_mine")
        await auroraToken.connect(user2).approve(jet.address, amount)
        tx = await jet.connect(user2).stake(amount)
        console.log("User2 stake 2nd time:", (await tx.wait()).cumulativeGasUsed.toNumber(), "gas")
        await network.provider.send("evm_increaseTime", [1])
        await network.provider.send("evm_mine")
        await auroraToken.connect(user2).approve(jet.address, amount)
        tx = await jet.connect(user2).stake(amount)
        console.log("User2 stake 3rd time:", (await tx.wait()).cumulativeGasUsed.toNumber(), "gas")
    })
    it('estimageGas claiming all with multiple users', async () => {
        // deploy streams
        const streamCount = 4
        for (let id = 1; id <= streamCount; id++) {
            // approve aurora tokens to the stream proposal
            const auroraProposalAmountForAStream = ethers.utils.parseUnits("10", 18)
            const maxRewardProposalAmountForAStream = scheduleRewards[0]
            await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
            // propose a stream
            startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
            scheduleTimes = [
                startTime,
                startTime + oneYear,
                startTime + 2 * oneYear,
                startTime + 3 * oneYear,
                startTime + 4 * oneYear
            ]
            await jet.connect(streamManager).proposeStream(
                user1.address,
                streamToken1.address,
                auroraProposalAmountForAStream,
                maxRewardProposalAmountForAStream,
                scheduleTimes,
                scheduleRewards,
                tauPerStream
            )
            // approve reward tokens
            await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
            // create a stream
            await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        }
        await network.provider.send("evm_increaseTime", [101])
        await network.provider.send("evm_mine")
        const amount = ethers.utils.parseUnits("1", 18)

        const usersCount = 5
        const users = [...Array(usersCount).keys()].map(i => `0x000000000000000000000000000000000000000${i+1}`)
        const amounts = users.map(() => amount)
        const batchAmount = amount.mul(usersCount)

        console.log(`Airdrop to ${usersCount} users with ${streamCount} streams.`)

        // init _before()
        await auroraToken.connect(user1).approve(jet.address, amount)
        await jet.connect(user1).stake(amount)

        // airdrop stake 1st time, set user rps 1st time, initialize shares 1st time
        await auroraToken.connect(auroraOwner).mint(auroraOwner.address, batchAmount)
        await auroraToken.connect(auroraOwner).approve(jet.address, batchAmount)
        let tx = await jet.connect(auroraOwner).stakeOnBehalfOfOtherUsers(users, amounts, batchAmount)
        console.log("Airdrop stake 1st time:", (await tx.wait()).cumulativeGasUsed.toNumber(), "gas.")
        await network.provider.send("evm_increaseTime", [10])
        await network.provider.send("evm_mine")

        // airdrop claim before stake
        tx = await jet.connect(auroraOwner).claimAllOnBehalfOfOtherUsers(users)
        console.log("Claim all on behalf:", (await tx.wait()).cumulativeGasUsed.toNumber(), "gas.")
        await network.provider.send("evm_increaseTime", [10])
        await network.provider.send("evm_mine")

        // airdrop add stake
        await auroraToken.connect(auroraOwner).mint(auroraOwner.address, batchAmount)
        await auroraToken.connect(auroraOwner).approve(jet.address, batchAmount)
        tx = await jet.connect(auroraOwner).stakeOnBehalfOfOtherUsers(users, amounts, batchAmount)
        console.log("Airdrop add stake:", (await tx.wait()).cumulativeGasUsed.toNumber(), "gas.")
        await network.provider.send("evm_increaseTime", [10])
        await network.provider.send("evm_mine")

        tx = await jet.connect(auroraOwner).claimAllOnBehalfOfAnotherUser(users[0])
        console.log("Claim all on behalf of single user:", (await tx.wait()).cumulativeGasUsed.toNumber(), "gas.")

        // Conclusion: claim all for 5 users (airdrop batch) is possible with up to 4 streams.
        // It will be better for the airdrop script to use multiple signing keys for processing requests in parallel.
    })
});
