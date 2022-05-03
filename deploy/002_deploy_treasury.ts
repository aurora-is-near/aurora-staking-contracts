import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {

    const { deploy } = hre.deployments
    const [ deployer ] = await hre.ethers.getSigners()
    const flags = 0
    const { 
        AURORA_TOKEN,
        TREASURY_MANAGER_ROLE_ADDRESS,
        DEFAULT_ADMIN_ROLE_ADDRESS
    } = process.env;
    let auroraAddress: any
    AURORA_TOKEN? auroraAddress = AURORA_TOKEN : auroraAddress = (await hre.ethers.getContract("Token")).address
    await deploy('Treasury', {
        log: true,
        from: deployer.address,
        proxy: {
            owner: deployer.address,
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
    // sleep for 3 seconds
    await new Promise(f => setTimeout(f, 1000));
    const treasuryManagerRole = await treasury.TREASURY_MANAGER_ROLE()
    if(!await treasury.hasRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)) {
        await treasury.connect(deployer).grantRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)
    }
    console.log(
        'Contract: ',
        'Treasury, ',
        'ADDRESS ', 
        TREASURY_MANAGER_ROLE_ADDRESS,
        `Has a role ${treasuryManagerRole}? `,
        await treasury.hasRole(treasuryManagerRole, TREASURY_MANAGER_ROLE_ADDRESS)
    )
    const treasuryDefaultAdminRole = await treasury.DEFAULT_ADMIN_ROLE()
    // sleep for 3 seconds
    await new Promise(f => setTimeout(f, 1000));
    if(!await treasury.hasRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)) {
        await treasury.connect(deployer).grantRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
    }
    console.log(
        'Contract: ', 
        'Treasury, ',
        'ADDRESS: ', 
        DEFAULT_ADMIN_ROLE_ADDRESS,
        `Has a role ${treasuryDefaultAdminRole}? `,
        await treasury.hasRole(treasuryDefaultAdminRole, DEFAULT_ADMIN_ROLE_ADDRESS)
    )
}

module.exports = func
module.exports.tags = ["tresuary"]
