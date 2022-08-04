import { expect, use } from "chai";
import { ethers, network, deployments, upgrades } from "hardhat";
import * as constants from './constants'
import { getEventLogs } from "./testHelper";

describe("LockedStaking", function () {
    let auroraOwner: any
    let stakingAdmin: any
    let streamToken1: any
    let streamToken2: any
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
    let stakingFactory: any
    let auroraToken: any
    
    before(async () => {
        // deploys all the contracts
        [auroraOwner, stakingAdmin, user1, user2, user3, user4, user5, spender, streamOwner, streamManager] = await ethers.getSigners()
        const jetStakingV1 = await ethers.getContract("JetStakingV1")
        const LockedStakingTemplate =  await ethers.getContractFactory('LockedStakingSubAccountImplementation')
        oneDay = 86400
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 10
        auroraToken = await ethers.getContract("Token")
        const extraInitParameters = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256"], 
            [
                auroraToken.address,
                ethers.utils.parseUnits("1", 18), // 1 AURORA
                oneDay
            ]
        )

        // Deploy Locked Staking Template
        const lockedStakingTemplate = await upgrades.deployProxy(
            LockedStakingTemplate,
            [
                jetStakingV1.address,
                auroraOwner.address,
                true,
                extraInitParameters
            ],
            {
                initializer: "initialize",
                kind : "uups",
            },
        )
        console.log(`Deploy LockedStakingSubAccountImpalementation template @ ${lockedStakingTemplate.address}`)
        await new Promise(f => setTimeout(f, 3000))
        const StakingFactory = await ethers.getContractFactory('StakingStrategyFactory')
        stakingFactory = await upgrades.deployProxy(
            StakingFactory,
            [
                lockedStakingTemplate.address,
                jetStakingV1.address,
                auroraToken.address,
                0
            ],
            {
                initializer: "initialize",
                kind : "uups",
            },
        )
        await stakingFactory.deployed()
        console.log(`Deploy Staking Strategy Factory @ ${stakingFactory.address}`)
    })

    it('should test multiple stakers reward calculation', async () => {
        const amount = ethers.utils.parseUnits("1", 18)
        const extraInitParameters = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256"], 
            [
                auroraToken.address,
                amount,
                oneDay
            ]
        )
        await auroraToken.connect(auroraOwner).approve(
            stakingFactory.address, 
            amount
        )
        console.log(`balance of aurora owner is: ${
            ethers.utils.formatEther(
                await auroraToken.balanceOf(auroraOwner.address)
            )}`
        )
        // console.log(stakingFactory)
        // console.log(stakingFactory)
        // const tx = await stakingFactory.connect(user1).emitMyEvent()
        const tx = await stakingFactory.connect(auroraOwner).cloneTemplate(
            0, // template id
            amount,
            extraInitParameters
        )
        const { instance, owner } = await getEventLogs(tx.hash, constants.eventsABI.templateCloned, 0)
        console.log(instance, owner)
        // const {streamId, owner, } = await getEventLogs(tx.hash, constants.eventsABI.streamProposed, 0)
        // // console.log(streamId, owner)
        // expect(owner).to.be.eq(user1.address)
        // expect(streamId.toNumber()).to.be.eq(id)
    })
})


// import { expect, use } from "chai";
// import { ethers, network, deployments, upgrades } from "hardhat";
// import * as constants from './constants'
// import { getEventLogs } from "./testHelper";



// describe("StakingStrategyFactory", function () {
//     let auroraOwner: any
//     let stakingAdmin: any
//     let streamToken1: any
//     let streamToken2: any
//     let auroraToken: any
//     let user1: any
//     let user2: any
//     let user3: any
//     let user4: any
//     let user5: any
//     let spender: any
//     let streamOwner: any
//     let treasury: any
//     let jet: any
//     let oneYear: number
//     let tauPerStream: number
//     let scheduleTimes: any
//     let scheduleRewards: any
//     let oneDay: any
//     let startTime: any
//     let treasuryAdmin: any
//     let streamManager: any
//     let stakingFactory: any
//     let lockedStakingTemplate: any

//     before(async () => {
//         // deploys all the contracts
//         [auroraOwner, stakingAdmin, user1, user2, user3, user4, user5, spender, streamOwner, streamManager] = await ethers.getSigners()
//         const supply = ethers.utils.parseUnits("10000000000", 18)
//         oneDay = 86400
//         const Token = await ethers.getContractFactory("Token")
//         auroraToken = await Token.connect(auroraOwner).deploy(supply, "AuroraToken", "AURORA")
//         // random example for other reward token contracts
//         streamToken1 = await Token.connect(user1).deploy(supply, "StreamToken1", "ST1")
//         streamToken2 = await Token.connect(user2).deploy(supply, "StreamToken2", "ST2")
//         const flags = 0
//         const Treasury = await ethers.getContractFactory("Treasury")
//         treasury = await upgrades.deployProxy(
//             Treasury, 
//             [
//                 [
//                     auroraToken.address,
//                     streamToken1.address,
//                     streamToken2.address
//                 ],
//                 flags
//             ],
//             {
//                 initializer: "initialize",
//                 kind : "uups",
//             },
//         )

