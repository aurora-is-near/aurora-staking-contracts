import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {

    const { deploy } = hre.deployments
    const { owner } = await hre.getNamedAccounts()
    const flags = 0
    const { TESTING, AURORA_TOKEN } = process.env;
    let auroraAddress: any
    if(TESTING) {
        auroraAddress = (await hre.ethers.getContract("Token")).address
    } else {
        auroraAddress = AURORA_TOKEN
    }

    console.log(auroraAddress)

    await deploy('Treasury', {
        log: true,
        from: owner,
        proxy: {
            owner: owner,
            proxyContract: 'OpenZeppelinTransparentProxy',
            methodName: 'initialize',    
        },
        args: [
            [
                auroraAddress
            ],
            flags
        ],
    })
}

module.exports = func
module.exports.tags = ["tresuary"]
