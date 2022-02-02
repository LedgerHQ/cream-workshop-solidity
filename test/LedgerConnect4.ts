import { expect } from "chai";
import hre, { ethers } from "hardhat";
import type { LedgerConnect4__factory, LedgerConnect4 } from "../typechain";

describe("Connect4Engine", function () {
  let LedgerConnect4Factory: LedgerConnect4__factory;
  let contract: LedgerConnect4;
  const params = {
    price: 100_000_000, // in gwei
    claimWindow: 10, // in minutes
    fees: 5, // in percentage
  };
  const value = ethers.utils.parseUnits(`${params.price}`, "gwei");

  // Create a game and play with player1 and player2 until player1 wins
  type PlayingSequenceType = (
    player1: any,
    player2: any,
    id?: number
  ) => Promise<void>;
  const PlayingSequence: PlayingSequenceType = async (
    player1,
    player2,
    id = 1
  ) => {
    await contract.connect(player1).play(id, 0, { value });
    await contract.connect(player2).play(id, 1, { value });
    await contract.connect(player1).play(id, 0, { value });
    await contract.connect(player2).play(id, 1, { value });
    await contract.connect(player1).play(id, 0, { value });
    await contract.connect(player2).play(id, 1, { value });
    await expect(contract.connect(player1).play(id, 0, { value })).to.emit(
      contract,
      "Victory"
    );
  };

  before(async function () {
    LedgerConnect4Factory = await ethers.getContractFactory("LedgerConnect4");
  });

  beforeEach(async function () {
    contract = await LedgerConnect4Factory.deploy(
      params.price,
      params.claimWindow,
      params.fees
    );
    await contract.deployed();
  });

  it("constructor sets correct value", async () => {
    const [price, claimWindow, fees] = await Promise.all([
      contract.getPayAmount(),
      contract.getClaimWindow(),
      contract.getFees(),
    ]);

    expect(price).to.equal(ethers.utils.parseUnits(`${params.price}`, "gwei"));
    expect(claimWindow).to.equal(params.claimWindow * 60);
    expect(fees).to.equal(params.fees);
  });

  it("create new game with default parameters", async () => {
    const [[owner]] = await Promise.all([
      ethers.getSigners(),
      contract.createGame(ethers.constants.AddressZero),
    ]);
    const game = await contract.getGame(1);

    expect(game.id).to.equal(1);
    expect(game.claimTime).to.equal(0);
    expect(game.prizepool).to.equal(0);
    expect(game.player1).to.equal(owner.address);
    expect(game.player2).to.equal(ethers.constants.AddressZero);
    expect(game.isLive).to.be.true;
    expect(game.isPlayer2Next).to.be.false;

    game.board.forEach((row: Array<number>) => {
      row.forEach((value) => expect(value).to.equal(0));
    });
  });

  it("returns the correct next game id", async () => {
    const [owner] = await ethers.getSigners();

    expect(await contract.getNextGameID()).to.equal(1);
    await contract.createGame(ethers.constants.AddressZero);
    expect(await contract.getNextGameID()).to.equal(2);

    // Trigger PlayerCannotBeTheSame error
    await expect(contract.createGame(owner.address)).to.be.reverted;
  });

  it("allow players to play a live game", async () => {
    const [, wallet2] = await ethers.getSigners();
    await contract.createGame(ethers.constants.AddressZero);

    // Trigger NotEnoughFounds error
    await expect(
      contract.play(1, 0, { value: value.sub(ethers.BigNumber.from("10")) })
    ).to.be.reverted;

    // Trigger GameIsOver error
    await expect(contract.play(5, 0, { value })).to.be.reverted;

    // Trigger PlayerNotAllowed error
    await expect(contract.connect(wallet2).play(1, 0, { value })).to.be
      .reverted;

    // Test if it's possible to play in a live-game
    await expect(contract.play(1, 0, { value })).to.emit(contract, "Played");

    // Trigger NotYourTurn error because it's player2's turn
    await expect(contract.play(1, 0, { value })).to.be.reverted;
  });

  it("manage and revert unauthorized moves", async () => {
    const [, player2] = await ethers.getSigners();
    await contract.createGame(player2.address);

    // Sequence of moves
    await contract.play(1, 0, { value });
    await contract.connect(player2).play(1, 0, { value });
    await contract.play(1, 0, { value });
    await contract.connect(player2).play(1, 0, { value });
    await contract.play(1, 0, { value });
    await contract.connect(player2).play(1, 0, { value });

    // Trigger MoveNotAuthorized error
    await expect(contract.play(1, 0, { value })).to.be.reverted;
    await expect(contract.play(1, 10, { value })).to.be.reverted;
  });

  it("exposes all players list", async () => {
    const [owner, wallet2] = await ethers.getSigners();

    await contract.connect(owner).createGame(wallet2.address);
    await PlayingSequence(owner, wallet2);

    // Fetch "leaderboard" and check if rewardsList/scoreList only contains the winner of the game
    const [players, rewardsList, scoreList] = await contract.getAllPlayers();
    [rewardsList, scoreList].forEach((arr) => expect(arr.length).to.equal(1));

    // 7 moves * the original price
    const batchPrice = `${7 * params.price}`;

    expect(players).to.deep.equal([owner.address]);
    expect(scoreList[0]).to.equal(ethers.utils.parseUnits(batchPrice, "gwei"));
    expect(rewardsList[0]).to.equal(
      ethers.utils
        .parseUnits(batchPrice, "gwei")
        .mul(ethers.BigNumber.from(100 - params.fees)) // substract the 5% fee
        .div(ethers.BigNumber.from(100))
    );
  });

  it("allows players to withdraw their profits", async () => {
    const [owner, wallet2] = await ethers.getSigners();

    // Ensure the method revert when the player has no earnings
    await expect(contract["takeProfit()"]()).to.be.reverted;

    await contract.connect(wallet2).createGame(owner.address);
    await PlayingSequence(wallet2, owner);

    const currentBalance = await wallet2.getBalance();

    // Calculate the expected earnings
    const batchPrice = `${7 * params.price}`;
    const expectedEarnings = ethers.utils
      .parseUnits(batchPrice, "gwei")
      .mul(ethers.BigNumber.from(100 - params.fees)) // substract the 5% fee
      .div(ethers.BigNumber.from(100));

    // Fetch the earnings using the two methods exposed by the contract
    // - The first one return the earnings of the sender
    // - The second one return the earnings of the address we pass as parameter
    const [earnings, earnings2] = await Promise.all([
      contract.connect(wallet2)["getEarnings()"](),
      contract.connect(wallet2)["getEarnings(address)"](wallet2.address),
    ]);

    // Check if the two earnings are the same and if they are equals to the expected one
    expect(earnings).to.equal(earnings2);
    expect(earnings).to.equal(expectedEarnings);

    // Withdraw the profit and ensure the earnings are sent to the player
    await contract.connect(wallet2)["takeProfit()"]();

    const newBalance = await wallet2.getBalance();
    expect(newBalance.gt(currentBalance)).to.be.true;
  });

  it("allows admin to withdraw their profits", async () => {
    const [owner, player1, player2, target] = await ethers.getSigners();

    // Ensure the method revert when the admin has no earnings
    await expect(contract["takeProfit(address)"](target.address)).to.be
      .reverted;

    await contract.connect(player1).createGame(player2.address);
    await PlayingSequence(player1, player2);

    const currentBalance = await target.getBalance();

    // Calculate the expected earnings
    const batchPrice = `${7 * params.price}`;
    const expectedEarnings = ethers.utils
      .parseUnits(batchPrice, "gwei")
      .mul(ethers.BigNumber.from(params.fees)) // 5% fee
      .div(ethers.BigNumber.from(100));

    // Fetch the fees captured by the contract
    const earnings = await contract["getEarnings(address)"](contract.address);

    // Check if the two earnings are the same and if they are equals to the expected one
    expect(earnings).to.equal(expectedEarnings);

    // Withdraw the profit and ensure the earnings are sent to the player
    await contract.connect(owner)["takeProfit(address)"](target.address);

    const newBalance = await target.getBalance();
    expect(newBalance.gt(currentBalance)).to.be.true;
  });

  it("returns all games", async () => {
    const [owner, wallet2] = await ethers.getSigners();

    // Create some games
    await Promise.all([
      contract.createGame(wallet2.address),
      contract.createGame(wallet2.address),
      contract.createGame(wallet2.address),
    ]);

    // Finish the first game
    await PlayingSequence(owner, wallet2);

    const [firstGame, ...games] = await contract.getAllGames();

    expect(games.length).to.equal(2);
    expect(firstGame.isLive).to.be.false;
    games.forEach((game) => expect(game.isLive).to.be.true);
  });

  it("allows players to claim win if the conditions are fullfiled", async () => {
    const [player1, player2, player3] = await ethers.getSigners();

    // Create a game
    await contract.createGame(player2.address);

    // Ensure non-players addresses cannot claim win
    await expect(contract.connect(player3).claimWin(1)).to.be.reverted;

    // Play some moves -- It's player2's turn
    await contract.connect(player1).play(1, 0, { value });
    await contract.connect(player2).play(1, 1, { value });
    await contract.connect(player1).play(1, 0, { value });

    // Ensure we can't claim until the claim window is not over -- Triger ClaimWindowNotOver
    await expect(contract.connect(player1).claimWin(1)).to.be.reverted;

    // Play some moves  -- It's player1's turn
    await contract.connect(player2).play(1, 1, { value });
    await contract.connect(player1).play(1, 0, { value });
    await contract.connect(player2).play(1, 1, { value });

    // Mock the timestamp value of the next block to ensure the claim window is over
    await hre.network.provider.request({
      method: "evm_setNextBlockTimestamp",
      params: [Date.now() + 1000 * 60 * params.claimWindow], // now + 10 minutes
    });

    // Ensure we can't claim during our turn
    await expect(contract.connect(player1).claimWin(1)).to.be.reverted;

    // Ensure we can claim when the conditions are fullfiled
    await expect(contract.connect(player2).claimWin(1))
      .to.emit(contract, "WinClaimed")
      .to.emit(contract, "Victory");

    // Ensure we can't claim a win if the game is over
    await expect(contract.connect(player1).claimWin(0)).to.be.reverted;

    // Check the earnings and the score of the winner
    expect(await contract.connect(player2)["getScore()"]()).gt(0);
    expect(await contract.connect(player2)["getEarnings()"]()).gt(0);
  });

  it("allows players to get their score", async () => {
    const [player1, player2] = await ethers.getSigners();

    // Create a game
    await contract.createGame(player2.address);

    await PlayingSequence(player1, player2);

    // Ensure the score is 0 for the looser but not for the winner
    expect(await contract.connect(player2)["getScore()"]()).equal(0);
    expect(await contract["getScore(address)"](player2.address)).equal(0);
    expect(await contract.connect(player1)["getScore()"]()).gt(0);
    expect(await contract["getScore(address)"](player1.address)).gt(0);
  });

  it("allows anyone to fetch the board of a game at any moment", async () => {
    const [player1, player2] = await ethers.getSigners();

    const [width, height] = await contract.getBoardDimensions();

    let board = new Array(width)
      .fill(null)
      .map(() => new Array(height).fill(null).map(() => 0));

    // Create a game
    await contract.createGame(player2.address);

    // Ensure not created and not live game has an empty board
    expect(await contract.getBoard(0)).to.deep.equal(board);
    expect(await contract.getBoard(1)).to.deep.equal(board);

    // Play some moves -- It's player2's turn
    await contract.connect(player1).play(1, 0, { value });
    await contract.connect(player2).play(1, 1, { value });
    await contract.connect(player1).play(1, 0, { value });

    // Mutate the board accordingly
    board[0][0] = 1;
    board[1][0] = 2;
    board[0][1] = 1;

    expect(await contract.getBoard(1)).to.deep.equal(board);

    // Play some moves  -- It's player1's turn
    await contract.connect(player2).play(1, 1, { value });
    await contract.connect(player1).play(1, 0, { value });
    await contract.connect(player2).play(1, 1, { value });
    await contract.connect(player1).play(1, 0, { value });

    // Mutate the board accordingly
    board[1][1] = 2;
    board[0][2] = 1;
    board[1][2] = 2;
    board[0][3] = 1;

    expect(await contract.getBoard(1)).to.deep.equal(board);
  });

  it("allow players to resign a game", async () => {
    const [player1, player2, player3] = await ethers.getSigners();

    // Create three games
    await contract.createGame(player2.address);
    await contract.createGame(player2.address);
    await contract.createGame(player2.address);

    // Finish the second game
    await PlayingSequence(player1, player2, 2);

    // Ensure non-players addresses cannot resign game
    await expect(contract.connect(player3).resignGame(1)).to.be.reverted;

    // Ensure non-live/non-created game can't be resigned
    await expect(contract.resignGame(0)).to.be.reverted;
    await expect(contract.resignGame(2)).to.be.reverted;

    // Play on game 1 and 3 to add some points to the prizepool
    await contract.connect(player1).play(1, 0, { value });
    await contract.connect(player1).play(3, 0, { value });

    // Ensure player1 can resign one of their games --- Player2 is the winner
    await expect(contract.connect(player1).resignGame(1))
      .to.emit(contract, "Resign")
      .to.emit(contract, "Victory");

    // Check if rewards are correctly distributed
    expect(await contract.connect(player2)["getScore()"]()).gt(0);
    expect(await contract.connect(player2)["getEarnings()"]()).gt(0);

    // Ensure player2 can resign one of their games --- Player1 is the winner
    await expect(contract.connect(player2).resignGame(3))
      .to.emit(contract, "Resign")
      .to.emit(contract, "Victory");

    // Check if rewards are correctly distributed
    expect(await contract.connect(player1)["getScore()"]()).gt(0);
    expect(await contract.connect(player1)["getEarnings()"]()).gt(0);
  });

  it("ensure no rewards are granted if the baord is empty", async () => {
    const [player1, player2] = await ethers.getSigners();

    // Create two games
    await contract.createGame(player2.address);
    await contract.createGame(player2.address);

    // Mock the timestamp value of the next block to ensure the claim window is over
    await hre.network.provider.request({
      method: "evm_setNextBlockTimestamp",
      params: [Date.now() + 1000 * 60 * params.claimWindow], // now + 10 minutes
    });

    // Claim the win of the first game for P2 and resign the second game with P1
    await Promise.all([
      contract.connect(player2).claimWin(1),
      contract.resignGame(2),
    ]);

    // Ensure no rewards are granted to any of the players
    [player1, player2].forEach(async (player) => {
      expect(await contract.connect(player)["getScore()"]()).equal(0);
      expect(await contract.connect(player)["getEarnings()"]()).equal(0);
    });
  });

  it("check is drawn games reward players correctly", async () => {
    const [player1, player2] = await ethers.getSigners();

    await contract.createGame(player2.address);

    /*
      Don't waste your time trying to understand the following
      sequence, just trust me, the board looks something like this 
      at the end:

      | 1 | 2 | 1 | 2 | 2 | 2 | 2 |
      | 1 | 2 | 1 | 1 | 2 | 2 | 1 |
      | 2 | 1 | 2 | 2 | 1 | 1 | 2 |
      | 1 | 2 | 1 | 1 | 1 | 2 | 1 |
      | 2 | 1 | 2 | 2 | 2 | 1 | 2 |
      | 1 | 2 | 1 | 1 | 1 | 2 | 1 |

      1 = One of Player 1's pieces
      2 = One of Player 2's pieces
    */
    await contract.connect(player1).play(1, 0, { value });
    await contract.connect(player2).play(1, 1, { value });
    await contract.connect(player1).play(1, 2, { value });
    await contract.connect(player2).play(1, 5, { value });
    await contract.connect(player1).play(1, 6, { value });
    await contract.connect(player2).play(1, 6, { value });
    await contract.connect(player1).play(1, 3, { value });
    await contract.connect(player2).play(1, 0, { value });
    await contract.connect(player1).play(1, 4, { value });
    await contract.connect(player2).play(1, 2, { value });
    await contract.connect(player1).play(1, 1, { value });
    await contract.connect(player2).play(1, 3, { value });
    await contract.connect(player1).play(1, 5, { value });
    await contract.connect(player2).play(1, 4, { value });
    await contract.connect(player1).play(1, 0, { value });
    await contract.connect(player2).play(1, 1, { value });
    await contract.connect(player1).play(1, 2, { value });
    await contract.connect(player2).play(1, 5, { value });
    await contract.connect(player1).play(1, 3, { value });
    await contract.connect(player2).play(1, 0, { value });
    await contract.connect(player1).play(1, 6, { value });
    await contract.connect(player2).play(1, 6, { value });
    await contract.connect(player1).play(1, 4, { value });
    await contract.connect(player2).play(1, 2, { value });
    await contract.connect(player1).play(1, 1, { value });
    await contract.connect(player2).play(1, 3, { value });
    await contract.connect(player1).play(1, 4, { value });
    await contract.connect(player2).play(1, 1, { value });
    await contract.connect(player1).play(1, 5, { value });
    await contract.connect(player2).play(1, 4, { value });
    await contract.connect(player1).play(1, 6, { value });
    await contract.connect(player2).play(1, 5, { value });
    await contract.connect(player1).play(1, 0, { value });
    await contract.connect(player2).play(1, 6, { value });
    await contract.connect(player1).play(1, 2, { value });
    await contract.connect(player2).play(1, 5, { value });
    await contract.connect(player1).play(1, 0, { value });
    await contract.connect(player2).play(1, 1, { value });
    await contract.connect(player1).play(1, 3, { value });
    await contract.connect(player2).play(1, 3, { value });
    await contract.connect(player1).play(1, 4, { value });
    await contract.connect(player2).play(1, 2, { value });

    // Check the earnings and the score of the winner
    [player1, player2].forEach(async (player) => {
      expect(await contract.connect(player)["getScore()"]()).gt(0);
      expect(await contract.connect(player)["getEarnings()"]()).gt(0);
    });
  });
});
