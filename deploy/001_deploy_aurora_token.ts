import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import * as dotenv from 'dotenv';
const func: DeployFunction = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments
    const { owner } = await getNamedAccounts()
    const auroraSupply = ethers.utils.parseUnits("1000000", 18)
    const name = "AuroraToken"
    const symbol = "AURORA"
    await deploy('Token', {
        from: owner,
        args: [
            auroraSupply,
            name,
            symbol
        ],
        log: true,
    })
}

module.exports = func
module.exports.tags = ["aurora"]
