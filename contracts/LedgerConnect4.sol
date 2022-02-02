// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./Connect4Engine.sol";
import "./librairies/UncheckedMath.sol";

error MoveNotAuthorized(uint8 move, uint8 limit);
error GameDoesNotExist(uint256 gameId);
error GameIsOver(uint256 gameId);
error PlayerNotAllowed(uint256 gameId, address player);
error NotEnoughFounds();
error NotYourTurn();
error CantClaimOnYourTurn();
error ClaimWindowNotOver();
error NoGainsToWithdraw();
error WithdrawFailed();
error PlayerCannotBeTheSame();


// TODO: init for constructor
/// @title This is a simple connect4 game that allows two players to create a game and play against each other
contract LedgerConnect4 is Initializable, Ownable, Connect4Engine {
    // constants/immutable game variables
    uint256 private payAmount;
    uint32 private claimWindow;
    uint8 private fees;

    // state variables
    uint256 private nextGameId;
    uint256 private nextPlayerId;

    struct Game {
        uint256 id;
        uint256 claimTime;
        uint256 prizepool;
        address player1;
        address player2;
        bool isLive;
        bool isPlayer2Next;
        uint8[BOARD_HEIGHT][BOARD_WIDTH] board;
    }

    /// @notice Map a game id to the game struct
    mapping(uint256 => Game) /* game.id => game */
        private games;

    /// @notice Map each player to the scores he accumulated. The score is never reset
    mapping(address => uint256) /* address => points */
        private scores;

    /// @notice Map each player to the earnings he can withdraw. Reset everytime the user withdraw his earnings.
    mapping(address => uint256) /* address => earns */
        private earnings;

    /// @notice Map an internal id to a new player once he win a game
    mapping(uint256 => address) /* id => address */
        private players;

    /// @notice fired when a new game is created
    /// @param gameId the id of the game
    /// @param player1 address of the first player
    /// @param player2 address of the second player
    event NewGame(
        uint256 indexed gameId,
        address indexed player1,
        address indexed player2
    );
    /// @notice fired when a player plays
    /// @param gameId the id of the game
    /// @param player address of the player who played
    /// @param x the x coordinate of the played cell
    /// @param y the y coordinate of the played cell
    /// @param isPlayer2Next true if the player who has to play next is the second player
    event Played(
        uint256 indexed gameId,
        address indexed player,
        uint8 x,
        uint8 y,
        bool isPlayer2Next
    );
    /// @notice fired when a player wins
    /// @param gameId the id of the game
    /// @param player address of the player who won
    /// @param earning the amount of points earned by the player
    event Victory(
        uint256 indexed gameId,
        address indexed player,
        uint256 earning
    );
    /// @notice fired when the board is full and no one won
    /// @param gameId the id of the game
    /// @param earning the amount of points earned by both players
    event Draw(uint256 indexed gameId, uint256 earning);
    /// @notice fired when a player resign a game
    event Resign(uint256 indexed gameId, address indexed player);
    /// @notice fired when a player claim a victory. Only possible if the claim window is over
    event WinClaimed(
        uint256 indexed gameId,
        address indexed player1,
        address indexed player2,
        uint256 earning
    );

    /// @notice Initialize the contract by setting the immutable variables
    /// @dev The first three variables aren't flagged as immutable because it's impossible to
    ///      use the keyword outside of a constructor. We don't use constructor because we use the
    ///      proxy pattern.
    /// @param _payAmount the required amount to play a game (in gwei)
    /// @param _claimWindow the required time player has to wait before claiming a win (in minutes)
    /// @param _fees the fees to pay to the contract (in percent)
    function initialize(
        uint256 _payAmount,
        uint32 _claimWindow,
        uint8 _fees
    ) public initializer {
        payAmount = _payAmount * 1 gwei;
        claimWindow = _claimWindow * 1 minutes;
        fees = _fees > 100 ? 100 : _fees;
        nextGameId = 1;
        nextPlayerId = 1;
    }

    /// @notice This function is internally called by the onlyLiveGame modifier
    /// @param _gameId the id of the game to check
    /// @return a boolean indicating if the game is live
    function isGameLive(uint256 _gameId) private view returns (bool) {
        return games[_gameId].isLive;
    }

    /// @notice This function is internally called by the onlyAllowedPlayer modifier
    /// @param _gameId the id of the game to check
    /// @return a boolean indicating if the player is allowed
    function isPlayerAllowed(uint256 _gameId) private view returns (bool) {
        Game memory game = games[_gameId];
        return (msg.sender == game.player1 || msg.sender == game.player2);
    }

    modifier onlyLiveGame(uint256 _gameId) {
        if (isGameLive(_gameId) == false) revert GameIsOver(_gameId);
        _;
    }

    modifier onlyAllowedPlayer(uint256 _gameId) {
        if (isPlayerAllowed(_gameId) == false)
            revert PlayerNotAllowed(_gameId, msg.sender);
        _;
    }

    /// @return the window of time before a claim can be made
    function getClaimWindow() external view returns (uint256) {
        return claimWindow;
    }

    /// @return the amount of ether to be paid for a move
    function getPayAmount() external view returns (uint256) {
        return payAmount;
    }

    /// @return the fees took by the contract
    function getFees() external view returns (uint8) {
        return fees;
    }

    /// @return the next id to be used for a game
    function getNextGameID() external view returns (uint256) {
        return nextGameId;
    }

    /// @param _id the id of the game to get
    /// @return game struct
    function getGame(uint256 _id) external view returns (Game memory game) {
        return games[_id];
    }

    /// @param _player the address of the player to get the score
    /// @return the score of the player
    function getScore(address _player) external view returns (uint256) {
        return scores[_player];
    }

    /// @return your own score
    function getScore() external view returns (uint256) {
        return scores[msg.sender];
    }

    /// @param _player the address of the player to get the score
    /// @return the score of the player
    function getEarnings(address _player) external view returns (uint256) {
        return earnings[_player];
    }

    /// @return your own score
    function getEarnings() external view returns (uint256) {
        return earnings[msg.sender];
    }

    /// @notice That returns a array of array of uint8 representing the board. Each cell is either 1 or 2 depending on the player who played it.
    /// @param _id the id of the game to get board
    /// @return board the board of the game
    function getBoard(uint256 _id)
        external
        view
        returns (uint8[BOARD_HEIGHT][BOARD_WIDTH] memory board)
    {
        return games[_id].board;
    }

    /// @notice This function allow you to fetch all games created since the beginning
    /// @dev If you want to sort/filter the data, I recommend you to do it off-chain to limit the on-chain computation cost
    /// @return a array of game struct
    function getAllGames() external view returns (Game[] memory) {
        uint256 gamesCount = nextGameId - 1;
        Game[] memory gamesList = new Game[](gamesCount);

        for (uint256 i = 0; i < gamesCount; i = UncheckedMath.increment(i)) {
            gamesList[i] = games[i + 1];
        }
        return gamesList;
    }

    /// @notice This function allow you to fetch all players who already won and their associated earnings/scores
    /** @dev 
        If you want to sort/filter the data, I recommend you to do it off-chain to limit the on-chain computation cost.
        Linked from the three array are linked by the index.
     */
    /// @return a tuple of players, rewardsList and scoresList
    function getAllPlayers()
        external
        view
        returns (
            address[] memory,
            uint256[] memory,
            uint256[] memory
        )
    {
        // The nextGameId counter start at 1
        uint256 playerCount = nextPlayerId - 1;

        address[] memory playerList = new address[](playerCount);
        uint256[] memory rewardsList = new uint256[](playerCount);
        uint256[] memory scoreList = new uint256[](playerCount);

        for (uint256 i = 0; i < playerCount; i = UncheckedMath.increment(i)) {
            address player = players[i + 1];
            playerList[i] = player;
            rewardsList[i] = earnings[player];
            scoreList[i] = scores[player];
        }

        return (playerList, rewardsList, scoreList);
    }

    /// @dev Called by player 1 to create a new game
    /// @param _player2 the address of the player 2
    function createGame(address _player2) external returns (uint256) {
        if (msg.sender == _player2) revert PlayerCannotBeTheSame();

        uint256 currentGameId = nextGameId;

        // Init a new game
        Game memory game;
        game.player1 = msg.sender;
        game.player2 = _player2;
        game.isLive = true;
        game.id = currentGameId;

        // Push the new game to games
        games[currentGameId] = game;

        // Increment nextGameId
        nextGameId = UncheckedMath.increment(nextGameId);

        emit NewGame(currentGameId, msg.sender, _player2);
        return currentGameId;
    }

    /**  @notice This function is called privately by the `play` and `claimWin` functions. 
                 The function increases the score and the reward of the player and store the fees collected by the contract */
    /// @param _reward The amount of reward earned by the player
    /// @param _player The address of the concerned player
    function distributeReward(uint256 _reward, address _player) private {
        if (_reward == 0) return;

        // increase player score and if needed add new player to the list
        uint256 oldPlayerScore = scores[_player];
        if (oldPlayerScore == 0) {
            uint256 playerId = nextPlayerId;
            players[playerId] = _player;
            nextPlayerId = UncheckedMath.increment(playerId);
        }
        scores[_player] = UncheckedMath.add(oldPlayerScore, _reward);

        // increase player and owner earnings
        address contractAddress = address(this);
        uint256 contractFees = (_reward * fees) / 100;
        uint256 realPlayerEarning = UncheckedMath.sub(_reward, contractFees);

        earnings[_player] = UncheckedMath.add(
            earnings[_player],
            realPlayerEarning
        );
        earnings[contractAddress] = UncheckedMath.add(
            earnings[contractAddress],
            contractFees
        );
    }

    /// @notice This function is called by players to cash out their rewards
    function takeProfit() external {
        uint256 gain = earnings[msg.sender];
        if (gain == 0) revert NoGainsToWithdraw();

        // Reset player earnings
        earnings[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: gain}("");
        if (success == false) revert WithdrawFailed();
    }

    /// @notice This function is called by the owner to cash out the rewards accumulated in the contract
    /// @param _receiver The address that will receive the funds
    function takeProfit(address _receiver) external onlyOwner {
        uint256 gain = earnings[address(this)];
        if (gain == 0) revert NoGainsToWithdraw();

        // Reset contract fees
        earnings[address(this)] = 0;

        (bool success, ) = _receiver.call{value: gain}("");
        if (success == false) revert WithdrawFailed();
    }

    /// @notice This function allow players to play. The result of the move is automatically calculated.
    /// @param _gameId the id of the game to play
    /// @param _x the x coordinate of the played cell
    function play(uint256 _gameId, uint8 _x)
        external
        payable
        onlyLiveGame(_gameId)
        onlyAllowedPlayer(_gameId)
    {
        Game memory game = games[_gameId];

        if (msg.value < payAmount) revert NotEnoughFounds();
        if (msg.sender == (game.isPlayer2Next ? game.player1 : game.player2))
            revert NotYourTurn();
        if (_x > BOARD_WIDTH) revert MoveNotAuthorized(_x, BOARD_WIDTH);

        // Find y axis: first non used tile on column
        uint8 y;
        for (y = 0; y <= BOARD_HEIGHT; y = UncheckedMath.increment8(y)) {
            if (y == BOARD_HEIGHT || game.board[_x][y] == 0) {
                break;
            }
        }

        // Check if the move is valid
        if (y >= BOARD_HEIGHT) revert MoveNotAuthorized(y, BOARD_HEIGHT);

        // Update the game state
        game.prizepool = UncheckedMath.add(game.prizepool, payAmount);
        game.claimTime = UncheckedMath.add(block.timestamp, claimWindow);
        game.board[_x][y] = game.isPlayer2Next ? 2 : 1;
        game.isPlayer2Next = !game.isPlayer2Next;

        emit Played(_gameId, msg.sender, _x, y, game.isPlayer2Next);

        if (isGameOver(game.board, _x, y)) {
            game.isLive = false;
            distributeReward(game.prizepool, msg.sender);
            emit Victory(_gameId, msg.sender, game.prizepool);
        } else if (isGameDrawn(game.board)) {
            game.isLive = false;
            uint256 prizeDivideBy2 = UncheckedMath.divide(game.prizepool, 2);
            distributeReward(prizeDivideBy2, game.player1);
            distributeReward(prizeDivideBy2, game.player2);
            emit Draw(_gameId, prizeDivideBy2);
        }

        games[_gameId] = game;
    }

    /// @notice Allow players to claim a win once the claim window is over. The claim window is reset everytime someone makes a move.
    /// @param _gameId the id of the game to claim
    function claimWin(uint256 _gameId)
        external
        onlyLiveGame(_gameId)
        onlyAllowedPlayer(_gameId)
    {
        Game memory game = games[_gameId];

        if (msg.sender == (game.isPlayer2Next ? game.player2 : game.player1))
            revert CantClaimOnYourTurn();
        if (game.claimTime > block.timestamp) revert ClaimWindowNotOver();

        game.isLive = false;
        address otherPlayer = msg.sender == game.player1
            ? game.player2
            : game.player1;

        distributeReward(game.prizepool, msg.sender);

        emit WinClaimed(_gameId, msg.sender, otherPlayer, game.prizepool);
        emit Victory(_gameId, msg.sender, game.prizepool);

        games[_gameId] = game;
    }

    /// @notice Allow players to resign a game he's playing
    /// @param _gameId the id of the game to resign
    function resignGame(uint256 _gameId)
        external
        onlyLiveGame(_gameId)
        onlyAllowedPlayer(_gameId)
    {
        Game memory game = games[_gameId];

        game.isLive = false;
        address otherPlayer = msg.sender == game.player1
            ? game.player2
            : game.player1;

        distributeReward(game.prizepool, otherPlayer);

        emit Resign(_gameId, msg.sender);
        emit Victory(_gameId, otherPlayer, game.prizepool);

        games[_gameId] = game;
    }
}
