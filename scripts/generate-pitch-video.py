#!/usr/bin/env python3
"""Generate Railbird pitch video: slide images + TTS + ffmpeg.

Usage:
    python3 scripts/generate-pitch-video.py
"""

import os, sys, wave, subprocess, textwrap, time, shutil, hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from pitch_snapshot import load_pitch_snapshot

try:
    from google import genai
    from google.genai import types
except ImportError:  # pragma: no cover - optional when using local macOS TTS
    genai = None
    types = None

# ── Config ───────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
VOICE_NAME = "Fenrir"
TTS_MODEL = "gemini-2.5-flash-preview-tts"
SAY_VOICE = os.environ.get("PITCH_SAY_VOICE", "Samantha")
TTS_BACKEND = os.environ.get(
    "PITCH_TTS_BACKEND",
    "say" if shutil.which("say") else "gemini",
).strip().lower()
FORCE_REGEN_AUDIO = os.environ.get("PITCH_FORCE_REGEN_AUDIO") == "true"

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "pitch-video"
SLIDES_DIR = OUT_DIR / "slides"
AUDIO_DIR = OUT_DIR / "audio"
FINAL_VIDEO = ROOT / "Railbird_Pitch.mp4"

SNAPSHOT = load_pitch_snapshot(ROOT)
APP_URL = SNAPSHOT.app_url.replace("https://", "")
DEMO_VIDEO_URL = SNAPSHOT.demo_video_url.replace("https://", "")
ROLLUP_CHAIN_ID = SNAPSHOT.rollup_chain_id
COSMOS_CHAIN_ID = SNAPSHOT.cosmos_chain_id
BRIDGE_ID = SNAPSHOT.bridge_id
RPC_URL = SNAPSHOT.rpc_url
LAUNCH_TX_URL = SNAPSHOT.launch_tx_url
LAUNCH_TX_SHORT = SNAPSHOT.short_launch_tx

W, H = 1920, 1080

# ── Brand Colors ─────────────────────────────────────────────────
BG       = (6, 7, 11)
BG_SOFT  = (13, 16, 32)
FG       = (247, 248, 255)
ACCENT   = (129, 108, 249)
ACC_SOFT = (200, 169, 255)
CYAN     = (34, 211, 238)
GOLD     = (250, 204, 21)
LIME     = (163, 230, 53)
VIOLET   = (167, 139, 250)
DANGER   = (239, 68, 68)
MUTED    = (124, 132, 162)
MUT_SOFT = (155, 163, 193)
CARD_BG  = (16, 18, 33)
CARD_BD  = (35, 39, 58)

# ── Fonts ────────────────────────────────────────────────────────
_font_cache = {}

def font(size, bold=False, mono=False):
    key = (size, bold, mono)
    if key in _font_cache:
        return _font_cache[key]
    if mono:
        path = "/System/Library/Fonts/Menlo.ttc"
    elif bold:
        path = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    else:
        path = "/System/Library/Fonts/Supplemental/Arial.ttf"
    f = ImageFont.truetype(path, size)
    _font_cache[key] = f
    return f


# ── Drawing Helpers ──────────────────────────────────────────────
def draw_rounded_rect(draw, xy, fill, outline=None, radius=12):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)


def draw_card(draw, x, y, w, h, title, bullets, title_color=ACCENT,
              title_size=20, bullet_size=15):
    """Draw a card with title + bullet list."""
    draw_rounded_rect(draw, (x, y, x+w, y+h), fill=CARD_BG, outline=CARD_BD)
    # Title
    tx, ty = x + 24, y + 18
    draw.text((tx, ty), title, fill=title_color, font=font(title_size, bold=True))
    # Bullets
    by = ty + title_size + 14
    for bullet in bullets:
        lines = textwrap.wrap(bullet, width=int(w / (bullet_size * 0.55)))
        for line in lines:
            draw.text((tx, by), line, fill=MUT_SOFT, font=font(bullet_size))
            by += bullet_size + 6
        by += 4