//         oneYear = 31556926
//         tauPerStream = 10

//         startTime = (await ethers.provider.getBlock("latest")).timestamp + 10
//         const JetStakingV1 = await ethers.getContractFactory('JetStakingTesting')
//         const minWeight = 256
//         const maxWeight = 1024
//         scheduleTimes = [
//             startTime, 
//             startTime + oneYear, 
//             startTime + 2 * oneYear, 
//             startTime + 3 * oneYear, 
//             startTime + 4 * oneYear
//         ]
//         scheduleRewards = [
//             ethers.utils.parseUnits("200000000", 18), // 100M
//             ethers.utils.parseUnits("100000000", 18), // 50M 
//             ethers.utils.parseUnits("50000000", 18),  // 25M
//             ethers.utils.parseUnits("25000000", 18),  // 25M
//             // Last amount should be 0 so scheduleTimes[4] marks the end of the stream schedule.
//             ethers.utils.parseUnits("0", 18),  // 0
//         ]
//         jet = await upgrades.deployProxy(
//             JetStakingV1,
//             [
//                 auroraToken.address,
//                 auroraOwner.address, // aurora stream owner
//                 scheduleTimes,
//                 scheduleRewards,
//                 tauPerStream,
//                 flags,
//                 treasury.address,
//                 maxWeight,
//                 minWeight
//             ],
//             {
//                 initializer: "initialize",
//                 kind : "uups",
//             },
//         )
//         const claimRole = await jet.CLAIM_ROLE()
//         const airdropRole = await jet.AIRDROP_ROLE()
//         const pauseRole = await jet.PAUSE_ROLE()
//         const defaultAdminRole = await jet.DEFAULT_ADMIN_ROLE()
//         const streamManagerRole = await jet.STREAM_MANAGER_ROLE()
//         const deployer = auroraOwner
//         expect(await jet.hasRole(claimRole, stakingAdmin.address)).to.be.eq(false)
//         expect(await jet.hasRole(airdropRole, stakingAdmin.address)).to.be.eq(false)
//         expect(await jet.hasRole(pauseRole, stakingAdmin.address)).to.be.eq(false)
//         expect(await jet.hasRole(defaultAdminRole, stakingAdmin.address)).to.be.eq(false)
//         await jet.connect(deployer).grantRole(claimRole, stakingAdmin.address)
//         await jet.connect(deployer).grantRole(airdropRole, stakingAdmin.address)
//         await jet.connect(deployer).grantRole(airdropRole, user1.address)
//         await jet.connect(deployer).grantRole(pauseRole, stakingAdmin.address)
//         await jet.connect(deployer).grantRole(streamManagerRole, streamManager.address)
//         await jet.connect(deployer).grantRole(defaultAdminRole, stakingAdmin.address)
        
