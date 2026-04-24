from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PitchSnapshot:
    app_url: str
    demo_video_url: str
    rollup_chain_id: str
    rpc_url: str
    launch_tx_url: str
    launch_tx_hash: str
    bridge_id: str
    cosmos_chain_id: str
    network: str
    low_table_address: str
    high_table_address: str
    chip_token_address: str
    sidebet_pool_address: str

    @property
    def short_launch_tx(self) -> str:
        return f"{self.launch_tx_hash[:10]}...{self.launch_tx_hash[-8:]}"


def load_pitch_snapshot(root: Path | None = None) -> PitchSnapshot:
    if root is None:
        root = Path(__file__).resolve().parent.parent

    submission = json.loads((root / ".initia" / "submission.json").read_text())
    rollup = json.loads((root / "infra" / "initia" / "rollup.json").read_text())
    deployments = json.loads((root / "infra" / "initia" / "deployments.json").read_text())
    contracts = deployments["contracts"]

    poker_tables = contracts.get("pokerTables") or []

    return PitchSnapshot(
        app_url=submission["demoUrl"],
        demo_video_url=submission["demoVideo"],
        rollup_chain_id=str(rollup["chainId"]),
        rpc_url=rollup["rpcUrl"],
        launch_tx_url=rollup["explorerUrl"],
        launch_tx_hash=rollup["launchTxHash"],
        bridge_id=str(rollup["bridgeId"]),
        cosmos_chain_id=str(rollup["cosmosChainId"]),
        network=str(rollup["network"]),
        low_table_address=(poker_tables[0] if len(poker_tables) > 0 else ""),
        high_table_address=(poker_tables[1] if len(poker_tables) > 1 else ""),
        chip_token_address=str(contracts["chipToken"]),
        sidebet_pool_address=str(contracts["sideBetPool"]),
    )
