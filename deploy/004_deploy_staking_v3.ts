import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { ONLY_DEPLOY_UPGRADE_V3 } = process.env
    if(ONLY_DEPLOY_UPGRADE_V3) {
        const { deploy } = hre.deployments
        const [ deployer ] = await hre.ethers.getSigners()
        const jetV3 = await deploy('JetStakingV3', {
                from: deployer.address,
                args: [],
                log: true,
            })
        console.log(`JetStakingV3 implementation contract address : ${jetV3.address}`)
    }
}

module.exports = func
module.exports.tags = ["aurora"]
