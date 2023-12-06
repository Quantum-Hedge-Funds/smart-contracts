// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockAggregatorV3 is AggregatorV3Interface {
    uint8 public decimals;
    string public description;
    uint256 public version;
    uint80 public latestRound;
    int256 public latestAnswer;
    uint256 public latestTimestamp;

    constructor(
        uint8 _decimals,
        string memory _description,
        uint256 _version,
        uint80 _latestRound,
        int256 _latestAnswer,
        uint256 _latestTimestamp
    ) {
        decimals = _decimals;
        description = _description;
        version = _version;
        latestRound = _latestRound;
        latestAnswer = _latestAnswer;
        latestTimestamp = _latestTimestamp;
    }

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            _roundId,
            latestAnswer,
            latestTimestamp,
            latestTimestamp,
            latestRound
        );
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            latestRound,
            latestAnswer,
            latestTimestamp,
            latestTimestamp,
            latestRound
        );
    }
}
