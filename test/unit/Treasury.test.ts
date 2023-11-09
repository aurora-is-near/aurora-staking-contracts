import { expect } from "chai";
import { ethers } from "hardhat";
import {deploySubProxy} from "../../scripts/middleware_utils"


describe("Treasury", function () {
    let admin: any
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
    let user6: any

    before(async () => {
        // deploys all the contracts
        [admin, newOwner, user1, user2, user3, user4, manager1, manager2, user5, user6] = await ethers.getSigners()
        const supply = ethers.utils.parseUnits("1000000000", 18)
        const Token = await ethers.getContractFactory("Token")
        const flags = 0
        auroraToken = await Token.connect(admin).deploy(supply, "AuroraToken", "AURORA")
        // random example for other reward token contracts
        streamToken1 = await Token.connect(user1).deploy(supply, "StreamToken1", "ST1")
        streamToken2 = await Token.connect(user2).deploy(supply, "StreamToken2", "ST2")

        const Treasury = await ethers.getContractFactory("Treasury")
        treasury = await deploySubProxy(
            Treasury, 
            [
                [
                    auroraToken.address,
                    streamToken1.address
                ],
                flags
            ]
        )
        await auroraToken.connect(admin).transfer(user1.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(admin).transfer(user2.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(admin).transfer(user3.address, ethers.utils.parseUnits("10000", 18))
        await auroraToken.connect(admin).transfer(user4.address, ethers.utils.parseUnits("10000", 18))
        // transfer 20% of the total supply to the treasury contract
        const twentyPercentOfAuroraTotalSupply = ethers.utils.parseUnits("200000000", 18)
        await auroraToken.connect(admin).transfer(treasury.address, twentyPercentOfAuroraTotalSupply)
    })

    it('should allow transfer ownership', async () => {
        const treasuryDefaultAdminRole = await treasury.DEFAULT_ADMIN_ROLE()
        await treasury.connect(admin).grantRole(treasuryDefaultAdminRole, newOwner.address)
        expect(await treasury.hasRole(treasuryDefaultAdminRole, newOwner.address)).to.be.eq(true)
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
        await treasury.connect(admin).addSupportedToken(streamToken2.address)
        expect(await treasury.isSupportedToken(streamToken2.address)).to.be.eq(true)
    })

    it('should allow only manager to remove supported token', async () => {
        expect(await treasury.isSupportedToken(streamToken2.address)).to.be.eq(true)
        await treasury.connect(admin).removeSupportedToken(streamToken2.address)
        expect(await treasury.isSupportedToken(streamToken2.address)).to.be.eq(false)
    })

    it('should allow only manager to add a new manager', async () => {
        const treasury_manager_role = await treasury.TREASURY_MANAGER_ROLE()
        await expect(treasury.connect(manager2).grantRole(treasury_manager_role, user2.address)).to.be.reverted
        await treasury.connect(newOwner).grantRole(treasury_manager_role, manager2.address)
        expect(await treasury.hasRole(treasury_manager_role, manager2.address)).to.be.eq(true)
    })

    it('should allow only manager to remove a manager', async () => {
        const treasury_manager_role = await treasury.TREASURY_MANAGER_ROLE()
        expect(treasury.connect(user2).revokeRole(treasury_manager_role, user1.address)).to.be.reverted
        await treasury.connect(newOwner).revokeRole(treasury_manager_role, manager2.address)
        expect(await treasury.hasRole(treasury_manager_role, manager2.address)).to.be.eq(false)
    })

    it('should allow default admin role to withdraw some aurora funds', async() => {
        const amount = ethers.utils.parseUnits("1000", 18)
        await treasury.connect(newOwner).payRewards(
            user6.address,
            auroraToken.address,
            amount
        )
        expect(await auroraToken.balanceOf(user6.address)).to.be.eq(amount)
    })
});
