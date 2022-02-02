import { expect } from "chai";
import { ethers } from "hardhat";

describe("Connect4Engine", function () {
  let Connect4EngineFactory: any;
  let LedgerConnect4Factory: any;

  before(async function () {
    Connect4EngineFactory = await ethers.getContractFactory("Connect4Engine");

    // As some engine methods are internal, we need to use the LedgerConnect4 to call them
    // Logic from LedgerConnect4 contract isn't tested here.
    LedgerConnect4Factory = await ethers.getContractFactory("LedgerConnect4");
  });

  it("returns correct board dimensions", async function () {
    const contract = await Connect4EngineFactory.deploy();
    await contract.deployed();

    const [width, height] = await contract.getBoardDimensions();

    expect(width).to.equal(7);
    expect(height).to.equal(6);
  });

  describe.skip("Internal tests", function () {
    /*
      @dev: These tests are leggit, run properly, but they can't be run automatically
      because they tests internal methods (unnacessible by design).
      To run them, you need first to update the modifier of the functions from `internal` to `public`.
      TODO: Find a way to run these tests automatically.
    */

    it("returns if the passed coords is included in the board", async () => {
      const contract = await LedgerConnect4Factory.deploy(
        ethers.utils.parseEther("0.1"),
        10,
        20
      );
      await contract.deployed();

      const [width, height] = await contract.getBoardDimensions();

      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          expect(await contract.isOnBoard(x, y)).to.be.true;
        }
      }
      expect(await contract.isOnBoard(width, 0)).to.be.false;
      expect(await contract.isOnBoard(0, height)).to.be.false;
    });

    it("returns if the board has winning pattern", async () => {
      const contract = await LedgerConnect4Factory.deploy(
        ethers.utils.parseEther("0.1"),
        10,
        20
      );
      await contract.deployed();

      const [width, height] = await contract.getBoardDimensions();

      const board = new Array(width)
        .fill(null)
        .map(() => new Array(height).fill(null).map(() => 0));

      // Set initial P1/P2 pieces
      board[0][0] = 1;
      board[1][0] = 1;
      board[2][0] = 1;
      board[0][1] = 1;
      board[0][2] = 1;
      board[1][1] = 1;
      board[2][2] = 1;
      board[1][2] = 2;
      board[2][1] = 2;
      board[5][0] = 2;
      board[5][1] = 2;
      board[6][0] = 2;
      board[6][1] = 2;
      board[6][2] = 2;

      /*
        Initial board state:

        |   |   |   |   |   |   |   |
        |   |   |   |   |   |   |   |
        | W |   |   | W |   |   | W |
        | 1 | 2 | 1 |   |   |   | 2 |
        | 1 | 1 | 2 |   |   | 2 | 2 |
        | 1 | 1 | 1 | W | 2 | 2 | 2 |

        1 = One of Player 1's pieces
        2 = One of Player 2's pieces
        W = Potential Winning move
      */

      const winningMoves = [
        [3, 0],
        [0, 3],
        [2, 2],
        [6, 3],
      ];

      const neutralMoves = [
        [0, 4],
        [0, 5],
        [1, 3],
        [1, 4],
        [1, 5],
        [2, 3],
        [2, 4],
        [2, 5],
        [3, 1],
        [3, 2],
        [3, 4],
        [3, 5],
        [4, 1],
        [4, 2],
        [4, 3],
        [4, 4],
        [4, 5],
        [5, 2],
        [5, 3],
        [5, 4],
        [5, 5],
        [6, 4],
        [6, 5],
      ];

      winningMoves.forEach(async ([x, y]) => {
        const clonedBoard = [...board];
        expect(await contract.isGameOver(clonedBoard, x, y)).to.be.true;
      });

      neutralMoves.forEach(async ([x, y]) => {
        const clonedBoard = [...board];
        expect(await contract.isGameOver(clonedBoard, x, y)).to.be.false;
      });
    });

    it("returns true if the board is full", async () => {
      const contract = await LedgerConnect4Factory.deploy(
        ethers.utils.parseEther("0.1"),
        10,
        20
      );
      await contract.deployed();

      const [width, height] = await contract.getBoardDimensions();

      const rows = [
        [1, 2, 1, 1, 1, 2, 1],
        [2, 1, 2, 2, 2, 1, 2],
        [1, 2, 1, 1, 1, 2, 1],
        [2, 1, 2, 2, 1, 1, 2],
        [1, 2, 1, 1, 2, 2, 1],
        [1, 2, 1, 2, 1, 2, 2],
      ];

      // Save the initial state of the board
      const board = new Array(width)
        .fill(null)
        .map(() => new Array(height).fill(null))
        .map((column, index) => column.map((_, y) => rows[y][index]));

      /*
        Initial board state:

        | 1 | 2 | 1 | 2 | 1 | 2 | 2 |
        | 1 | 2 | 1 | 1 | 2 | 2 | 1 |
        | 2 | 1 | 2 | 2 | 1 | 1 | 2 |
        | 1 | 2 | 1 | 1 | 1 | 2 | 1 |
        | 2 | 1 | 2 | 2 | 2 | 1 | 2 |
        | 1 | 2 | 1 | 1 | 1 | 2 | 1 |

        1 = One of Player 1's pieces
        2 = One of Player 2's pieces
      */

      expect(await contract.isGameDrawn(board)).to.be.true;

      // Remove one piece of the board
      board[1][0] = 0;

      expect(await contract.isGameDrawn(board)).to.be.false;
    });
  });
});
