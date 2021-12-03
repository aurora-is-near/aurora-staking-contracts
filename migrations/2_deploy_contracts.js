const Treasury = artifacts.require("Treasury");
const DJetStaking = artifacts.require("DJetStaking");

module.exports = async (deployer) => {
  await deployer.deploy(DJetStaking, "Vote", "Vote");
  let dJetStakingInstance = await DJetStaking.deployed();

  await deployer.deploy(Treasury, dJetStakingInstance.address, [], []);
};
