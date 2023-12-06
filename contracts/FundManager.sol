// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/libraries/FunctionsRequest.sol";

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FundManager is Ownable, FunctionsClient {
    // chainlink config
    using FunctionsRequest for FunctionsRequest.Request;

    uint8 public donHostedSecretsSlotID;
    uint64 public donHostedSecretsVersion;
    bytes32 public donId;
    uint64 subscriptionId;
    uint32 gasLimitForPriceFetchFunction;
    uint32 gasLimitForAssetOptimizationFunction;
    bytes encryptedSecretsUrlsForPriceFetchFunction;
    bytes encryptedSecretsUrlsForAssetOptimizationFunction;

    // chainlink functions
    string public priceFetchSourceCode;

    // tokens config
    struct Token {
        uint256 id;
        string symbol;
        address contractAddress;
        address chainlinkUSDDataFeed;
        bool isActive;
    }

    mapping(uint256 => Token) public tokens;
    mapping(address => uint256) public tokenAddressToId;

    uint256 totalTokens;
    uint256 totalTokenIds;
    uint256[] public activeTokenIds;

    // refresh requests
    struct RefreshRequest {
        uint256 id;
        uint256 totalBatches;
        uint256 totalBatchesFulfilled;
        bool fulfilled;
    }
    uint256 public totalRefreshRequests;
    mapping(uint256 => RefreshRequest) public refreshRequests;
    mapping(uint256 => bytes32[]) public refreshRequestIds;
    struct RequestStatus {
        uint256 refreshRequestId;
        uint256 index;
        bool fulfilled;
        string dataHash;
    }
    mapping(bytes32 => RequestStatus) public requestStatuses;

    event ChainlinkResponse(bytes32 requestId, bytes response, bytes err);

    error TokenAlreadyAdded();
    error TokenNotFound();

    error InvalidValueSent();
    error CircuitAlreadyInSystem();
    error InvalidStatusForThisCall();
    error InvalidRequestId();

    bytes public result;

    constructor(
        address chainlinkFunctionsRouter
    ) FunctionsClient(chainlinkFunctionsRouter) Ownable(msg.sender) {}

    function addToken(
        address tokenContractAddress,
        address chainlinkUSDDataFeed,
        string calldata symbol
    ) public onlyOwner {
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

    function removeToken(address tokenContractAddress) public onlyOwner {
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

    function getJSONTokenSymbolList(
        uint256 limit
    ) public view returns (string[] memory) {
        uint256 pages = totalTokens / limit;
        if (totalTokens % limit != 0) {
            pages += 1;
        }

        string[] memory outputStrings = new string[](pages);
        for (uint256 pageId = 0; pageId < pages; pageId++) {
            string memory output = '{"tokens":[';
            uint256 upperBound = min((pageId + 1) * limit, totalTokens);
            for (uint256 i = pageId * limit; i < upperBound; i++) {
                uint256 tokenId = activeTokenIds[i];
                Token memory token = tokens[tokenId];
                output = string.concat(
                    output,
                    '{"id": ',
                    Strings.toString(tokenId),
                    ', "symbol": "',
                    token.symbol,
                    '"}'
                );
                if (i != upperBound - 1) {
                    output = string.concat(output, ",");
                }
            }
            output = string.concat(output, "]}");
            outputStrings[pageId] = output;
        }

        return outputStrings;
    }

    function min(uint256 a, uint256 b) public pure returns (uint256) {
        if (a < b) return a;
        return b;
    }

    function setPriceFetchSourceCode(
        string calldata _priceFetchSourceCode
    ) public onlyOwner {
        priceFetchSourceCode = _priceFetchSourceCode;
    }

    function initiateProportionRefresh() public {
        string[] memory symbolsPaginated = getJSONTokenSymbolList(4);

        uint256 refreshId = ++totalRefreshRequests;
        refreshRequests[refreshId] = RefreshRequest({
            id: refreshId,
            totalBatches: symbolsPaginated.length,
            totalBatchesFulfilled: 0,
            fulfilled: false
        });

        for (uint256 i = 0; i < symbolsPaginated.length; i++) {
            string[] memory args = new string[](1);
            args[0] = symbolsPaginated[i];
            bytes32 requestId = sendRequest(
                priceFetchSourceCode,
                args,
                encryptedSecretsUrlsForPriceFetchFunction,
                gasLimitForPriceFetchFunction
            );
            refreshRequestIds[refreshId].push(requestId);
            requestStatuses[requestId] = RequestStatus({
                refreshRequestId: refreshId,
                index: i,
                fulfilled: false,
                dataHash: ""
            });
        }
    }

    function setSubscriptionId(uint64 _subscriptionId) public onlyOwner {
        subscriptionId = _subscriptionId;
    }

    function setDONConfig(
        uint8 _donHostedSecretsSlotID,
        uint64 _donHostedSecretsVersion,
        bytes32 _donId
    ) public onlyOwner {
        donHostedSecretsSlotID = _donHostedSecretsSlotID;
        donHostedSecretsVersion = _donHostedSecretsVersion;
        donId = _donId;
    }

    function setEncryptedSecretUrlsForPriceFetchFunction(
        bytes calldata _encryptedSecretsUrls
    ) public onlyOwner {
        encryptedSecretsUrlsForPriceFetchFunction = _encryptedSecretsUrls;
    }

    function setGasLimitForPriceFetchFunction(
        uint32 _gasLimit
    ) public onlyOwner {
        gasLimitForPriceFetchFunction = _gasLimit;
    }

    function sendRequest(
        string memory source,
        string[] memory args,
        bytes memory encryptedSecretsUrls,
        // bytes[] memory bytesArgs,
        uint32 gasLimit
    ) internal returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(source);
        if (encryptedSecretsUrls.length > 0)
            req.addSecretsReference(encryptedSecretsUrls);
        else if (donHostedSecretsVersion > 0) {
            req.addDONHostedSecrets(
                donHostedSecretsSlotID,
                donHostedSecretsVersion
            );
        }
        if (args.length > 0) req.setArgs(args);
        // if (bytesArgs.length > 0) req.setBytesArgs(bytesArgs);
        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            gasLimit,
            donId
        );
    }

    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        // if (requestTypes[requestId] == RequestType.NON_EXISTENT) {
        //     revert InvalidRequestId();
        // }

        // bytes32 circuitHash = requestIdToCircuitID[requestId];

        // // TODO: handle error

        // if (requestTypes[requestId] == RequestType.CREATE_CIRCUIT) {
        //     string memory jobId = abi.decode(response, (string));
        //     updateJobId(circuitHash, jobId);
        // } else if (requestTypes[requestId] == RequestType.FETCH_RESULT) {
        //     string memory result = abi.decode(response, (string));
        //     updateResult(circuitHash, result);
        // }

        result = response;

        emit ChainlinkResponse(requestId, response, err);
    }
}
