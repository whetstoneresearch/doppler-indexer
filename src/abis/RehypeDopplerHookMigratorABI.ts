export const RehypeDopplerHookMigratorABI = [
  {
    "inputs": [
      {
        "internalType": "contract DopplerHookMigrator",
        "name": "migrator",
        "type": "address"
      },
      {
        "internalType": "contract IPoolManager",
        "name": "poolManager_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "FeeDistributionMustAddUpToWAD",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SenderNotAirlockOwner",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SenderNotAuthorized",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SenderNotMigrator",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "PoolId",
        "name": "poolId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "airlockOwner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint128",
        "name": "fees0",
        "type": "uint128"
      },
      {
        "indexed": false,
        "internalType": "uint128",
        "name": "fees1",
        "type": "uint128"
      }
    ],
    "name": "AirlockOwnerFeesClaimed",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MIGRATOR",
    "outputs": [
      {
        "internalType": "contract DopplerHookMigrator",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "asset",
        "type": "address"
      }
    ],
    "name": "claimAirlockOwnerFees",
    "outputs": [
      {
        "internalType": "uint128",
        "name": "fees0",
        "type": "uint128"
      },
      {
        "internalType": "uint128",
        "name": "fees1",
        "type": "uint128"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "asset",
        "type": "address"
      }
    ],
    "name": "collectFees",
    "outputs": [
      {
        "internalType": "BalanceDelta",
        "name": "fees",
        "type": "int256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "PoolId",
        "name": "poolId",
        "type": "bytes32"
      }
    ],
    "name": "getFeeDistributionInfo",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "assetBuybackPercentWad",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "numeraireBuybackPercentWad",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "beneficiaryPercentWad",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lpPercentWad",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "PoolId",
        "name": "poolId",
        "type": "bytes32"
      }
    ],
    "name": "getHookFees",
    "outputs": [
      {
        "internalType": "uint128",
        "name": "fees0",
        "type": "uint128"
      },
      {
        "internalType": "uint128",
        "name": "fees1",
        "type": "uint128"
      },
      {
        "internalType": "uint128",
        "name": "beneficiaryFees0",
        "type": "uint128"
      },
      {
        "internalType": "uint128",
        "name": "beneficiaryFees1",
        "type": "uint128"
      },
      {
        "internalType": "uint128",
        "name": "airlockOwnerFees0",
        "type": "uint128"
      },
      {
        "internalType": "uint128",
        "name": "airlockOwnerFees1",
        "type": "uint128"
      },
      {
        "internalType": "uint24",
        "name": "customFee",
        "type": "uint24"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "PoolId",
        "name": "poolId",
        "type": "bytes32"
      }
    ],
    "name": "getPoolInfo",
    "outputs": [
      {
        "internalType": "address",
        "name": "asset",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "numeraire",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "buybackDst",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "PoolId",
        "name": "poolId",
        "type": "bytes32"
      }
    ],
    "name": "getPosition",
    "outputs": [
      {
        "internalType": "int24",
        "name": "tickLower",
        "type": "int24"
      },
      {
        "internalType": "int24",
        "name": "tickUpper",
        "type": "int24"
      },
      {
        "internalType": "uint128",
        "name": "liquidity",
        "type": "uint128"
      },
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sender",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "Currency",
            "name": "currency0",
            "type": "address"
          },
          {
            "internalType": "Currency",
            "name": "currency1",
            "type": "address"
          },
          {
            "internalType": "uint24",
            "name": "fee",
            "type": "uint24"
          },
          {
            "internalType": "int24",
            "name": "tickSpacing",
            "type": "int24"
          },
          {
            "internalType": "contract IHooks",
            "name": "hooks",
            "type": "address"
          }
        ],
        "internalType": "struct PoolKey",
        "name": "key",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "bool",
            "name": "zeroForOne",
            "type": "bool"
          },
          {
            "internalType": "int256",
            "name": "amountSpecified",
            "type": "int256"
          },
          {
            "internalType": "uint160",
            "name": "sqrtPriceLimitX96",
            "type": "uint160"
          }
        ],
        "internalType": "struct IPoolManager.SwapParams",
        "name": "params",
        "type": "tuple"
      },
      {
        "internalType": "BalanceDelta",
        "name": "balanceDelta",
        "type": "int256"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "onAfterSwap",
    "outputs": [
      {
        "internalType": "Currency",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "int128",
        "name": "",
        "type": "int128"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sender",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "Currency",
            "name": "currency0",
            "type": "address"
          },
          {
            "internalType": "Currency",
            "name": "currency1",
            "type": "address"
          },
          {
            "internalType": "uint24",
            "name": "fee",
            "type": "uint24"
          },
          {
            "internalType": "int24",
            "name": "tickSpacing",
            "type": "int24"
          },
          {
            "internalType": "contract IHooks",
            "name": "hooks",
            "type": "address"
          }
        ],
        "internalType": "struct PoolKey",
        "name": "key",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "bool",
            "name": "zeroForOne",
            "type": "bool"
          },
          {
            "internalType": "int256",
            "name": "amountSpecified",
            "type": "int256"
          },
          {
            "internalType": "uint160",
            "name": "sqrtPriceLimitX96",
            "type": "uint160"
          }
        ],
        "internalType": "struct IPoolManager.SwapParams",
        "name": "params",
        "type": "tuple"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "onBeforeSwap",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "asset",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "Currency",
            "name": "currency0",
            "type": "address"
          },
          {
            "internalType": "Currency",
            "name": "currency1",
            "type": "address"
          },
          {
            "internalType": "uint24",
            "name": "fee",
            "type": "uint24"
          },
          {
            "internalType": "int24",
            "name": "tickSpacing",
            "type": "int24"
          },
          {
            "internalType": "contract IHooks",
            "name": "hooks",
            "type": "address"
          }
        ],
        "internalType": "struct PoolKey",
        "name": "key",
        "type": "tuple"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "onInitialization",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "poolManager",
    "outputs": [
      {
        "internalType": "contract IPoolManager",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "quoter",
    "outputs": [
      {
        "internalType": "contract Quoter",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "PoolId",
        "name": "poolId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "assetBuybackPercentWad",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "numeraireBuybackPercentWad",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "beneficiaryPercentWad",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lpPercentWad",
        "type": "uint256"
      }
    ],
    "name": "setFeeDistribution",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
] as const;