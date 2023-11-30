// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {FunctionsResponse} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/libraries/FunctionsResponse.sol";
import {IFunctionsClient} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/interfaces/IFunctionsClient.sol";

contract MockFunctionsRouter {
    uint256 totalRequests;

    event RequestCreated(
        bytes32 requestId,
        uint64 subscriptionId,
        bytes data,
        uint16 dataVersion,
        uint32 callbackGasLimit,
        bytes32 donId
    );

    mapping(bytes32 => address) requesters;

    function sendRequest(
        uint64 subscriptionId,
        bytes calldata data,
        uint16 dataVersion,
        uint32 callbackGasLimit,
        bytes32 donId
    ) external returns (bytes32 requestId) {
        requestId = keccak256(abi.encode(totalRequests++));
        requesters[requestId] = msg.sender;

        emit RequestCreated(
            requestId,
            subscriptionId,
            data,
            dataVersion,
            callbackGasLimit,
            donId
        );
    }

    function fulfill(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external {
        IFunctionsClient client = IFunctionsClient(requesters[requestId]);
        client.handleOracleFulfillment(requestId, response, err);
    }
}
