// Auto-generated from Foundry artifacts. Do not edit manually.
// Run: pnpm --filter @playerco/shared generate-abis
export const POKER_TABLE_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_tableId",
        "type": "uint256"
      },
      {
        "name": "_smallBlind",
        "type": "uint256"
      },
      {
        "name": "_bigBlind",
        "type": "uint256"
      },
      {
        "name": "_vrfAdapter",
        "type": "address"
      },
      {
        "name": "_chipToken",
        "type": "address"
      },
      {
        "name": "_kycSBT",
        "type": "address"
      },
      {
        "name": "_actionTimeout",
        "type": "uint256"
      },
      {
        "name": "_vrfTimeout",
        "type": "uint256"
      },
      {
        "name": "_showdownTimeout",
        "type": "uint256"
      },
      {
        "name": "_numSeats",
        "type": "uint8"
      },
      {
        "name": "_dealer",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ACTION_TIMEOUT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DECK_SIZE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "EMERGENCY_TIMELOCK",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_SEATS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SHOWDOWN_TIMEOUT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDEALT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VRF_TIMEOUT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "actionDeadline",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "admin",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "advanceToPreflop",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allSeatsFilled",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bigBlind",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "buttonSeat",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "call",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "canCheck",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "canStartHand",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cashOutSeat",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      },
      {
        "name": "amount",
        "type": "uint256"
      },
      {
        "name": "recipient",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "check",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "chipToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "communityCards",
    "inputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "currentHand",
    "inputs": [],
    "outputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "pot",
        "type": "uint256"
      },
      {
        "name": "currentBet",
        "type": "uint256"
      },
      {
        "name": "lastRaiseSize",
        "type": "uint256"
      },
      {
        "name": "actorSeat",
        "type": "uint8"
      },
      {
        "name": "lastAggressor",
        "type": "uint8"
      },
      {
        "name": "actionsInRound",
        "type": "uint8"
      },
      {
        "name": "sidePotCount",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "currentHandId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "dealer",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "dealerSeedCommits",
    "inputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "dealerSeedReveals",
    "inputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "emergencyWithdrawRequestedAt",
    "inputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "encryptionKeys",
    "inputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeEmergencyWithdraw",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      },
      {
        "name": "recipient",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "fold",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "forceTimeout",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "fulfillVRF",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256"
      },
      {
        "name": "randomness",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "gameState",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getActionDeadline",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAmountToCall",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCommunityCards",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8[5]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEncryptionKey",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getHandInfo",
    "inputs": [],
    "outputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "pot",
        "type": "uint256"
      },
      {
        "name": "currentBetAmount",
        "type": "uint256"
      },
      {
        "name": "actorSeat",
        "type": "uint8"
      },
      {
        "name": "state",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRevealedHoleCards",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "seatIndex",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "card1",
        "type": "uint8"
      },
      {
        "name": "card2",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSeat",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "owner",
            "type": "address"
          },
          {
            "name": "operator",
            "type": "address"
          },
          {
            "name": "stack",
            "type": "uint256"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "currentBet",
            "type": "uint256"
          },
          {
            "name": "isAllIn",
            "type": "bool"
          },
          {
            "name": "totalHandBet",
            "type": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSidePot",
    "inputs": [
      {
        "name": "potIndex",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256"
      },
      {
        "name": "eligible",
        "type": "bool[9]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSidePotCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "holeCardVRFRandomnessHash",
    "inputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "holeCommits",
    "inputs": [
      {
        "name": "",
        "type": "uint256"
      },
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isHoleCardsRevealed",
    "inputs": [
      {
        "name": "",
        "type": "uint256"
      },
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "kycSBT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastActionBlock",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "leaveSeat",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      },
      {
        "name": "recipient",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "needsPostBlind",
    "inputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "numSeats",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingHoleCardVRFRequestId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingVRFRequestId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "playerRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "raise",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      },
      {
        "name": "raiseToAmount",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reRequestHoleCardVRF",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reRequestVRF",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registerEncryptionKey",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      },
      {
        "name": "pubKey",
        "type": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registerSeat",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      },
      {
        "name": "owner",
        "type": "address"
      },
      {
        "name": "operator",
        "type": "address"
      },
      {
        "name": "buyIn",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "requestEmergencyWithdraw",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revealDealerSeed",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "seed",
        "type": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revealHoleCards",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "seatIndex",
        "type": "uint8"
      },
      {
        "name": "card1",
        "type": "uint8"
      },
      {
        "name": "card2",
        "type": "uint8"
      },
      {
        "name": "salt",
        "type": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "seats",
    "inputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "owner",
        "type": "address"
      },
      {
        "name": "operator",
        "type": "address"
      },
      {
        "name": "stack",
        "type": "uint256"
      },
      {
        "name": "isActive",
        "type": "bool"
      },
      {
        "name": "currentBet",
        "type": "uint256"
      },
      {
        "name": "isAllIn",
        "type": "bool"
      },
      {
        "name": "totalHandBet",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setAdmin",
    "inputs": [
      {
        "name": "_newAdmin",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setBlinds",
    "inputs": [
      {
        "name": "_newSmallBlind",
        "type": "uint256"
      },
      {
        "name": "_newBigBlind",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setDealer",
    "inputs": [
      {
        "name": "_newDealer",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPlayerRegistry",
    "inputs": [
      {
        "name": "_registry",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setVRFAdapter",
    "inputs": [
      {
        "name": "_newAdapter",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settleShowdown",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "showdownStartTimestamp",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sidePots",
    "inputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "smallBlind",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "startHand",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitDealerSeedCommit",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "commitment",
        "type": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitHoleCommit",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "seatIndex",
        "type": "uint8"
      },
      {
        "name": "commitment",
        "type": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "tableId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "topUpSeat",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8"
      },
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "unpause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "verifyShuffleAtShowdown",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "seatCount",
        "type": "uint8"
      },
      {
        "name": "reveals",
        "type": "tuple[]",
        "components": [
          {
            "name": "card1",
            "type": "uint8"
          },
          {
            "name": "card2",
            "type": "uint8"
          },
          {
            "name": "salt",
            "type": "bytes32"
          },
          {
            "name": "commitment",
            "type": "bytes32"
          }
        ]
      },
      {
        "name": "vrfRandomness",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "vrfAdapter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vrfRequestTimestamp",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "ActionTaken",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "action",
        "type": "uint8",
        "indexed": false
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "potAfter",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdminUpdated",
    "inputs": [
      {
        "name": "oldAdmin",
        "type": "address",
        "indexed": true
      },
      {
        "name": "newAdmin",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BettingRoundComplete",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "fromState",
        "type": "uint8",
        "indexed": false
      },
      {
        "name": "toState",
        "type": "uint8",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BlindsUpdated",
    "inputs": [
      {
        "name": "oldSmallBlind",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "oldBigBlind",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "newSmallBlind",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "newBigBlind",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CardIntegrityViolation",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "card",
        "type": "uint8",
        "indexed": false
      },
      {
        "name": "communityIndex",
        "type": "uint8",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CommunityCardsDealt",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "street",
        "type": "uint8",
        "indexed": false
      },
      {
        "name": "cards",
        "type": "uint8[]",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DealerSeedCommitted",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "commitment",
        "type": "bytes32",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DealerSeedRevealed",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "seed",
        "type": "bytes32",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DealerUpdated",
    "inputs": [
      {
        "name": "oldDealer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "newDealer",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EmergencyWithdrawExecuted",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EmergencyWithdrawRequested",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "unlockAt",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EncryptionKeyRegistered",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "pubKey",
        "type": "bytes",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ForceTimeout",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "forcedAction",
        "type": "uint8",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HandSettled",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "winnerSeat",
        "type": "uint8",
        "indexed": false
      },
      {
        "name": "potAmount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HandStarted",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "smallBlind",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "bigBlind",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "buttonSeat",
        "type": "uint8",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HoleCardVRFFulfilled",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "randomnessHash",
        "type": "bytes32",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HoleCardVRFReRequested",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "oldRequestId",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "newRequestId",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HoleCardsRevealed",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "card1",
        "type": "uint8",
        "indexed": false
      },
      {
        "name": "card2",
        "type": "uint8",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HoleCommitSubmitted",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "commitment",
        "type": "bytes32",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "KYCCheckPassed",
    "inputs": [
      {
        "name": "player",
        "type": "address",
        "indexed": true
      },
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PlayerRegistryUpdated",
    "inputs": [
      {
        "name": "oldRegistry",
        "type": "address",
        "indexed": true
      },
      {
        "name": "newRegistry",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PostBlindPosted",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PotUpdated",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "pot",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SeatAllIn",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "totalBet",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SeatCashOut",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "stackAfter",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SeatClosed",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SeatEvicted",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SeatTopUp",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "stackAfter",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SeatUpdated",
    "inputs": [
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": false
      },
      {
        "name": "operator",
        "type": "address",
        "indexed": false
      },
      {
        "name": "stack",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ShowdownTimedOut",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "activePlayers",
        "type": "uint8",
        "indexed": false
      },
      {
        "name": "potAmount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ShuffleIntegrityViolation",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "dealerSeed",
        "type": "bytes32",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ShuffleUnverified",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ShuffleVerified",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "dealerSeed",
        "type": "bytes32",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TablePaused",
    "inputs": [
      {
        "name": "by",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TableUnpaused",
    "inputs": [
      {
        "name": "by",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TournamentWinner",
    "inputs": [
      {
        "name": "winner",
        "type": "address",
        "indexed": true
      },
      {
        "name": "seatIndex",
        "type": "uint8",
        "indexed": true
      },
      {
        "name": "finalStack",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VRFAdapterUpdated",
    "inputs": [
      {
        "name": "oldAdapter",
        "type": "address",
        "indexed": true
      },
      {
        "name": "newAdapter",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VRFReRequested",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "street",
        "type": "uint8",
        "indexed": false
      },
      {
        "name": "oldRequestId",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "newRequestId",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VRFRequested",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "street",
        "type": "uint8",
        "indexed": false
      },
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  { "type": "error", "name": "OneActionPerBlock", "inputs": [] },
  { "type": "error", "name": "InvalidGameState", "inputs": [] },
  { "type": "error", "name": "CannotStartHand", "inputs": [] },
  { "type": "error", "name": "VRFTimeoutNotReached", "inputs": [] },
  { "type": "error", "name": "ShowdownRevealWindowOpen", "inputs": [] },
  { "type": "error", "name": "CommitmentAlreadyExists", "inputs": [] },
  { "type": "error", "name": "NotYourTurn", "inputs": [] },
  {
    "type": "function",
    "name": "commitDecision",
    "inputs": [
      { "name": "seatIndex", "type": "uint8" },
      { "name": "commitHash", "type": "bytes32" },
      { "name": "reasoningHash", "type": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getReasoningHash",
    "inputs": [
      { "name": "handId", "type": "uint256" },
      { "name": "seatIndex", "type": "uint8" }
    ],
    "outputs": [{ "name": "", "type": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "revealDecision",
    "inputs": [
      { "name": "handId", "type": "uint256" },
      { "name": "seatIndex", "type": "uint8" },
      { "name": "action", "type": "string" },
      { "name": "reasoning", "type": "string" },
      { "name": "salt", "type": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "decisionCommits",
    "inputs": [
      { "name": "handId", "type": "uint256" },
      { "name": "seatIndex", "type": "uint8" }
    ],
    "outputs": [{ "name": "", "type": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "DecisionCommitted",
    "inputs": [
      { "name": "handId", "type": "uint256", "indexed": true },
      { "name": "seatIndex", "type": "uint8", "indexed": true },
      { "name": "commitHash", "type": "bytes32", "indexed": false },
      { "name": "reasoningHash", "type": "bytes32", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DecisionRevealed",
    "inputs": [
      { "name": "handId", "type": "uint256", "indexed": true },
      { "name": "seatIndex", "type": "uint8", "indexed": true },
      { "name": "action", "type": "string", "indexed": false },
      { "name": "reasoning", "type": "string", "indexed": false }
    ],
    "anonymous": false
  }
] as const;