//         expect(await jet.hasRole(claimRole, stakingAdmin.address)).to.be.eq(true)
//         expect(await jet.hasRole(airdropRole, stakingAdmin.address)).to.be.eq(true)
//         expect(await jet.hasRole(pauseRole, stakingAdmin.address)).to.be.eq(true)
//         expect(await jet.hasRole(defaultAdminRole, stakingAdmin.address)).to.be.eq(true)
//         expect(await jet.hasRole(streamManagerRole, streamManager.address)).to.be.eq(true)
//         const LockedStakingTemplate =  await ethers.getContractFactory('LockedStakingSubAccountImplementation')
//         const extraInitParameters = ethers.utils.defaultAbiCoder.encode(
//             ["address", "uint256", "uint256"], 
//             [
//                 streamToken1.address,
//                 ethers.utils.parseUnits("1", 18),
//                 startTime + oneYear
//             ]
//         )
//         lockedStakingTemplate = await upgrades.deployProxy(
//             LockedStakingTemplate,
//             [
//                 jet.address,
//                 stakingAdmin.address,
//                 true,
//                 extraInitParameters
//             ],
//             {
//                 initializer: "initialize",
//                 kind : "uups",
//             },
//         )
//         const StakingFactory = await ethers.getContractFactory('StakingStrategyFactory')
//         stakingFactory = await upgrades.deployProxy(
//             StakingFactory,
//             [
//                 lockedStakingTemplate.address,
//                 jet.address,
//                 auroraToken.address,
//                 0
//             ],
//             {
//                 initializer: "initialize",
//                 kind : "uups",
//             },
//         )
//         await auroraToken.connect(auroraOwner).transfer(user1.address, ethers.utils.parseUnits("10000", 18))
//         await auroraToken.connect(auroraOwner).transfer(user2.address, ethers.utils.parseUnits("10000", 18))
//         await auroraToken.connect(auroraOwner).transfer(user3.address, ethers.utils.parseUnits("10000", 18))
//         await auroraToken.connect(auroraOwner).transfer(user4.address, ethers.utils.parseUnits("10000", 18))
//         await auroraToken.connect(auroraOwner).transfer(stakingAdmin.address, ethers.utils.parseUnits("100000000", 18))
//         await auroraToken.connect(auroraOwner).transfer(streamManager.address, ethers.utils.parseUnits("100000000", 18))
//         // console.log(balanceOfAurorOwner)
//         // transfer 20% of the total supply to the treasury contract
//         const twentyPercentOfAuroraTotalSupply = ethers.utils.parseUnits("200000000", 18)
//         // const onePercentOfTokenSupply = ethers.utils.parseUnits("1000000", 18)
//         await auroraToken.connect(auroraOwner).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)
//         const balanceOfAurorOwner = await auroraToken.balanceOf(auroraOwner.address)
//         await auroraToken.connect(auroraOwner).transfer(user5.address, balanceOfAurorOwner)
//         // transfer ownership of the treasury to the jet staking contract
//         // const defaultAdminRole = await jet.DEFAULT_ADMIN_ROLE()
//         await treasury.connect(auroraOwner).grantRole(defaultAdminRole, jet.address)
//     })

//     beforeEach(async () => {        
//         await deployments.fixture()
//         // fund users wallet
//         // await auroraToken.connect(auroraOwner).transfer(user1.address, ethers.utils.parseUnits("10000", 18))
//         // await auroraToken.connect(auroraOwner).transfer(user2.address, ethers.utils.parseUnits("10000", 18))
//         // await auroraToken.connect(auroraOwner).transfer(user3.address, ethers.utils.parseUnits("10000", 18))
//         // await auroraToken.connect(auroraOwner).transfer(user4.address, ethers.utils.parseUnits("10000", 18))
//         // await auroraToken.connect(auroraOwner).transfer(stakingAdmin.address, ethers.utils.parseUnits("100000000", 18))
//         // await auroraToken.connect(auroraOwner).transfer(streamManager.address, ethers.utils.parseUnits("100000000", 18))
//         // // console.log(balanceOfAurorOwner)
//         // // transfer 20% of the total supply to the treasury contract
//         // const twentyPercentOfAuroraTotalSupply = ethers.utils.parseUnits("200000000", 18)
//         // // const onePercentOfTokenSupply = ethers.utils.parseUnits("1000000", 18)
//         // await auroraToken.connect(auroraOwner).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)
//         // const balanceOfAurorOwner = await auroraToken.balanceOf(auroraOwner.address)
//         // await auroraToken.connect(auroraOwner).transfer(user5.address, balanceOfAurorOwner)
//         // // transfer ownership of the treasury to the jet staking contract
//         // const defaultAdminRole = await jet.DEFAULT_ADMIN_ROLE()
//         // await treasury.connect(auroraOwner).grantRole(defaultAdminRole, jet.address)
//     })

//     it("should default admin create new clone", async () => {
//         const amount = ethers.utils.parseUnits("1", 18)
//         const extraInitParameters = ethers.utils.defaultAbiCoder.encode(
//             ["address", "uint256", "uint256"], 
//             [
//                 streamToken1.address,
//                 amount,
//                 startTime + oneYear
//             ]
//         )
//         await auroraToken.approve(
//             stakingFactory.address, 
//             amount
//         )
//         // console.log(stakingFactory)
//         const tx = await stakingFactory.connect(user1).emitMyEvent()
//         await tx.wait()
//         // const tx = await stakingFactory.cloneTemplate(
//         //     0, // template id
//         //     amount,
//         //     extraInitParameters
//         // )
//         const { instance, owner } = await getEventLogs(tx.hash, constants.eventsABI.cloned, 1)
//         console.log(instance, owner)
//         // const {streamId, owner, } = await getEventLogs(tx.hash, constants.eventsABI.streamProposed, 0)
//         // // console.log(streamId, owner)
//         // expect(owner).to.be.eq(user1.address)
//         // expect(streamId.toNumber()).to.be.eq(id)
//     })
// })