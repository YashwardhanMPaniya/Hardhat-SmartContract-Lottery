//SPDX-License-Identifier:MIT
pragma solidity ^0.8.8;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

//import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

contract Raffle is VRFConsumerBaseV2, AutomationCompatibleInterface {
    /*Types */
    enum raffleState {
        OPEN,
        CLOSE,
        CALCULATING
    }

    /*state variables */
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    uint16 private constant REQUEST_CONFIRMATION = 3;
    uint32 private constant NUMS = 1;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;

    //Lottery Variable
    address private s_recentWinner;
    raffleState s_raffleState;
    uint256 private s_lastTimestamp;
    uint256 private immutable i_interval;

    /*Error */
    error Raffle_notEnoughETHEntered();
    error Raffle_TransactionFailed();
    error Raffle_LotteryIsCloseNow();
    error Raffle__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

    constructor(
        address vrfCoordinatorV2,
        uint64 subscriptionId,
        bytes32 gasLane,
        uint256 interval,
        uint256 entranceFee,
        uint32 callbackGasLimit
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_subscriptionId = subscriptionId;
        i_gasLane = gasLane;
        i_interval = interval;
        i_entranceFee = entranceFee;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = raffleState.OPEN;
        s_lastTimestamp = block.timestamp;
    }

    // vrfCoordinatorV2Address,
    //     subscriptionId,
    //     networkConfig[chainId]["gasLane"],
    //     networkConfig[chainId]["keepersUpdateInterval"],
    //     networkConfig[chainId]["raffleEntranceFee"],
    //     networkConfig[chainId]["callbackGasLimit"],

    //Event
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 requestId);
    event ListOfWinner(address recentWinner);

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle_notEnoughETHEntered();
        }
        if (s_raffleState != raffleState.OPEN) {
            revert Raffle_LotteryIsCloseNow();
        }

        s_players.push(payable(msg.sender));
        emit RaffleEnter(msg.sender);
    }

    /**
     * @dev This is the function that the Chainlink Keeper nodes call
     * they look for `upkeepNeeded` to return True.
     * the following should be true for this to return true:
     * 1. The time interval has passed between raffle runs.
     * 2. The lottery is open.
     * 3. The contract has ETH.
     * 4. Implicity, your subscription is funded with LINK.
     */
    function checkUpkeep(
        bytes memory /* checkData */
    ) public view override returns (bool upkeepNeeded, bytes memory /* performData */) {
        bool isOpen = s_raffleState == raffleState.OPEN;
        bool isTrue = block.timestamp - s_lastTimestamp > i_interval;
        bool hasETH = address(this).balance > 0;
        bool hasPlayer = s_players.length > 0;

        upkeepNeeded = ((isOpen && isTrue) && (hasETH && hasPlayer));
        return (upkeepNeeded, "0*0");
    }

    function performUpkeep(bytes calldata /* performData */) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");

        if (!upkeepNeeded) {
            revert Raffle__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        s_raffleState = raffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATION,
            i_callbackGasLimit,
            NUMS
        );

        emit RequestedRaffleWinner(requestId);
    }

    function fulfillRandomWords(
        uint256 /*requestId*/,
        uint256[] memory randomWords
    ) internal override {
        uint256 getRandomNumber = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[getRandomNumber];
        s_recentWinner = recentWinner;
        s_players = new address payable[](0);
        s_raffleState = raffleState.OPEN;
        s_lastTimestamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle_TransactionFailed();
        }
        emit ListOfWinner(recentWinner);
    }

    /*view and pure function */
    function getentranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getLastTimeStamp() public view returns (uint256) {
        return s_lastTimestamp;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getRaffleState() public view returns (raffleState) {
        return s_raffleState;
    }
}