def draw_tag_title(draw, tag, title, tag_color=ACCENT, y_start=60):
    """Draw slide tag + accent line + title."""
    # Tag
    draw.text((120, y_start), tag.upper(), fill=tag_color,
              font=font(14, mono=True))
    # Accent line
    draw.rectangle((120, y_start + 28, 280, y_start + 31), fill=tag_color)
    # Title
    draw.text((120, y_start + 44), title, fill=FG,
              font=font(34, bold=True))
    return y_start + 44 + 50  # return content start y


def wrap_text(text, draw, fnt, max_width):
    """Wrap text to fit within max_width pixels."""
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=fnt)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


# ── Slide Definitions ────────────────────────────────────────────

def slide_01_title():
    """Title slide."""
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    # Left accent bar
    draw.rectangle((0, 0, 6, H), fill=ACCENT)
    # Accent line
    draw.rectangle((160, 280, 420, 283), fill=ACCENT)
    # RAILBIRD
    draw.text((160, 310), "RAILBIRD", fill=FG, font=font(80, bold=True))
    # Subtitle
    draw.text((160, 420), "Autonomous AI Poker on Its Own Initia Appchain",
              fill=ACC_SOFT, font=font(28))
    # Context
    draw.text((160, 500), f"INITIA TESTNET  |  Gaming + AI  |  Chain ID {ROLLUP_CHAIN_ID}",
              fill=MUTED, font=font(16))
    # URL
    draw.text((160, 580), APP_URL, fill=CYAN, font=font(22, mono=True))
    return img


def slide_02_problem():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "Problem",
                        "On-chain gaming has two trust failures",
                        tag_color=DANGER)
    cy += 20
    # Left card
    draw_card(draw, 120, cy, 780, 360,
              "Centralized Dealers",
              ["The house sees every card before you do",
               "Outcomes can be silently manipulated",
               "Zero on-chain proof of fairness",
               "Players must blindly trust the operator"],
              title_color=DANGER, title_size=22, bullet_size=16)
    # Right card
    draw_card(draw, 960, cy, 780, 360,
              "Opaque AI Agents",
              ["AI makes DeFi decisions with zero transparency",
               "No way to verify what the AI actually decided",
               "Black-box strategies erode user trust",
               "No auditability after the fact"],
              title_color=DANGER, title_size=22, bullet_size=16)
    # Bottom question
    qy = cy + 400
    draw.text((120, qy),
              "What if every shuffle was provably fair",
              fill=ACC_SOFT, font=font(20, bold=True))
    draw.text((120, qy + 30),
              "and every AI decision was recorded on-chain?",
              fill=ACC_SOFT, font=font(20, bold=True))
    return img


def slide_03_solution():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "Solution",
                        "Fully on-chain poker with verifiable AI")
    cy += 20
    pillars = [
        ("Trustless Dealer", LIME,
         ["VRF randomness + dealer pre-commit",
          "Deterministic Fisher-Yates shuffle",
          "Verified on-chain at showdown",
          "No entity can manipulate the deck"]),
        ("ECIES Encrypted Cards", CYAN,
         ["Wallet public key encrypts each hand",
          "Only the seat owner can decrypt",
          "keccak256 commit / reveal integrity",
          "Not even our servers can read cards"]),
        ("Verifiable AI", VIOLET,
         ["Gemini-based reasoning engine",
          "Decision hash committed on-chain",
          "Anyone can audit any action",
          "Full transparency without trust"]),
    ]
    cw = 520
    for i, (title, color, bullets) in enumerate(pillars):
        x = 120 + i * (cw + 40)
        # Color bar
        draw.rectangle((x, cy, x + cw, cy + 4), fill=color)
        draw_card(draw, x, cy + 6, cw, 380, title, bullets,
                  title_color=color, title_size=21, bullet_size=15)
    return img


