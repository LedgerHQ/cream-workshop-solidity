import { expect } from "chai";
import { ethers } from "hardhat";

describe("Connect4", function () {
  it("deploys correctly", async function () {
    const [owner] = await ethers.getSigners();
    const Connect4 = await ethers.getContractFactory("Connect4");
    const contract = await Connect4.deploy(
      10, // minutes
      ethers.utils.parseEther("0.001")
    );
    await contract.deployed();

    expect(await contract.owner()).to.equal(owner.address);
  });

  // TODO: write tests
});
