import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {

    const { deploy } = hre.deployments
    const { owner } = await hre.getNamedAccounts()
    const flags = 0
    const { 
        AURORA_TOKEN,
        TREASURY_MANAGER_ROLE_ADDRESS
    } = process.env;
    let auroraAddress: any
    AURORA_TOKEN? auroraAddress = AURORA_TOKEN : auroraAddress = (await hre.ethers.getContract("Token")).address
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
    await new Promise(f => setTimeout(f, 3000));
    const treasury = await hre.ethers.getContract("Treasury")
    await treasury.deployed()
    const treasuryManagerRole = await treasury.TREASURY_MANAGER_ROLE()
    await treasury.grantRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)
    console.log(
        'CONTRACT: ',
        'Treasury ',
        'ADDRESS ', 
        TREASURY_MANAGER_ROLE_ADDRESS,
        `Has a role ${treasuryManagerRole}? `,
        await treasury.hasRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)
    )
}

module.exports = func
module.exports.tags = ["tresuary"]
