// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Campus Ballot — a public, one-wallet-one-vote activity poll.
/// @notice A wallet is not a verified student identity. Votes are public and final.
contract CampusBallot {
    string public constant APP_ID = "campus-ballot-v1";
    string public constant question = "What should our next campus activity be?";
    uint256 public immutable closesAt;
    uint256 public totalVotes;
    string[4] private options = [
        "Outdoor movie night", "Board game social", "Weekend nature walk", "Creative workshop"
    ];
    uint256[4] private counts;
    mapping(address => bool) public hasVoted;
    // 0 means no vote; 1–4 correspond to option IDs 0–3.
    mapping(address => uint256) public choiceOf;

    event VoteCast(address indexed voter, uint256 indexed optionId);

    constructor(uint256 durationInDays) {
        require(durationInDays >= 1 && durationInDays <= 365, "Choose 1 to 365 days");
        closesAt = block.timestamp + durationInDays * 1 days;
    }

    function vote(uint256 optionId) external {
        require(block.timestamp < closesAt, "Voting has closed");
        require(!hasVoted[msg.sender], "This wallet has already voted");
        require(optionId < options.length, "Invalid option");
        hasVoted[msg.sender] = true;
        choiceOf[msg.sender] = optionId + 1;
        counts[optionId] += 1;
        totalVotes += 1;
        emit VoteCast(msg.sender, optionId);
    }

    function getResults() external view returns (
        string[4] memory names, uint256[4] memory votes, uint256 total, uint256 deadline, bool isOpen
    ) {
        return (options, counts, totalVotes, closesAt, block.timestamp < closesAt);
    }
}
