const { ethers, upgrades } = require("hardhat");
//the address of the deployed proxy
const PROXY = "0x98bE4f05CAAe308b6B3f6f57B705a43A716f511e"; // replace me
const CONTRACT_NAME = 'JetStakingV2' // replace me

async function main() {
    const {owner} = await getNamedAccounts();
    const contractV2 = await ethers.getContractFactory(CONTRACT_NAME);
    console.log(`Upgrading ${CONTRACT_NAME}...`)
    console.log('Owner address: ', owner)
    const instance = await upgrades.upgradeProxy(PROXY, contractV2, { from: owner })
    console.log(`Contract ${CONTRACT_NAME} has been upgraded @ address: ${instance.address}`)
    //TODO: approve the tokens.
    //TODO: extend the current Aurora schedule.
    //TODO: unpause the staking contract.
}

main();