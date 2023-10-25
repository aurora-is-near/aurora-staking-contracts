import { expect } from "chai";
import { ethers } from "hardhat";
import {deploySubProxy} from "../../scripts/middleware_utils"

describe("AdminControlled", function () {
    let admin: any
    let newAdmin: any
    let user: any
    let pauseRoleAdmin: any
    let adminControlled: any
    let targetContract: any

    before(async () => {
        // deploys the contracts
        [admin, newAdmin, user, pauseRoleAdmin] = await ethers.getSigners()
        const AdminControlled = await ethers.getContractFactory("AdminControlledTesting")
        const TargetContract = await ethers.getContractFactory("TargetContract")
        const supply = ethers.utils.parseUnits("1000000000", 18)
        targetContract = await TargetContract.connect(admin).deploy()
        const flags = 0
        adminControlled = await deploySubProxy(
            AdminControlled,
            [
                flags
            ]
        )
        const pauseRole = await adminControlled.PAUSE_ROLE()
        await adminControlled.grantRole(pauseRole, pauseRoleAdmin.address)
    })
    it('should admin able to pause the contract', async () => {
        await adminControlled.connect(admin).adminPause(1)
        await expect(adminControlled.connect(user).pauseMe()).to.be.revertedWith('CONTRACT_IS_PAUSED')
    })
    it('should pause role able to pause the contract and only admin can unpause the contract', async () => {
        await adminControlled.connect(pauseRoleAdmin).adminPause(1)
        // should fail to unpasue
        await expect(adminControlled.connect(pauseRoleAdmin).adminPause(0))
        .to.be.revertedWith("ONLY_DEFAULT_ADMIN_CAN_UNPAUSE")
        // unpause with admin only
        await adminControlled.connect(admin).adminPause(0)
    })
    it('should allow admin to change the storage layout using admin SSTORE', async() => {
        const changeMeBefore = await adminControlled.changeMe()
        const storageSlot = 252
        const newValue = 1
        await adminControlled.connect(admin).adminSstore(storageSlot, newValue)
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
        const tx = await adminControlled.getSignatureForTokenMinting()
        let ABI = ["function targetFunction(string memory _nameTarget)"]
        let iface = new ethers.utils.Interface(ABI)
        const data = iface.encodeFunctionData("targetFunction", ["Testname"])
        await adminControlled.connect(admin).adminDelegatecall(
            targetContract.address,
            data
        )
    })
});
