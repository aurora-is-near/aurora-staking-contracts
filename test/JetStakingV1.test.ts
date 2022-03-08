import { expect, use } from "chai";
import { time } from "console";
import { ethers, network, deployments, upgrades } from "hardhat";
import * as constants from './constants'
import { getEventLogs } from "./testHelper";
import { Table } from 'console-table-printer';

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
    let startTime: any

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

    it('user stakes and never claims', async () => {
        await jet.connect(stakingAdmin).deployStream(
            streamToken1.address,
            10,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        const amountStaked1 = ethers.utils.parseUnits("1000", 18)
        await auroraToken.connect(user1).approve(jet.address, amountStaked1)
        await jet.connect(user1).stake(amountStaked1)
        let currentTime = (await ethers.provider.getBlock("latest")).timestamp
        const timeDiff = currentTime - startTime
        await network.provider.send("evm_increaseTime", [4 * oneYear - timeDiff - 1]) // increase time for 20 days
        await network.provider.send("evm_mine")
        await jet.connect(user1).updateUserCalculation()
        const expectedReward = 
        ((parseInt(scheduleRewards[0]) - parseInt(scheduleRewards[1])) / 1e18) * (oneYear - timeDiff) / oneYear + 
        ((parseInt(scheduleRewards[1]) - parseInt(scheduleRewards[2])) / 1e18) + 
        ((parseInt(scheduleRewards[2]) - parseInt(scheduleRewards[3])) / 1e18) + 
        ((parseInt(scheduleRewards[3]) - parseInt(scheduleRewards[4])) / 1e18) + 
        parseInt(scheduleRewards[4]) / 1e18 +
        parseInt(ethers.utils.formatEther(amountStaked1))

        expect(parseInt(ethers.utils.formatEther(await jet.totalDeposit()))).to.be.eq(parseInt(ethers.utils.formatEther(amountStaked1)))
        expect(parseInt(ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))).to.be.eq(
            parseInt(expectedReward.toString())
        )
        expect(1000000000 * parseInt(ethers.utils.formatEther(amountStaked1))).to.be.eq(
            parseInt(ethers.utils.formatUnits(await jet.totalShares(0), 0))
        )
    })
    it('should multiple users stake and unstake over 4 years', async () => {
        let timeAfter = 0
        let timeDiff = 0
        const p = new Table({
            columns: [
              { name: 'User_Address', alignment: 'center'},
              { name: 'Operation', alignment: 'center'},
              { name: 'Amount', alignment: 'center'},
              { name: 'Year', alignment: 'center'},
              { name: 'Duration', alignment: 'center'},
              { name: 'Expected_Reward_For_This_User', alignment: 'center' },
              { name: 'Actual_Reward_For_This_User', alignment: 'center' },
              { name: 'Expected_Total_Reward', alignment: 'center' },
              { name: 'Actual_Total_Reward', alignment: 'center' },
              { name: 'Expected_Total_Shares', alignment: 'center' },
              { name: 'Actual_Total_Shares', alignment: 'center' },
              { name: 'Pending', alignment: 'center'},
              { name: 'Total_Deposit', alignment: 'center' }
            ],
        })
        await jet.connect(stakingAdmin).deployStream(
            streamToken1.address,
            10,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        const amounts = [
            ethers.utils.parseUnits("5", 18),
            ethers.utils.parseUnits("10", 18),
            ethers.utils.parseUnits("5", 18),
            ethers.utils.parseUnits("20", 18)
        ]
        // Year 1
        await auroraToken.connect(user1).approve(jet.address, amounts[0])
        let timeBefore = (await ethers.provider.getBlock("latest")).timestamp + 1
        const timeBeforeUser1Stake = timeBefore
        await jet.connect(user1).stake(amounts[0])
        await network.provider.send("evm_increaseTime", [oneDay])
        await network.provider.send("evm_mine")
        timeAfter = (await ethers.provider.getBlock("latest")).timestamp
        await jet.connect(user1).updateUserCalculation()
        timeDiff = timeAfter - timeBefore
        // calculated expected shares and reward
        let expectedShares = parseFloat(ethers.utils.formatEther(amounts[0]))
        let totalShares = expectedShares * 1000000000
        const User1FirstStakeShares = totalShares
        let expectedReward = ((parseInt(scheduleRewards[0]) - parseInt(scheduleRewards[1])) / 1e9) * timeDiff / oneYear
        let totalExpectedReward = expectedReward * expectedShares / totalShares

        p.addRow({ 
            User_Address: user1.address,
            Operation: 'Staking',
            Amount: parseFloat(ethers.utils.formatEther(amounts[0])),
            Year: '1', 
            Duration: timeDiff,
            Expected_Reward_For_This_User: totalExpectedReward,
            Actual_Reward_For_This_User: parseFloat(ethers.utils.formatEther(await jet.connect(user1).getTotalUserReward())),
            Expected_Total_Reward: totalExpectedReward,
            Actual_Total_Reward: parseFloat(ethers.utils.formatEther(await jet.totalAmountOfStakedAurora())),
            Expected_Total_Shares: parseFloat(totalShares.toString()),
            Actual_Total_Shares: parseFloat(ethers.utils.formatUnits(await jet.totalShares(0), 0)),
            Pending: 0,
            Total_Deposit: parseFloat(ethers.utils.formatEther(await jet.totalDeposit()))
        })
        const expectedTotalSharesUser1Year1 = totalShares
        expect(totalShares).to.be.eq(parseInt(ethers.utils.formatUnits(await jet.totalShares(0), 0)))
        expect(parseFloat(ethers.utils.formatEther(await jet.connect(user1).getTotalUserReward()))).to.be.greaterThanOrEqual(
            totalExpectedReward
        )

        // user 2 stakes amounts[1]
        await auroraToken.connect(user2).approve(jet.address, amounts[1])
        timeBefore = (await ethers.provider.getBlock("latest")).timestamp + 1
        await jet.connect(user2).stake(amounts[1])
        let totalAmountOfStakedAurora = parseFloat(ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        await network.provider.send("evm_increaseTime", [oneDay])
        await network.provider.send("evm_mine")
        timeAfter = (await ethers.provider.getBlock("latest")).timestamp
        timeDiff = timeAfter - timeBefore
        expectedShares = parseInt(ethers.utils.formatEther(amounts[1])) * totalShares / totalAmountOfStakedAurora
        totalShares += expectedShares
        expectedReward = ((parseInt(scheduleRewards[0]) - parseInt(scheduleRewards[1])) / 1e18) * timeDiff / oneYear
        const totalExpectedRewardUser2 = expectedReward * expectedShares / totalShares
        totalExpectedReward = totalExpectedReward + totalExpectedRewardUser2
        
        expect(parseFloat(ethers.utils.formatEther(await jet.connect(user2).getTotalUserReward()))).to.be.greaterThanOrEqual(
            totalExpectedRewardUser2
        )
        expect(parseInt(totalShares.toString())).to.be.lessThanOrEqual(parseInt(ethers.utils.formatUnits(await jet.totalShares(0), 0)))
        p.addRow({ 
            User_Address: user2.address,
            Operation: 'Staking',
            Amount: parseFloat(ethers.utils.formatEther(amounts[1])),
            Year: '1', 
            Duration: timeDiff,
            Expected_Reward_For_This_User: totalExpectedRewardUser2,
            Actual_Reward_For_This_User: parseFloat(ethers.utils.formatEther(await jet.connect(user2).getTotalUserReward())),
            Expected_Total_Reward: totalExpectedReward,
            Actual_Total_Reward: parseFloat(ethers.utils.formatEther(await jet.totalAmountOfStakedAurora())),
            Expected_Total_Shares: parseFloat(totalShares.toString()),
            Actual_Total_Shares: parseFloat(ethers.utils.formatUnits(await jet.totalShares(0), 0)),
            Pending: 0,
            Total_Deposit: parseFloat(ethers.utils.formatEther(await jet.totalDeposit()))
        })
        
        // Year 2
        // After 1 Year, User 1 unstakes 1.5 Aurora token --- second year
        const unstakedUser1Amount = ethers.utils.parseUnits("1.5", 18)
        await network.provider.send("evm_increaseTime", [oneYear])
        await network.provider.send("evm_mine")
        await jet.connect(user1).updateUserCalculation()
        const user1TotalStakedReward = parseFloat(ethers.utils.formatEther(await jet.connect(user1).getTotalUserReward()))
        totalAmountOfStakedAurora = parseFloat(ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))        
        const currentUser1TotalShares = User1FirstStakeShares
        await jet.connect(user1).unstake(unstakedUser1Amount)        
        timeAfter = (await ethers.provider.getBlock("latest")).timestamp + 1
        timeDiff = timeAfter - timeBeforeUser1Stake - 2 
        // calculate the percentage of the reward of the unstaked amount
        const claimedRewardUser1Unstake = parseFloat(ethers.utils.formatEther(unstakedUser1Amount)) * user1TotalStakedReward / parseFloat(ethers.utils.formatEther(amounts[0])) 
        const unclaimedRewardUser1Unstake = user1TotalStakedReward - claimedRewardUser1Unstake
        totalAmountOfStakedAurora -= user1TotalStakedReward
        totalShares = parseFloat(totalShares.toString()) - currentUser1TotalShares
        const newRestakingUser1Shares = unclaimedRewardUser1Unstake * totalShares / totalAmountOfStakedAurora
        totalShares += newRestakingUser1Shares
        totalAmountOfStakedAurora += unclaimedRewardUser1Unstake
        
        p.addRow({ 
            User_Address: user1.address,
            Operation: 'Unstaking',
            Amount:  ethers.utils.formatEther(unstakedUser1Amount),
            Year: '2', 
            Duration: timeDiff,
            Expected_Reward_For_This_User: unclaimedRewardUser1Unstake,
            Actual_Reward_For_This_User: parseFloat(ethers.utils.formatEther(await jet.connect(user1).getTotalUserReward())),
            Expected_Total_Reward: totalAmountOfStakedAurora,
            Actual_Total_Reward: parseFloat(ethers.utils.formatEther(await jet.totalAmountOfStakedAurora())),
            Expected_Total_Shares: totalShares,
            Actual_Total_Shares: parseFloat(ethers.utils.formatUnits(await jet.totalShares(0), 0)),
            Pending: ethers.utils.formatEther(await jet.getPending(user1.address, 0)),
            Total_Deposit: parseFloat(ethers.utils.formatEther(await jet.totalDeposit()))
        })
        expect(parseFloat(ethers.utils.formatEther(await jet.connect(user1).getTotalUserReward()))).to.be.greaterThanOrEqual(
            unclaimedRewardUser1Unstake
        )
        expect(totalShares).to.be.lessThanOrEqual(parseInt(ethers.utils.formatUnits(await jet.totalShares(0), 0)))
       
        // Year 3
        await auroraToken.connect(user3).approve(jet.address, amounts[2])
        timeBefore = (await ethers.provider.getBlock("latest")).timestamp + 1
        console.log(totalShares, parseFloat(ethers.utils.formatEther(amounts[2])), totalAmountOfStakedAurora)
        const user3Shares = parseFloat(ethers.utils.formatEther(amounts[2])) * (totalShares/ totalAmountOfStakedAurora)
        await jet.connect(user3).stake(amounts[2])
        await network.provider.send("evm_increaseTime", [oneYear])
        await network.provider.send("evm_mine")
        await jet.connect(user3).updateUserCalculation()
        timeAfter = (await ethers.provider.getBlock("latest")).timestamp
        timeDiff = timeAfter - timeBefore
        let expectedRewardDuringThisPeriod = (
            ((parseInt(scheduleRewards[1]) - parseInt(scheduleRewards[2])) / 1e18) * (2 * oneDay) / oneYear +
            ((parseInt(scheduleRewards[2]) - parseInt(scheduleRewards[3])) / 1e18) * (timeDiff - 2 * oneDay) / oneYear
        )
        const expectedUser3Reward = expectedRewardDuringThisPeriod * user3Shares
        totalAmountOfStakedAurora += expectedRewardDuringThisPeriod 
        totalShares += user3Shares
        
        p.addRow({ 
            User_Address: user3.address,
            Operation: 'Staking',
            Amount:  ethers.utils.formatEther(amounts[2]),
            Year: '3', 
            Duration: timeDiff,
            Expected_Reward_For_This_User: expectedUser3Reward,
            Actual_Reward_For_This_User: parseFloat(ethers.utils.formatEther(await jet.connect(user3).getTotalUserReward())),
            Expected_Total_Reward: totalAmountOfStakedAurora,
            Actual_Total_Reward: parseFloat(ethers.utils.formatEther(await jet.totalAmountOfStakedAurora())),
            Expected_Total_Shares: totalShares,
            Actual_Total_Shares: parseFloat(ethers.utils.formatUnits(await jet.totalShares(0), 0)),
            Pending: ethers.utils.formatEther(await jet.getPending(user3.address, 0)),
            Total_Deposit: parseFloat(ethers.utils.formatEther(await jet.totalDeposit()))
        })

        p.printTable();
    })
    it('should stick to the total reward 200M Aurora tokens', async () => {
        let currentTime = (await ethers.provider.getBlock("latest")).timestamp
        const timeDiff = currentTime - startTime
        await jet.connect(stakingAdmin).deployStream(
            streamToken1.address,
            10,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        const amountStaked1 = ethers.utils.parseUnits("1000", 18)
        const amountStaked2 = ethers.utils.parseUnits("1000", 18)
        const amountStaked3 = ethers.utils.parseUnits("3000", 18)
        console.log('============= Year 1 ====================')
        await auroraToken.connect(user1).approve(jet.address, amountStaked1)
        await jet.connect(user1).stake(amountStaked1)
        // Year 1
        await auroraToken.connect(user2).approve(jet.address, amountStaked2)
        await jet.connect(user2).stake(amountStaked2)
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('============= Year 2 ====================')
        // Year 2
        await network.provider.send("evm_increaseTime", [oneYear - timeDiff]) // increase time for 20 days
        await network.provider.send("evm_mine")
        await auroraToken.connect(user3).approve(jet.address, amountStaked3)
        await jet.connect(user3).stake(amountStaked3)
        await jet.connect(user1).updateUserCalculation()
        console.log(ethers.utils.formatEther(await jet.connect(user1).getTotalUserReward()))
        // await jet.connect(user1).unstake(ethers.utils.parseUnits("500", 18))
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('============= Year 3 ====================')
        // Year 3
        await network.provider.send("evm_increaseTime", [oneYear]) // increase time for 20 days
        await network.provider.send("evm_mine")
        await auroraToken.connect(user3).approve(jet.address, amountStaked3)
        await jet.connect(user3).stake(amountStaked3)
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('============= Year 4 ====================')
        // Year 4
        await network.provider.send("evm_increaseTime", [0.5 * oneYear]) // increase time for 20 days
        await network.provider.send("evm_mine")
        await auroraToken.connect(user4).approve(jet.address, amountStaked3)
        await jet.connect(user4).stake(amountStaked3)
        await auroraToken.connect(user4).approve(jet.address, amountStaked3)
        await jet.connect(user4).stake(amountStaked3)
        await auroraToken.connect(user5).approve(jet.address, amountStaked3)
        await jet.connect(user5).stake(amountStaked3)
        await auroraToken.connect(user5).approve(jet.address, amountStaked3)
        await jet.connect(user5).stake(amountStaked3)
        await network.provider.send("evm_increaseTime", [0.5 * oneYear]) // increase time for 20 days
        await network.provider.send("evm_mine")
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('Total Shares: ', ethers.utils.formatUnits(await jet.totalShares(0), 0))
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
        console.log('------------ user 1 stakes 13 aurora tokens -------------')
        await auroraToken.connect(user1).approve(jet.address, ethers.utils.parseUnits("13", 18))
        await jet.connect(user1).stake(ethers.utils.parseUnits("13", 18))
        // await jet.connect(user1).updateUserCalculation()
        // await jet.connect(user2).updateUserCalculation()
        // await jet.connect(user3).updateUserCalculation()
        // console.log(
        //     'Calculated shares (User 1): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
        //     'Calculated shares (User 2): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
        //     'Calculated shares (User 3): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
        //     'Reward Per Share',
        //     ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        // )
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
        // await jet.connect(user1).updateUserCalculation()
        // await jet.connect(user2).updateUserCalculation()
        // await jet.connect(user3).updateUserCalculation()
        console.log(
            'Calculated Shares for User 2 in test:',
            parseFloat(ethers.utils.formatEther(amountStaked)) / parseFloat(ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))  * parseFloat(ethers.utils.formatEther(await jet.totalShares(0))),
        )
        // console.log(
        //     'Calculated shares (User 1): ',
        //     await jet.getAmountOfShares(user1.address, 0), 
        //     'Calculated shares (User 2): ',
        //     await jet.getAmountOfShares(user2.address, 0), 
        //     'Calculated shares (User 3): ',
        //     await jet.getAmountOfShares(user3.address, 0),
        //     'Reward Per Share',
        //     await jet.getRewardPerShare(0)
        // )
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
        // await jet.connect(user1).updateUserCalculation()
        // await jet.connect(user2).updateUserCalculation()
        // await jet.connect(user3).updateUserCalculation()
        // console.log(
        //     'Calculated shares (User 1): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
        //     'Calculated shares (User 2): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
        //     'Calculated shares (User 3): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
        //     'Reward Per Share',
        //     ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        // )
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('Total Shares: ', ethers.utils.formatUnits(await jet.totalShares(0), 9))
        console.log('------------ user 1 stakes 10 aurora tokens -------------')
        console.log('waiting for ', 20 * oneDay, ' seconds ......')
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        await auroraToken.connect(user1).approve(jet.address, amountStaked)
        await jet.connect(user1).stake(amountStaked)
        // await jet.connect(user1).updateUserCalculation()
        // await jet.connect(user2).updateUserCalculation()
        // await jet.connect(user3).updateUserCalculation()
        // console.log(
        //     'Calculated shares (User 1): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
        //     'Calculated shares (User 2): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
        //     'Calculated shares (User 3): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
        //     'Reward Per Share',
        //     ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        // )
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('Total Shares: ', ethers.utils.formatUnits(await jet.totalShares(0), 9))
        console.log('------------ user 2 unstake 2 aurora tokens -------------')
        console.log('waiting for ', 20 * oneDay, ' seconds ......')
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        
        await jet.connect(user2).unstake(ethers.utils.parseUnits("2", 18))
        // await jet.connect(user1).updateUserCalculation()
        // await jet.connect(user2).updateUserCalculation()
        // await jet.connect(user3).updateUserCalculation()
        // console.log(
        //     'Calculated shares (User 1): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
        //     'Calculated shares (User 2): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
        //     'Calculated shares (User 3): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
        //     'Reward Per Share',
        //     ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        // )
        console.log('Total Deposited Aurora: ', ethers.utils.formatEther(await jet.totalDeposit()))
        console.log('Total Staked Aurora: ', ethers.utils.formatEther(await jet.totalAmountOfStakedAurora()))
        console.log('Total Shares: ', ethers.utils.formatUnits(await jet.totalShares(0), 9))
        console.log('------------ user 3 stakes 10 aurora tokens -------------')
        await auroraToken.connect(user3).approve(jet.address, amountStaked)
        await jet.connect(user3).stake(amountStaked)
        await network.provider.send("evm_increaseTime", [366 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        console.log('waiting for ', 300 * oneDay , ' seconds ......')

        // await jet.connect(user1).updateUserCalculation()
        // await jet.connect(user2).updateUserCalculation()
        // await jet.connect(user3).updateUserCalculation()
        // console.log(
        //     'Calculated shares (User 1): ',
        //     await jet.getAmountOfShares(user1.address, 0), 
        //     'Calculated shares (User 2): ',
        //     await jet.getAmountOfShares(user2.address, 0), 
        //     'Calculated shares (User 3): ',
        //     await jet.getAmountOfShares(user3.address, 0),
        //     'Reward Per Share',
        //     await jet.getRewardPerShare(0)
        // )
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
        // await jet.connect(user1).updateUserCalculation()
        // await jet.connect(user2).updateUserCalculation()
        // await jet.connect(user3).updateUserCalculation()
        // console.log(
        //     'Calculated shares (User 1): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user1.address, 0), 9), 
        //     'Calculated shares (User 2): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user2.address, 0), 9), 
        //     'Calculated shares (User 3): ',
        //     ethers.utils.formatUnits(await jet.getAmountOfShares(user3.address, 0), 9),
        //     'Reward Per Share',
        //     ethers.utils.formatUnits(await jet.getRewardPerShare(0), 9)
        // )
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
        const rewardPerShare = ethers.utils.formatEther(await jet.getRewardPerShare(0))
        // console.log(parseFloat(rewardPerShare))
        const userShares = ethers.utils.formatEther(await jet.getAmountOfShares(user1.address, 0))
        await jet.connect(user1).updateUserCalculation()
        const totalAmountOfStakedAurora = ethers.utils.formatEther(await jet.totalAmountOfStakedAurora())
        const totalShares = ethers.utils.formatEther(await jet.totalShares(0))
        const expectedReward = (parseFloat(totalAmountOfStakedAurora) / parseFloat(totalShares))  * parseFloat(userShares) + 4 // 4 is the diff reward till calling unstake
        await jet.connect(user1).unstake(amountStaked)
        const pendingRelease = await jet.getPending(user1.address, 0)
        await network.provider.send("evm_increaseTime", [20 * oneDay]) // increase time for 20 days
        await network.provider.send("evm_mine")
        const tx = await jet.connect(user1).withdraw(0)
        const {amount, } = await getEventLogs(tx.hash, constants.eventsABI.released, 1)
        expect(parseInt(expectedReward.toString())).to.be.greaterThanOrEqual(parseInt(ethers.utils.formatEther(amount)))
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
        const expectedScheduleReward = scheduleRewards[0]/1e18
        console.log(expectedScheduleReward)
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
        expect(parseInt(ethers.utils.formatUnits(total))).to.be.greaterThanOrEqual(parseInt(expectedScheduledReward.toString()))
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