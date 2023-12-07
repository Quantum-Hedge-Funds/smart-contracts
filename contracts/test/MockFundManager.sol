// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockFundManager {
    struct Weight {
        uint256 id;
        uint256 tokenId;
        uint256 weight;
    }
    mapping(uint256 => Weight) public weights;
    uint256 public totalWeights;
    uint256 public lastUpdated;

    uint256 totalTokens;
    uint256 totalTokenIds;
    uint256[] public activeTokenIds;

    struct Token {
        uint256 id;
        string symbol;
        address contractAddress;
        address chainlinkUSDDataFeed;
        bool isActive;
    }

    mapping(uint256 => Token) public tokens;
    mapping(address => uint256) public tokenAddressToId;

    error TokenAlreadyAdded();
    error TokenNotFound();

    function updateTokens(
        uint256[] memory tokenIds_,
        uint256[] memory weights_
    ) external {
        if (tokenIds_.length != weights_.length) {
            revert("MockFundManager: tokenIds and weights length mismatch");
        }

        for (uint256 i = 0; i < tokenIds_.length; i++) {
            weights[i] = Weight(i, tokenIds_[i], weights_[i]);
        }
        totalWeights = tokenIds_.length;
        lastUpdated = block.timestamp;
    }

    function addToken(
        address tokenContractAddress,
        address chainlinkUSDDataFeed,
        string calldata symbol
    ) public {
        uint256 previousTokenId = tokenAddressToId[tokenContractAddress];
        if (tokens[previousTokenId].isActive) revert TokenAlreadyAdded();

        uint256 tokenId = ++totalTokenIds;
        totalTokens++;

        tokens[tokenId] = Token({
            id: tokenId,
            symbol: symbol,
            contractAddress: tokenContractAddress,
            chainlinkUSDDataFeed: chainlinkUSDDataFeed,
            isActive: true
        });
        activeTokenIds.push(tokenId);
        tokenAddressToId[tokenContractAddress] = tokenId;
    }

    function removeToken(address tokenContractAddress) public {
        uint256 tokenId = tokenAddressToId[tokenContractAddress];
        if (!tokens[tokenId].isActive) revert TokenNotFound();

        // TODO: sell all the positions for this token and buy for other tokens

        tokens[tokenId].isActive = false;

        for (uint256 i = 0; i < totalTokens; i++) {
            if (activeTokenIds[i] == tokenId) {
                activeTokenIds[i] = activeTokenIds[totalTokens - 1];
                break;
            }
        }
        activeTokenIds.pop();

        totalTokens--;
    }
}
