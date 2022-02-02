// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @title Some unchecked math operations
/** @notice This library implements some basic math operations and bypassing the native unchecked operation introduce in Solidity since 0.8.0.
 ** This library is recommend to use >= 0.8.2. Before that, function won't be inlined in the contract that consumes the library. **/
/// @dev All function calls are currently implemented without side effects
library UncheckedMath {
    /// @notice Increment by one the given uint8
    /// @param a The uint8 to increment
    /// @return The incremented value
    function increment8(uint8 a) internal pure returns (uint8) {
        unchecked {
            return a + 1;
        }
    }

    /// @notice Increment by one the given uint256
    /// @param a The uint256 to increment
    /// @return The incremented value
    function increment(uint256 a) internal pure returns (uint256) {
        unchecked {
            return a + 1;
        }
    }

    /// @notice Add two given uint256
    /// @param a The first uint256 value
    /// @param b The second uint256 value
    /// @return The result of the addition
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        unchecked {
            return a + b;
        }
    }

    /// @notice Substract two given uint256
    /// @param a The first uint256 value
    /// @param b The second uint256 value
    /// @return The result of the substraction
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        unchecked {
            return a - b;
        }
    }

    /// @notice Divide two given uint256
    /// @param a The first uint256 value
    /// @param b The second uint256 value
    /// @return The result of the division
    function divide(uint256 a, uint256 b) internal pure returns (uint256) {
        unchecked {
            return a / b;
        }
    }
}
