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
        oneYear = 31536000
        tauPerStream = 1000

        let startTime = (await ethers.provider.getBlock("latest")).timestamp
        const JetStakingV1 = await ethers.getContractFactory('JetStakingV1')
        scheduleTimes = [startTime, startTime + oneYear, startTime + 2 * oneYear, startTime + 3 * oneYear, startTime + 4 * oneYear]
        scheduleRewards = [0, 100, 50, 25, 25]
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
        const {stream, index, } = await getEventLogs(tx.hash, constants.eventsABI.streamAdded, 0)
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
});