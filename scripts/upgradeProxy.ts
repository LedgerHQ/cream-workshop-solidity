import { ethers, upgrades } from "hardhat";

async function main() {
  const Factory = await ethers.getContractFactory("BoxV2");
  await upgrades.upgradeProxy(process.env.PROXY_ADDRESS ?? "", Factory);
  console.log("Contract upgraded");
}

main();
