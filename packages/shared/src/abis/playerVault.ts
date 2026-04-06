// Auto-generated from Foundry artifacts. Do not edit manually.
// Run: pnpm --filter @playerco/shared generate-abis
export const PLAYER_VAULT_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_owner",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "authorizeTable",
    "inputs": [
      {
        "name": "table",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "authorizedTables",
    "inputs": [
      {
        "name": "",
        "type": "address"
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
    "name": "cumulativePnl",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "emitSnapshot",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "fundBuyIn",
    "inputs": [
      {
        "name": "table",
        "type": "address"
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
    "name": "getAvailableBalance",
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
    "name": "getCumulativePnl",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getExternalAssets",
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
    "name": "getHandCount",
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
    "name": "handCount",
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
    "name": "initialize",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "initialized",
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
    "name": "lastSnapshotHandId",
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
    "name": "onSettlement",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "pnl",
        "type": "int256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "owner",
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
    "name": "receiveSettlement",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "recordRebalanceBuy",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "monIn",
        "type": "uint256"
      },
      {
        "name": "tokenOut",
        "type": "uint256"
      },
      {
        "name": "navBefore",
        "type": "uint256"
      },
      {
        "name": "navAfter",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordRebalanceSell",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256"
      },
      {
        "name": "tokenIn",
        "type": "uint256"
      },
      {
        "name": "monOut",
        "type": "uint256"
      },
      {
        "name": "navBefore",
        "type": "uint256"
      },
      {
        "name": "navAfter",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "releaseEscrow",
    "inputs": [
      {
        "name": "table",
        "type": "address"
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
    "name": "revokeTable",
    "inputs": [
      {
        "name": "table",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "tableEscrow",
    "inputs": [
      {
        "name": "",
        "type": "address"
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
    "name": "totalEscrow",
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
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [
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
    "type": "event",
    "name": "BuyInFunded",
    "inputs": [
      {
        "name": "table",
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
    "name": "Deposited",
    "inputs": [
      {
        "name": "from",
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
    "name": "EscrowReleased",
    "inputs": [
      {
        "name": "table",
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
    "name": "RebalanceBuy",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "monIn",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "tokenOut",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "navBefore",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "navAfter",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RebalanceSell",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "tokenIn",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "monOut",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "navBefore",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "navAfter",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SettlementLoss",
    "inputs": [
      {
        "name": "table",
        "type": "address",
        "indexed": true
      },
      {
        "name": "handId",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "lossAmount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SettlementReceived",
    "inputs": [
      {
        "name": "table",
        "type": "address",
        "indexed": true
      },
      {
        "name": "handId",
        "type": "uint256",
        "indexed": false
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
    "name": "VaultInitialized",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true
      },
      {
        "name": "initialAssets",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultSnapshot",
    "inputs": [
      {
        "name": "handId",
        "type": "uint256",
        "indexed": true
      },
      {
        "name": "externalAssets",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "cumulativePnl",
        "type": "int256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Withdrawn",
    "inputs": [
      {
        "name": "to",
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
  }
] as const;