def slide_04_architecture():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "Architecture",
                        "Three layers on Initia")
    cy += 10
    # On-chain band
    draw.rectangle((120, cy, W - 120, cy + 40), fill=ACCENT)
    draw.text((140, cy + 8),
              "ON-CHAIN — Railbird MiniEVM Rollup on Initia",
              fill=BG, font=font(14, mono=True))
    # Contract boxes
    contracts = ["PokerTable", "SideBetPool", "VRFAdapter",
                 "ChipToken", "PlayerRegistry", "PlayerVault"]
    bw = 250
    by = cy + 55
    for i, name in enumerate(contracts):
        bx = 130 + i * (bw + 16)
        draw_rounded_rect(draw, (bx, by, bx + bw, by + 50),
                          fill=CARD_BG, outline=ACCENT)
        tw = draw.textbbox((0, 0), name, font=font(13, mono=True))
        tx = bx + (bw - (tw[2] - tw[0])) // 2
        draw.text((tx, by + 14), name, fill=ACC_SOFT,
                  font=font(13, mono=True))
    # Off-chain band
    ocy = by + 75
    draw.rectangle((120, ocy, W - 120, ocy + 35), fill=CYAN)
    draw.text((140, ocy + 7), "OFF-CHAIN SERVICES",
              fill=BG, font=font(14, mono=True))
    # Off-chain cards
    draw_card(draw, 120, ocy + 50, 780, 200,
              "Indexer + WebSocket API",
              ["Contract events -> Postgres -> REST + WS",
               "Real-time table state streaming",
               "Leaderboard aggregation"],
              title_color=CYAN, title_size=19, bullet_size=14)
    draw_card(draw, 960, ocy + 50, 780, 200,
              "OwnerView + Dealer Service",
              ["Wallet-signature authentication",
               "ECIES hole card delivery (owner-only)",
               "KeeperBot for liveness"],
              title_color=CYAN, title_size=19, bullet_size=14)
    # AI band
    acy = ocy + 270
    draw.rectangle((120, acy, W - 120, acy + 35), fill=VIOLET)
    draw.text((140, acy + 7),
              "AI LAYER — 4x Gemini 2.0 Flash | hand strength + pot odds + opponent modeling | on-chain hash",
              fill=BG, font=font(12, mono=True))
    return img


def slide_05_agents():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "AI Agents",
                        "Four autonomous personalities")
    cy += 20
    agents = [
        ("Aegis", "Tight", "0.2",
         ["Patient, disciplined", "Waits for premium hands", "Rarely bluffs"],
         CYAN),
        ("Maverick", "Balanced", "0.4",
         ["Reads opponents, adapts", "Mixes value & bluffs", "Solid fundamentals"],
         ACCENT),
        ("Nova", "Loose", "0.6",
         ["Creative lines", "Plays many hands", "Finds unorthodox spots"],
         GOLD),
        ("Rex", "Maniac", "0.8",
         ["Maximum pressure", "Relentless aggression", "Forces hard decisions"],
         DANGER),
    ]
    cw = 380
    for i, (name, style, aggr, desc, color) in enumerate(agents):
        x = 120 + i * (cw + 30)
        # Color top bar
        draw.rectangle((x, cy, x + cw, cy + 4), fill=color)
        # Card
        draw_rounded_rect(draw, (x, cy + 6, x + cw, cy + 450),
                          fill=CARD_BG, outline=color)
        # Name
        nb = draw.textbbox((0, 0), name, font=font(32, bold=True))
        nx = x + (cw - (nb[2] - nb[0])) // 2
        draw.text((nx, cy + 40), name, fill=color, font=font(32, bold=True))
        # Style
        sb = draw.textbbox((0, 0), style, font=font(16, bold=True))
        sx = x + (cw - (sb[2] - sb[0])) // 2
        draw.text((sx, cy + 90), style, fill=FG, font=font(16, bold=True))
        # Aggression
        atxt = f"Aggression  {aggr}"
        ab = draw.textbbox((0, 0), atxt, font=font(12, mono=True))
        ax = x + (cw - (ab[2] - ab[0])) // 2
        draw.text((ax, cy + 125), atxt, fill=MUTED, font=font(12, mono=True))
        # Description
        dy = cy + 180
        for line in desc:
            lb = draw.textbbox((0, 0), line, font=font(15))
            lx = x + (cw - (lb[2] - lb[0])) // 2
            draw.text((lx, dy), line, fill=MUT_SOFT, font=font(15))
            dy += 30
    return img


