import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("JetStakingV1Upgrade", function () {
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
    let jetv2: any

    beforeEach(async () => {
        // deploys all the contracts
        [auroraOwner, stakingAdmin, user1, user2, user3, user4, user5, spender, streamOwner] = await ethers.getSigners()
        const supply = ethers.utils.parseUnits("1000000000", 18)
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
        await treasury.deployed();

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
        await jet.deployed();
        await jet.transferOwnership(stakingAdmin.address)        
        // fund users wallet
        await auroraToken.connect(auroraOwner).transfer(user1.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user2.address, ethers.utils.parseUnits("10000", 18))
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
        
    })

    it('should test JetStakingV1 change function signature', async() => {
        const JetStakingV1ChangeFunctionSignature = await ethers.getContractFactory('JetStakingV1ChangeFunctionSignature')
        jetv2 = await upgrades.upgradeProxy(
            jet.address,
            JetStakingV1ChangeFunctionSignature
        )
        const amount = ethers.utils.parseUnits("5", 18)
        const batchAmount = ethers.utils.parseUnits("10", 18)
        await auroraToken.connect(auroraOwner).mint(auroraOwner.address, batchAmount)
        await auroraToken.connect(auroraOwner).approve(jet.address, batchAmount)
        await jetv2.connect(auroraOwner)["batchStakeOnBehalfOfOtherUsers(address[],uint256[],uint256,bool)"](
            [
                user1.address,
                user2.address
            ],
            [
                amount,
                amount
            ],
            batchAmount,
            false
        )
        expect(amount).to.be.eq(
            await jetv2.getUserTotalDeposit(user1.address)
        )
        expect(amount).to.be.eq(
            await jetv2.getUserTotalDeposit(user2.address)
        )
    })
    it('should test JetStakingV1 change in storage', async() => {
        const JetStakingV1ChangeInStorage = await ethers.getContractFactory('JetStakingV1ChangeInStorage')
        jetv2 = await upgrades.upgradeProxy(
            jet.address,
            JetStakingV1ChangeInStorage
        )
        expect(await jetv2.storageVar()).to.be.eq(0)
    })
    it('should test JetStakingV1 change in storage and logic', async() => {
        const JetStakingV1ChangeInStorageAndLogic = await ethers.getContractFactory('JetStakingV1ChangeInStorageAndLogic')
        jetv2 = await upgrades.upgradeProxy(
            jet.address,
            JetStakingV1ChangeInStorageAndLogic,
            {
                call:{ fn: "updateStorageVar(uint256)", args: [1] }
            }
        )
        expect(await jetv2.storageVar()).to.be.eq(1)
        await jetv2.connect(auroraOwner).updateStorageVar(3)
        expect(await jetv2.storageVar()).to.be.eq(3)
    })
    it('should test JetStakingV1 extra functionality', async() => {
        const JetStakingV1ExtraFunctionality = await ethers.getContractFactory('JetStakingV1ExtraFunctionality')
        jetv2 = await upgrades.upgradeProxy(
            jet.address,
            JetStakingV1ExtraFunctionality
        )
        expect(await jetv2.dummy()).to.be.eq(1)
    })
})
