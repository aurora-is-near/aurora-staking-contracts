import { Contract, ContractFactory } from "ethers";
import { ethers, upgrades } from "hardhat";

export async function deploySubProxy(contractFactory: ContractFactory, initialize_args: any[]): Promise<Contract> {
  const [ deployer ] = await ethers.getSigners()

  let contract = await contractFactory.deploy();
  await contract.deployed();
  console.log(`Deploy Imp done @ ${contract.address}`);

  let MiddlewareProxy = await ethers.getContractFactory("SphereXProtectedSubProxy");
  const contract_init_data = contract.interface.encodeFunctionData("initialize", initialize_args);

  let proxy = await upgrades.deployProxy(
    MiddlewareProxy,
    [
      deployer.address,
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

  await proxy.deployed();

  proxy = new ethers.Contract(proxy.address, contractFactory.interface, deployer);
  console.log("Deploy Middleware Proxy done @ " + (await proxy.getSubImplementation()));
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

export async function upgradeProxyToMiddleware(
  proxy: Contract,
  contractFactory: ContractFactory,
  opts?: { call?: { fn: string; args: any[] }} ): Promise<Contract> {

  const [ deployer ] = await ethers.getSigners()

  let contract = await contractFactory.deploy();
  await contract.deployed();
  console.log(`Deploy Imp done @ ${contract.address}`);

  let MiddlewareProxy = await ethers.getContractFactory("SphereXProtectedSubProxy");
  let contract_init_data = '0x';
  if (opts && opts.call) {
    const { fn, args } = opts.call;
    contract_init_data = contract.interface.encodeFunctionData(fn, args);
  }

  await upgrades.upgradeProxy(proxy, MiddlewareProxy, {call: {fn: 'initialize', args: [
    deployer.address,
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    contract.address,
    contract_init_data,
  ]},
  unsafeAllow: ["delegatecall"],
  unsafeSkipStorageCheck: true})

  return contractFactory.attach(proxy.address);
}
