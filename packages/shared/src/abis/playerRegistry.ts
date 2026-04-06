// Auto-generated from Foundry artifacts. Do not edit manually.
// Run: pnpm --filter @playerco/shared generate-abis
export const PLAYER_REGISTRY_ABI = [
  {
    "type": "function",
    "name": "agents",
    "inputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "vault",
        "type": "address"
      },
      {
        "name": "table",
        "type": "address"
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
        "name": "metaURI",
        "type": "string"
      },
      {
        "name": "isRegistered",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deregisterAgent",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAgent",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "vault",
            "type": "address"
          },
          {
            "name": "table",
            "type": "address"
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
            "name": "metaURI",
            "type": "string"
          },
          {
            "name": "isRegistered",
            "type": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMetaURI",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getOperator",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      }
    ],
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
    "name": "getOwner",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      }
    ],
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
    "name": "getRegisteredAgentAt",
    "inputs": [
      {
        "name": "index",
        "type": "uint256"
      }
    ],
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
    "name": "getRegisteredCount",
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
    "name": "getTable",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      }
    ],
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
    "name": "getVault",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      }
    ],
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
    "name": "isAuthorized",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      },
      {
        "name": "account",
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
    "name": "isOperator",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      },
      {
        "name": "account",
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
    "name": "isOwner",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      },
      {
        "name": "account",
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
    "name": "isRegistered",
    "inputs": [
      {
        "name": "agent",
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
    "name": "registerAgent",
    "inputs": [
      {
        "name": "vault",
        "type": "address"
      },
      {
        "name": "table",
        "type": "address"
      },
      {
        "name": "operator",
        "type": "address"
      },
      {
        "name": "metaURI",
        "type": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registeredAgents",
    "inputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
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
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      },
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
    "name": "updateMetaURI",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      },
      {
        "name": "newMetaURI",
        "type": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateOperator",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      },
      {
        "name": "newOperator",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateTable",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      },
      {
        "name": "newTable",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateVault",
    "inputs": [
      {
        "name": "agent",
        "type": "address"
      },
      {
        "name": "newVault",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AgentDeregistered",
    "inputs": [
      {
        "name": "agent",
        "type": "address",
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
    "name": "AgentRegistered",
    "inputs": [
      {
        "name": "agent",
        "type": "address",
        "indexed": true
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": false
      },
      {
        "name": "table",
        "type": "address",
        "indexed": false
      },
      {
        "name": "operator",
        "type": "address",
        "indexed": false
      },
      {
        "name": "metaURI",
        "type": "string",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MetaURIUpdated",
    "inputs": [
      {
        "name": "agent",
        "type": "address",
        "indexed": true
      },
      {
        "name": "oldMetaURI",
        "type": "string",
        "indexed": false
      },
      {
        "name": "newMetaURI",
        "type": "string",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OperatorUpdated",
    "inputs": [
      {
        "name": "agent",
        "type": "address",
        "indexed": true
      },
      {
        "name": "oldOperator",
        "type": "address",
        "indexed": true
      },
      {
        "name": "newOperator",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnerUpdated",
    "inputs": [
      {
        "name": "agent",
        "type": "address",
        "indexed": true
      },
      {
        "name": "oldOwner",
        "type": "address",
        "indexed": true
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TableUpdated",
    "inputs": [
      {
        "name": "agent",
        "type": "address",
        "indexed": true
      },
      {
        "name": "oldTable",
        "type": "address",
        "indexed": true
      },
      {
        "name": "newTable",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultUpdated",
    "inputs": [
      {
        "name": "agent",
        "type": "address",
        "indexed": true
      },
      {
        "name": "oldVault",
        "type": "address",
        "indexed": true
      },
      {
        "name": "newVault",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  }
] as const;
