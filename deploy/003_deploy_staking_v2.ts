import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { ONLY_DEPLOY_UPGRADE } = process.env
    if(ONLY_DEPLOY_UPGRADE) {
        const { deploy } = hre.deployments
        const [ deployer ] = await hre.ethers.getSigners()
        const jetV2 = await deploy('JetStakingV2', {
                from: deployer.address,
                args: [],
                log: true,
            })
        console.log(`JetStakingV2 implementation contract address : ${jetV2.address}`)
    }
}

module.exports = func
module.exports.tags = ["aurora"]
