import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {

    const { deploy } = hre.deployments
    const { owner } = await hre.getNamedAccounts()

    const auroraAddress = (await hre.ethers.getContract("Token")).address
    const omgTokenAddress = "0xd26114cd6EE289AccF82350c8d8487fedB8A0C07" // Replace this address
    const hexTokenAddress = "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39" // Replace this address 

    await deploy('Treasury', {
        log: true,
        from: owner,
        proxy: {
            owner: owner,
            proxyContract: 'OpenZeppelinTransparentProxy',
            methodName: 'initialize',    
        },
        args: [[
            owner
        ],[
            auroraAddress,
            omgTokenAddress,
            hexTokenAddress
        ]],
    })
}

module.exports = func
module.exports.tags = ["tresuary"]
