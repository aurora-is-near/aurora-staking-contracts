import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("TreasuryUpgrade", function () {
    let auroraOwner: any
    let newOwner: any
    let streamToken1: any
    let streamToken2: any
    let streamToken3: any
    let auroraToken: any
    let user1: any
    let user2: any
    let user3: any
    let user4: any
    let user5: any
    let manager1: any
    let manager2: any
    let treasury: any
    let treasuryV2: any

    beforeEach(async () => {
        // deploys all the contracts
        [auroraOwner, newOwner, user1, user2, user3, user4, manager1, manager2, user5] = await ethers.getSigners()
        const supply = ethers.utils.parseUnits("1000000000", 18)
        const Token = await ethers.getContractFactory("Token")
        const flags = 0
        auroraToken = await Token.connect(auroraOwner).deploy(supply, "AuroraToken", "AURORA")
        // random example for other reward token contracts
        streamToken1 = await Token.connect(user1).deploy(supply, "StreamToken1", "ST1")
        streamToken2 = await Token.connect(user2).deploy(supply, "StreamToken2", "ST2")
        streamToken3 = await Token.connect(user2).deploy(supply, "StreamToken3", "ST3")
        const Treasury = await ethers.getContractFactory("Treasury")
        treasury = await upgrades.deployProxy(
            Treasury, 
            [
                [manager1.address],
                [
                    auroraToken.address,
                    streamToken1.address
                ],
                flags
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
    it('should test Treasury change function signature', async() => {
        const TreasuryChangeFunctionSignature = await ethers.getContractFactory('TreasuryChangeFunctionSignature')
        treasuryV2 = await upgrades.upgradeProxy(
            treasury.address,
            TreasuryChangeFunctionSignature
        )
        await treasuryV2.connect(manager1)["addSupportedToken(address,bool)"](
            streamToken3.address,
            true
        )
    })
    it('should test Treasury change in storage', async() => {
        const TreasuryChangeInStorage = await ethers.getContractFactory('TreasuryChangeInStorage')
        treasuryV2 = await upgrades.upgradeProxy(
            treasury.address,
            TreasuryChangeInStorage
        )
        expect(await treasuryV2.newTreasury()).to.be.eq('0x0000000000000000000000000000000000000000')
    })
    it('should test Treasury change in storage and logic', async() => {
        const TreasuryChangeInStorageAndLogic = await ethers.getContractFactory('TreasuryChangeInStorageAndLogic')
        treasuryV2 = await upgrades.upgradeProxy(
            treasury.address,
            TreasuryChangeInStorageAndLogic,
            {
                call:{ fn: "updateStorageVar(address)", args: [manager1.address] }
            }
        )
        expect(await treasuryV2.newTreasury()).to.be.eq(manager1.address)
        await treasuryV2.updateStorageVar(manager2.address)
        expect(await treasuryV2.newTreasury()).to.be.eq(manager2.address)
    })
    it('should test Treasury extra functionality', async() => {
        const TreasuryExtraFunctionality = await ethers.getContractFactory('TreasuryExtraFunctionality')
        treasuryV2 = await upgrades.upgradeProxy(
            treasury.address,
            TreasuryExtraFunctionality
        )
        expect(await treasuryV2.dummy()).to.be.eq(1)
    })
});
