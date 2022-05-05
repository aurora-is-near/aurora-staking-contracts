import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deploy } = hre.deployments
    const [ deployer ] = await hre.ethers.getSigners()
    const auroraSupply = ethers.utils.parseUnits("1000000", 18)
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
    console.log(`Sample Aurora Token : ${token.address}`)
}

module.exports = func
module.exports.tags = ["aurora"]
