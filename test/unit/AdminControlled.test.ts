import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("AdminControlled", function () {
    let admin: any
    let newAdmin: any

    before(async () => {
        // deploys all the contracts
        [admin, newAdmin] = await ethers.getSigners()
    })

    // it('should allow transfer ownership new admin', async () => {
       
    // })
});
