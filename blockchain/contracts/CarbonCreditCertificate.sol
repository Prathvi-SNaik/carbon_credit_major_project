pragma solidity ^0.8.20;

/// @title CarbonCreditFarm Certificate
/// @notice Academic prototype: stores SHA-256 hashes of approved credit records, not documents or datasets.
contract CarbonCreditCertificate {
    address public admin;
    uint256 public nextId;

    struct Certificate {
        bytes32 payloadHash;
        address issuer;
        uint256 timestamp;
        bool exists;
    }

    mapping(uint256 => Certificate) public certificates;
    mapping(bytes32 => uint256) public byPayload;

    event Certified(uint256 indexed id, bytes32 payloadHash, address issuer);

    constructor() {
        admin = msg.sender;
    }

    function certify(bytes32 payloadHash) external returns (uint256 id) {
        require(msg.sender == admin, "admin only");
        require(byPayload[payloadHash] == 0, "already certified");
        id = ++nextId;
        certificates[id] = Certificate(payloadHash, msg.sender, block.timestamp, true);
        byPayload[payloadHash] = id;
        emit Certified(id, payloadHash, msg.sender);
    }
}