def slide_06_initia():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "Initia",
                        "Why this belongs on its own appchain", tag_color=CYAN)
    cy += 20
    features = [
        ("Own Appchain Identity", VIOLET,
         ["Dedicated Railbird rollup",
          f"Chain ID {ROLLUP_CHAIN_ID}",
          "Product and chain move together"]),
        ("MiniEVM Fast Path", LIME,
         ["Standard Solidity + Foundry",
          "No VM rewrite to prove the stack",
          "Fast path from contracts to live chain"]),
        ("Bridge + Ecosystem Surface", CYAN,
         [f"Bridge ID {BRIDGE_ID}",
          f"Cosmos chain {COSMOS_CHAIN_ID}",
          "Appchain-native discovery surface"]),
        ("Public Chain Evidence", GOLD,
         ["Live RPC and launch tx are public",
          "Judges can verify directly",
          "Submission metadata points to real links"]),
    ]
    hw, hh = 780, 210
    for i, (title, color, bullets) in enumerate(features):
        col, row = i % 2, i // 2
        x = 120 + col * (hw + 40)
        y = cy + row * (hh + 30)
        # Color left bar
        draw.rectangle((x, y, x + 4, y + hh), fill=color)
        draw_card(draw, x, y, hw, hh, title, bullets,
                  title_color=color, title_size=19, bullet_size=14)
    # Footer
    fy = cy + 2 * (hh + 30) + 10
    ftxt = f"RPC {RPC_URL}  |  Launch tx {LAUNCH_TX_SHORT}"
    fb = draw.textbbox((0, 0), ftxt, font=font(13, mono=True))
    fx = (W - (fb[2] - fb[0])) // 2
    draw.text((fx, fy), ftxt, fill=MUTED, font=font(13, mono=True))
    return img


def slide_07_demo():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "Live Product", APP_URL)
    draw.text((120, cy - 10),
              "Public app. Public video. Public chain evidence.",
              fill=ACC_SOFT, font=font(20))
    cy += 30
    items = [
        ("Landing + Live Dashboard",
         "Season banner  |  live stats  |  featured table entrypoint"),
        ("Table + Verify Surface",
         "Community cards, pot, action log  |  audit trail and reasoning hash flow"),
        ("Leaderboard + Agent Pages",
         "ROI, PnL, win rate, drawdown  |  persona and recent hand detail"),
        ("Create-Agent + Demo Video",
         f"Open deployment flow  |  public walkthrough at {DEMO_VIDEO_URL}"),
    ]
    for i, (title, desc) in enumerate(items):
        y = cy + i * 115
        draw_rounded_rect(draw, (120, y, W - 120, y + 100),
                          fill=CARD_BG, outline=CARD_BD)
        draw.text((150, y + 14), title, fill=ACCENT,
                  font=font(18, bold=True))
        draw.text((150, y + 48), desc, fill=MUT_SOFT, font=font(14))
    return img


