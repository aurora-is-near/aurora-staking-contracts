import { Contract, ContractFactory } from "ethers";
import { ethers, upgrades } from "hardhat";

export async function deploySubProxy(contractFactory: ContractFactory, initialize_args: any[]): Promise<Contract> {
  let contract = await contractFactory.deploy();
  await contract.deployed();
  console.log(`Deploy Imp done @ ${contract.address}`);

  let MiddlewareProxy = await ethers.getContractFactory("SphereXProtectedSubProxy");
  const contract_init_data = contract.interface.encodeFunctionData("initialize", initialize_args);

  let proxy = await upgrades.deployProxy(
    MiddlewareProxy,
    [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      contract.address,
      contract_init_data,
    ],
    {
      initializer: "initialize",
      kind: "uups",
      unsafeAllow: ["delegatecall"],
    }
  );

  await new Promise((f) => setTimeout(f, 3000));
  await proxy.deployed();

  proxy = new ethers.Contract(proxy.address, contractFactory.interface, ethers.provider.getSigner());
  console.log("Deploy Treasury Middleware Proxy done @ " + (await proxy.getSubImplementation()));
  console.log(`Deploy Proxy done @ ${proxy.address}`);
  return proxy;
}

export async function upgradeSubProxy(
  proxy: Contract,
  contractFactory: ContractFactory,
  opts?: { call?: { fn: string; args: any[] } }
): Promise<Contract> {
  let contract = await contractFactory.deploy();
  await contract.deployed();
  console.log(`Deploy New Imp done @ ${contract.address}`);

  const middleware = await ethers.getContractAt("ProtectedUUPSUpgradeable", proxy.address);
  if (opts && opts.call) {
    const { fn, args } = opts.call;
    const call_data = contract.interface.encodeFunctionData(fn, args);
    await middleware.subUpgradeToAndCall(contract.address, call_data);
  } else {
    await middleware.subUpgradeTo(contract.address);
  }

  return contractFactory.attach(proxy.address);
}
