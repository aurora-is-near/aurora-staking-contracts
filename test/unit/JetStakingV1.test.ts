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
        await jet.connect(deployer).grantRole(airdropRole, user1.address)
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
        // transfer 20% of the total supply to the treasury contract
        const twentyPercentOfAuroraTotalSupply = ethers.utils.parseUnits("200000000", 18)
        // const onePercentOfTokenSupply = ethers.utils.parseUnits("1000000", 18)
        await auroraToken.connect(auroraOwner).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)
        const balanceOfAurorOwner = await auroraToken.balanceOf(auroraOwner.address)
        await auroraToken.connect(auroraOwner).transfer(user5.address, balanceOfAurorOwner)
        // transfer ownership of the treasury to the jet staking contract
        const defaultAdminRole = await jet.DEFAULT_ADMIN_ROLE()
        await treasury.connect(auroraOwner).grantRole(defaultAdminRole, jet.address)
    })

    it('should test multiple stakers reward calculation', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = 0
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        const amount1 = ethers.utils.parseUnits("1", 0)
        const amount2 = ethers.utils.parseUnits("1002", 18)
        const totalDeposit = amount1.add(amount2)
        await auroraToken.connect(user1).approve(jet.address, amount1)
        await auroraToken.connect(user2).approve(jet.address, amount2)
        await network.provider.send("evm_setAutomine", [false])
        // Users stake in the same block to compare rewards with the same stream weight
        await jet.connect(user1).stake(amount1)
        await jet.connect(user2).stake(amount2)
        await network.provider.send("evm_mine")
        await network.provider.send("evm_setAutomine", [true])
        // create a stream
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        await network.provider.send("evm_setAutomine", [false])

        // After 1 year (1st year rewards)
        await jet.connect(user1).moveRewardsToPending(id)
        await jet.connect(user2).moveRewardsToPending(id)
        await network.provider.send("evm_mine", [startTime + oneYear])
        // Check rewards are distributed proportionally
        const firstYearRewards = scheduleRewards[0].sub(scheduleRewards[1])
        const user1Pending1 = await jet.getPending(id, user1.address)
        const user2Pending1 = await jet.getPending(id, user2.address)
        expect(user1Pending1).to.equal(firstYearRewards.mul(amount1).div(totalDeposit))
        expect(user2Pending1).to.equal(firstYearRewards.mul(amount2).div(totalDeposit))

        // After 1.5 years (1st chedule rewards + half of 2nd schedule rewards)
        await jet.connect(user1).moveRewardsToPending(id)
        await jet.connect(user2).moveRewardsToPending(id)
        await network.provider.send("evm_mine", [startTime + oneYear + oneYear / 2])
        // Check rewards are distributed proportionally
        const secondYearRewards = scheduleRewards[1].sub(scheduleRewards[2])
        const user1Pending2 = await jet.getPending(id, user1.address)
        const user2Pending2 = await jet.getPending(id, user2.address)
        expect(user1Pending2).to.equal(
            user1Pending1.add(secondYearRewards.div(2).mul(amount1).div(totalDeposit))
        )
        expect(user2Pending2).to.equal(
            firstYearRewards.mul(amount2).div(totalDeposit)
            .add(secondYearRewards.div(2).mul(amount2).div(totalDeposit))
        )

        // After 5 years (all rewards distributed after 4 years)
        await jet.connect(user1).moveRewardsToPending(id)
        await jet.connect(user2).moveRewardsToPending(id)
        await network.provider.send("evm_mine", [startTime + oneYear * 5])
        const user1Pending3 = await jet.getPending(id, user1.address)
        const user2Pending3 = await jet.getPending(id, user2.address)
        await network.provider.send("evm_setAutomine", [true])
        // Dust difference due to rounding ?
        // `(reward * (schedule.time[startIndex + 1] - start)) / (schedule.time[startIndex + 1] - schedule.time[startIndex])`
        // or `(getRewardsAmount(streamId, touchedAt) * RPS_MULTIPLIER) / totalStreamShares;`
        // Fewer rewards distributed than allocated so this should not prevent everyone from withdrawing.
        expect(user1Pending3).to.equal(
            scheduleRewards[0].mul(amount1).div(totalDeposit)
        )
        expect(user2Pending3).to.equal(
            scheduleRewards[0].mul(amount2).div(totalDeposit)
            .sub(2)
        )
        expect(user1Pending3.add(user2Pending3)).to.equal(scheduleRewards[0].sub(3))
    })
    it('should test multiple stakers compound reward during 6 months', async () => {
        const id = 0
        const amount1 = ethers.utils.parseUnits("1", 0)
        const amount2 = ethers.utils.parseUnits("102", 18)
        const totalDeposit = amount1.add(amount2)
        await auroraToken.connect(user1).approve(jet.address, amount1)
        await auroraToken.connect(user2).approve(jet.address, amount2)
        await network.provider.send("evm_setAutomine", [false])
        // Users stake in the same block to compare rewards with the same stream weight
        await jet.connect(user1).stake(amount1)
        await jet.connect(user2).stake(amount2)
        await network.provider.send("evm_mine", [startTime + oneYear / 2])

        // After 6 months
        await jet.connect(user1).unstakeAll()
        await jet.connect(user2).unstakeAll()
        await network.provider.send("evm_mine", [startTime + oneYear])
        const firstYearRewards = scheduleRewards[0].sub(scheduleRewards[1])
        const user1Pending = await jet.getPending(id, user1.address)
        const user2Pending = await jet.getPending(id, user2.address)
        await network.provider.send("evm_setAutomine", [true])
        const totalStakeValue = totalDeposit.add(firstYearRewards.div(2))
        expect(user1Pending).to.equal(
            totalStakeValue.mul(amount1).div(totalDeposit)
        )
        expect(user2Pending).to.equal(
            totalStakeValue.mul(amount2).div(totalDeposit)
            // When user1 unstakeAll, unstake amount is rounded down.
            // `stakeValue = totalAmountOfStakedAurora * users[msg.sender].auroraShares) / totalAuroraShares`
            // becomes larger for the next user to unstake (because totalAmountOfStakedAurora reduced less compared to totalAuroraShares)
            .add(1)
        )
        expect(user1Pending.add(user2Pending)).to.equal(firstYearRewards.div(2).add(amount1).add(amount2))
    })
    it('should test multiple stakers compound reward during 1 year', async () => {
        const id = 0
        const amount1 = ethers.utils.parseUnits("11", 15)
        const amount2 = ethers.utils.parseUnits("2", 18)
        const amount3 = ethers.utils.parseUnits("333", 18)
        const totalDeposit1 = amount1.add(amount2)
        await auroraToken.connect(user1).approve(jet.address, amount1)
        await auroraToken.connect(user2).approve(jet.address, amount2)
        await network.provider.send("evm_setAutomine", [false])
        // Users stake in the same block to compare rewards with the same stream weight
        await jet.connect(user1).stake(amount1)
        await jet.connect(user2).stake(amount2)
        await network.provider.send("evm_mine", [startTime + oneYear / 2])

        // After 6 months
        await auroraToken.connect(user3).approve(jet.address, amount3)
        await jet.connect(user3).stake(amount3)
        await network.provider.send("evm_mine", [startTime + oneYear])

        const totalShares = await jet.totalAuroraShares()

        // After 1 year (1/2 year with 2 stakers + 1/2 year with 3 stakers)
        await jet.connect(user1).unstakeAll()
        await jet.connect(user2).unstakeAll()
        await jet.connect(user3).unstakeAll()
        await network.provider.send("evm_mine", [startTime + oneYear + oneYear / 2])
        const firstYearRewards = scheduleRewards[0].sub(scheduleRewards[1])
        const secondYearRewards = scheduleRewards[1].sub(scheduleRewards[2])
        const user1Pending = await jet.getPending(id, user1.address)
        const user2Pending = await jet.getPending(id, user2.address)
        const user3Pending = await jet.getPending(id, user3.address)
        await network.provider.send("evm_setAutomine", [true])
        const totalStakeValue1 = totalDeposit1.add(firstYearRewards.div(2))
        const totalDeposit2 = totalStakeValue1.add(amount3)
        const totalStakeValue2 = totalDeposit2.add(secondYearRewards.div(2))
        const user1StakeValue = totalStakeValue1.mul(amount1).div(totalDeposit1)
        const user2StakeValue = totalStakeValue1.mul(amount2).div(totalDeposit1)
        const oneShareValue = totalStakeValue2.div(totalShares)
        // When user2 stakes after user1, no AURORA rewards were issued so shares are not rounded up.
        // When user3 stakes after user2, user3 shares are rounded up which dilutes user1 and user2. ???
        const expectedUser1Pending = totalStakeValue2.mul(user1StakeValue).div(totalDeposit2)
        expect(user1Pending).to.be.lte(expectedUser1Pending)
        expect(user1Pending).to.be.gt(expectedUser1Pending.sub(oneShareValue))
        const expectedUser2Pending = totalStakeValue2.mul(user2StakeValue).div(totalDeposit2)
        expect(user2Pending).to.be.lte(expectedUser2Pending)
        expect(user2Pending).to.be.gt(expectedUser2Pending.sub(oneShareValue))
        const expectedUser3Pending = totalStakeValue2.mul(amount3).div(totalDeposit2)
        expect(user3Pending).to.be.lte(expectedUser3Pending.add(oneShareValue))
        expect(user3Pending).to.be.gt(expectedUser3Pending)
        expect(user1Pending.add(user2Pending).add(user3Pending)).to.equal(
            firstYearRewards.div(2).add(secondYearRewards.div(2)).add(amount1).add(amount2).add(amount3)
        )
    })

    it("should return treasury account", async () => {
        expect(await jet.treasury()).to.eq(treasury.address)
    })

    it('should allow admin to propose new stream', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
        await expect(jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            minRewardProposalAmountForAStream,
            scheduleTimes.slice(0,1),
            scheduleRewards.slice(0,1),
            tauPerStream
        )).to.be.revertedWith("SCHEDULE_TOO_SHORT")
        const tx = await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
    it('should refund stream owner when stream created with less rewards', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = 2
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, minRewardProposalAmountForAStream)
        // create a stream and refund half to stream manager without rounding error.
        await expect(jet.connect(user1).createStream(id, minRewardProposalAmountForAStream))
            .to.emit(auroraToken, "Transfer").withArgs(jet.address, streamManager.address, 1)
    })
    it('should create stream and refund staking admin if deposit reward is less than the upper amount', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
        await network.provider.send("evm_increaseTime", [200 * oneDay]) // increase time for 200 days
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
        const minRewardProposalAmountForAStream = scheduleRewards[0].div(2)
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
            minRewardProposalAmountForAStream,
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
            minRewardProposalAmountForAStream,
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = scheduleRewards[0].div(2)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = scheduleRewards[0].div(2)
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
            minRewardProposalAmountForAStream,
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = scheduleRewards[0].div(2)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = scheduleRewards[0].div(2)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = scheduleRewards[0].div(2)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = scheduleRewards[0].div(2)
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        await expect(jet.tempMoveRewardsToPending(user2.address, Ids[0]))
        .to.be.revertedWith("INACTIVE_OR_PROPOSED_STREAM")

        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(Ids[0], maxRewardProposalAmountForAStream)
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            minRewardProposalAmountForAStream,
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
        await expect(jet.connect(stakingAdmin).updateTreasury(newTreasury.address))
        .to.be.revertedWith("REQUIRE_PAUSE")
        await jet.connect(stakingAdmin).adminPause(1)
        await jet.connect(stakingAdmin).updateTreasury(newTreasury.address)
        await expect(jet.connect(stakingAdmin).updateTreasury(newTreasury.address))
        .to.be.revertedWith("SAME_ADDRESS")
        expect(newTreasury.address).to.be.eq(await jet.treasury())
    })
    it('should admin remove stream', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
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
        expect(stream.status).to.be.eq(0)
    })
    it('admin can claim streams on behalf of another user', async() => {
        const Ids = [1, 2, 3]
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = scheduleRewards[0]
        const minRewardProposalAmountForAStream = scheduleRewards[0].div(2)
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
            minRewardProposalAmountForAStream,
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
            minRewardProposalAmountForAStream,
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
            minRewardProposalAmountForAStream,
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
            const minRewardProposalAmountForAStream = scheduleRewards[0].div(2)
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
                minRewardProposalAmountForAStream,
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
            const minRewardProposalAmountForAStream = scheduleRewards[0].div(2)
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
                minRewardProposalAmountForAStream,
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

    it('should not return zero stake value when a user unstakeAll', async () => {
        // init the staking contract and the streams
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // user4 stakes (1**-17) Aurora
        const amountStaked = ethers.utils.parseUnits("1", 1)
        console.log(`user 1 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user1BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
        await auroraToken.connect(user4).approve(jet.address, amountStaked)
        await jet.connect(user4).stake(amountStaked)
        // user 5 stakes (1**-17) Aurora same amount but after 1 second.
        console.log(`user 2 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user2BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
        await auroraToken.connect(user5).approve(jet.address, amountStaked)
        await jet.connect(user5).stake(amountStaked)
        // user 4 unstakeAll 
        console.log(`user 1 shares: ${ethers.utils.formatEther(await jet.getUserShares(user4.address))}`)
        console.log(`user 2 shares: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
        // user 5 trying to unstakeAll
        console.log(`user 1 unstakeAll`)
        await jet.connect(user4).unstakeAll()
        console.log(`user 2 unstakeAll`)
        await jet.connect(user5).unstakeAll()
         // withdraw
         await network.provider.send("evm_increaseTime", [tauPerStream + 1])
         await network.provider.send("evm_mine")
         const streamId = 0 // main aurora rewards
         await jet.connect(user4).withdraw(streamId)
         await jet.connect(user5).withdraw(streamId)
         const user1BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
         const user2BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
         console.log(`user 1 balance before ${user1BalanceBefore} and after ${user1BalanceAfter}`)
         console.log(`user 2 balance before ${user2BalanceBefore} and after ${user2BalanceAfter}`)
         const user1Rewards = parseFloat(user1BalanceAfter) - parseFloat(user1BalanceBefore)
         const user2Rewards = parseFloat(user2BalanceAfter) - parseFloat(user2BalanceBefore)
         console.log(`user 1 reward: ${user1Rewards.toFixed(4)}`)
         console.log(`user 2 reward: ${user2Rewards.toFixed(4)}`)
         console.log(`total user shares ${await jet.totalAuroraShares()}`)
        // user 5 trying to unstakeAll again
        console.log(`user 2 shares after unstaking all: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
        await expect(jet.connect(user5).unstakeAll()).to.be.revertedWith(
            'ZERO_TOTAL_AURORA_SHARES'
        )
    })

    it('should user 1 stakes before user 2 but both stake very small but the same amount and unstake at the same time', async () => {
        // init the staking contract and the streams
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // user4 stakes (1**-17) Aurora
        const amountStaked = ethers.utils.parseUnits("1", 1)
        console.log(`user 1 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user1BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
        await auroraToken.connect(user4).approve(jet.address, amountStaked)
        await jet.connect(user4).stake(amountStaked)
        await jet.connect(user4).updateUserCalculation()
        console.log(
            'total amount of AURORA staked',
            ethers.utils.formatEther(
                await jet.totalAmountOfStakedAurora()
            )
        )
        // user 5 stakes (1**-17) Aurora same amount but after 1 second.
        console.log(`user 2 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user2BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
        await auroraToken.connect(user5).approve(jet.address, amountStaked)
        await jet.connect(user5).stake(amountStaked)
        console.log(
            'total amount of AURORA staked',
            ethers.utils.formatEther(
                await jet.totalAmountOfStakedAurora()
            )
        )
        // user 4 unstakeAll 
        console.log(`user 1 shares: ${ethers.utils.formatEther(await jet.getUserShares(user4.address))}`)
        console.log(`user 2 shares: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
        // user 5 trying to unstakeAll
        console.log(`user 1 & 2 unstakeAll`)
        await jet.connect(user4).unstakeAllOnBehalfOfOthers([user4.address, user5.address])
         // withdraw
         await network.provider.send("evm_increaseTime", [tauPerStream + 1])
         await network.provider.send("evm_mine")
         const streamId = 0 // main aurora rewards
         await jet.connect(user4).withdraw(streamId)
         await jet.connect(user5).withdraw(streamId)
         const user1BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
         const user2BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
         console.log(`user 1 balance before ${user1BalanceBefore} and after ${user1BalanceAfter}`)
         const user1Rewards = parseFloat(user1BalanceAfter) - parseFloat(user1BalanceBefore)
         console.log(`user 2 balance before ${user2BalanceBefore} and after ${user2BalanceAfter}`)
         const user2Rewards = parseFloat(user2BalanceAfter) - parseFloat(user2BalanceBefore)
         console.log(`user 1 reward: ${user1Rewards.toFixed(4)}`)
         console.log(`user 2 reward: ${user2Rewards.toFixed(4)}`)
         expect(user1Rewards).to.be.gt(user2Rewards)
         console.log(`total user shares ${await jet.totalAuroraShares()}`)
        // user 5 trying to unstakeAll again
        console.log(`user 2 shares after unstaking all: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
    })
    it('should both users get the same reward if they stake and unstake the same amount at the same time', async() => {
        // init the staking contract and the streams
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // user4 stakes (1**-17) Aurora
        const totalAmount = ethers.utils.parseUnits("2", 0)
        const amountStaked = ethers.utils.parseUnits("1", 0)
        console.log(`user 1 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user1BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
        await auroraToken.connect(user1).approve(jet.address, totalAmount)
        await jet.connect(user1).stakeOnBehalfOfOtherUsers(
            [
                user4.address,
                user5.address
            ],
            [
                amountStaked,
                amountStaked
            ],
            totalAmount
        )
        // user 5 stakes (1**-17) Aurora same amount but after 1 second.
        console.log(`user 2 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user2BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
        // user 4 unstakeAll 
        console.log(`user 1 shares: ${ethers.utils.formatEther(await jet.getUserShares(user4.address))}`)
        console.log(`user 2 shares: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
        // user 5 trying to unstakeAll
        console.log(`user 1 & 2 unstakeAll`)
        await jet.connect(user4).unstakeAllOnBehalfOfOthers([user4.address, user5.address])
         // withdraw
         await network.provider.send("evm_increaseTime", [tauPerStream + 1])
         await network.provider.send("evm_mine")
         const streamId = 0 // main aurora rewards
         await jet.connect(user4).withdraw(streamId)
         await jet.connect(user5).withdraw(streamId)
         const user1BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
         const user2BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
         console.log(`user 1 balance before ${user1BalanceBefore} and after ${user1BalanceAfter}`)
         const user1Rewards = parseFloat(user1BalanceAfter) - parseFloat(user1BalanceBefore)
         console.log(`user 2 balance before ${user2BalanceBefore} and after ${user2BalanceAfter}`)
         const user2Rewards = parseFloat(user2BalanceAfter) - parseFloat(user2BalanceBefore)
         console.log(`user 1 reward: ${user1Rewards.toFixed(4)}`)
         console.log(`user 2 reward: ${user2Rewards.toFixed(4)}`)
         expect(user1Rewards.toFixed(4)).to.be.eq(user2Rewards.toFixed(4))
         console.log(`total user shares ${await jet.totalAuroraShares()}`)
        // user 5 trying to unstakeAll again
        console.log(`user 2 shares after unstaking all: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
    })

    it('should user 2 should get double rewards if he has a double stake', async() => {
        // init the staking contract and the streams
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // user4 stakes (1**-18) Aurora
        // user4 stakes (2**-18) Aurora
        const totalAmount = ethers.utils.parseUnits("3", 0)
        const amountStakedUser1 = ethers.utils.parseUnits("1", 0)
        const amountStakedUser2 = ethers.utils.parseUnits("2", 0)
        console.log(`user 1 stakes: ${ethers.utils.formatEther(amountStakedUser1)} AURORA`)
        const user1BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
        await auroraToken.connect(user1).approve(jet.address, totalAmount)
        await jet.connect(user1).stakeOnBehalfOfOtherUsers(
            [
                user4.address,
                user5.address
            ],
            [
                amountStakedUser1,
                amountStakedUser2
            ],
            totalAmount
        )
        // user 5 stakes (1**-17) Aurora same amount but after 1 second.
        console.log(`user 2 stakes: ${ethers.utils.formatEther(amountStakedUser2)} AURORA`)
        const user2BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
        // user 4 unstakeAll 
        console.log(`user 1 shares: ${ethers.utils.formatEther(await jet.getUserShares(user4.address))}`)
        console.log(`user 2 shares: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
        // user 5 trying to unstakeAll
        console.log(`user 1 & 2 unstakeAll`)
        await jet.connect(user4).unstakeAllOnBehalfOfOthers([user4.address, user5.address])
         // withdraw
         await network.provider.send("evm_increaseTime", [tauPerStream + 1])
         await network.provider.send("evm_mine")
         const streamId = 0 // main aurora rewards
         await jet.connect(user4).withdraw(streamId)
         await jet.connect(user5).withdraw(streamId)
         const user1BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
         const user2BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
         console.log(`user 1 balance before ${user1BalanceBefore} and after ${user1BalanceAfter}`)
         console.log(`user 2 balance before ${user2BalanceBefore} and after ${user2BalanceAfter}`)
         const user1Rewards = parseFloat(user1BalanceAfter) - parseFloat(user1BalanceBefore)
         const user2Rewards = parseFloat(user2BalanceAfter) - parseFloat(user2BalanceBefore)
         console.log(`user 1 reward: ${user1Rewards.toFixed(4)}`)
         console.log(`user 2 reward: ${user2Rewards.toFixed(4)}`)
        //  expect(user1Rewards.toFixed(4)).to.be.lt(user2Rewards.toFixed(4))
         console.log(`total user shares ${await jet.totalAuroraShares()}`)
        // user 5 trying to unstakeAll again
        console.log(`user 2 shares after unstaking all: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
    })
    // test small amounts for issue number 1

    it('should return the right share calculations', async () => {
        // init the staking contract and the streams
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 10
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // user4 stakes (1**-18) Aurora
        const amountStaked = ethers.utils.parseUnits("1", 1)
        console.log(`user 1 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user1BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
        await auroraToken.connect(user4).approve(jet.address, amountStaked)
        await jet.connect(user4).stake(amountStaked)
        console.log('User 1 shares: ',
            ethers.utils.formatEther(
                await jet.getUserShares(user4.address)
            )
        )
        // user 5 stakes (1**-18) Aurora same amount but after 1 second.
        console.log(`user 2 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user2BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
        await auroraToken.connect(user5).approve(jet.address, amountStaked)
        await jet.connect(user5).stake(amountStaked)
        console.log('User 2 shares: ',
            ethers.utils.formatEther(
                await jet.getUserShares(user5.address)
            )
        )
        // user 4 unstakeAll 
        // user 5 trying to unstakeAll
        console.log(`user 1 unstakeAll`)
        await jet.connect(user4).unstakeAll()
        console.log(
            'total amount of AURORA staked',
            ethers.utils.formatEther(
                await jet.totalAmountOfStakedAurora()
            )
        )
        console.log(
            'total Aurora shares',
            ethers.utils.formatEther(
                await jet.totalAuroraShares()
            )
        )
        console.log(`user 2 unstakeAll`)
        await jet.connect(user5).unstakeAll()
         // withdraw
         await network.provider.send("evm_increaseTime", [tauPerStream + 1])
         await network.provider.send("evm_mine")
         const streamId = 0 // main aurora rewards
         await jet.connect(user4).withdraw(streamId)
         await jet.connect(user5).withdraw(streamId)
         const user1BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
         const user2BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
         const user1Rewards = parseFloat(user1BalanceAfter) - parseFloat(user1BalanceBefore)
         const user2Rewards = parseFloat(user2BalanceAfter) - parseFloat(user2BalanceBefore)
         console.log(`user 1 reward: ${user1Rewards.toFixed(4)}`)
         console.log(`user 2 reward: ${user2Rewards.toFixed(4)}`)
         console.log(`user 1 balance before ${user1BalanceBefore} and after ${user1BalanceAfter}`)
         console.log(`user 2 balance before ${user2BalanceBefore} and after ${user2BalanceAfter}`)
         console.log(`total user shares ${await jet.totalAuroraShares()}`)
        // user 5 trying to unstakeAll again
        console.log(`user 1 shares after unstaking all: ${ethers.utils.formatEther(await jet.getUserShares(user4.address))}`)
        await expect(jet.connect(user4).unstakeAll()).to.be.revertedWith(
            'ZERO_TOTAL_AURORA_SHARES'
        )
    })

    it('should return the right share calculations 2', async () => {
        // init the staking contract and the streams
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 10
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // user4 stakes (1**-18) Aurora
        const amountStaked = ethers.utils.parseUnits("1", 18)
        console.log(`user 1 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user1BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
        await auroraToken.connect(user4).approve(jet.address, amountStaked)
        await jet.connect(user4).stake(amountStaked)
        console.log('User 1 shares: ',
            ethers.utils.formatEther(
                await jet.getUserShares(user4.address)
            )
        )
        // user 5 stakes (1**-18) Aurora same amount but after 1 second.
        console.log(`user 2 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user2BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
        await auroraToken.connect(user5).approve(jet.address, amountStaked)
        await jet.connect(user5).stake(amountStaked)
        console.log('User 2 shares: ',
            ethers.utils.formatEther(
                await jet.getUserShares(user5.address)
            )
        )
        // user 4 unstakeAll 
        // user 5 trying to unstakeAll
        console.log(`user 1 unstakeAll`)
        await jet.connect(user4).unstakeAll()
        console.log(
            'total amount of AURORA staked',
            ethers.utils.formatEther(
                await jet.totalAmountOfStakedAurora()
            )
        )
        console.log(
            'total Aurora shares',
            ethers.utils.formatEther(
                await jet.totalAuroraShares()
            )
        )
        console.log(`user 2 unstakeAll`)
        await jet.connect(user5).unstakeAll()
         // withdraw
         await network.provider.send("evm_increaseTime", [tauPerStream + 1])
         await network.provider.send("evm_mine")
         const streamId = 0 // main aurora rewards
         await jet.connect(user4).withdraw(streamId)
         await jet.connect(user5).withdraw(streamId)
         const user1BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
         const user2BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
         console.log(`user 1 balance before ${user1BalanceBefore} and after ${user1BalanceAfter}`)
         console.log(`user 2 balance before ${user2BalanceBefore} and after ${user2BalanceAfter}`)
         const user1Rewards = parseFloat(user1BalanceAfter) - parseFloat(user1BalanceBefore)
         const user2Rewards = parseFloat(user2BalanceAfter) - parseFloat(user2BalanceBefore)
         console.log(`user 1 reward: ${user1Rewards.toFixed(4)}`)
         console.log(`user 2 reward: ${user2Rewards.toFixed(4)}`)
         console.log(`total user shares ${await jet.totalAuroraShares()}`)
        // user 5 trying to unstakeAll again
        console.log(`user 1 shares after unstaking all: ${ethers.utils.formatEther(await jet.getUserShares(user4.address))}`)
        await expect(jet.connect(user4).unstakeAll()).to.be.revertedWith(
            'ZERO_TOTAL_AURORA_SHARES'
        )
    })

    it('should user 0 stake, then two new users stake and unstake the same amount at the same time', async() => {
        // init the staking contract and the streams
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        // user4 stakes (1**-17) Aurora
        const totalAmount = ethers.utils.parseUnits("2", 18)
        const amountStaked = ethers.utils.parseUnits("1", 18)
        await auroraToken.connect(user3).approve(jet.address, amountStaked)
        await jet.connect(user3).stake(amountStaked)
        console.log(`user 1 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user1BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
        await auroraToken.connect(user1).approve(jet.address, totalAmount)
        await jet.connect(user1).stakeOnBehalfOfOtherUsers(
            [
                user4.address,
                user5.address
            ],
            [
                amountStaked,
                amountStaked
            ],
            totalAmount
        )
        // user 5 stakes (1**-17) Aurora same amount but after 1 second.
        console.log(`user 2 stakes: ${ethers.utils.formatEther(amountStaked)} AURORA`)
        const user2BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
        // user 4 unstakeAll 
        console.log(`user 1 shares: ${ethers.utils.formatEther(await jet.getUserShares(user4.address))}`)
        console.log(`user 2 shares: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
        // user 5 trying to unstakeAll
        console.log(`user 1 & 2 unstakeAll`)
        await jet.connect(user4).unstakeAllOnBehalfOfOthers([user4.address, user5.address])
         // withdraw
         await network.provider.send("evm_increaseTime", [tauPerStream + 1])
         await network.provider.send("evm_mine")
         const streamId = 0 // main aurora rewards
         await jet.connect(user4).withdraw(streamId)
         await jet.connect(user5).withdraw(streamId)
         const user1BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
         const user2BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
         console.log(`user 1 balance before ${user1BalanceBefore} and after ${user1BalanceAfter}`)
         const user1Rewards = parseFloat(user1BalanceAfter) - parseFloat(user1BalanceBefore)
         console.log(`user 2 balance before ${user2BalanceBefore} and after ${user2BalanceAfter}`)
         const user2Rewards = parseFloat(user2BalanceAfter) - parseFloat(user2BalanceBefore)
         console.log(`user 1 reward: ${user1Rewards.toFixed(4)}`)
         console.log(`user 2 reward: ${user2Rewards.toFixed(4)}`)
         expect(user1Rewards.toFixed(4)).to.be.eq(user2Rewards.toFixed(4))
         console.log(`total user shares ${await jet.totalAuroraShares()}`)
        // user 5 trying to unstakeAll again
        console.log(`user 2 shares after unstaking all: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
    })
    
    it('should not have a possible race condition', async () => {
        // init the staking contract and the streams
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
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
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        let user1BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
        let user2BalanceBefore = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
        let user1StakeAmount = ethers.utils.parseUnits("1", 0) // 1 aurora
        let user2StakeAmount = ethers.utils.parseUnits("1", 18) // 1 ** 18 aurora
        let totalUsersStake = user1StakeAmount.add(user2StakeAmount);
        await auroraToken.connect(user1).approve(jet.address, totalUsersStake)
        await jet.connect(user1).stakeOnBehalfOfOtherUsers(
            [
                user4.address,
                user5.address
            ],
            [
                user1StakeAmount,
                user2StakeAmount
            ],
            totalUsersStake
        )
        // user 5 stakes (1**-17) Aurora same amount but after 1 second.
        console.log(`user 1 stakes: ${ethers.utils.formatEther(user1StakeAmount)} AURORA`)
        console.log(`user 2 stakes: ${ethers.utils.formatEther(user2StakeAmount)} AURORA`)
        // user 4 unstakeAll 
        console.log(`user 1 shares: ${ethers.utils.formatEther(await jet.getUserShares(user4.address))}`)
        console.log(`user 2 shares: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
        // user 5 trying to unstakeAll
        console.log(`user 1 & 2 unstakeAll`)
        await jet.connect(user4).unstakeAllOnBehalfOfOthers([user4.address, user5.address])
        // withdraw
        await network.provider.send("evm_increaseTime", [tauPerStream + 1])
        await network.provider.send("evm_mine")
        const streamId = 0 // main aurora rewards
        await jet.connect(user4).withdraw(streamId)
        await jet.connect(user5).withdraw(streamId)
        let user1BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
        let user2BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
        console.log(`user 1 balance before ${user1BalanceBefore} and after ${user1BalanceAfter}`)
        let user1Rewards = parseFloat(user1BalanceAfter) - parseFloat(user1BalanceBefore)
        console.log(`user 2 balance before ${user2BalanceBefore} and after ${user2BalanceAfter}`)
        let user2Rewards = parseFloat(user2BalanceAfter) - parseFloat(user2BalanceBefore)
        console.log(`user 1 reward: ${user1Rewards.toFixed(18)}`)
        console.log(`user 2 reward: ${user2Rewards.toFixed(18)}`)
        console.log('Reversing the order of the staking and unstaking')
        user1BalanceBefore = user1BalanceAfter
        user2BalanceBefore = user2BalanceAfter
        await auroraToken.connect(user1).approve(jet.address, totalUsersStake)
        await jet.connect(user1).stakeOnBehalfOfOtherUsers(
            [
                user5.address,
                user4.address
            ],
            [
                user2StakeAmount,
                user1StakeAmount
            ],
            totalUsersStake
        )
        // user 5 stakes (1**-17) Aurora same amount but after 1 second.
        console.log(`user 1 stakes: ${ethers.utils.formatEther(user1StakeAmount)} AURORA`)
        console.log(`user 2 stakes: ${ethers.utils.formatEther(user2StakeAmount)} AURORA`)
        // user 4 unstakeAll 
        console.log(`user 1 shares: ${ethers.utils.formatEther(await jet.getUserShares(user4.address))}`)
        console.log(`user 2 shares: ${ethers.utils.formatEther(await jet.getUserShares(user5.address))}`)
        // user 5 trying to unstakeAll
        console.log(`user 1 & 2 unstakeAll`)
        await jet.connect(user4).unstakeAllOnBehalfOfOthers([user4.address, user5.address])
         // withdraw
        await network.provider.send("evm_increaseTime", [tauPerStream + 1])
        await network.provider.send("evm_mine")
        await jet.connect(user4).withdraw(streamId)
        await jet.connect(user5).withdraw(streamId)
        user1BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user4.address))
        user2BalanceAfter = ethers.utils.formatEther(await auroraToken.balanceOf(user5.address))
        console.log(`user 1 balance before ${user1BalanceBefore} and after ${user1BalanceAfter}`)
        user1Rewards = parseFloat(user1BalanceAfter) - parseFloat(user1BalanceBefore)
        console.log(`user 2 balance before ${user2BalanceBefore} and after ${user2BalanceAfter}`)
        user2Rewards = parseFloat(user2BalanceAfter) - parseFloat(user2BalanceBefore)
        console.log(`user 1 reward: ${user1Rewards.toFixed(19)}`)
        console.log(`user 2 reward: ${user2Rewards.toFixed(19)}`)

    })
});
