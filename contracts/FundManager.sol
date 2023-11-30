// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/libraries/FunctionsRequest.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

contract FundManager is Ownable, FunctionsClient {
    using FunctionsRequest for FunctionsRequest.Request;

    uint8 public donHostedSecretsSlotID;
    uint64 public donHostedSecretsVersion;
    bytes32 public donId;
    uint64 subscriptionId;
    uint32 gasLimit;
    bytes encryptedSecretsUrls;

    event CircuitAdded(string circuitQASM, bytes32 circuitHash);
    event CircuitJobSent(bytes32 circuitHash, string jobId);
    event CircuitResultAsked(bytes32 circuitHash, string jobId);
    event CircuitResultUpdated(
        bytes32 circuitHash,
        string jobId,
        string result
    );
    event ChainlinkResponse(bytes32 requestId, bytes response, bytes err);
    event SourceUpdatedForAddingCircuit(string sourceForAddingCircuit);
    event SourceUpdatedForFetchingResult(string sourceForFetchingResult);

    error InvalidValueSent();
    error CircuitAlreadyInSystem();
    error InvalidStatusForThisCall();
    error InvalidRequestId();

    bytes public result;

    constructor(
        address chainlinkFunctionsRouter
    ) FunctionsClient(chainlinkFunctionsRouter) Ownable(msg.sender) {}

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

    function setEncryptedSecretUrls(
        bytes calldata _encryptedSecretsUrls
    ) public onlyOwner {
        encryptedSecretsUrls = _encryptedSecretsUrls;
    }

    function setGasLimit(uint32 _gasLimit) public onlyOwner {
        gasLimit = _gasLimit;
    }

    function makeRequest(string calldata sourceCode) public payable {
        // bytes32 circuitHash = keccak256(abi.encode(circuitQASM));
        // if (status[circuitHash] != Status.NON_EXISTENT) revert CircuitAlreadyInSystem();
        // if (calculateCost(circuitQASM) != msg.value) revert InvalidValueSent();

        // send the request to chainlink
        string[] memory args = new string[](1);
        args[0] = "Hello World";
        sendRequest(sourceCode, args, gasLimit);
    }

    function sendRequest(
        string memory source,
        string[] memory args,
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
