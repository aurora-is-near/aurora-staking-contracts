const { ethers, upgrades } = require("hardhat");
const { upgradeProxyToMiddlewareHexData } = require("./middleware_utils");

async function upgradeProxy(factory) {
    const {owner} = await getNamedAccounts();
    const contractFactory = await ethers.getContractFactory(factory);

    const result = await upgradeProxyToMiddlewareHexData(contractFactory);
    console.log('result', result)
}

module.exports = {
  upgradeProxy
}
