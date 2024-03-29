import { expect } from "chai";
import { ethers, network, deployments, upgrades } from "hardhat";

describe("JetStakingV3UpgradeWithMultiSig", function () {
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
    let snapshot: any
    
    before(async () => {
        // reset any previouse deployments
        await reset();
        // deploys all the contracts
        [auroraOwner, stakingAdmin, user1, user2, user3, user4, user5, spender, streamOwner, streamManager] = await ethers.getSigners()
        const supply = ethers.utils.parseUnits("10000000000", 18)
        oneDay = 86400
        const Token = await ethers.getContractFactory("Token")
        auroraToken = await Token.connect(auroraOwner).deploy(supply, "AuroraToken", "AURORA")
        // random example for other reward token contracts
        streamToken1 = await Token.connect(user1).deploy(supply, "StreamToken1", "ST1")
        streamToken2 = await Token.connect(user2).deploy(supply, "StreamToken2", "ST2")
        const streams = [
            await Token.connect(user1).deploy(supply, "StreamToken3", "ST3"),
            await Token.connect(user1).deploy(supply, "StreamToken4", "ST4"),
            await Token.connect(user1).deploy(supply, "StreamToken5", "ST5"),
            await Token.connect(user1).deploy(supply, "StreamToken6", "ST6"),
            await Token.connect(user1).deploy(supply, "StreamToken7", "ST7")
        ]
        const flags = 0
        const Treasury = await ethers.getContractFactory("Treasury")
        treasury = await upgrades.deployProxy(
            Treasury, 
            [
                [
                    auroraToken.address,
                    streamToken1.address,
                    streamToken2.address,
                    streams[0].address,
                    streams[1].address,
                    streams[2].address,
                    streams[3].address,
                    streams[4].address,
                ],
                flags
            ]
        )

        oneYear = 31556926
        tauPerStream = 10

        startTime = (await ethers.provider.getBlock("latest")).timestamp + 10
        const JetStakingV1 = await ethers.getContractFactory('JetStakingTestingV1')
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

        // create new 5 streams (before upgrading to V3).
        const auroraProposalAmountForAStream = 0
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000000", 18)
        for(let i = 0; i < 5; i++) {
            let id = i + 1;
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
                streams[i].address,
                auroraProposalAmountForAStream,
                maxRewardProposalAmountForAStream,
                minRewardProposalAmountForAStream,
                scheduleTimes,
                scheduleRewards,
                tauPerStream
            )
            await streams[i].connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
            await jet.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        }
    })

    beforeEach(async () => {        
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
        await auroraToken.connect(auroraOwner).transfer(user5.address, balanceOfAurorOwner.sub(ethers.utils.parseUnits("1000000", 18)))
        // transfer ownership of the treasury to the jet staking contract
        const defaultAdminRole = await jet.DEFAULT_ADMIN_ROLE()
        await treasury.connect(auroraOwner).grantRole(defaultAdminRole, jet.address)

        // multiple users stake before the upgrade
        const id = await jet.getStreamsCount()
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
        await network.provider.send("evm_setAutomine", [true])
    })

    async function reset() {
        await network.provider.request({
          method: 'evm_revert',
          params: ["0x7"] // snapshot is global
        });
    }

    it("should do upgrade from V1 to V2, then to V3, propose new stream and check rewards calculation", async() => {
        // upgrade V1 to V2 by deploying the implementation contract first.
        const { deploy } = deployments;
        // deploy V2 implementation
        const jetv2 = await deploy('JetStakingTestingV2', {
            from: auroraOwner.address,
            args: [],
            log: true,
        });
        // upgrade the contract to V2
        await jet.connect(auroraOwner).upgradeTo(
            jetv2.address
        );
        // get contract with ABI and the proxy address
        const jetV2 = await ethers.getContractAt('JetStakingV2', jet.address);
        const schedule = await jetV2.getStreamSchedule(0);
        // update the schedule
        startTime = schedule[0][4].toNumber();
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
        // pause contract
        await jetV2.connect(auroraOwner).adminPause(1)
        // approve rewards to the staking contract
        const balance = await auroraToken.connect(auroraOwner).balanceOf(auroraOwner.address);
        expect(balance).to.be.gt(scheduleRewards[0]);
        await auroraToken.connect(auroraOwner).approve(jetV2.address, scheduleRewards[0]);
        await jetV2.connect(auroraOwner).extendAuroraStreamSchedule(scheduleTimes, scheduleRewards);
        // unpause the contract
        await jetV2.connect(auroraOwner).adminPause(0)
        // users stakes some aurora tokens.
        const amount1 = ethers.utils.parseUnits("1000", 18)
        // await auroraToken.connect(user1).approve(jetV2.address, amount1)
        // await jetV2.connect(user1).stake(amount1)

        // upgrade the contract to v3
        // deploy V3
        const jetv3 = await deploy('JetStakingTestingV3', {
            from: auroraOwner.address,
            args: [],
            log: true,
        });
        
        // pause the contract
        await jet.connect(auroraOwner).adminPause(1);
        // upgrade the contract to V3
        await jet.connect(auroraOwner).upgradeTo(
            jetv3.address
        );
        const jetV3 = await ethers.getContractAt('JetStakingV3', jet.address);
        // unpause the contract
        await jet.connect(auroraOwner).adminPause(0);
        // propose and create new stream 
        const auroraProposalAmountForAStream = 0
        const maxRewardProposalAmountForAStream = ethers.utils.parseUnits("200000", 18)
        const minRewardProposalAmountForAStream = ethers.utils.parseUnits("100000", 18)
        await auroraToken.connect(streamManager).approve(jet.address, auroraProposalAmountForAStream)
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 100
        scheduleRewards = [
            ethers.utils.parseUnits("200000", 18),
            ethers.utils.parseUnits("100000", 18), 
            ethers.utils.parseUnits("50000", 18),
            ethers.utils.parseUnits("25000", 18),
            ethers.utils.parseUnits("0", 18),
        ]
        scheduleTimes = [
            startTime,
            startTime + oneYear,
            startTime + 2 * oneYear,
            startTime + 3 * oneYear,
            startTime + 4 * oneYear
        ]
        await jetV3.connect(streamManager).proposeStream(
            user1.address,
            streamToken1.address,
            auroraProposalAmountForAStream,
            maxRewardProposalAmountForAStream,
            minRewardProposalAmountForAStream,
            scheduleTimes,
            scheduleRewards,
            tauPerStream
        )
        const id = await jetV3.getStreamsCount() - 1;
        await streamToken1.connect(user1).approve(jet.address, maxRewardProposalAmountForAStream)
        await jetV3.connect(user1).createStream(id, maxRewardProposalAmountForAStream)
        await auroraToken.connect(user3).approve(jetV2.address, amount1)
        const start = (await ethers.provider.getBlock("latest")).timestamp + 1
        await jetV2.connect(user3).stake(amount1)
        await network.provider.send("evm_mine", [startTime + oneDay * 30])
        const userRPS = await jetV2.getRewardPerShareForUser(id, user3.address)
        const latestRPS = await jetV2.getLatestRewardPerShare(id)
        let userShares = await jetV2.getAmountOfShares(0, user3.address)
        const expectedClaimableAmount = (latestRPS.sub(userRPS)).mul(userShares).div("1" + "0".repeat(31))
        expect(await jetV3.getStreamClaimableAmount(id, user3.address)).to.be.eq(expectedClaimableAmount)
        const end = (await ethers.provider.getBlock("latest")).timestamp + 1
        await jetV3.connect(user3).moveRewardsToPending(id)
        userShares = await jetV3.getAmountOfShares(0, user3.address);
        const totalShares = await jetV3.totalAuroraShares();
        const pending = (((scheduleRewards[0] - scheduleRewards[1])/ 1e18) * (end - start) / oneYear) * userShares/ totalShares;
        expect(parseInt(ethers.utils.formatEther(await jetV2.getPending(id, user1.address)))).to.be.eq(
            parseInt(pending.toString())
        )
    })
});