def slide_08_sidebet():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "Rollup Evidence",
                        "Judge quick path",
                        tag_color=GOLD)
    cy += 10
    # Left: How it works
    draw.text((120, cy), "PUBLIC LINKS", fill=GOLD,
              font=font(13, mono=True))
    steps = [
        ("1. App", APP_URL),
        ("2. Live", f"{APP_URL}/live"),
        ("3. Video", "railbird.fun/videos/...mp4"),
        ("4. Launch TX", LAUNCH_TX_SHORT),
    ]
    sy = cy + 35
    for step_title, step_desc in steps:
        draw.text((120, sy), step_title, fill=GOLD,
                  font=font(17, bold=True))
        draw.text((120, sy + 28), step_desc, fill=MUT_SOFT, font=font(14))
        sy += 90

    # Right: Why it matters
    rx = 960
    draw.text((rx, cy), "ROLLUP FACTS", fill=ACCENT,
              font=font(13, mono=True))
    defi = [
        ("Chain ID", ACCENT, ROLLUP_CHAIN_ID),
        ("Cosmos Chain", CYAN, COSMOS_CHAIN_ID),
        ("Bridge ID", LIME, BRIDGE_ID),
        ("RPC", VIOLET, RPC_URL.replace("https://", "")),
    ]
    dy = cy + 35
    for title, color, desc in defi:
        draw.rectangle((rx, dy + 4, rx + 10, dy + 14), fill=color)
        draw.text((rx + 20, dy), title, fill=color,
                  font=font(16, bold=True))
        draw.text((rx + 20, dy + 28), desc, fill=MUT_SOFT, font=font(13))
        dy += 90
    return img


def slide_09_security():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "Security",
                        "Trust model & on-chain guarantees")
    cy += 20
    items = [
        ("Commit / Reveal", LIME,
         "keccak256 commitments on-chain. Cards + salt revealed at showdown. "
         "Post-hoc integrity is mathematically guaranteed."),
        ("Anti-MEV", CYAN,
         "One action per block per table. Prevents front-running and sandwich attacks. "
         "Deterministic ordering at contract level."),
        ("Liveness Guarantees", VIOLET,
         "30-minute turn timeouts. Any address can call forceTimeout(). "
         "Keeper incentives ensure the game always progresses."),
        ("Non-Dilutive Treasury", GOLD,
         "Vault reverts if trade would reduce NAV/share. "
         "Existing holders are never diluted. It's a require statement."),
    ]
    for i, (title, color, desc) in enumerate(items):
        y = cy + i * 135
        draw.rectangle((120, y + 4, 132, y + 16), fill=color)
        draw.text((148, y), title, fill=color,
                  font=font(19, bold=True))
        # Wrap description
        lines = wrap_text(desc, draw, font(14), W - 300)
        for j, line in enumerate(lines):
            draw.text((148, y + 32 + j * 22), line, fill=MUT_SOFT,
                      font=font(14))
    return img


def slide_10_ecosystem():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "Ecosystem Impact",
                        "An open AI arena on Initia",
                        tag_color=CYAN)
    cy += 10
    # Left: flywheel
    draw.text((120, cy), "AI ECOSYSTEM", fill=CYAN,
              font=font(13, mono=True))
    flywheel = [
        ("Open AI Arena",
         "Anyone deploys custom AI agents via wizard."),
        ("Natural Onboarding",
         "Free spectating -> wallet on first prediction."),
        ("Composable AI Infra",
         "Permissionless registry, market, protocol."),
        ("Continuous Activity",
         "AI plays 24/7. Steady organic on-chain demand."),
    ]
    fy = cy + 35
    for title, desc in flywheel:
        draw.text((120, fy), title, fill=CYAN, font=font(17, bold=True))
        draw.text((120, fy + 28), desc, fill=MUT_SOFT, font=font(14))
        fy += 90

    # Right: live surfaces
    rx = 960
    draw.text((rx, cy), "LIVE SURFACES", fill=GOLD,
              font=font(13, mono=True))
    metrics = [
        ("4", "AI agents", ACCENT),
        ("2", "poker tables", GOLD),
        ("1", "public app", LIME),
        ("1", "demo video", VIOLET),
    ]
    my = cy + 35
    for title, label, color in metrics:
        draw.text((rx, my), title, fill=color, font=font(24, bold=True))
        draw.text((rx + 220, my + 4), label, fill=MUT_SOFT,
                  font=font(16))
        my += 90
    return img


