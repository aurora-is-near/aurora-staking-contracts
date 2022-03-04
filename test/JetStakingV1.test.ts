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
        [auroraOwner, stakingAdmin, user1, user2, user3, user4, user5] = await ethers.getSigners()
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
            ethers.utils.parseUnits("200000000", 18),// 10000
            ethers.utils.parseUnits("100000000", 18), // 5000 
            ethers.utils.parseUnits("50000000", 18), // 2500
            ethers.utils.parseUnits("25000000", 18), // 1250
            ethers.utils.parseUnits("12500000", 18), // 625 
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
                flags,
                treasury.address
            ]
        )
        await jet.transferOwnership(stakingAdmin.address)
    })

    beforeEach(async () => {        
        await deployments.fixture()
        // fund users wallet
        await auroraToken.connect(auroraOwner).transfer(user1.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user2.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user3.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user4.address, ethers.utils.parseUnits("10000", 18))
        // console.log(balanceOfAurorOwner)
        // transfer 20% of the total supply to the treasury contract
        const twentyPercentOfAuroraTotalSupply = ethers.utils.parseUnits("200000000", 18)
        // const onePercentOfTokenSupply = ethers.utils.parseUnits("1000000", 18) 
        await auroraToken.connect(auroraOwner).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)
        const balanceOfAurorOwner = await auroraToken.balanceOf(auroraOwner.address)
        await auroraToken.connect(auroraOwner).transfer(user5.address, balanceOfAurorOwner)
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

    // it('should allow user to move rewards to pending release', async () => {
    //     await jet.connect(stakingAdmin).deployStream(
    //         streamToken1.address,
    //         10,
    //         scheduleTimes,
    //         scheduleRewards,
    //         tauPerStream
    //     )
    //     const amountStaked = ethers.utils.parseUnits("10", 18)
    //     await auroraToken.connect(user1).approve(jet.address, amountStaked)
    //     await jet.connect(user1).stake(amountStaked)
    //     await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
    //     await network.provider.send("evm_mine")
    //     const tx = await jet.moveRewardsToPending(0)
    //     const {amount, } = await getEventLogs(tx.hash, constants.eventsABI.pending, 0)
    //     expect(amount).to.be.eq(0)
    // })

    it('should allow user to unstake tokens', async () => {
        await jet.connect(stakingAdmin).deployStream(
            streamToken1.address,
            10,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        const amountStaked = ethers.utils.parseUnits("10", 18)
        
        console.log('------------ user 1 stakes 13 aurora tokens -------------')
        await auroraToken.connect(user1).approve(jet.address, ethers.utils.parseUnits("13", 18))
        await jet.connect(user1).stake(ethers.utils.parseUnits("13", 18))
        await jet.connect(user1).updateUserCalculation()
        await jet.connect(user2).updateUserCalculation()
        await jet.connect(user3).updateUserCalculation()
        console.log(
            'Calculated shares (User 1): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
            'Calculated shares (User 2): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
            'Calculated shares (User 3): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
            'Reward Per Share',
            ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        )
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('Total Shares: ', ethers.utils.formatUnits(await jet.totalShares(0), 9))
        console.log('------------ user 2 stakes 10 aurora tokens -------------')
        await network.provider.send("evm_increaseTime", [1]) // increase time for 20 days
        await network.provider.send("evm_mine")
        console.log('waiting for ', 1, ' seconds ......')
        console.log('user 2 stakes 10 Aurora tokens')
        await auroraToken.connect(user2).approve(jet.address, amountStaked)
        await jet.connect(user2).stake(amountStaked)
        console.log('waiting for ', 20 * oneDay, ' seconds ......')
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        await jet.connect(user1).updateUserCalculation()
        await jet.connect(user2).updateUserCalculation()
        await jet.connect(user3).updateUserCalculation()
        console.log(
            'Calculated shares (User 1): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
            'Calculated shares (User 2): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
            'Calculated shares (User 3): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
            'Reward Per Share',
            ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        )
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('Total Shares: ', ethers.utils.formatUnits(await jet.totalShares(0), 9))
        console.log('------------ user 1 unstake 13 aurora tokens -------------')
        console.log('waiting for ', 20 * oneDay, ' seconds ......')
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        console.log('Total deposit for User1: ', ethers.utils.formatEther(await jet.getUserTotalDeposit(user1.address)))
        await jet.connect(user1).updateUserCalculation()
        console.log('Total User 1 Reward: ', ethers.utils.formatEther(await jet.connect(user1).getTotalUserReward()))
        await jet.connect(user1).unstake(ethers.utils.parseUnits("13", 18))
        console.log(
            'Unstaked amount including rewards is (pending): ',
            ethers.utils.formatEther(await jet.getPending(user1.address, 0))
        )
        await jet.connect(user1).updateUserCalculation()
        await jet.connect(user2).updateUserCalculation()
        await jet.connect(user3).updateUserCalculation()
        console.log(
            'Calculated shares (User 1): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
            'Calculated shares (User 2): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
            'Calculated shares (User 3): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
            'Reward Per Share',
            ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        )
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('Total Shares: ', ethers.utils.formatUnits(await jet.totalShares(0), 9))
        console.log('------------ user 1 stakes 10 aurora tokens -------------')
        console.log('waiting for ', 20 * oneDay, ' seconds ......')
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        await auroraToken.connect(user1).approve(jet.address, amountStaked)
        await jet.connect(user1).stake(amountStaked)
        await jet.connect(user1).updateUserCalculation()
        await jet.connect(user2).updateUserCalculation()
        await jet.connect(user3).updateUserCalculation()
        console.log(
            'Calculated shares (User 1): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
            'Calculated shares (User 2): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
            'Calculated shares (User 3): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
            'Reward Per Share',
            ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        )
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('Total Shares: ', ethers.utils.formatUnits(await jet.totalShares(0), 9))
        console.log('------------ user 2 unstake 2 aurora tokens -------------')
        console.log('waiting for ', 20 * oneDay, ' seconds ......')
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        
        await jet.connect(user2).unstake(ethers.utils.parseUnits("2", 18))
        await jet.connect(user1).updateUserCalculation()
        await jet.connect(user2).updateUserCalculation()
        await jet.connect(user3).updateUserCalculation()
        console.log(
            'Calculated shares (User 1): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
            'Calculated shares (User 2): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
            'Calculated shares (User 3): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
            'Reward Per Share',
            ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        )
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('Total Shares: ', ethers.utils.formatUnits(await jet.totalShares(0), 9))
        console.log('------------ user 3 stakes 10 aurora tokens -------------')
        await auroraToken.connect(user3).approve(jet.address, amountStaked)
        await jet.connect(user3).stake(amountStaked)
        await network.provider.send("evm_increaseTime", [366 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        console.log('waiting for ', 300 * oneDay , ' seconds ......')

        await jet.connect(user1).updateUserCalculation()
        await jet.connect(user2).updateUserCalculation()
        await jet.connect(user3).updateUserCalculation()
        console.log(
            'Calculated shares (User 1): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
            'Calculated shares (User 2): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
            'Calculated shares (User 3): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
            'Reward Per Share',
            ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        )
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('Total Shares: ', ethers.utils.formatUnits(await jet.totalShares(0), 9))
        console.log('------------ user 3 unstakes 10 aurora tokens -------------')
        await jet.connect(user3).unstake(amountStaked)
        console.log(
            'user3 total deposit',
            ethers.utils.formatEther(await jet.getUserTotalDeposit(user3.address)),
            'Unstaked amount including rewards is (pending): ',
            ethers.utils.formatEther(await jet.getPending(user3.address, 0))
        )
        await jet.connect(user1).updateUserCalculation()
        await jet.connect(user2).updateUserCalculation()
        await jet.connect(user3).updateUserCalculation()
        console.log(
            'Calculated shares (User 1): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
            'Calculated shares (User 2): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
            'Calculated shares (User 3): ',
            ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
            'Reward Per Share',
            ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        )
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
        await network.provider.send("evm_increaseTime", [stakingPeriod])
        await network.provider.send("evm_mine")
        await auroraToken.connect(user2).approve(jet.address, amountStaked)
        await jet.connect(user2).stake(amountStaked)
        await auroraToken.connect(user3).approve(jet.address, amountStaked)
        await jet.connect(user3).stake(amountStaked)
        // console.log(
        //     'Total staked Aurora',
        //     ethers.utils.formatEther(await jet.totalAmountOfStakedAurora())
        // )
        // console.log(
        //     'reward per share',
        //     ethers.utils.formatEther(await jet.getRewardPerShare(0))
        // )
        // console.log(
        //     'Total Shares',
        //     (await jet.totalShares(0)).toNumber()
        // )
        const rewardPerShare = ethers.utils.formatEther(await jet.getRewardPerShare(0))
        // console.log(parseFloat(rewardPerShare))
        const userShares = ethers.utils.formatEther(await jet.getAmountOfShares(user1.address, 0))
        // console.log(
        //     'Reward to claim for User 1: ', 
        //     ethers.utils.formatEther(await jet.calculateReward(user1.address, 0))
        // )

        // console.log(
        //     'Reward to claim for User 2: ', 
        //     ethers.utils.formatEther(await jet.calculateReward(user2.address, 0))
        // )

        // console.log(
        //     'Reward to claim for User 3: ', 
        //     ethers.utils.formatEther(await jet.calculateReward(user3.address, 0))
        // )
        await jet.connect(user1).updateUserCalculation()
        const totalAmountOfStakedAurora = ethers.utils.formatEther(await jet.totalAmountOfStakedAurora())
        const totalShares = ethers.utils.formatEther(await jet.totalShares(0))
        const expectedReward = (parseFloat(totalAmountOfStakedAurora) / parseFloat(totalShares))  * parseFloat(userShares) + 2 // 2 is the diff reward till calling unstake
        await jet.connect(user1).unstake(amountStaked)
        const pendingRelease = await jet.getPending(user1.address, 0)
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const tx = await jet.connect(user1).withdraw(0)
        const {amount, } = await getEventLogs(tx.hash, constants.eventsABI.released, 1)
        // console.log(parseInt(ethers.utils.formatEther(amount)))
        // console.log(expectedReward)
        expect(parseInt(expectedReward.toString())).to.be.eq(parseInt(ethers.utils.formatEther(amount)))
        expect(pendingRelease).to.be.eq(amount)
        const user1BalanceAfter = await auroraToken.balanceOf(user1.address)
        expect(user1BalanceBefore).to.be.lt(user1BalanceAfter)
    })

    it('should able to get schedule times per stream', async () => {
        const schedules = await jet.getSchedule(0)
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
        expect(ethers.utils.formatUnits(total)).to.be.eq(ethers.utils.formatEther(scheduleRewards[0]))
        expect(scheduleCalculated.toNumber()).to.be.eq(parseInt(ethers.utils.formatEther(scheduleRewards[0])))
        expect(ethers.utils.formatUnits(rewardPerShareAurora)).to.be.eq(ethers.utils.formatEther(scheduleRewards[0]))
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(4)
    })

    it('should schedule from 1 to 2 years', async () => {
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[1], scheduleTimes[2])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[1], scheduleTimes[2])
        const expectedScheduledReward = parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.eq(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(expectedScheduledReward)
        expect(startIndex.toNumber()).to.be.eq(1)
        expect(endIndex.toNumber()).to.be.eq(2)
    })

    it('should schedule from 1 to 3', async () => {
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[1], scheduleTimes[3])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[1], scheduleTimes[3])
        const expectedScheduledReward = 
            (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))) + 
            (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3])))
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.eq(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(expectedScheduledReward)
        expect(startIndex.toNumber()).to.be.eq(1)
        expect(endIndex.toNumber()).to.be.eq(3)
    })

    it('should schedule from 0 to 1', async () => {
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], scheduleTimes[1])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0], scheduleTimes[1])
        const expectedScheduledReward = parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.eq(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(expectedScheduledReward)
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(1)
    })

    it('should schedule from 0 to now (200 days)', async () => {
        await network.provider.send("evm_increaseTime", [200 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        // TODO: solve the precision issue with solidity vs js
        const expectedScheduledReward = 
            (parseInt(ethers.utils.formatEther(scheduleRewards[startIndex])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))) * ( 200 * oneDay) / oneYear + 60
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(parseInt(expectedScheduledReward.toString()))
        expect(parseInt(scheduleCalculated.toNumber())).to.be.eq(parseInt(expectedScheduledReward.toString()))
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(parseInt(expectedScheduledReward.toString()))
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(0)
    })

    it('should schedule from 0 to now (400 days)', async () => {
        await network.provider.send("evm_increaseTime", [400 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const expectedScheduledReward1 = 
            (parseInt(ethers.utils.formatEther(scheduleRewards[startIndex])) - parseInt(ethers.utils.formatEther(scheduleRewards[1])))
        const expectedScheduledReward2 = (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))) * (400 * oneDay - oneYear) / oneYear + 30
        const expectedScheduledReward = parseInt(expectedScheduledReward1.toString()) + parseInt(expectedScheduledReward2.toString())
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.eq(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(expectedScheduledReward)
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(1)
    })

    it('should schedule from 0 to now (750 days)', async () => {
        await network.provider.send("evm_increaseTime", [750 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const expectedScheduledReward1 = 
            (parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))) + 
            (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2])))
        const expectedScheduledReward2 = (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3]))) * (750 * oneDay - 2 * oneYear) / oneYear + 15
        const expectedScheduledReward = parseInt(expectedScheduledReward1.toString()) + parseInt(expectedScheduledReward2.toString())
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.eq(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(expectedScheduledReward)
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(2)
    })
    it('should schedule from 200 to now (750 days)', async () => {
        const twoHunderedDays = (await ethers.provider.getBlock("latest")).timestamp + 200 * oneDay
        await network.provider.send("evm_increaseTime", [750 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(twoHunderedDays, (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, twoHunderedDays, (await ethers.provider.getBlock("latest")).timestamp)
        const expectedScheduledReward1 = (parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))) * (oneYear - 200 * oneDay) / oneYear
        const expectedScheduledReward2 = (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2])))
        const expectedScheduledReward3 = (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3]))) * (750 * oneDay - 2 * oneYear) / oneYear
        const expectedScheduledReward = parseInt(expectedScheduledReward1.toString()) + parseInt(expectedScheduledReward2.toString()) + parseInt(expectedScheduledReward3.toString()) - 44
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.eq(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.eq(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.eq(expectedScheduledReward)
        expect(startIndex.toNumber()).to.be.eq(0)
        expect(endIndex.toNumber()).to.be.eq(2)
    })

    it('should schedule from 200 to end (4 years)', async () => {
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0] + 200 * oneDay, scheduleTimes[4])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(0, scheduleTimes[0] + 200 * oneDay, scheduleTimes[4])
        const expectedScheduledReward1 = (parseInt(ethers.utils.formatEther(scheduleRewards[0])) - parseInt(ethers.utils.formatEther(scheduleRewards[1]))) * (oneYear - 200 * oneDay) / oneYear
        const expectedScheduledReward2 = (parseInt(ethers.utils.formatEther(scheduleRewards[1])) - parseInt(ethers.utils.formatEther(scheduleRewards[2]))) + 
                (parseInt(ethers.utils.formatEther(scheduleRewards[2])) - parseInt(ethers.utils.formatEther(scheduleRewards[3]))) +
                (parseInt(ethers.utils.formatEther(scheduleRewards[3])) - parseInt(ethers.utils.formatEther(scheduleRewards[4])))
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

    it('should allow to stake max amount', async () => {
        let amountStaked = await auroraToken.balanceOf(user5.address)
        await auroraToken.connect(user5).approve(jet.address, amountStaked)
        await jet.connect(user5).stake(amountStaked)
        let totalStaked = amountStaked
        // let totalShares = 
        const stakingPeriod = 112 * oneDay
        amountStaked = ethers.utils.parseUnits("10", 18)
        await network.provider.send("evm_increaseTime", [stakingPeriod]) // increase time for 20 days
        await network.provider.send("evm_mine")
        // await auroraToken.connect(user2).approve(jet.address, amountStaked)
        // await jet.connect(user2).stake(amountStaked)
        // console.log(
        //     'Total staked Aurora',
        //     ethers.utils.formatEther(await jet.totalAmountOfStakedAurora())
        // )
        // console.log(
        //     'reward per share',
        //     (await jet.getRewardPerShare(0)).toNumber()
        // )
        // console.log(
        //     'total shares',
        //     ethers.utils.formatEther(await jet.totalShares(0))
        // )
        // console.log(
        //     'Reward to claim for User 5: ', 
        //     (await jet.calculateReward(user5.address, 0)).toNumber()
        // )
        // console.log(
        //     'Reward to claim for User 2: ', 
        //     (await jet.calculateReward(user2.address, 0)).toNumber()
        // )
    })
});