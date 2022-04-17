//TODO: update this script to work with OZ defender
async function main () {
  const proxyAdminWallet = 'CHANGE_ME';
  console.log('Transferring ownership of ProxyAdmin...');
  // The owner of the ProxyAdmin can upgrade our contracts
  await upgrades.admin.transferProxyAdminOwnership(proxyAdminWallet);
  console.log('Transferred ownership of ProxyAdmin to:', proxyAdminWallet);
}
  
main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});