def slide_11_traction():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "Traction",
                        "Live now on Initia")
    cy += 20
    # Left: TODAY
    draw.text((120, cy), "TODAY", fill=ACCENT, font=font(13, mono=True))
    stats = [
        ("1", "Dedicated Rollup", ACCENT),
        ("4", "Autonomous AI Agents", VIOLET),
        ("2", "Live Table Contracts", LIME),
        ("Live", APP_URL, CYAN),
    ]
    sy = cy + 35
    for num, label, color in stats:
        draw.text((120, sy), num, fill=color, font=font(38, bold=True))
        draw.text((300, sy + 10), label, fill=MUT_SOFT, font=font(16))
        sy += 90

    # Right: ROADMAP
    rx = 960
    draw.text((rx, cy), "ROADMAP", fill=GOLD, font=font(13, mono=True))
    roadmap = [
        ("Harder Crypto Guarantees", "Tighten the dealing and evidence story"),
        ("Tournaments", "Multi-table elimination brackets"),
        ("Mobile", "Optimized spectating + notifications"),
        ("Participation", "Push prediction and agent creation deeper"),
    ]
    ry = cy + 35
    for title, desc in roadmap:
        draw.text((rx, ry), title, fill=GOLD, font=font(19, bold=True))
        draw.text((rx, ry + 28), desc, fill=MUT_SOFT, font=font(14))
        ry += 90
    return img


def slide_12_closing():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    # Left accent bar
    draw.rectangle((0, 0, 6, H), fill=ACCENT)
    # Accent line
    draw.rectangle((160, 280, 380, 283), fill=ACCENT)
    # RAILBIRD
    draw.text((160, 310), "RAILBIRD", fill=FG, font=font(72, bold=True))
    # Tagline
    draw.text((160, 410), "Own Initia Rollup. Live AI Poker.",
              fill=ACC_SOFT, font=font(26))
    # Pillars
    draw.text((160, 500), "Live app.", fill=LIME,
              font=font(18, bold=True))
    draw.text((160, 535), "Live demo video.", fill=CYAN,
              font=font(18, bold=True))
    draw.text((160, 570), "Live rollup evidence.", fill=VIOLET,
              font=font(18, bold=True))
    # URL
    draw.text((160, 640), APP_URL, fill=CYAN,
              font=font(22, mono=True))
    draw.text((160, 675), "Built on Initia", fill=MUTED,
              font=font(14))
    return img


SLIDE_RENDERERS = [
    slide_01_title, slide_02_problem, slide_03_solution,
    slide_04_architecture, slide_05_agents, slide_06_initia,
    slide_07_demo, slide_08_sidebet, slide_09_security,
    slide_10_ecosystem, slide_11_traction, slide_12_closing,
]

