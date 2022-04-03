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
    let name: string
    let symbol: string
    let oneYear: number
    let tauPerStream: number
    let scheduleTimes: any
    let scheduleRewards: any
    let oneDay: any
    let startTime: any
    
    before(async () => {
        // deploys all the contracts
        [auroraOwner, stakingAdmin, user1, user2, user3, user4, user5, spender, streamOwner] = await ethers.getSigners()
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

        startTime = (await ethers.provider.getBlock("latest")).timestamp
        const JetStakingV1 = await ethers.getContractFactory('JetStakingTesting')
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
            ethers.utils.parseUnits("12500000", 18),  // 0 
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
                treasury.address,
                oneDay,
                oneDay,
                60 * oneDay
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
        await auroraToken.connect(auroraOwner).transfer(stakingAdmin.address, ethers.utils.parseUnits("100000000", 18))
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

    it('should allow admin to propose new stream', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        const tx = await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
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
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
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
    })
    it('should create stream and retfund staking admin if deposit reward is less than the upper amount', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
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
    })
    it('should stake aurora tokens', async () => {
        const amountStaked = ethers.utils.parseUnits("10", 18)
        await auroraToken.connect(user1).approve(jet.address, amountStaked)
        const tx = await jet.connect(user1).stake(amountStaked)
        const {amount, } = await getEventLogs(tx.hash, constants.eventsABI.staked, 0)
        expect(amount).to.be.eq(amountStaked)
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
        expect(parseInt(ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))).to.be.eq(
            parseInt(expectedReward.toString())
        )
        expect(parseInt(ethers.utils.formatUnits(amountStaked1, 0))).to.be.eq(
            parseInt(ethers.utils.formatUnits(await jet.totalShares(0), 0))
        )
    })
    it('should users stake and claim reward any time', async () => {
        const timeDiff = 0
        // // add new stream
        // await jet.connect(stakingAdmin).deployStream(
        //     streamToken1.address,
        //     10,
        //     scheduleTimes,
        //     scheduleRewards,
        //     tauPerStream
        // )
        // // user1 stakes 1000 Aurora tokens
        // let amount = ethers.utils.parseUnits("1000", 18)
        // await auroraToken.connect(user1).approve(jet.address, amount)
        // let touchedAt = (await ethers.provider.getBlock("latest")).timestamp
        // await jet.connect(user1).stake(amount)
        // const user1Balance = parseInt(ethers.utils.formatEther(await auroraToken.balanceOf(user1.address)))
        // // wait for 3 days
        // let days = 0
        // await network.provider.send("evm_increaseTime", [3 * oneDay])
        // days += 3
        // await network.provider.send("evm_mine")
        // let current = (await ethers.provider.getBlock("latest")).timestamp
        // timeDiff =  current - touchedAt - 1
        // touchedAt = (await ethers.provider.getBlock("latest")).timestamp
        // // user 1 claim rewards
        // const streamId = 1
        // let rps = await jet.getRewardPerShare(streamId)
        // await jet.connect(user1).moveRewardsToPending(streamId)
        // const pending = parseInt(ethers.utils.formatEther(await jet.getPending(streamId, user1.address)))
        // rps = await jet.getRewardPerShare(streamId)
        // const user1RPSAfterClaiming = rps
        // await network.provider.send("evm_increaseTime", [1])
        // await network.provider.send("evm_mine")
        // let totalStakedAurora = await jet.getTotalAmountOfStakedAurora()
        // await network.provider.send("evm_increaseTime", [1])
        // await network.provider.send("evm_mine")
        // let shares =  parseInt(ethers.utils.formatEther(amount))
        // let expectedRewardPerShare = (
        //     ((parseInt(scheduleRewards[0])/1e18 - parseInt(scheduleRewards[1])/1e18)) * (days * oneDay + 2) /
        //     (oneYear * shares)
        // )
        // expect(pending).within(expectedRewardPerShare * shares - 5, expectedRewardPerShare * shares + 5)
        // // expect(pending).to.be.lessThanOrEqual(expectedRewardPerShare * shares)
        // expect(amount).to.be.eq(
        //     await jet.totalShares(0)
        // )
        // expect(timeDiff).within(3 * oneDay - 1, 3 * oneDay + 1)
        // // const _rps = parseInt(ethers.utils.formatUnits(rps, 30)) / 10
        // // expect(parseInt(_rps.toString())).to.be.eq(
        // //     parseInt(
        // //         expectedRewardPerShare.toString()
        // //     )
        // // )
        // // expect(rps).to.be.eq(
        // //     await jet.getRewardPerShareForUser(streamId, user1.address)
        // // )
        // // user2 stakes 100 Aurora tokens
        // await network.provider.send("evm_increaseTime", [1 * oneDay])
        // await network.provider.send("evm_mine")
        // current = (await ethers.provider.getBlock("latest")).timestamp
        // days += 1
        // amount = ethers.utils.parseUnits("100", 18)
        // await auroraToken.connect(user2).approve(jet.address, amount)
        // await jet.connect(user2).stake(amount)
        // // check RPS
        // rps = await jet.getRewardPerShare(streamId)
        // expectedRewardPerShare = (
        //     ((parseInt(scheduleRewards[0])/1e18 - parseInt(scheduleRewards[1])/1e18)) * (days * oneDay) /
        //     (oneYear * shares)
        // )
        // shares += parseInt(ethers.utils.formatEther(amount)) * shares / parseInt(ethers.utils.formatEther(totalStakedAurora))
        // const expectedTotalAmountOfStakedAurora = 
        //         parseInt(ethers.utils.formatUnits(amount, 18)) +
        //         parseInt(ethers.utils.formatUnits(totalStakedAurora)) +
        //         ((parseInt(scheduleRewards[0])/1e18 - parseInt(scheduleRewards[1])/1e18)) * (current - touchedAt + 2) /
        //         (oneYear)
        // await network.provider.send("evm_increaseTime", [1])
        // await network.provider.send("evm_mine")
        // expect(parseInt(expectedTotalAmountOfStakedAurora.toString())).within(
        //     parseInt(ethers.utils.formatUnits(await jet.getTotalAmountOfStakedAurora(), 18)) - 5,
        //     parseInt(ethers.utils.formatUnits(await jet.getTotalAmountOfStakedAurora(), 18)) + 5
        // )
        // await network.provider.send("evm_increaseTime", [1])
        // await network.provider.send("evm_mine")
        // totalStakedAurora = parseInt(ethers.utils.formatUnits(await jet.totalAmountOfStakedAurora()))
        // expect(rps.toNumber()).to.be.lessThanOrEqual(expectedRewardPerShare)
        // expect(parseInt(shares.toString())).to.be.eq(
        //     parseInt(ethers.utils.formatEther(await jet.totalShares(0)))
        // )
        // expect(
        //     parseInt(ethers.utils.formatEther(await jet.getUserShares(user1.address))) +
        //     parseInt(ethers.utils.formatEther(await jet.getUserShares(user2.address)))
        // ).to.be.eq(
        //     parseInt(shares.toString())
        // )
        // // user 1 unstake 500 Aurora tokens (50%) and restake unclaimed rewards = false
        // amount = ethers.utils.parseUnits("500", 18)
        // await network.provider.send("evm_increaseTime", [5 * oneDay])
        // await network.provider.send("evm_mine")
        // days += 5
        // expectedRewardPerShare = (
        //     ((parseInt(scheduleRewards[0])/1e18 - parseInt(scheduleRewards[1])/1e18)) * (days * oneDay) /
        //     (oneYear * shares)
        // )
        // await jet.connect(user1).unstake(amount)
        // shares -= parseInt(ethers.utils.formatEther(amount))
        
        // expect(parseInt(shares.toString())).to.be.eq(parseInt(ethers.utils.formatEther(await jet.totalShares(0))))
        // // rps = await jet.getRewardPerShare(0)
        // // expect(parseInt(rps)).to.be.greaterThanOrEqual(expectedRewardPerShare)
        // expect(pending).within(
        //     (shares - parseInt(ethers.utils.formatEther(await jet.getUserShares(user2.address)))) * (expectedRewardPerShare - user1RPSAfterClaiming) - 400,
        //     (shares - parseInt(ethers.utils.formatEther(await jet.getUserShares(user2.address)))) * (expectedRewardPerShare - user1RPSAfterClaiming) + 400
        // )
        // await network.provider.send("evm_increaseTime", [5 * oneDay])
        // await network.provider.send("evm_mine")
        // days += 5
        // await jet.connect(user1).withdraw(0)
        
        // expect(user1Balance + (shares - parseInt(ethers.utils.formatEther(await jet.getUserShares(user2.address)))) * (expectedRewardPerShare - user1RPSAfterClaiming)).to.be.lessThanOrEqual(
        //     parseInt(ethers.utils.formatEther(await auroraToken.balanceOf(user1.address)))
        // )
        // // user 1 stakes 500 Aurora tokens
        
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
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.within(parseInt(expectedScheduledReward.toString()) - 10, parseInt(expectedScheduledReward.toString()) + 10)
        expect(parseInt(scheduleCalculated.toNumber())).to.be.greaterThanOrEqual(parseInt(expectedScheduledReward.toString()))
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.greaterThanOrEqual(parseInt(expectedScheduledReward.toString()))
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
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.greaterThanOrEqual(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.greaterThanOrEqual(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.greaterThanOrEqual(expectedScheduledReward)
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
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.greaterThanOrEqual(expectedScheduledReward)
        expect(scheduleCalculated.toNumber()).to.be.greaterThanOrEqual(expectedScheduledReward)
        expect(parseInt(ethers.utils.formatUnits(rewardPerShareAurora))).to.be.greaterThanOrEqual(expectedScheduledReward)
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
    it('should only admin whitelist contract address', async () => {
        const SampleContract = await ethers.getContractFactory("Token")
        const sampleContract = await SampleContract.connect(auroraOwner).deploy(1000, "SampleContract", "SC")
        await jet.connect(stakingAdmin).whitelistContract(sampleContract.address, true)
        expect(await jet.whitelistedContracts(sampleContract.address)).to.be.eq(true)
    })
    it('should only admin batch whitelist contracts', async () => {
        const SampleContract1 = await ethers.getContractFactory("Token")
        const sampleContract1 = await SampleContract1.connect(auroraOwner).deploy(1000, "SampleContract1", "SC1")
        const SampleContract2 = await ethers.getContractFactory("Token")
        const sampleContract2 = await SampleContract2.connect(auroraOwner).deploy(1000, "SampleContract2", "SC2")
        await jet.connect(stakingAdmin).batchWhitelistContract(
            [
                sampleContract1.address,
                sampleContract2.address
            ],
            [
                true,
                true
            ]
        )
        expect(await jet.whitelistedContracts(sampleContract1.address)).to.be.eq(true)
        expect(await jet.whitelistedContracts(sampleContract2.address)).to.be.eq(true)
    })
    it('should only admin mint vote tokens', async () => {
        const amount = ethers.utils.parseUnits("5", 18)
        await jet.connect(stakingAdmin).mint(spender.address, amount)
        expect(await jet.balanceOf(spender.address)).to.be.eq(amount)
    })
    it('should revert in transfer', async () => {
        const amount = ethers.utils.parseUnits("5", 18)
        await jet.connect(stakingAdmin).mint(spender.address, amount)
        await expect(jet.connect(spender).transfer(spender.address, amount)).to.be.reverted;
    })
    it('should revert in approving vote tokens', async () => {
        const amount = ethers.utils.parseUnits("5", 18)
        await jet.connect(stakingAdmin).mint(spender.address, amount)
        await expect(jet.connect(spender).approve(stakingAdmin.address, amount)).to.be.reverted;
    })
    it('should only whitelisted contract call transferFrom', async () => {
        const sampleWhitelistContractAddress = spender.address
        await jet.connect(stakingAdmin).whitelistContract(sampleWhitelistContractAddress, true)
        expect(await jet.whitelistedContracts(sampleWhitelistContractAddress)).to.be.eq(true)
        const amount = ethers.utils.parseUnits("5", 18)
        await jet.connect(stakingAdmin).mint(user5.address, amount)
        await jet.connect(spender).transferFrom(user5.address, user4.address, amount)
        expect(await jet.balanceOf(user4.address)).to.be.eq(amount)
    })
    it('should stake on behalf of another user', async () => {
        const amount = ethers.utils.parseUnits("5", 18)
        await auroraToken.connect(auroraOwner).mint(auroraOwner.address, amount)
        await auroraToken.connect(auroraOwner).approve(jet.address, amount)
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
        await jet.connect(auroraOwner).batchStakeOnBehalfOfOtherUsers(
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
         expect(user1BalanceAfter).to.be.greaterThan(user1BalanceBefore)
    })
    it('should claim all rewards', async () => {
        // deploy stream
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
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
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
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
        expect(amount).to.be.eq(
            await jet.getAmountOfShares(id, user1.address)
        )
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
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
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
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
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
        const userRPS = parseInt(ethers.utils.formatEther(await jet.getRewardPerShareForUser(id, user1.address)))
        const latestRPS = parseInt(ethers.utils.formatEther(await jet.getLatestRewardPerShare(id)))
        const userShares = parseInt(ethers.utils.formatEther(await jet.getUserShares(user1.address)))
        const expectedClaimableAmount = (latestRPS - userRPS) * userShares / 1e13
        expect(parseInt(
            ethers.utils.formatEther(await jet.getStreamClaimableAmount(id, user1.address))
        )).to.be.eq(parseInt(expectedClaimableAmount.toString()))
    })
    it('should restake the rest of aurora tokens', async () => {
        // deploy stream
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
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
        await network.provider.send("evm_increaseTime", [1])
        await network.provider.send("evm_mine")
        const userDepositAfter = parseInt(await jet.getUserTotalDeposit(user5.address))
        expect(userDepositBefore).to.be.lessThan(userDepositAfter)
    })
    it('should return zero total aurora staked if touchedAt equals zero', async () => {
        expect(
            await jet.getTotalAmountOfStakedAurora()
        ).to.be.eq(0)
    })
    it('should return zero latest reward per share', async () => {
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        expect(
            await jet.getLatestRewardPerShare(id)
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
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
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
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
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
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
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
        expect(parseInt(ethers.utils.formatEther(await jet.getPending(id, user1.address)))).to.be.greaterThanOrEqual(
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
        const shares = amount
        await jet.connect(user1).unstake(shares)
        // withdraw
        await network.provider.send("evm_increaseTime", [tauPerStream + 1])
        await network.provider.send("evm_mine")
        const streamId = 0 // main aurora rewards
        await jet.connect(user1).withdraw(streamId)
        const user1BalanceAfter = parseInt(await auroraToken.balanceOf(user1.address))
        expect(user1BalanceAfter).to.be.greaterThan(user1BalanceBefore)
    })
    it('should not stake after the schedule end', async () => {
        await network.provider.send("evm_increaseTime", [5 * oneYear])
        await network.provider.send("evm_mine")
        const amount = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amount)
        await expect(jet.connect(user1).stake(amount)).to.be.revertedWith('INVALID_SCHEDULE')
    })
    it('should only admin update the treasury address', async () => {
        // deploy new treasury contract
        const Treasury = await ethers.getContractFactory("Treasury")
        const newTreasury = await upgrades.deployProxy(
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
        await jet.connect(stakingAdmin).updateTreasury(newTreasury.address)
        expect(newTreasury.address).to.be.eq(await jet.treasury())
    })
    it('should remove stream', async () => {
        //TODO update the contract and the test
        const id = 1
        // approve aurora tokens to the stream proposal
        const auroraProposalAmountForAStream = ethers.utils.parseUnits("10000", 18)
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(stakingAdmin).approve(jet.address, auroraProposalAmountForAStream)
        // propose a stream
        await jet.connect(stakingAdmin).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            scheduleTimes[scheduleTimes.length - 1],
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        // approve reward tokens
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        // create a stream
        await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        await jet.connect(stakingAdmin).removeStream(id)
    })
    it('should admin able to update decay grace period', async () => {
        const newDecayGracePeriod = 2 * oneDay
        await jet.connect(stakingAdmin).updateDecayGracePeriod(newDecayGracePeriod)
        expect(newDecayGracePeriod).to.be.eq(
            parseInt(await jet.decayGracePeriod())
        )
    })
    it('should admin able to update burn grace period', async () => {
        const newBurnGracePeriod = 2 * oneDay
        await jet.connect(stakingAdmin).updateBurnGracePeriod(newBurnGracePeriod)
        expect(newBurnGracePeriod).to.be.eq(
            parseInt(await jet.burnGracePeriod())
        )
    })
});
