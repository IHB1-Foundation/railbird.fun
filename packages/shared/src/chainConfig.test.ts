// @playerco/shared - Chain config tests

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  getChainConfig,
  validateChainConfigEnv,
  clearChainConfigCache,
  ChainConfigError,
} from "./chainConfig.js";
import { ENV_VARS } from "./types.js";

// Helper to set all required env vars with valid test values
function setAllEnvVars(): void {
  process.env[ENV_VARS.CHAIN_ENV] = "testnet";
  process.env[ENV_VARS.RPC_URL] = "https://rpc.example.com";
  process.env[ENV_VARS.POKER_TABLE_ADDRESSES] =
    "0x1111111111111111111111111111111111111111,0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  process.env[ENV_VARS.PLAYER_REGISTRY_ADDRESS] = "0x2222222222222222222222222222222222222222";
  process.env[ENV_VARS.PLAYER_VAULT_ADDRESS] = "0x3333333333333333333333333333333333333333";
  process.env[ENV_VARS.VRF_ADAPTER_ADDRESS] = "0x4444444444444444444444444444444444444444";
  process.env[ENV_VARS.VRF_ADAPTER_TYPE] = "production";
}

// Helper to clear all env vars
function clearAllEnvVars(): void {
  delete process.env[ENV_VARS.CHAIN_ENV];
  delete process.env[ENV_VARS.RPC_URL];
  delete process.env[ENV_VARS.POKER_TABLE_ADDRESSES];
  delete process.env[ENV_VARS.PLAYER_REGISTRY_ADDRESS];
  delete process.env[ENV_VARS.PLAYER_VAULT_ADDRESS];
  delete process.env[ENV_VARS.VRF_ADAPTER_ADDRESS];
  delete process.env[ENV_VARS.VRF_ADAPTER_TYPE];
}

