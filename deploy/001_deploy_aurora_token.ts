import { Address, DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { AURORA_TOKEN } = process.env
    const { deploy } = hre.deployments
    const [ deployer ] = await hre.ethers.getSigners()
    const auroraSupply = ethers.utils.parseUnits("1000000", 18)
    let tokenAddress: Address
    if(AURORA_TOKEN?.toString().startsWith("0x")) {
        tokenAddress = AURORA_TOKEN
    } else {
        const name = "AuroraToken"
        const symbol = "AURORA"
        const token = await deploy('Token', {
            from: deployer.address,
            args: [
                auroraSupply,
                name,
                symbol
            ],
            log: true,
        })
        await new Promise(f => setTimeout(f, 3000));
        tokenAddress = token.address
    }
    console.log(`Sample Aurora Token : ${tokenAddress}`)
}

module.exports = func
module.exports.tags = ["aurora"]
