const Treasury = artifacts.require("Treasury");
const DJetStaking = artifacts.require("DJetStaking");
const ERC1967Proxy = artifacts.require("ERC1967Proxy");

module.exports = async (deployer) => {
  await deployer.deploy(DJetStaking, "Vote", "Vote");
  let dJetStakingInstance = await DJetStaking.deployed();

  let dJetStakingProxyInstance = await deployer.deploy(ERC1967Proxy, dJetStakingInstance.address, "0x");

  await deployer.deploy(Treasury, dJetStakingProxyInstance.address, [], []);
  let treasuryInstance = await Treasury.deployed();
  
  let treasuryProxyInstance = await deployer.deploy(ERC1967Proxy, treasuryInstance.address, "0x");
};
