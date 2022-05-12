const { ethers, upgrades } = require("hardhat");
//the address of the deployed proxy
const PROXY = "0x058bb716392FD11Aa78B423408a0Acf465B229c6"; // replace me
const CONTRACT_NAME = 'JetStakingV1ChangeInStorage'

async function main() {
    const {owner} = await getNamedAccounts();
    const contractV2 = await ethers.getContractFactory(CONTRACT_NAME);
    console.log(`Upgrading ${CONTRACT_NAME}...`);
    const instance = await upgrades.upgradeProxy(PROXY, contractV2, { from: owner });
    console.log(`Contract ${CONTRACT_NAME} has been upgraded @ address: ${instance.address}`);
}

main();