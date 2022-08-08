import { expect, use } from "chai";
import { ethers, network, deployments, upgrades } from "hardhat";
import * as constants from './constants'
import { getEventLogs } from "./testHelper";

describe("LockedStaking", function () {
    let auroraOwner: any
    let stakingAdmin: any
    let user1: any
    let user2: any
    let user3: any
    let user4: any
    let user5: any
    let spender: any
    let streamOwner: any
    let oneDay: any
    let stakingFactory: any
    let auroraToken: any
    let LockedStakingTemplate: any
    let startTime: any
    let jetStakingV1: any
    
    before(async () => {
        // deploys all the contracts
        [auroraOwner, stakingAdmin, user1, user2, user3, user4, user5, spender, streamOwner] = await ethers.getSigners()
        jetStakingV1 = await ethers.getContract("JetStakingV1")
        LockedStakingTemplate =  await ethers.getContractFactory('LockedStakingSubAccountImplementation')
        oneDay = 86400
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 10
        auroraToken = await ethers.getContract("Token")
        // const amount = ethers.utils.parseUnits("1", 18) // 1 AURORA
        // const extraInitParameters = ethers.utils.defaultAbiCoder.encode(
        //     ["address", "uint256"], 
        //     [
        //         auroraToken.address,
        //         oneDay
        //     ]
        // )

        // Deploy Locked Staking Template
        const lockedStakingTemplate = await LockedStakingTemplate.deploy()
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
    })

    it('should allow anyone to deploy a new locked staking instance', async () => {
        const amount = ethers.utils.parseUnits("1", 18)
        const extraInitParameters = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256"], 
            [
                auroraToken.address,
                oneDay
            ]
        )
        console.log(
            await auroraToken.balanceOf(auroraOwner.address),
            await auroraToken.allowance(auroraOwner.address, stakingFactory.address)
        )
        await auroraToken.connect(auroraOwner).approve(
            stakingFactory.address,
            amount
        )
        console.log(
            await auroraToken.allowance(auroraOwner.address, stakingFactory.address)
        )

        const tx = await stakingFactory.connect(auroraOwner).cloneTemplate(
            0, // template id
            amount,
            extraInitParameters
        )
        const { instance, owner } = await getEventLogs(tx.hash, constants.eventsABI.templateCloned, 0)
        expect(owner).to.be.eq(auroraOwner.address)
        const lockedStakingSubAccount = await ethers.getContractAt('LockedStakingSubAccountImplementation',instance)
        expect(
            await lockedStakingSubAccount.stakingContract()
        ).to.eq(jetStakingV1.address)
    })
})