# ── Narration Text ───────────────────────────────────────────────
NARRATIONS = [
    # Slide 1 — Title
    "Hi everyone. We're Railbird. Railbird is autonomous AI poker on its own Initia appchain, and the live product is already running right now.",

    # Slide 2 — Problem
    "Poker and AI both have the same trust problem. In most poker products, the deck lives on a private server. In most AI products, you only see the output, not accountable behavior. We wanted to remove both trust assumptions at once.",

    # Slide 3 — Solution
    "Railbird combines three things. The table runs on-chain. Private cards stay private during the hand through encrypted delivery and reveal flow. And the AI layer becomes observable through public history and verification surfaces.",

    # Slide 4 — Architecture
    "The system has four layers. A dedicated Initia MiniEVM rollup at the base. Core poker contracts on top of it. Services like the indexer, OwnerView, and fleet in the middle. And four Gemini agents acting above that. The chain is the source of truth for the whole product.",

    # Slide 5 — AI Agents
    "We run four distinct personalities, not one generic bot. Aegis is tight. Maverick is balanced. Nova plays wider lines. Rex applies constant pressure. That spread turns the table into a live arena for comparing autonomous behavior under the same on-chain rules.",

    # Slide 6 — Initia
    "Initia is a real product fit here, not a logo choice. Railbird has its own appchain identity, keeps the Solidity and Foundry workflow through MiniEVM, and exposes public chain evidence like RPC, bridge identity, and launch transaction that judges can verify directly.",

    # Slide 7 — Live Product
    f"The product surface is already public. The landing page, live dashboard, table pages, verification flow, leaderboard, agent pages, and create-agent flow are all live at {APP_URL}.",

    # Slide 8 — Rollup Evidence
    f"This is the critical proof slide for the hackathon. Rollup chain ID {ROLLUP_CHAIN_ID}. Cosmos chain {COSMOS_CHAIN_ID}. Bridge ID {BRIDGE_ID}. Public RPC at {RPC_URL}. Public launch transaction at {LAUNCH_TX_URL}.",

    # Slide 9 — Security
    "Security and liveness are built into the protocol. Commit and reveal keeps private state checkable after the fact. Table progression is constrained on-chain. And timeout paths keep the game moving instead of depending on one trusted operator staying online.",

    # Slide 10 — Ecosystem
    "Railbird also creates an open AI arena on Initia. Spectators can follow agent performance, outside builders can deploy their own agents, and the surrounding product surfaces make AI behavior legible instead of opaque.",

    # Slide 11 — Traction
    "Today the important milestone is already complete. There is a live app, a live demo video, and a live dedicated rollup backing the submission. Next we tighten the cryptographic guarantees, expand the game structure, and deepen public participation.",

    # Slide 12 — Closing
    "Railbird is simple to summarize. Live app. Live demo. Live rollup evidence. Autonomous AI poker on Initia. Thank you.",
]


# ── TTS Generation ───────────────────────────────────────────────
def narration_digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def audio_hash_path(out_path: Path) -> Path:
    return out_path.with_suffix(".sha256")


def audio_is_current(text: str, out_path: Path) -> bool:
    hash_path = audio_hash_path(out_path)
    if FORCE_REGEN_AUDIO or not out_path.exists() or out_path.stat().st_size <= 1000:
        return False
    if not hash_path.exists():
        return False
    return hash_path.read_text().strip() == narration_digest(text)


def mark_audio_current(text: str, out_path: Path):
    audio_hash_path(out_path).write_text(narration_digest(text))


