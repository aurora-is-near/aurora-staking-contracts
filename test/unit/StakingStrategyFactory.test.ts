import { expect, use } from "chai";
import { ethers, network, deployments, upgrades } from "hardhat";
import * as constants from './constants'
import { getEventLogs } from "./testHelper";

describe("LockedStaking", function () {
    let auroraOwner: any
    let user1: any
    let oneDay: any
    let stakingFactory: any
    let auroraToken: any
    let LockedStakingTemplate: any
    let startTime: any
    let jetStakingV1: any
    
    before(async () => {
        // deploys all the contracts
        [auroraOwner, user1] = await ethers.getSigners()
        jetStakingV1 = await ethers.getContract("JetStakingV1")
        LockedStakingTemplate =  await ethers.getContractFactory('LockedStakingSubAccountImplementation')
        oneDay = 86400
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 10
        auroraToken = await ethers.getContract("Token")

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
        const voteToken = auroraToken // random vote token
        const extraInitParameters = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256"], 
            [
                voteToken.address,
                oneDay
            ]
        )
        await auroraToken.connect(auroraOwner).approve(
            stakingFactory.address,
            amount
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
        expect(
            await stakingFactory.clonesCount()
        ).to.be.eq(1)
        const templatesCount = await stakingFactory.getTemplatesCount()
        expect(
            await stakingFactory.getUserClones(owner)
        ).to.deep.eq(
            [
                [
                    ethers.BigNumber.from(templatesCount.toNumber() - 1),
                    instance
                ]
            ]
        )
    })
    it('should only default admin role add new templates', async () => {
        const NewTemplate =  await ethers.getContractFactory('LockedStakingSubAccountImplementation')
        // Deploy the template
        const templateId = await stakingFactory.getTemplatesCount()
        const newTemplate = await NewTemplate.deploy()
        await stakingFactory.connect(auroraOwner).addTemplate(newTemplate.address)
        expect(
            newTemplate.address
        ).be.eq(
            await stakingFactory.templates(templateId)
        )
        await expect(
            stakingFactory.connect(user1).addTemplate(newTemplate.address)
        ).to.be.reverted
    })
})
