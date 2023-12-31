// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./VaultShareToken.sol";
import "./FundManager.sol";
import "./interfaces/ExtendedIERC20.sol";

contract Vault is Ownable {
    VaultShareToken public shareToken;
    ExtendedIERC20 public stableToken;
    FundManager public fundManager;
    IUniswapV2Router02 public uniswapRouter;

    address[] public supportedTokens;
    mapping(address => bool) public isTokenSupported;

    uint256 public lastUpdated;

    event Deposit(address indexed from, uint256 amount);
    event Withdraw(address indexed to, uint256 amount);
    event AddSupportedToken(address indexed token);
    event RemoveSupportedToken(address indexed token);

    constructor(
        ExtendedIERC20 _stableToken,
        FundManager _fundManager,
        address _uniswapRouter
    ) Ownable(msg.sender) {
        fundManager = _fundManager;
        stableToken = _stableToken;
        shareToken = new VaultShareToken();
        supportedTokens.push(address(stableToken));
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);

        emit AddSupportedToken(address(stableToken));
    }

    function updateFundManager(FundManager _fundManager) public onlyOwner {
        fundManager = _fundManager;
    }

    function addSupportedToken(address _token) public {
        if (isTokenSupported[_token]) revert("Token already supported");
        supportedTokens.push(_token);
        isTokenSupported[_token] = true;

        emit AddSupportedToken(_token);
    }

    function removeSupportedToken(address _token) public {
        if (!isTokenSupported[_token]) revert("Token not supported");
        isTokenSupported[_token] = false;
        uint256 totalSupportedTokens = supportedTokens.length;
        for (uint256 i = 0; i < totalSupportedTokens; i++) {
            if (supportedTokens[i] == _token) {
                supportedTokens[i] = supportedTokens[totalSupportedTokens - 1];
                supportedTokens.pop();
                emit RemoveSupportedToken(_token);
                return;
            }
        }
    }

    function deposit(uint256 amount) public {
        if (stableToken.allowance(msg.sender, address(this)) < amount)
            revert("Insufficient allowance");

        if (stableToken.balanceOf(msg.sender) < amount)
            revert("Insufficient balance");

        uint256 shares = calculateShares(amount);

        shareToken.mint(msg.sender, shares);

        stableToken.transferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, amount);
    }

    function withdraw(uint256 amount) public {
        if (shareToken.balanceOf(msg.sender) < amount)
            revert("Insufficient balance");
        uint256 totalSupply = shareToken.totalSupply();
        shareToken.burn(msg.sender, amount);

        uint256 totalSupportedTokens = supportedTokens.length;
        for (uint256 i = 0; i < totalSupportedTokens; i++) {
            address tokenAddress = supportedTokens[i];
            ExtendedIERC20 token = ExtendedIERC20(tokenAddress);
            uint256 share = (token.balanceOf(address(this)) * amount) /
                totalSupply;
            token.transfer(msg.sender, share);
        }

        emit Withdraw(msg.sender, amount);
    }

    function calculateShares(
        uint256 amount
    ) public view returns (uint256 share) {
        uint256 totalValue = calculateTotalValue();
        uint256 currentTotalSupply = shareToken.totalSupply();

        if (totalValue == 0 || currentTotalSupply == 0) {
            uint256 stableTokenUnit = 10 ** stableToken.decimals();
            uint256 shareTokenUnit = 10 ** shareToken.decimals();
            share = (amount * shareTokenUnit) / stableTokenUnit;
        } else {
            share = (currentTotalSupply * amount) / totalValue;
        }
    }

    function calculateTotalValue() public view returns (uint256 total) {
        total = stableToken.balanceOf(address(this));

        uint256 totalSupportedTokens = supportedTokens.length;
        for (uint256 i = 1; i < totalSupportedTokens; i++) {
            address tokenAddress = supportedTokens[i];
            uint256 tokenBalance = ExtendedIERC20(tokenAddress).balanceOf(
                address(this)
            );
            total += getTokenValue(tokenAddress, tokenBalance);
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

        uint8 tokenDecimals = ExtendedIERC20(tokenAddress).decimals();
        uint256 tokenUnit = 10 ** tokenDecimals;
        uint8 feedDecimals = chainlinkDataFeed.decimals();
        uint256 feedUnit = 10 ** feedDecimals;
        uint8 stableTokenDecimals = stableToken.decimals();
        uint256 stableTokenUnit = 10 ** stableTokenDecimals;

        return
            (stableTokenUnit * amount * uint256(price)) /
            (tokenUnit * feedUnit);
    }

    function rebalance() public {
        uint256 totalSupportedTokens = supportedTokens.length;

        // sell all the tokens in favor of the stable token
        for (uint256 i = 1; i < totalSupportedTokens; i++) {
            address tokenAddress = supportedTokens[i];
            uint256 tokenBalance = ExtendedIERC20(tokenAddress).balanceOf(
                address(this)
            );
            _swapTokens(tokenAddress, address(stableToken), tokenBalance);
        }

        uint256 totalUSDCBalance = stableToken.balanceOf(address(this));

        // buy the tokens in the propostion given by the fund manager contract
        uint256 totalWeights = fundManager.totalWeights();
        uint256 fundManagerLastUpdate = fundManager.lastUpdated();

        if (lastUpdated == fundManagerLastUpdate) return;

        for (uint256 i = 0; i < totalWeights; i++) {
            (, uint256 tokenId, uint256 weight) = fundManager.weights(i);
            (, , address tokenContractAddress, , ) = fundManager.tokens(
                tokenId
            );

            //   supportedTokens[]
            if (!isTokenSupported[tokenContractAddress]) {
                addSupportedToken(tokenContractAddress);
            }

            uint256 share = (totalUSDCBalance * weight) / 10000;
            _swapTokens(address(stableToken), tokenContractAddress, share);
        }
    }

    function _swapTokens(
        address _tokenIn,
        address _tokenOut,
        uint256 _amount
    ) internal {
        ExtendedIERC20(_tokenIn).approve(address(uniswapRouter), _amount);

        address[] memory path = new address[](2);
        path[0] = _tokenIn;
        path[1] = _tokenOut;

        uniswapRouter.swapExactTokensForTokens(
            _amount,
            0,
            path,
            address(this),
            block.timestamp + 300
        );
    }
}
