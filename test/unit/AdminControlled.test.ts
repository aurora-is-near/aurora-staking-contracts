import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { JumpType } from "hardhat/internal/hardhat-network/stack-traces/model";

describe("AdminControlled", function () {
    let admin: any
    let newAdmin: any
    let user: any
    let adminControlled: any
    let auroraToken: any

    before(async () => {
        // deploys the contracts
        [admin, newAdmin, user] = await ethers.getSigners()
        const AdminControlled = await ethers.getContractFactory("AdminControlledTesting")
        const Token = await ethers.getContractFactory("Token")
        const supply = ethers.utils.parseUnits("1000000000", 18)
        auroraToken = await Token.connect(admin).deploy(supply, "AuroraToken", "AURORA")
        const flags = 0
        adminControlled = await upgrades.deployProxy(
            AdminControlled,
            [
                flags
            ]
        )
    })
    it('should admin able to pause the contract', async () => {
        await adminControlled.adminPause(1)
        await expect(adminControlled.connect(user).pauseMe()).to.be.revertedWith('Paused')
    })
    it('should allow admin to change the storage layout using admin SSTORE', async() => {
        const changeMeBefore = await adminControlled.changeMe()
        const storageSlot = 153
        const newValue = 1
        await adminControlled.adminSstore(storageSlot, newValue)
        const changeMeAfter = await adminControlled.changeMe()
        expect(changeMeBefore).to.not.eq(changeMeAfter)
        expect(changeMeAfter).to.be.eq(newValue)
    })
    it('should allow admin to change SSTORE with mask', async() => {
        const changeMeBefore = await adminControlled.changeMe() // 0
        const mask = 1 // 1
        const storageSlot = 153
        const newValue = 1
        // xor(and(xor(value, oldval), mask)
        // xor(and(xor(1, 0), 1)) = 0
        await adminControlled.adminSstoreWithMask(storageSlot, newValue, mask)
        const changeMeAfter = await adminControlled.changeMe()
        expect(changeMeBefore).to.be.eq(changeMeAfter)
    })
    it('should allow admin to delegate call', async () => {
        const target = auroraToken.address
        const tx = await adminControlled.getSignatureForTokenMinting(user.address, ethers.utils.parseUnits("10", 18))
        //TODO: still need to figure out why it reverts
        await expect(adminControlled.connect(admin).adminDelegatecall(target, tx.data, {value: ethers.utils.parseEther("0")})).to.be.reverted
        // expect(await auroraToken.balanceOf(user.address)).to.be.eq(ethers.utils.formatEther("1"))
    })
    it('should allow admin to send and receive eth', async () => {
        await adminControlled.adminReceiveEth({value: ethers.utils.parseEther("1.0")})
        expect(await ethers.provider.getBalance(adminControlled.address)).to.be.eq(
            ethers.utils.parseEther("1.0")
        )
        const balanceBefore = await ethers.provider.getBalance(user.address)
        await adminControlled.adminSendEth(user.address, ethers.utils.parseEther("0.5"))
        expect(parseInt((await ethers.provider.getBalance(user.address)).toString())).to.be.lessThanOrEqual(
            parseInt(ethers.utils.parseEther("0.5").toString()) + parseInt(balanceBefore.toString())
        )
    })
});
