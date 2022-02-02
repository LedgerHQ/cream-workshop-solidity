// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./librairies/UncheckedMath.sol";

contract Connect4Engine {
    uint8 internal constant BOARD_WIDTH = 7;
    uint8 internal constant BOARD_HEIGHT = 6;

    /// @return a tuple of the board width and height
    function getBoardDimensions() external pure returns (uint8, uint8) {
        return (BOARD_WIDTH, BOARD_HEIGHT);
    }

    /// @dev Confirms that the x/y co-ordinates provided are within the boundary of the game board
    /// @param _x the x coordinate of the played cell
    /// @param _y the y coordinate of the played cell
    /// @return true if the co-ordinates are within the board boundary
    function isOnBoard(int8 _x, int8 _y) internal pure returns (bool) {
        return (_x >= 0 &&
            _x < int8(BOARD_WIDTH) &&
            _y >= 0 &&
            _y < int8(BOARD_HEIGHT));
    }

    /// @dev Looks along an axis from a starting point to see if any player has the winning number of moves in a row
    /// @param _board The state of the game board
    /// @param _x The starting column to search from
    /// @param _y The starting row to search from
    /// @param _adjustments The axis to search along
    /// @return true if the required pattern is found
    function findPattern(
        uint8[BOARD_HEIGHT][BOARD_WIDTH] memory _board,
        uint8 _x,
        uint8 _y,
        int8[4] memory _adjustments
    ) internal pure returns (bool) {
        uint8 count = 1;

        unchecked {
            uint8 target = _board[_x][_y];
            int8 nx = int8(_x) + _adjustments[0];
            int8 ny = int8(_y) + _adjustments[1];

            while (
                isOnBoard(nx, ny) && _board[uint8(nx)][uint8(ny)] == target
            ) {
                count++;
                nx = nx + _adjustments[0];
                ny = ny + _adjustments[1];
            }

            nx = int8(_x) + _adjustments[2];
            ny = int8(_y) + _adjustments[3];
            while (
                isOnBoard(nx, ny) && _board[uint8(nx)][uint8(ny)] == target
            ) {
                count++;
                nx = nx + _adjustments[2];
                ny = ny + _adjustments[3];
            }
        }

        return count >= 4;
    }

    /// @dev Checks to see if either player has won the game
    /// @param _board The state of the game board
    /// @param _x The most recent column played
    /// @param _y The most recent row played
    /// @return true if the game is over
    function isGameOver(
        uint8[BOARD_HEIGHT][BOARD_WIDTH] memory _board,
        uint8 _x,
        uint8 _y
    ) internal pure returns (bool) {
        return (findPattern(_board, _x, _y, [int8(-1), 0, 1, 0]) ||
            findPattern(_board, _x, _y, [int8(-1), -1, 1, 1]) ||
            findPattern(_board, _x, _y, [int8(-1), 1, 1, -1]) ||
            findPattern(_board, _x, _y, [int8(0), -1, 0, 1]));
    }

    /// @dev Checks to see if the game is drawn, i.e. the game board is full
    /// @param _board The state of the game board
    /// @return true if the game is drawn
    function isGameDrawn(uint8[BOARD_HEIGHT][BOARD_WIDTH] memory _board)
        internal
        pure
        returns (bool)
    {
        for (uint8 i = 0; i < BOARD_WIDTH; i = UncheckedMath.increment8(i)) {
            for (
                uint8 j = 0;
                j < BOARD_HEIGHT;
                j = UncheckedMath.increment8(j)
            ) {
                if (_board[i][j] == 0) return false;
            }
        }

        return true;
    }
}
