import { expect, use } from "chai";
import { ethers, network, deployments, upgrades } from "hardhat";
import * as constants from './constants'
import { getEventLogs } from "./testHelper";

describe("Treasury", function () {
    let auroraOwner: any
    let newOwner: any
    let streamToken1: any
    let streamToken2: any
    let auroraToken: any
    let user1: any
    let user2: any
    let user3: any
    let user4: any
    let user5: any
    let manager1: any
    let manager2: any
    let treasury: any

    before(async () => {
        // deploys all the contracts
        [auroraOwner, newOwner, user1, user2, user3, user4, manager1, manager2, user5] = await ethers.getSigners()
        const supply = ethers.utils.parseUnits("1000000000", 18)
        const Token = await ethers.getContractFactory("Token")
        auroraToken = await Token.connect(auroraOwner).deploy(supply, "AuroraToken", "AURORA")
        // random example for other reward token contracts
        streamToken1 = await Token.connect(user1).deploy(supply, "StreamToken1", "ST1")
        streamToken2 = await Token.connect(user2).deploy(supply, "StreamToken2", "ST2")

        const Treasury = await ethers.getContractFactory("Treasury")
        treasury = await upgrades.deployProxy(
            Treasury, 
            [
                [manager1.address],
                [
                    auroraToken.address,
                    streamToken1.address
                ]
            ]
        )
        await auroraToken.connect(auroraOwner).transfer(user1.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user2.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user3.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(auroraOwner).transfer(user4.address, ethers.utils.parseUnits("10000", 18))
        // transfer 20% of the total supply to the treasury contract
        const twentyPercentOfAuroraTotalSupply = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(auroraOwner).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)
    })

    it('should allow transfer ownership', async () => {
        await treasury.connect(auroraOwner).transferOwnership(newOwner.address)
        expect(await treasury.owner()).to.be.eq(newOwner.address)
    })

    it('should only manager approve tokens to', async () => {
        await treasury.connect(manager1).approveTokensTo(
            [
                auroraToken.address,
                streamToken1.address
            ],
            [
                ethers.utils.parseUnits("100000", 18),
                ethers.utils.parseUnits("100000", 18)
            ],
            treasury.address
        )
    })

    it("should allow only owner pay rewards", async () => {
       await treasury.connect(newOwner).payRewards(
            user5.address,
            auroraToken.address,
            ethers.utils.parseUnits("10", 18)
        )
        expect(
            await auroraToken.balanceOf(user5.address)
        ).to.be.eq(ethers.utils.parseUnits("10", 18))
    }) 
    
    it('should allow only manager add supported token', async () => {
        await treasury.connect(manager1).addSupportedToken(streamToken2.address)
        expect(await treasury.isSupportedToken(streamToken2.address)).to.be.eq(true)
    })

    it('should allow only manager to remove supported token', async () => {
        expect(await treasury.isSupportedToken(streamToken2.address)).to.be.eq(true)
        await treasury.connect(manager1).removeSupportedToken(streamToken2.address)
        expect(await treasury.isSupportedToken(streamToken2.address)).to.be.eq(false)
    })

    it('should allow only manager to add a new manager', async () => {
        expect(treasury.connect(manager2).addManager(user2.address)).to.be.revertedWith("Sender is not a manager")
        await treasury.connect(manager1).addManager(manager2.address)
        expect(await treasury.isManager(manager2.address)).to.be.eq(true)
    })

    it('should allow only manager to remove a manager', async () => {
        expect(treasury.connect(user2).removeManager(user1.address)).to.be.reverted
        await treasury.connect(manager1).removeManager(manager2.address)
        expect(await treasury.isManager(manager2.address)).to.be.eq(false)
    })
});