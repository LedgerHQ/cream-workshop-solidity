import { ethers, upgrades } from "hardhat";

async function main() {
  const Factory = await ethers.getContractFactory("LedgerConnect4");
  const contract = await upgrades.deployProxy(Factory, [100_000_000, 10, 5]);
  await contract.deployed();
  console.log("Contract deployed to:", contract.address);
}

main();