def generate_tts_gemini(text: str, out_path: Path, client) -> Path:
    if client is None or genai is None or types is None:
        raise RuntimeError("Gemini TTS requested but google-genai is not available.")
    if not GEMINI_API_KEY:
        raise RuntimeError("Gemini TTS requested but GEMINI_API_KEY is not set.")

    response = client.models.generate_content(
        model=TTS_MODEL,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=VOICE_NAME
                    )
                )
            ),
        ),
    )

    audio_data = response.candidates[0].content.parts[0].inline_data.data

    with wave.open(str(out_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(audio_data)

    print(f"  [done] {out_path.name} via gemini ({len(audio_data)} bytes)")
    return out_path


def generate_tts_say(text: str, out_path: Path) -> Path:
    if not shutil.which("say"):
        raise RuntimeError("PITCH_TTS_BACKEND=say requested but 'say' is unavailable.")
    tmp_aiff = out_path.with_suffix(".aiff")
    subprocess.run(
        ["say", "-v", SAY_VOICE, "-o", str(tmp_aiff), text],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(tmp_aiff),
            "-ac",
            "1",
            "-ar",
            "24000",
            str(out_path),
        ],
        check=True,
        capture_output=True,
    )
    tmp_aiff.unlink(missing_ok=True)
    print(f"  [done] {out_path.name} via say")
    return out_path


def generate_tts(text: str, out_path: Path, client) -> Path:
    """Generate TTS audio and save as WAV."""
    if audio_is_current(text, out_path):
        print(f"  [skip] {out_path.name} already matches narration")
        return out_path

    if TTS_BACKEND == "say":
        path = generate_tts_say(text, out_path)
    elif TTS_BACKEND == "gemini":
        path = generate_tts_gemini(text, out_path, client)
    else:
        raise RuntimeError(f"Unsupported PITCH_TTS_BACKEND: {TTS_BACKEND}")

    mark_audio_current(text, path)
    return path


def get_wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        return frames / rate


# ── Video Assembly ───────────────────────────────────────────────
def make_segment(slide_img: Path, audio_wav: Path, out_mp4: Path):
    """Create a video segment from one slide image + audio."""
    duration = get_wav_duration(audio_wav)
    # Add 0.5s padding at end for breathing room
    total = duration + 0.5
    subprocess.run([
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(slide_img),
        "-i", str(audio_wav),
        "-c:v", "libx264", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
        "-pix_fmt", "yuv420p",
        "-t", f"{total:.2f}",
        "-shortest",
        str(out_mp4),
    ], check=True, capture_output=True)


def concat_segments(segment_paths: list, out_path: Path):
    """Concatenate video segments using ffmpeg concat demuxer."""
    list_file = out_path.parent / "segments.txt"
    with open(list_file, "w") as f:
        for p in segment_paths:
            f.write(f"file '{p}'\n")

    subprocess.run([
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c", "copy",
        str(out_path),
    ], check=True, capture_output=True)

    list_file.unlink()


# ── Main ─────────────────────────────────────────────────────────
def main():
    SLIDES_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    n = len(SLIDE_RENDERERS)
    assert len(NARRATIONS) == n, f"Slide/narration mismatch: {n} vs {len(NARRATIONS)}"

    # 1. Render slide images
    print(f"\n=== Rendering {n} slide images ===")
    slide_paths = []
    for i, render_fn in enumerate(SLIDE_RENDERERS):
        path = SLIDES_DIR / f"slide_{i+1:02d}.png"
        img = render_fn()
        img.save(path, "PNG")
        slide_paths.append(path)
        print(f"  [done] slide_{i+1:02d}.png")

    # 2. Generate TTS audio
    print(f"\n=== Generating {n} TTS audio files (backend: {TTS_BACKEND}) ===")
    client = genai.Client(api_key=GEMINI_API_KEY) if TTS_BACKEND == "gemini" else None
    audio_paths = []
    for i, text in enumerate(NARRATIONS):
        path = AUDIO_DIR / f"audio_{i+1:02d}.wav"
        generate_tts(text, path, client)
        audio_paths.append(path)
        # Small delay to avoid rate limiting
        if TTS_BACKEND == "gemini" and i < n - 1:
            time.sleep(1)

    # 3. Create video segments
    print(f"\n=== Creating {n} video segments ===")
    seg_dir = OUT_DIR / "segments"
    seg_dir.mkdir(exist_ok=True)
    segment_paths = []
    total_duration = 0.0
    for i in range(n):
        seg_path = seg_dir / f"seg_{i+1:02d}.mp4"
        make_segment(slide_paths[i], audio_paths[i], seg_path)
        dur = get_wav_duration(audio_paths[i])
        total_duration += dur + 0.5
        segment_paths.append(seg_path)
        print(f"  [done] seg_{i+1:02d}.mp4  ({dur:.1f}s)")

    # 4. Concatenate
    print(f"\n=== Concatenating into final video ===")
    concat_segments(segment_paths, FINAL_VIDEO)

    print(f"\n{'='*50}")
    print(f"  Video saved: {FINAL_VIDEO}")
    print(f"  Total duration: {total_duration:.1f}s ({total_duration/60:.1f}min)")
    print(f"  Slides: {n}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
