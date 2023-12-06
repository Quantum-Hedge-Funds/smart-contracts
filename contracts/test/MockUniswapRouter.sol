// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockAggregatorV3.sol";
import "./MockERC20.sol";
import "../FundManager.sol";

contract MockUniswapRouter {
    FundManager public fundManager;
    address public stableToken;

    constructor(FundManager _fundManager, address _stableToken) {
        fundManager = _fundManager;
        stableToken = _stableToken;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 /* amountOutMin */,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external returns (uint256[] memory amounts) {
        MockERC20 tokenIn = MockERC20(path[0]);
        MockERC20 tokenOut = MockERC20(path[1]);

        tokenIn.transferFrom(msg.sender, address(this), amountIn);

        if (address(tokenIn) != stableToken) {
            uint256 tokenValue = getTokenValue(address(tokenIn), amountIn);
            tokenOut.mint(to, tokenValue);
        } else {
            uint256 tokenValue = getTokenValueReverse(
                address(tokenOut),
                amountIn
            );
            tokenOut.mint(to, tokenValue);
        }
    }

    function getTokenValue(
        address tokenAddress,
        uint256 amount
    ) public view returns (uint256) {
        uint256 id = fundManager.tokenAddressToId(tokenAddress);
        if (id == 0) revert("Token not found");

        (, , , address chainlinkDataFeedAddress, ) = fundManager.tokens(id);

        AggregatorV3Interface chainlinkDataFeed = AggregatorV3Interface(
            chainlinkDataFeedAddress
        );
        (, int256 price, , , ) = chainlinkDataFeed.latestRoundData();

        uint8 tokenDecimals = MockERC20(tokenAddress).decimals();
        uint256 tokenUnit = 10 ** tokenDecimals;
        uint8 feedDecimals = chainlinkDataFeed.decimals();
        uint256 feedUnit = 10 ** feedDecimals;
        uint8 stableTokenDecimals = MockERC20(stableToken).decimals();
        uint256 stableTokenUnit = 10 ** stableTokenDecimals;

        return
            (stableTokenUnit * amount * uint256(price)) /
            (tokenUnit * feedUnit);
    }

    function getTokenValueReverse(
        address tokenAddress,
        uint256 amount
    ) public view returns (uint256) {
        uint256 id = fundManager.tokenAddressToId(tokenAddress);
        if (id == 0) revert("Token not found");

        (, , , address chainlinkDataFeedAddress, ) = fundManager.tokens(id);

        AggregatorV3Interface chainlinkDataFeed = AggregatorV3Interface(
            chainlinkDataFeedAddress
        );
        (, int256 price, , , ) = chainlinkDataFeed.latestRoundData();

        uint8 tokenDecimals = MockERC20(tokenAddress).decimals();
        uint256 tokenUnit = 10 ** tokenDecimals;
        uint8 feedDecimals = chainlinkDataFeed.decimals();
        uint256 feedUnit = 10 ** feedDecimals;
        uint8 stableTokenDecimals = MockERC20(stableToken).decimals();
        uint256 stableTokenUnit = 10 ** stableTokenDecimals;

        return
            (tokenUnit * amount * feedUnit) /
            (uint256(price) * stableTokenUnit);
    }
}
