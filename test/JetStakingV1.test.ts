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
    let treasury: any
    let jet: any
    let name: string
    let symbol: string
    let oneYear: number
    let tauPerStream: number
    let scheduleTimes: any
    let scheduleRewards: any
    let oneDay: any

    before(async () => {
        // deploys all the contracts
        [auroraOwner, stakingAdmin, user1, user2, user3, user4] = await ethers.getSigners()
        const supply = ethers.utils.parseUnits("1000000000", 18)
        oneDay = 86400
        const Token = await ethers.getContractFactory("Token")
        auroraToken = await Token.connect(auroraOwner).deploy(supply, "AuroraToken", "AURORA")
        // random example for other reward token contracts
        streamToken1 = await Token.connect(user1).deploy(supply, "StreamToken1", "ST1")
        streamToken2 = await Token.connect(user2).deploy(supply, "StreamToken2", "ST2")

        const Treasury = await ethers.getContractFactory("Treasury")
        treasury = await upgrades.deployProxy(
            Treasury, 
            [
                [auroraOwner.address],
                [
                    auroraToken.address,
                    streamToken1.address,
                    streamToken2.address
                ]
            ]
        )

        name = "Jet Staking V1" 
        symbol = "VOTE"
        const flags = 0
        oneYear = 31556926
        tauPerStream = 10

        let startTime = (await ethers.provider.getBlock("latest")).timestamp
        const JetStakingV1 = await ethers.getContractFactory('JetStakingTesting')
        scheduleTimes = [
            startTime, 
            startTime + oneYear, 
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        scheduleRewards = [
            10000,
            5000,
            2500, 
            1250, 
            625
        ]
        jet = await upgrades.deployProxy(
            JetStakingV1,
            [
                auroraToken.address, 
                name,
                symbol,
                scheduleTimes,
                scheduleRewards,
                tauPerStream,
                stakingAdmin.address,
                flags,
                treasury.address
            ]
        )
    })

    beforeEach(async () => {        
        await deployments.fixture()
        // fund users wallet
        await auroraToken.connect(auroraOwner).transfer(user1.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user2.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user3.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user4.address, ethers.utils.parseUnits("10000", 18))
        // transfer 20% of the total supply to the treasury contract
        const twentyPercentOfAuroraTotalSupply = ethers.utils.parseUnits("200000000", 18)
        const onePercentOfTokenSupply = ethers.utils.parseUnits("1000000", 18) 
        await auroraToken.connect(auroraOwner).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)
        // transfer ownership of the treasury to the jet staking contract
        await treasury.connect(auroraOwner).transferOwnership(jet.address)
        await treasury.connect(auroraOwner).approveTokensTo(
            [
                auroraToken.address,
                streamToken1.address,
                streamToken1.address
            ],
            [
                ethers.utils.parseUnits("100000", 18),
                ethers.utils.parseUnits("100000", 18),
                ethers.utils.parseUnits("100000", 18)
            ],
            treasury.address
        )
    })

    it("should return treasury account", async () => {
        expect(await jet.treasury()).to.eq(treasury.address)
    })

    it("should return jet staking name", async () => {
        expect(await jet.name()).to.eq(name)
    })

    it("should return let staking symbol", async () => {
        expect(await jet.symbol()).to.eq(symbol)
    })

    it('should allow admin to deploy new stream', async () => {
        const weight = 10
        const tx = await jet.connect(stakingAdmin).deployStream(
            streamToken1.address,
            weight,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        const {stream, index, } = await getEventLogs(tx.hash, constants.eventsABI.streamActivated, 0)
        expect(stream).to.be.eq(streamToken1.address)
        expect(index).to.be.eq(await jet.streamToIndex(stream))
    })

    it('should stake aurora tokens', async () => {
        await jet.connect(stakingAdmin).deployStream(
            streamToken1.address,
            10,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        const amountStaked = ethers.utils.parseUnits("10", 18)
        await auroraToken.connect(user1).approve(jet.address, amountStaked)
        const tx = await jet.connect(user1).stake(amountStaked)
        const {amount, } = await getEventLogs(tx.hash, constants.eventsABI.staked, 0)
        expect(amount).to.be.eq(amountStaked)
    })

    it('should allow user to move rewards to pending release', async () => {
        await jet.connect(stakingAdmin).deployStream(
            streamToken1.address,
            10,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        const amountStaked = ethers.utils.parseUnits("10", 18)
        await auroraToken.connect(user1).approve(jet.address, amountStaked)
        await jet.connect(user1).stake(amountStaked)
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const tx = await jet.moveRewardsToPending(0)
        const {amount, } = await getEventLogs(tx.hash, constants.eventsABI.pending, 0)
        expect(amount).to.be.eq(0)
    })

    it('should allow user to unstake tokens', async () => {
        await jet.connect(stakingAdmin).deployStream(
            streamToken1.address,
            10,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        const amountStaked = ethers.utils.parseUnits("10", 18)
        await auroraToken.connect(user1).approve(jet.address, amountStaked)
        await jet.connect(user1).stake(amountStaked)
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        await jet.connect(user1).unstake(ethers.utils.parseUnits("5", 18))
    })

    
    it('should allow user to withdraw tokens', async () => {
        await jet.connect(stakingAdmin).deployStream(
            streamToken1.address,
            10,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        const user1BalanceBefore = await auroraToken.balanceOf(user1.address)
        const amountStaked = ethers.utils.parseUnits("13", 18)
        await auroraToken.connect(user1).approve(jet.address, amountStaked)
        await jet.connect(user1).stake(amountStaked)
        await auroraToken.connect(user2).approve(jet.address, amountStaked)
        await jet.connect(user2).stake(amountStaked)
        const stakingPeriod = 112 * oneDay
        await network.provider.send("evm_increaseTime", [stakingPeriod]) // increase time for 20 days
        await network.provider.send("evm_mine")
        await auroraToken.connect(user2).approve(jet.address, amountStaked)
        await jet.connect(user2).stake(amountStaked)
        // console.log(
        //     'Total staked Aurora',
        //     ethers.utils.formatEther(await jet.totalAmountOfStakedAurora())
        // )
        // console.log(
        //     'reward per share',
        //     (await jet.getRewardPerShare(0)).toNumber()
        // )
        const rewardPerShare = (await jet.getRewardPerShare(0)).toNumber()
        // console.log('User shares: ', ethers.utils.formatEther(await jet.getAmountOfShares(user1.address, 0)))
        const userShares = parseInt(ethers.utils.formatEther(await jet.getAmountOfShares(user1.address, 0)))
        const expectedReward = parseInt(ethers.utils.formatEther(amountStaked)) + rewardPerShare * userShares
        await jet.connect(user1).unstake(amountStaked)
        const pendingRelease = await jet.getPending(user1.address, 0)
        // console.log(
        //     'Pending release tokens before withdrawal: ', 
        //     ethers.utils.formatEther(pendingRelease)
        // )
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        
        const tx = await jet.connect(user1).withdraw(0)
        const {amount, } = await getEventLogs(tx.hash, constants.eventsABI.released, 1)
        // console.log('Withdraw Amount', ethers.utils.formatEther(amount))
        // console.log(
        //     'Pending release tokens after withdrawal: ',
        //     ethers.utils.formatEther(await jet.getPending(user1.address, 0))
        // )
        expect(expectedReward).to.be.eq(parseInt(ethers.utils.formatEther(amount)))
        expect(pendingRelease).to.be.eq(amount)
        const user1BalanceAfter = await auroraToken.balanceOf(user1.address)
        // console.log('User balance after withdrawl', ethers.utils.formatEther(user1BalanceAfter))
        expect(user1BalanceBefore).to.be.lt(user1BalanceAfter)
    })

    it('should able to get schedule times per stream', async () => {
        const schedules = await jet.getSchedule(0)
        // console.log(schedules[0][0].toNumber(), schedules[0][1].toNumber(), scheduleTimes[0] + 400 * oneDay)
        expect(schedules[0][0]).to.be.eq(scheduleTimes[0])
    })
    it('should be able to get reward per share', async () => {
        expect(
            ethers.utils.formatEther(await jet.getRewardPerShare(0))
        ).to.be.eq("0.0")
    })

    it('should schedule from 0 to 4 years', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0], scheduleTimes[4])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0], scheduleTimes[4])
        // console.log(
        //     'RPS:',
        //     ethers.utils.formatUnits(rewardPerShareAurora)
        // )
        // console.log(
        //     'Total staked Aurora Tokens',
        //     ethers.utils.formatUnits(total)
        // )

        // console.log('schedule calculated over 4 years: ', scheduleCalculated.toNumber())
        // console.log(
        //     'StartIndex: ',
        //     startIndex.toNumber(),
        //     'End Index: ', 
        //     endIndex.toNumber()
        // )
        expect(ethers.utils.formatUnits(total)).to.be.eq("10000.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(10000)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("10000.0")
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(4)
    })

    it('should schedule from 1 to 2 years', async () => {
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[1], scheduleTimes[2])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[1], scheduleTimes[2])
        expect(ethers.utils.formatUnits(total)).to.be.eq("2500.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(2500)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("2500.0")
        expect(startIndex.toNumber()).to.be.eq(1)
        expect(endIndex.toNumber()).to.be.eq(2)
    })

    it('should schedule from 1 to 3', async () => {
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[1], scheduleTimes[3])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[1], scheduleTimes[3])
        expect(ethers.utils.formatUnits(total)).to.be.eq("3750.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(3750)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("3750.0")
        expect(startIndex.toNumber()).to.be.eq(1)
        expect(endIndex.toNumber()).to.be.eq(3)
    })

    it('should schedule from 0 to 1', async () => {
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], scheduleTimes[1])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0], scheduleTimes[1])
        expect(ethers.utils.formatUnits(total)).to.be.eq("5000.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(5000)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("5000.0")
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(1)
    })

    it('should schedule from 0 to now (200 days)', async () => {
        await network.provider.send("evm_increaseTime", [200 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        expect(ethers.utils.formatUnits(total)).to.be.eq("2737.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(2737)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("2737.0")
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(0)
    })

    it('should schedule from 0 to now (400 days)', async () => {
        await network.provider.send("evm_increaseTime", [400 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        expect(ethers.utils.formatUnits(total)).to.be.eq("5237.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(5237)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("5237.0")
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(1)
    })

    it('should schedule from 0 to now (750 days)', async () => {
        await network.provider.send("evm_increaseTime", [750 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        expect(ethers.utils.formatUnits(total)).to.be.eq("7566.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(7566)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("7566.0")
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(2)
    })
    it('should schedule from 200 to now (750 days)', async () => {
        const twoHunderedDays = (await ethers.provider.getBlock("latest")).timestamp + 200 * oneDay
        await network.provider.send("evm_increaseTime", [750 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(twoHunderedDays, (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(twoHunderedDays, (await ethers.provider.getBlock("latest")).timestamp)
        expect(ethers.utils.formatUnits(total)).to.be.eq("4828.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(4828)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("4828.0")
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(2)
    })

    it('should schedule from 200 to end (4 years)', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0] + 200 * oneDay, scheduleTimes[4])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0] + 200 * oneDay, scheduleTimes[4])
        expect(ethers.utils.formatUnits(total)).to.be.eq("6637.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(6637)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("6637.0")
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(4)
    })

    it('should schedule from 200 to end (3 years)', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0] + 200 * oneDay, scheduleTimes[3])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0] + 200 * oneDay, scheduleTimes[3])
        expect(ethers.utils.formatUnits(total)).to.be.eq("6012.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(6012)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("6012.0")
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(3)
    })

    it('should schedule from 400 to end (3 years)', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0] + 400 * oneDay, scheduleTimes[3])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0] + 400 * oneDay, scheduleTimes[3])
        expect(ethers.utils.formatUnits(total)).to.be.eq("3512.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(3512)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("3512.0")
        expect(startIndex.toNumber()).to.be.eq(1)
        expect(endIndex.toNumber()).to.be.eq(3)
    })

    it('should schedule from 400 to end of (3rd year) + 1 day', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0] + 400 * oneDay, scheduleTimes[3] + 2 * oneDay)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0] + 400 * oneDay, scheduleTimes[3] + 2 * oneDay)
        expect(ethers.utils.formatUnits(total)).to.be.eq("3515.000000000000000001")
        expect(scheduleCalculated.toNumber()).to.be.eq(3515)
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq("3515.0")
        expect(startIndex.toNumber()).to.be.eq(1)
        expect(endIndex.toNumber()).to.be.eq(3)
    })
});