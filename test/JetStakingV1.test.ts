import { expect, use } from "chai";
import { ethers, network, deployments, upgrades } from "hardhat";
import * as constants from './constants'
import { getEventLogs } from "./testHelper";
import { Signer } from "ethers"
import exp from "constants"
import { start } from "repl"

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
        const supply = ethers.utils.parseUnits("1000000", 18)
        oneDay = 24 * 60 * 60
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
        const JetStakingV1 = await ethers.getContractFactory('JetStakingV1')
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
        // approve total supply to the jet staking contract
        await auroraToken.connect(auroraOwner).approve(jet.address, await auroraToken.totalSupply())
        // users approve their AURORA tokens for jet staking contract
        await auroraToken.connect(auroraOwner).approve(jet.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(user2).approve(jet.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(user3).approve(jet.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(user4).approve(jet.address, ethers.utils.parseUnits("10000", 18))
        // transfer ownership of the treasury to the jet staking contract
        await treasury.connect(auroraOwner).transferOwnership(jet.address)
        await treasury.connect(auroraOwner).approveTokensTo(
            [
                auroraToken.address,
                streamToken1.address,
                streamToken1.address
            ],
            [
                ethers.utils.parseUnits("10000", 18),
                ethers.utils.parseUnits("10000", 18),
                ethers.utils.parseUnits("10000", 18)
            ],
            jet.address
        )
    })

    // it("should return treasury account", async () => {
    //     expect(await jet.treasury()).to.eq(treasury.address)
    // })

    // it("should return jet staking name", async () => {
    //     expect(await jet.name()).to.eq(name)
    // })

    // it("should return let staking symbol", async () => {
    //     expect(await jet.symbol()).to.eq(symbol)
    // })

    // it('should allow admin to deploy new stream', async () => {
    //     const weight = 10
    //     const tx = await jet.connect(stakingAdmin).deployStream(
    //         streamToken1.address,
    //         weight,
    //         scheduleTimes,
    //         scheduleRewards,
    //         tauPerStream
    //     )
    //     const {stream, index, } = await getEventLogs(tx.hash, constants.eventsABI.streamAdded, 0)
    //     expect(stream).to.be.eq(streamToken1.address)
    //     expect(index).to.be.eq(await jet.streamToIndex(stream))
    // })

    // it('should stake aurora tokens', async () => {
    //     await jet.connect(stakingAdmin).deployStream(
    //         streamToken1.address,
    //         10,
    //         scheduleTimes,
    //         scheduleRewards,
    //         tauPerStream
    //     )
    //     const amountStaked = ethers.utils.parseUnits("10", 18)
    //     await auroraToken.connect(user1).approve(jet.address, amountStaked)
    //     const tx = await jet.connect(user1).stake(amountStaked)
    //     const {amount, } = await getEventLogs(tx.hash, constants.eventsABI.staked, 0)
    //     expect(amount).to.be.eq(amountStaked)
    // })

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

    // it('should allow user to unstake tokens', async () => {
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
    //     await jet.connect(user1).unstake(ethers.utils.parseUnits("5", 18))
    // })

    // it('should allow user to withdraw tokens', async () => {
    //     await jet.connect(stakingAdmin).deployStream(
    //         streamToken1.address,
    //         10,
    //         scheduleTimes,
    //         scheduleRewards,
    //         tauPerStream
    //     )
    //     const amountStaked = ethers.utils.parseUnits("10", 18)
    //     const user1BalanceBefore = await auroraToken.balanceOf(user1.address)
    //     await auroraToken.connect(user1).approve(jet.address, amountStaked)
    //     const tx1 = await jet.connect(user1).stake(amountStaked)
        
    //     await network.provider.send("evm_increaseTime", [100 * oneDay]) // increase time for 20 days
    //     await network.provider.send("evm_mine")
    //     // console.log(
    //     //     await getEventLogs(tx1.hash, constants.eventsABI.startEnd, 0)
    //     // )
    //     // console.log(
    //     //     'reward per share',
    //     //     ethers.utils.formatEther(await jet.getRewardPerShare(0))
    //     // )
    //     // console.log(await jet.getAmountOfShares(user1.address, 0))
    //     await jet.connect(user1).unstake(amountStaked)
    //     await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
    //     await network.provider.send("evm_mine")
    //     const pendingRelease = await jet.getPending(user1.address, 0)
    //     // console.log(
    //     //     'Pending release tokens before withdrawal: ', 
    //     //     ethers.utils.formatEther(pendingRelease)
    //     // )
    //     const tx = await jet.connect(user1).withdraw(0)
    //     const {amount, } = await getEventLogs(tx.hash, constants.eventsABI.released, 1)
    //     // console.log(ethers.utils.formatEther(amount))
    //     // console.log(
    //     //     'Pending release tokens after withdrawal: ',
    //     //     ethers.utils.formatEther(await jet.getPending(user1.address, 0))
    //     // )
    //     // const user1BalanceAfter = await auroraToken.balanceOf(user1.address)
    //     // // expect(user1BalanceBefore).to.be.lt(user1BalanceAfter)
    // })
    
    // it('should allow user to get the calculated reward per stream', async () => {
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
    //     await network.provider.send("evm_increaseTime", [100 * oneDay]) // increase time for 20 days
    //     await network.provider.send("evm_mine")
    //     // console.log(await jet.calculateReward(user1.address, 0))
    //     // await network.provider.send("evm_increaseTime", [100 * oneDay]) // increase time for 20 days
    //     // await network.provider.send("evm_mine")
    //     // console.log(await jet.calculateReward(user1.address, 0))
    //     // await network.provider.send("evm_increaseTime", [400 * oneDay]) // increase time for 20 days
    //     // await network.provider.send("evm_mine")
    //     // console.log(await jet.calculateReward(user1.address, 0))
    //     // console.log(await jet.calculateReward(user2.address, 0))
    // })

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

    it('should have a full happy path', async () => {
        // console.log(
        //     'Amount of shares for user1:', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 18),
        // )
        // await jet.connect(stakingAdmin).deployStream(
        //     streamToken1.address,
        //     10,
        //     scheduleTimes,
        //     scheduleRewards,
        //     tauPerStream
        // )
        // // USER 1 STAKES 10 tokens
        // let amountStaked = ethers.utils.parseUnits("10", 18)
        // await auroraToken.connect(user1).approve(jet.address, amountStaked)
        // await jet.connect(user1).stake(amountStaked)
        // console.log("-------------------------------------------------------")
        // console.log(
        //     'User1 stakes 10 Aurora tokens. '
        // )
        // console.log(
        //     'Amount of shares for user1:', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 18),
        // )
        // console.log(
        //     'Reward Per Share (rps): ', 
        //     ethers.utils.formatUnits(await jet.rps(0), 0)
        // )
        // console.log(
        //     'Total amount of Aurora Staked', 
        //     ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()),
        //     'Total number of shares',
        //     ethers.utils.formatUnits(await jet.totalShares(0), 18)
        // )
        // // USER 2 STAKES 10 tokens
        // await network.provider.send("evm_increaseTime", [400 * oneDay]) // increase time for 400 days
        // await network.provider.send("evm_mine")
        // await auroraToken.connect(user2).approve(jet.address, amountStaked)
        // await jet.connect(user2).stake(amountStaked)
        // console.log("-------------------------------------------------------")
        // console.log(
        //     'After 400 days User2 stakes 10 Aurora tokens. '
        // )
        // console.log(
        //     'Amount of shares for user1:', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 18),
        // )
        // console.log(
        //     'Amount of shares for user2:', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 18),
        // )
        // console.log(
        //     'Reward Per Share (rps): ', 
        //     ethers.utils.formatUnits(await jet.rps(0), 0)
        // )
        // console.log(
        //     'Total amount of Aurora Staked', 
        //     ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()),
        //     'Total number of shares',
        //     ethers.utils.formatUnits(await jet.totalShares(0), 18)
        // )
        // await network.provider.send("evm_increaseTime", [100 * oneDay]) // increase time for 20 days
        // await network.provider.send("evm_mine")

        /// Before Unstaking
        console.log("---------------------From 0 to 4 schedules----------------------------------")
        console.log(
            'Before calculations',
        )
        const {total, rewardPerShareAurora, scheduleCalculated} = await jet.before(scheduleTimes[0], scheduleTimes[4])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0], scheduleTimes[4])
        console.log(
            'RPS:',
            ethers.utils.formatUnits(rewardPerShareAurora)
        )
        console.log(
            'Total staked Aurora Tokens',
            ethers.utils.formatUnits(total)
        )

        console.log('schedule calculated over 4 years: ', scheduleCalculated.toNumber())
        console.log(
            'StartIndex: ',
            startIndex.toNumber(),
            'End Index: ', 
            endIndex.toNumber()
        )
        // User1 unstakes 5 Aurora tokens
        // const unstakedAmount = ethers.utils.parseUnits("5", 18)
        // await jet.connect(user1).unstake(unstakedAmount)
        // console.log("-------------------------------------------------------")
        // console.log(
        //     'After 100 days User1 unstake 5 Aurora tokens. '
        // )
        // console.log(
        //     'Amount of shares for user1:', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 18),
        // )
        // console.log(
        //     'Amount of shares for user2:', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 18),
        // )
        // console.log(
        //     'Reward Per Share (rps): ', 
        //     ethers.utils.formatUnits(await jet.rps(0), 0)
        // )
        // console.log(
        //     'Total amount of Aurora Staked', 
        //     ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()),
        //     'Total number of shares',
        //     ethers.utils.formatUnits(await jet.totalShares(0), 18)
        // )

        // await network.provider.send("evm_increaseTime", [200 * oneDay]) // increase time for 20 days
        // await network.provider.send("evm_mine")
        // amountStaked = ethers.utils.parseUnits("100", 18)
        // await auroraToken.connect(user3).approve(jet.address, amountStaked)
        // await jet.connect(user3).stake(amountStaked)
        // console.log("-------------------------------------------------------")
        // console.log(
        //     'After another 200 days. User3 staked 100 Aurora Tokens'
        // )
        // console.log(
        //     'Amount of shares for user1:', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 18),
        // )
        // console.log(
        //     'Amount of shares for user2:', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 18),
        // )
        // console.log(
        //     'Amount of shares for user3:', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 18),
        // )
        // console.log(
        //     'Reward Per Share (rps): ', 
        //     ethers.utils.formatUnits(await jet.rps(0), 0)
        // )
        // console.log(
        //     'Total amount of Aurora Staked', 
        //     ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()),
        //     'Total number of shares',
        //     ethers.utils.formatUnits(await jet.totalShares(0), 18)
        // )





        // console.log("-------------------------------------------------------")
        // console.log(
        //     'Calculated reward for user1: ',
        //     ethers.utils.formatUnits(await jet.calculateReward(user1.address, 0), 0),
        //     'Amount of shares user1', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 0)
        // )
        // console.log(
        //     'rps', 
        //     (await jet.rps(0)).toNumber()
        // )
        // console.log(
        //     'Calculated reward for user2',
        //     ethers.utils.formatUnits(await jet.calculateReward(user2.address, 0), 0),
        //     'Amount of shares user2', 
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 0),
        // )
        // console.log(
        //     'Total amount of Aurora Staked', 
        //     ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()),
        //     'Reward per share',
        //     ethers.utils.formatEther(await jet.getRewardPerShare(0))
        // )
        // console.log("-------------------------------------------------------")
        // console.log(
        //     'Total number of shares',
        //     ethers.utils.formatUnits(await jet.totalShares(0), 0),
        //     'Stream 1', 
        //     ethers.utils.formatUnits(await jet.totalShares(1), 0)
        // )
        // await network.provider.send("evm_increaseTime", [1 * oneDay]) // increase time for 20 days
        // await network.provider.send("evm_mine")
        // await jet.connect(user1).withdraw(0)
        // console.log(
        //     'Total amount of Aurora Staked', 
        //     ethers.utils.formatEther(await jet.totalAmountOfStakedAurora())
        // )
    })

    // it('should stake over long periods', async () => {
    //     await jet.connect(stakingAdmin).deployStream(
    //         streamToken1.address,
    //         10,
    //         scheduleTimes,
    //         scheduleRewards,
    //         tauPerStream
    //     )
    //     // USER 1 STAKES 10 tokens
    //     let amountStaked = ethers.utils.parseUnits("10", 18)
    //     // await auroraToken.connect(user1).approve(jet.address, amountStaked)
    //     // await jet.connect(user1).stake(amountStaked)
    //     await network.provider.send("evm_increaseTime", [1050 * oneDay]) // increase time for 20 days
    //     await network.provider.send("evm_mine")
    //     amountStaked = ethers.utils.parseUnits("100", 18)
    //     await auroraToken.connect(user1).approve(jet.address, amountStaked)
    //     await jet.connect(user1).stake(amountStaked)
    // })

    it('should from 1 to 2', async () => {
        console.log("---------------------from 1 to 2 ----------------------------------")
        console.log(
            'Before calculations',
        )

        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[1], scheduleTimes[2])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[1], scheduleTimes[2])
        console.log(
            'RPS:',
            ethers.utils.formatUnits(rewardPerShareAurora)
        )
        console.log(
            'Total staked Aurora Tokens',
            ethers.utils.formatUnits(total)
        )

        console.log('schedule calculated over 2 years: ', scheduleCalculated.toNumber())
        console.log(
            'StartIndex: ',
            startIndex.toNumber(),
            'End Index: ', 
            endIndex.toNumber()
        )
    })

    it('should from 1 to 3', async () => {
        console.log("---------------------from 1 to 3 ----------------------------------")
        console.log(
            'Before calculations',
        )

        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[1], scheduleTimes[3])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[1], scheduleTimes[3])
        console.log(
            'RPS:',
            ethers.utils.formatUnits(rewardPerShareAurora)
        )
        console.log(
            'Total staked Aurora Tokens',
            ethers.utils.formatUnits(total)
        )

        console.log('schedule calculated over 2 years: ', scheduleCalculated.toNumber())
        console.log(
            'StartIndex: ',
            startIndex.toNumber(),
            'End Index: ', 
            endIndex.toNumber()
        )
    })

    it('should from 0 to 1', async () => {
        console.log("---------------------from 0 to 1 ----------------------------------")

        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], scheduleTimes[1])
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0], scheduleTimes[1])
        console.log(
            'RPS:',
            ethers.utils.formatUnits(rewardPerShareAurora)
        )
        console.log(
            'Total staked Aurora Tokens',
            ethers.utils.formatUnits(total)
        )

        console.log('schedule calculated over 2 years: ', scheduleCalculated.toNumber())
        console.log(
            'StartIndex: ',
            startIndex.toNumber(),
            'End Index: ', 
            endIndex.toNumber()
        )
    })

    it('should from 0 to now 200 days', async () => {
        console.log("---------------------from 0 to now (200 days)----------------------------------")
        await network.provider.send("evm_increaseTime", [200 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        console.log(
            'RPS:',
            ethers.utils.formatUnits(rewardPerShareAurora)
        )
        console.log(
            'Total staked Aurora Tokens',
            ethers.utils.formatUnits(total)
        )

        console.log('schedule calculated over 200 days: ', scheduleCalculated.toNumber())
        console.log(
            'StartIndex: ',
            startIndex.toNumber(),
            'End Index: ', 
            endIndex.toNumber()
        )
    })
    it('should from 0 to now 400 days', async () => {
        console.log("---------------------from 0 to now (400 days)----------------------------------")
        await network.provider.send("evm_increaseTime", [400 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        console.log(
            'RPS:',
            ethers.utils.formatUnits(rewardPerShareAurora)
        )
        console.log(
            'Total staked Aurora Tokens',
            ethers.utils.formatUnits(total)
        )

        console.log('schedule calculated over 400 days: ', scheduleCalculated.toNumber())
        console.log(
            'StartIndex: ',
            startIndex.toNumber(),
            'End Index: ', 
            endIndex.toNumber()
        )
    })

    it('should from 0 to now 750 days', async () => {
        console.log("---------------------from 0 to now (750 days)----------------------------------")
        await network.provider.send("evm_increaseTime", [750 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(scheduleTimes[0], (await ethers.provider.getBlock("latest")).timestamp)
        console.log(
            'RPS:',
            ethers.utils.formatUnits(rewardPerShareAurora)
        )
        console.log(
            'Total staked Aurora Tokens',
            ethers.utils.formatUnits(total)
        )

        console.log('schedule calculated over 750 days: ', scheduleCalculated.toNumber())
        console.log(
            'StartIndex: ',
            startIndex.toNumber(),
            'End Index: ', 
            endIndex.toNumber()
        )
    })
    it('should from 200 to now 750 days', async () => {
        console.log("---------------------from 200 to now (750 days)----------------------------------")
        const twoHunderedDays = (await ethers.provider.getBlock("latest")).timestamp + 200 * oneDay
        console.log(twoHunderedDays)
        await network.provider.send("evm_increaseTime", [750 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const { total, rewardPerShareAurora, scheduleCalculated } = await jet.before(twoHunderedDays, (await ethers.provider.getBlock("latest")).timestamp)
        const { startIndex, endIndex } = await jet.startEndScheduleIndex(twoHunderedDays, (await ethers.provider.getBlock("latest")).timestamp)
        console.log(
            'RPS:',
            ethers.utils.formatUnits(rewardPerShareAurora)
        )
        console.log(
            'Total staked Aurora Tokens',
            ethers.utils.formatUnits(total)
        )

        console.log('schedule calculated over 750 days: ', scheduleCalculated.toNumber())
        console.log(
            'StartIndex: ',
            startIndex.toNumber(),
            'End Index: ', 
            endIndex.toNumber()
        )
    })
});