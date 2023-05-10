import { expect } from "chai";
import { ethers, network, deployments, upgrades } from "hardhat";
import * as constants from './constants'
import { getEventLogs } from "./testHelper";
import assert from "assert";

describe("JetStakingV2", function () {
    let auroraOwner: any
    let stakingAdmin: any
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
    let startTime: any
    let streamManager: any
    
    before(async () => {
        // deploys all the contracts
        [auroraOwner, stakingAdmin, user1, user2, user3, user4, user5, spender, streamOwner, streamManager] = await ethers.getSigners()
        const Token = await ethers.getContract("Token")
        auroraToken = await ethers.getContractAt('Token', Token.address);
        treasury = await ethers.getContract('Treasury');
        console.log(`Treasury contract address: ${treasury.address}`);
        oneYear = 31556926
        tauPerStream = 10
        const JetStakingV1 = await ethers.getContract('JetStakingV1')
        const currentJet = await ethers.getContractAt('JetStakingV1', JetStakingV1.address);
        const schedule = await currentJet.getStreamSchedule(0);
        console.log(schedule[0][4].toNumber());
        startTime = schedule[0][4].toNumber() + 1;
        console.log(`JetStaking contract address ${JetStakingV1.address}`);
        const JetStakingV2 = await ethers.getContractFactory('JetStakingTestingV2');
        scheduleTimes = [
            startTime, 
            startTime + oneYear,
            startTime + 2 * oneYear, 
            startTime + 3 * oneYear, 
            startTime + 4 * oneYear
        ]
        scheduleRewards = [
            ethers.utils.parseUnits("100000", 18),
            ethers.utils.parseUnits("50000", 18),
            ethers.utils.parseUnits("25000", 18),
            ethers.utils.parseUnits("12500", 18),
            // Last amount should be 0 so scheduleTimes[4] marks the end of the stream schedule.
            ethers.utils.parseUnits("0", 18),  // 0
        ]
        // upgrade contract to V2
        jet = await upgrades.upgradeProxy(
            JetStakingV1.address,
            JetStakingV2
        );
    })

    it("should update the main aurora stream", async () => {
        const streamId = 0 // Aurora stream
        // pause contract
        await jet.connect(auroraOwner).adminPause(1)
        // approve rewards to the staking contract
        const balance = await auroraToken.connect(auroraOwner).balanceOf(auroraOwner.address);
        expect(balance).to.be.gt(scheduleRewards[0]);
        await auroraToken.connect(auroraOwner).approve(jet.address, scheduleRewards[0]);
        await jet.connect(auroraOwner).extendAuroraStreamSchedule(scheduleTimes, scheduleRewards);
        const streamSchedule = await jet.getStreamSchedule(streamId);
        console.log(
            "scheduleTimes: ",
            JSON.stringify(streamSchedule.scheduleTimes.map((time: number) => new Date(time * 1000).toUTCString()))
        );
        console.log(
            "scheduleRewards: ",
            JSON.stringify(streamSchedule.scheduleRewards.map((amount: { toString: () => any; }) => amount.toString()))
        )
    })
});
