// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VaultShareToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Vault {
    VaultShareToken public shareToken;
    IERC20 public stableToken;

    address[] public supportedTokens;

    event Deposit(address indexed from, uint256 amount);
    event Withdraw(address indexed to, uint256 amount);
    event AddSupportedToken(address indexed token);
    event RemoveSupportedToken(address indexed token);

    constructor(IERC20 _stableToken) {
        stableToken = _stableToken;
        shareToken = new VaultShareToken();
        supportedTokens.push(address(stableToken));

        emit AddSupportedToken(address(stableToken));
    }

    function addSupportedToken(address _token) public {
        supportedTokens.push(_token);

        emit AddSupportedToken(_token);
    }

    function removeSupportedToken(address _token) public {
        uint256 totalSupportedTokens = supportedTokens.length;
        for (uint256 i = 0; i < totalSupportedTokens; i++) {
            if (supportedTokens[i] == _token) {
                supportedTokens[i] = supportedTokens[totalSupportedTokens - 1];
                supportedTokens.pop();
                emit RemoveSupportedToken(_token);
                return;
            }
        }

        revert("Token not found");
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
            IERC20 token = IERC20(tokenAddress);
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
        if (totalValue == 0 || currentTotalSupply == 0) share = amount;
        else share = (currentTotalSupply * amount) / totalValue;
    }

    function calculateTotalValue() public view returns (uint256 total) {
        total = IERC20(supportedTokens[0]).balanceOf(address(this));

        uint256 totalSupportedTokens = supportedTokens.length;
        for (uint256 i = 1; i < totalSupportedTokens; i++) {
            address tokenAddress = supportedTokens[i];
            total += IERC20(tokenAddress).balanceOf(address(this)) * 1;
        }
    }
}