describe("chainConfig", () => {
  beforeEach(() => {
    clearAllEnvVars();
    clearChainConfigCache();
  });

  afterEach(() => {
    clearAllEnvVars();
    clearChainConfigCache();
  });

  describe("getChainConfig", () => {
    it("loads config successfully when all env vars are set", () => {
      setAllEnvVars();

      const config = getChainConfig();

      assert.strictEqual(config.env, "testnet");
      assert.strictEqual(config.chainId, 133);
      assert.strictEqual(config.rpcUrl, "https://rpc.example.com");
      assert.deepStrictEqual(config.contracts.pokerTables, [
        "0x1111111111111111111111111111111111111111",
        "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ]);
      assert.strictEqual(
        config.contracts.playerRegistry,
        "0x2222222222222222222222222222222222222222",
      );
    });

    it("supports single table address in comma-separated field", () => {
      setAllEnvVars();
      process.env[ENV_VARS.POKER_TABLE_ADDRESSES] = "0x1111111111111111111111111111111111111111";
      clearChainConfigCache();

      const config = getChainConfig();
      assert.strictEqual(config.contracts.pokerTables.length, 1);
    });

    it("throws ChainConfigError when CHAIN_ENV is missing", () => {
      setAllEnvVars();
      delete process.env[ENV_VARS.CHAIN_ENV];

      assert.throws(
        () => getChainConfig(),
        (err: Error) => {
          assert.ok(err instanceof ChainConfigError);
          assert.ok(err.message.includes("CHAIN_ENV"));
          return true;
        },
      );
    });

    it("throws ChainConfigError when RPC_URL is missing", () => {
      setAllEnvVars();
      delete process.env[ENV_VARS.RPC_URL];

      assert.throws(
        () => getChainConfig(),
        (err: Error) => {
          assert.ok(err instanceof ChainConfigError);
          assert.ok(err.message.includes("RPC_URL"));
          return true;
        },
      );
    });

    it("throws ChainConfigError for invalid CHAIN_ENV value", () => {
      setAllEnvVars();
      process.env[ENV_VARS.CHAIN_ENV] = "invalid";

      assert.throws(
        () => getChainConfig(),
        (err: Error) => {
          assert.ok(err instanceof ChainConfigError);
          assert.ok(err.message.includes("invalid"));
          return true;
        },
      );
    });

    it("throws ChainConfigError for invalid address in table list", () => {
      setAllEnvVars();
      process.env[ENV_VARS.POKER_TABLE_ADDRESSES] = "not-an-address";

      assert.throws(
        () => getChainConfig(),
        (err: Error) => {
          assert.ok(err instanceof ChainConfigError);
          assert.ok(err.message.includes("Invalid address"));
          return true;
        },
      );
    });

    it("throws ChainConfigError listing all missing addresses", () => {
      process.env[ENV_VARS.CHAIN_ENV] = "testnet";
      process.env[ENV_VARS.RPC_URL] = "https://rpc.example.com";
      // No addresses set

      assert.throws(
        () => getChainConfig(),
        (err: Error) => {
          assert.ok(err instanceof ChainConfigError);
          const configErr = err as ChainConfigError;
          assert.ok(configErr.missingVars);
          assert.ok(configErr.missingVars!.length > 0);
          return true;
        },
      );
    });

    it("caches config and returns same instance", () => {
      setAllEnvVars();

      const config1 = getChainConfig();
      const config2 = getChainConfig();

      assert.strictEqual(config1, config2);
    });

    it("reloads config when forceReload is true", () => {
      setAllEnvVars();

      const config1 = getChainConfig();
      process.env[ENV_VARS.RPC_URL] = "https://new-rpc.example.com";
      const config2 = getChainConfig(true);

      assert.notStrictEqual(config1, config2);
      assert.strictEqual(config2.rpcUrl, "https://new-rpc.example.com");
    });

    it("supports all three environments with correct chain IDs", () => {
      setAllEnvVars();

      process.env[ENV_VARS.CHAIN_ENV] = "local";
      clearChainConfigCache();
      assert.strictEqual(getChainConfig().env, "local");
      assert.strictEqual(getChainConfig().chainId, 31337);

      process.env[ENV_VARS.CHAIN_ENV] = "testnet";
      clearChainConfigCache();
      assert.strictEqual(getChainConfig().env, "testnet");
      assert.strictEqual(getChainConfig().chainId, 133);

      process.env[ENV_VARS.CHAIN_ENV] = "mainnet";
      clearChainConfigCache();
      assert.strictEqual(getChainConfig().env, "mainnet");
      assert.strictEqual(getChainConfig().chainId, 177);

      process.env.INITIA_CHAIN_ID = "12345";
      process.env[ENV_VARS.CHAIN_ENV] = "initia-testnet";
      clearChainConfigCache();
      assert.strictEqual(getChainConfig().env, "initia-testnet");
      assert.strictEqual(getChainConfig().chainId, 12345);
      delete process.env.INITIA_CHAIN_ID;
    });

    it("initia-testnet throws when INITIA_CHAIN_ID is unset (no silent 7777777 fallback)", () => {
      setAllEnvVars();
      process.env[ENV_VARS.CHAIN_ENV] = "initia-testnet";
      delete process.env.INITIA_CHAIN_ID;
      clearChainConfigCache();
      assert.throws(() => getChainConfig(), /INITIA_CHAIN_ID is required/);
    });

    it("initia-testnet uses INITIA_EXPLORER_URL when set", () => {
      setAllEnvVars();
      process.env[ENV_VARS.CHAIN_ENV] = "initia-testnet";
      process.env.INITIA_CHAIN_ID = "12345";
      process.env.INITIA_EXPLORER_URL = "https://custom-explorer.example.com";
      clearChainConfigCache();
      assert.strictEqual(getChainConfig().blockExplorerUrl, "https://custom-explorer.example.com");
      delete process.env.INITIA_EXPLORER_URL;
      delete process.env.INITIA_CHAIN_ID;
    });
  });

  describe("initia-testnet branch", () => {
    it("throws for missing addresses on initia-testnet", () => {
      process.env[ENV_VARS.CHAIN_ENV] = "initia-testnet";
      process.env[ENV_VARS.RPC_URL] = "https://rpc.initia-rollup.example.com";
      process.env[ENV_VARS.VRF_ADAPTER_TYPE] = "production";

      assert.throws(
        () => getChainConfig(),
        (err: Error) => {
          assert.ok(err instanceof ChainConfigError);
          const configErr = err as ChainConfigError;
          assert.ok(configErr.missingVars && configErr.missingVars.length > 0);
          return true;
        },
      );
    });
  });

  describe("VRF adapter type validation", () => {
    it("allows any adapter type on local environment", () => {
      setAllEnvVars();
      process.env[ENV_VARS.CHAIN_ENV] = "local";
      delete process.env[ENV_VARS.VRF_ADAPTER_TYPE];
      clearChainConfigCache();

      assert.doesNotThrow(() => getChainConfig());
    });

    it("requires production adapter type on testnet", () => {
      setAllEnvVars();
      process.env[ENV_VARS.CHAIN_ENV] = "testnet";
      delete process.env[ENV_VARS.VRF_ADAPTER_TYPE];
      clearChainConfigCache();

      assert.throws(
        () => getChainConfig(),
        (err: Error) => {
          assert.ok(err instanceof ChainConfigError);
          assert.ok(err.message.includes("VRF_ADAPTER_TYPE"));
          assert.ok(err.message.includes("production"));
          return true;
        },
      );
    });

    it("requires production adapter type on mainnet", () => {
      setAllEnvVars();
      process.env[ENV_VARS.CHAIN_ENV] = "mainnet";
      delete process.env[ENV_VARS.VRF_ADAPTER_TYPE];
      clearChainConfigCache();

      assert.throws(
        () => getChainConfig(),
        (err: Error) => {
          assert.ok(err instanceof ChainConfigError);
          assert.ok(err.message.includes("MockVRFAdapter"));
          return true;
        },
      );
    });

    it("succeeds on testnet with VRF_ADAPTER_TYPE=production", () => {
      setAllEnvVars();
      process.env[ENV_VARS.CHAIN_ENV] = "testnet";
      process.env[ENV_VARS.VRF_ADAPTER_TYPE] = "production";
      clearChainConfigCache();

      const config = getChainConfig();
      assert.strictEqual(config.env, "testnet");
    });

    it("rejects non-production adapter type on testnet", () => {
      setAllEnvVars();
      process.env[ENV_VARS.CHAIN_ENV] = "testnet";
      process.env[ENV_VARS.VRF_ADAPTER_TYPE] = "mock";
      clearChainConfigCache();

      assert.throws(
        () => getChainConfig(),
        (err: Error) => {
          assert.ok(err instanceof ChainConfigError);
          assert.ok(err.message.includes("mock"));
          return true;
        },
      );
    });
  });

  describe("validateChainConfigEnv", () => {
    it("returns empty array when all vars are set", () => {
      setAllEnvVars();

      const missing = validateChainConfigEnv();

      assert.deepStrictEqual(missing, []);
    });

    it("returns list of missing variables", () => {
      // Only set some vars
      process.env[ENV_VARS.CHAIN_ENV] = "testnet";
      process.env[ENV_VARS.RPC_URL] = "https://rpc.example.com";

      const missing = validateChainConfigEnv();

      assert.ok(missing.length > 0);
      assert.ok(missing.includes(ENV_VARS.POKER_TABLE_ADDRESSES));
    });

    it("does not throw even when vars are missing", () => {
      // No env vars set
      assert.doesNotThrow(() => validateChainConfigEnv());
    });

    it("includes VRF_ADAPTER_TYPE in missing vars for non-local env", () => {
      setAllEnvVars();
      delete process.env[ENV_VARS.VRF_ADAPTER_TYPE];
      // testnet env requires VRF_ADAPTER_TYPE
      const missing = validateChainConfigEnv();
      assert.ok(missing.includes(ENV_VARS.VRF_ADAPTER_TYPE));
    });

    it("does not require VRF_ADAPTER_TYPE for local env", () => {
      setAllEnvVars();
      process.env[ENV_VARS.CHAIN_ENV] = "local";
      delete process.env[ENV_VARS.VRF_ADAPTER_TYPE];
      const missing = validateChainConfigEnv();
      assert.ok(!missing.includes(ENV_VARS.VRF_ADAPTER_TYPE));
    });
  });
});

// Run tests
console.log("Running chainConfig tests...\n");
