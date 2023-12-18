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
    uint32 gasLimitForScheduleOptimizationFunction;
    uint32 gasLimitForResultFetchFunction;

    bytes encryptedSecretsUrlsForPriceFetchFunction;
    bytes encryptedSecretsUrlsForScheduleOptimizationFunction;
    bytes encryptedSecretsUrlsForResultFetchFunction;

    // chainlink functions
    string public priceFetchSourceCode;
    string public scheduleOptimizationSourceCode;
    string public resultFetchSourceCode;

    // define request types
    enum RequestType {
        NON_EXISTENT,
        PRICE_FETCH,
        SCHEDULE_OPTIMIZATION,
        RESULT_FETCH
    }
    mapping(bytes32 => RequestType) public requestTypes;

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
        bytes32 scheduleOptimizationRequestId;
        bool scheduleInitiated;
        bool scheduled;
        string jobId;
        bool completed;
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
    mapping(bytes32 => uint256)
        public scheduleOptimizationRequestIdsToRefreshRequestIds;
    mapping(bytes32 => uint256) public resultFetchRequestIdsToRefreshRequestIds;

    // define weights
    struct Weight {
        uint256 id;
        uint256 tokenId;
        uint256 weight;
    }
    mapping(uint256 => Weight) public weights;
    uint256 public totalWeights;
    uint256 public lastUpdated;

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

    function setScheduleOptimizationSourceCode(
        string calldata _scheduleOptimizationSourceCode
    ) public onlyOwner {
        scheduleOptimizationSourceCode = _scheduleOptimizationSourceCode;
    }

    function setResultFetchSourceCode(
        string calldata _resultFetchSourceCode
    ) public onlyOwner {
        resultFetchSourceCode = _resultFetchSourceCode;
    }

    function initiateProportionRefresh() public {
        string[] memory symbolsPaginated = getJSONTokenSymbolList(4);

        uint256 refreshId = ++totalRefreshRequests;
        refreshRequests[refreshId] = RefreshRequest({
            id: refreshId,
            totalBatches: symbolsPaginated.length,
            totalBatchesFulfilled: 0,
            fulfilled: false,
            scheduleOptimizationRequestId: bytes32(""),
            scheduleInitiated: false,
            scheduled: false,
            jobId: "",
            completed: false
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
            requestTypes[requestId] = RequestType.PRICE_FETCH;
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

    function setEncryptedSecretUrlsForScheduleOptimizationFunction(
        bytes calldata _encryptedSecretsUrls
    ) public onlyOwner {
        encryptedSecretsUrlsForScheduleOptimizationFunction = _encryptedSecretsUrls;
    }

    function setEncryptedSecretUrlsForResultFetchFunction(
        bytes calldata _encryptedSecretsUrls
    ) public onlyOwner {
        encryptedSecretsUrlsForResultFetchFunction = _encryptedSecretsUrls;
    }

    function setGasLimitForPriceFetchFunction(
        uint32 _gasLimit
    ) public onlyOwner {
        gasLimitForPriceFetchFunction = _gasLimit;
    }

    function setGasLimitForScheduleOptimizationFunction(
        uint32 _gasLimit
    ) public onlyOwner {
        gasLimitForScheduleOptimizationFunction = _gasLimit;
    }

    function setGasLimitForResultFetch(uint32 _gasLimit) public onlyOwner {
        gasLimitForResultFetchFunction = _gasLimit;
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

    function scheduleOptimization(uint256 refreshRequestId) public {
        RefreshRequest storage refreshRequest = refreshRequests[
            refreshRequestId
        ];
        if (!refreshRequest.fulfilled) revert("Not fulfilled");
        if (refreshRequest.scheduleInitiated) revert("Already initiated");
        refreshRequest.scheduleInitiated = true;
        uint256 totalBatches = refreshRequest.totalBatches;
        string[] memory args = new string[](totalBatches + 1);
        args[0] = Strings.toString(totalBatches);
        for (uint256 i = 0; i < totalBatches; i++) {
            args[i + 1] = requestStatuses[
                refreshRequestIds[refreshRequestId][i]
            ].dataHash;
        }

        bytes32 scheduleOptimizationRequestId = sendRequest(
            scheduleOptimizationSourceCode,
            args,
            encryptedSecretsUrlsForScheduleOptimizationFunction,
            gasLimitForScheduleOptimizationFunction
        );
        requestTypes[scheduleOptimizationRequestId] = RequestType
            .SCHEDULE_OPTIMIZATION;
        refreshRequest
            .scheduleOptimizationRequestId = scheduleOptimizationRequestId;
        scheduleOptimizationRequestIdsToRefreshRequestIds[
            scheduleOptimizationRequestId
        ] = refreshRequestId;
    }

    function fetchData() public {
        RefreshRequest memory refreshRequest = refreshRequests[
            totalRefreshRequests
        ];

        if (!refreshRequest.fulfilled) revert("Not fulfilled");

        if (!refreshRequest.scheduled) revert("Not Scheduled");

        if (refreshRequest.completed) revert("Already completed");

        string[] memory args = new string[](1);
        args[0] = refreshRequest.jobId;

        bytes32 requestId = sendRequest(
            resultFetchSourceCode,
            args,
            encryptedSecretsUrlsForResultFetchFunction,
            gasLimitForResultFetchFunction
        );

        requestTypes[requestId] = RequestType.RESULT_FETCH;
        resultFetchRequestIdsToRefreshRequestIds[requestId] = refreshRequest.id;
    }

    function decodeResult(
        bytes memory data
    )
        public
        pure
        returns (
            uint256 totalTokensInResult,
            uint256[] memory ids,
            uint256[] memory tokenWeights
        )
    {
        assembly {
            totalTokensInResult := mload(add(data, 32))
        }

        ids = new uint256[](totalTokensInResult);
        tokenWeights = new uint256[](totalTokensInResult);
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < totalTokensInResult; i++) {
            uint256 id;
            uint256 weight;
            assembly {
                id := mload(add(data, add(64, mul(i, 64))))
                weight := mload(add(data, add(96, mul(i, 64))))
            }
            ids[i] = id;
            tokenWeights[i] = weight;
            totalWeight += weight;
        }

        if (totalWeight != 10000) revert("invalid data");

        return (totalTokensInResult, ids, tokenWeights);
    }

    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory /* err */
    ) internal override {
        if (requestTypes[requestId] == RequestType.NON_EXISTENT) {
            revert InvalidRequestId();
        }

        if (requestTypes[requestId] == RequestType.PRICE_FETCH) {
            string memory dataCID = string(response);
            RequestStatus storage refreshRequestStatus = requestStatuses[
                requestId
            ];
            if (refreshRequestStatus.fulfilled) revert("Already fulfilled");
            refreshRequestStatus.dataHash = dataCID;
            refreshRequestStatus.fulfilled = true;
            RefreshRequest storage refreshRequest = refreshRequests[
                refreshRequestStatus.refreshRequestId
            ];
            refreshRequest.totalBatchesFulfilled++;
            if (
                refreshRequest.totalBatchesFulfilled ==
                refreshRequest.totalBatches
            ) {
                refreshRequest.fulfilled = true;
            }
            return;
        }

        if (requestTypes[requestId] == RequestType.SCHEDULE_OPTIMIZATION) {
            string memory jobId = string(response);
            RefreshRequest storage refreshRequest = refreshRequests[
                scheduleOptimizationRequestIdsToRefreshRequestIds[requestId]
            ];
            refreshRequest.scheduled = true;
            refreshRequest.jobId = jobId;
            return;
        }

        if (requestTypes[requestId] == RequestType.RESULT_FETCH) {
            RefreshRequest storage refreshRequest = refreshRequests[
                resultFetchRequestIdsToRefreshRequestIds[requestId]
            ];
            refreshRequest.completed = true;

            (
                uint256 totalTokensInResult,
                uint256[] memory ids,
                uint256[] memory tokenWeights
            ) = decodeResult(response);

            for (uint256 i = 0; i < totalTokensInResult; i++) {
                uint256 tokenId = ids[i];
                uint256 weight = tokenWeights[i];
                weights[i] = Weight({id: i, tokenId: tokenId, weight: weight});
            }

            totalWeights = totalTokensInResult;
            lastUpdated = block.timestamp;

            return;
        }
    }
}
