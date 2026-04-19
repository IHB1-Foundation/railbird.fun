#!/usr/bin/env python3
"""Generate Railbird pitch video: slide images + Gemini TTS + ffmpeg.

Usage:
    python3 scripts/generate-pitch-video.py
"""

import os, sys, wave, subprocess, textwrap, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from google import genai
from google.genai import types

# ── Config ───────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get(
    "GEMINI_API_KEY", "AIzaSyCLjS_gpyJ028wSsAp6PwYBkgzpVcgtkx8"
)
VOICE_NAME = "Fenrir"
TTS_MODEL = "gemini-2.5-flash-preview-tts"

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "pitch-video"
SLIDES_DIR = OUT_DIR / "slides"
AUDIO_DIR = OUT_DIR / "audio"
FINAL_VIDEO = ROOT / "Railbird_Pitch.mp4"

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
    draw.text((160, 420), "The World's First Trustless AI Poker Protocol",
              fill=ACC_SOFT, font=font(28))
    # Context
    draw.text((160, 500), "On-Chain Horizon Hackathon  |  AI Track  |  HashKey Chain",
              fill=MUTED, font=font(16))
    # URL
    draw.text((160, 580), "railbird.fun", fill=CYAN, font=font(22, mono=True))
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
         ["Gemini 2.0 Flash reasoning engine",
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
                        "Three layers on HashKey Chain")
    cy += 10
    # On-chain band
    draw.rectangle((120, cy, W - 120, cy + 40), fill=ACCENT)
    draw.text((140, cy + 8),
              "ON-CHAIN — HashKey Chain Testnet (ID: 133)",
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
                        "Four Gemini-powered personalities")
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


def slide_06_hashkey():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "HashKey Chain",
                        "Why we chose this chain", tag_color=CYAN)
    cy += 20
    features = [
        ("Wallet-Based Identity", VIOLET,
         ["All auth via wallet signatures",
          "No email/password needed",
          "On-chain ownership = authorization"]),
        ("OP Stack EVM Equivalence", LIME,
         ["Standard Solidity + Foundry",
          "Zero contract modifications",
          "Low gas, familiar DX"]),
        ("VRF On-Chain Randomness", CYAN,
         ["Backbone of trustless dealer",
          "Provably fair shuffles",
          "Verifiable at showdown"]),
        ("Blockscout Explorer", GOLD,
         ["All 6 contracts source-verified",
          "Public code inspection",
          "Full state transparency"]),
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
    ftxt = "6 contracts deployed & source-verified on HashKey Chain Testnet (Chain ID: 133)"
    fb = draw.textbbox((0, 0), ftxt, font=font(13, mono=True))
    fx = (W - (fb[2] - fb[0])) // 2
    draw.text((fx, fy), ftxt, fill=MUTED, font=font(13, mono=True))
    return img


def slide_07_demo():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    cy = draw_tag_title(draw, "Live Demo", "railbird.fun")
    draw.text((120, cy - 10),
              "Everything on-chain. Everything verifiable.",
              fill=ACC_SOFT, font=font(20))
    cy += 30
    items = [
        ("Live Table Viewer",
         "Real-time cards, pot, chip stacks  |  Action log with block numbers  |  VRF status"),
        ("AI Decision Transparency",
         "Hand strength + pot odds per action  |  On-chain reasoning hash  |  Confidence gauge"),
        ("Showdown & Settlement",
         "Card flip animation  |  Winner highlight + pot distribution  |  Commit/reveal verified"),
        ("Leaderboard & Agent Pages",
         "ROI / PnL / Win Rate / MDD  |  Vault metrics  |  Token trading widget"),
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
    cy = draw_tag_title(draw, "AI Prediction Market",
                        "Spectating becomes evaluating",
                        tag_color=GOLD)
    cy += 10
    # Left: How it works
    draw.text((120, cy), "HOW IT WORKS", fill=GOLD,
              font=font(13, mono=True))
    steps = [
        ("1. Watch", "Observe AI agent patterns in real-time"),
        ("2. Predict", "Pick which agent wins. Place RCHIP on that seat"),
        ("3. Settle", "Hand settles on-chain. Contract reads the winner"),
        ("4. Claim", "Winners claim proportional payout from the pool"),
    ]
    sy = cy + 35
    for step_title, step_desc in steps:
        draw.text((120, sy), step_title, fill=GOLD,
                  font=font(17, bold=True))
        draw.text((120, sy + 28), step_desc, fill=MUT_SOFT, font=font(14))
        sy += 90

    # Right: Why it matters
    rx = 960
    draw.text((rx, cy), "WHY IT MATTERS FOR AI", fill=ACCENT,
              font=font(13, mono=True))
    defi = [
        ("AI Evaluation Layer", ACCENT,
         "Crowd-sourced AI assessment with real stakes."),
        ("Fully Transparent", CYAN,
         "Pari-mutuel, on-chain. No house edge."),
        ("Open Platform", LIME,
         "Permissionless. Build prediction UIs or analysis bots."),
        ("Auto Settlement", VIOLET,
         "Auto-settle after showdown. Permissionless claims."),
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
                        "An open AI arena on HashKey Chain",
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

    # Right: metrics
    rx = 960
    draw.text((rx, cy), "WHAT TEAMS CAN BUILD", fill=GOLD,
              font=font(13, mono=True))
    metrics = [
        ("Agents", "Custom AI strategies", ACCENT),
        ("Dashboards", "Performance analytics", GOLD),
        ("Bots", "Prediction & arbitrage", LIME),
        ("Tournaments", "Multi-table competition", VIOLET),
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
                        "Built and deployed in 5 weeks")
    cy += 20
    # Left: TODAY
    draw.text((120, cy), "TODAY", fill=ACCENT, font=font(13, mono=True))
    stats = [
        ("6", "Contracts Deployed", ACCENT),
        ("4", "Autonomous AI Agents", VIOLET),
        ("100%", "Source Verified", LIME),
        ("Live", "railbird.fun", CYAN),
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
        ("ZK Proofs", "Fully trustless dealing"),
        ("Tournaments", "Multi-table elimination brackets"),
        ("Mobile", "Optimized spectating + push notifications"),
        ("Mainnet", "Real economic stakes on HashKey Chain"),
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
    draw.text((160, 410), "Trustless AI Poker. Fully On-Chain.",
              fill=ACC_SOFT, font=font(26))
    # Pillars
    draw.text((160, 500), "Every card provably fair.", fill=LIME,
              font=font(18, bold=True))
    draw.text((160, 535), "Every AI decision verifiable.", fill=CYAN,
              font=font(18, bold=True))
    draw.text((160, 570), "Every prediction settles on-chain.", fill=VIOLET,
              font=font(18, bold=True))
    # URL
    draw.text((160, 640), "railbird.fun", fill=CYAN,
              font=font(22, mono=True))
    draw.text((160, 675), "Built on HashKey Chain", fill=MUTED,
              font=font(14))
    return img


SLIDE_RENDERERS = [
    slide_01_title, slide_02_problem, slide_03_solution,
    slide_04_architecture, slide_05_agents, slide_06_hashkey,
    slide_07_demo, slide_08_sidebet, slide_09_security,
    slide_10_ecosystem, slide_11_traction, slide_12_closing,
]

# ── Narration Text ───────────────────────────────────────────────
NARRATIONS = [
    # Slide 1 — Title (15s)
    "Hi everyone. We're Railbird. "
    "AI agents playing real poker, fully on-chain, with zero trust required. "
    "Not a concept. Not a whitepaper. Live right now on HashKey Chain.",

    # Slide 2 — Problem (35s)
    "Let's talk about the elephant in the room. "
    "Crypto poker has been around for years. And it's all fake. "
    "Every single platform runs a server-side deck. "
    "The house sees every card before you do. They can manipulate outcomes — "
    "and you have absolutely no way to prove they didn't. "
    "And then there's the bigger problem. "
    "AI agents are making autonomous decisions everywhere now — "
    "managing funds, executing strategies, playing games. "
    "But nobody can verify what they're actually thinking. "
    "Nobody can audit whether their decisions are honest. "
    "It's a black box operating with real assets, and you're just supposed to trust it. "
    "So we asked: what if the dealer literally cannot cheat, "
    "and every AI decision is permanently recorded on-chain?",

    # Slide 3 — Solution (40s)
    "That's what we built. Railbird is a fully on-chain poker protocol "
    "where AI agents play real Texas Hold'em — and everything is verifiable. "
    "Three pillars. "
    "One — the dealer can't cheat. We use VRF randomness combined with a dealer pre-commit seed "
    "to run a deterministic Fisher-Yates shuffle. The result is hashed and stored on-chain. "
    "At showdown, anyone can verify the shuffle was fair. This isn't trust us — this is math. "
    "Two — nobody can see your cards. Each player's hole cards are encrypted with ECIES "
    "using their wallet-derived public key. Only the seat owner can decrypt. "
    "Three — every AI decision is auditable. When an agent folds, calls, or raises, "
    "the reasoning behind that decision is hashed and committed on-chain. Full transparency, zero trust.",

    # Slide 4 — Architecture (35s)
    "Here's how it all fits together. "
    "On-chain layer: six smart contracts on HashKey Chain. "
    "PokerTable runs the full game state machine. SideBetPool is the spectator betting market. "
    "VRFAdapter provides provable randomness. ChipToken is our ERC-20. "
    "PlayerRegistry maps agents to wallets. PlayerVault handles the treasury. "
    "Off-chain: an Indexer that streams every contract event into Postgres "
    "and serves it via REST and WebSocket. "
    "AI layer: four Gemini 2.0 Flash agents making autonomous decisions in real-time. "
    "The key insight: the on-chain layer is the source of truth for everything. "
    "If our servers go down, the game state is still on-chain, still verifiable, still correct.",

    # Slide 5 — AI Agents (30s)
    "Now let's talk about the brains. "
    "We didn't build one generic AI. We built four distinct personalities, "
    "each powered by Gemini 2.0 Flash. "
    "Aegis — the rock. Patient, disciplined, waits for premium hands. "
    "Maverick — the grinder. Reads opponents, adapts mid-game, mixes value bets and bluffs. "
    "Nova — the creative. Plays a lot of hands, finds unconventional lines. "
    "Rex — the maniac. Pure pressure. Relentless aggression. "
    "Each agent tracks opponent behavior in real-time and adapts its strategy dynamically. "
    "These aren't bots running a fixed script. They're learning and adjusting every hand.",

    # Slide 6 — HashKey Chain (20s)
    "Quick note on why we chose HashKey Chain. "
    "We needed four things no other chain bundles together. "
    "Wallet-based identity — all authentication through wallet signatures. "
    "OP Stack EVM equivalence — standard Solidity, zero modifications. "
    "VRF — on-chain verifiable randomness, the backbone of our trustless dealer. "
    "And Blockscout — all six contracts are source-verified. Nothing is hidden.",

    # Slide 7 — Live Demo (30s)
    "Let me show you what this actually looks like. "
    "At railbird.fun, you see the live table — community cards, pot size, "
    "chip stacks for all four agents updating in real-time, "
    "and a complete action log with on-chain block numbers. "
    "There's a VRF status widget showing exactly when randomness was requested and fulfilled. "
    "When a hand reaches showdown, you see the card flip, the winner highlight, "
    "and pot distribution — all settled and verified on-chain. "
    "The leaderboard ranks agents by ROI, PnL, win rate, and max drawdown. "
    "This isn't a mockup. Every pixel maps to an on-chain state.",

    # Slide 8 — AI Prediction Market (40s)
    "Now this is where it gets really interesting. "
    "You're watching AI agents play poker. You've been observing their patterns — "
    "Aegis plays tight, Rex bluffs constantly, Nova finds creative lines. "
    "You think you know who's going to win this hand. So you put your RCHIP on it. "
    "The bet goes through our SideBetPool smart contract. "
    "When the hand settles on-chain, the contract reads the winner directly from PokerTable. "
    "If you called it right, you claim your proportional share of the entire pool. "
    "Why this matters for AI. "
    "First — it creates a real evaluation layer for AI agents. "
    "People aren't just watching — they're actively assessing which AI strategy performs best. "
    "This is crowd-sourced AI evaluation with real stakes. "
    "Second — it's fully transparent. Pari-mutuel, on-chain. No house edge. No manipulation. "
    "Third — it's an open platform. Anyone can build prediction interfaces, "
    "analysis bots, or strategy trackers on top. "
    "We're not just building a game — we're building infrastructure for evaluating autonomous AI agents.",

    # Slide 9 — Security (25s)
    "Security isn't a feature we added. It's the design principle everything was built on. "
    "Commit-reveal for hole cards — keccak256 commitments on-chain, verified at showdown. "
    "One action per block per table — prevents front-running and MEV. "
    "Thirty-minute turn timeouts with keeper incentives — the protocol never gets stuck. "
    "Non-dilutive treasury — the vault reverts if any trade would reduce NAV per share. "
    "Existing holders cannot be diluted. It's not a policy. It's a require statement.",

    # Slide 10 — Ecosystem (35s)
    "Let me tell you what Railbird brings to HashKey Chain — because this is bigger than poker. "
    "An open AI arena. Anyone can deploy their own AI agent with custom strategy "
    "through our web wizard. This isn't locked to our four agents. "
    "It's a competitive ecosystem where different AI strategies compete, adapt, "
    "and evolve — all on-chain, all verifiable. "
    "Natural user onboarding: spectating is free, no wallet needed. "
    "But predicting outcomes or deploying an agent requires a wallet. "
    "You go from watching to participating in one click. "
    "And composable AI infrastructure: the agent registry, the prediction market, "
    "the game protocol — all permissionless. Any team can build strategy analyzers, "
    "agent dashboards, or tournament platforms. "
    "We're building the rails for on-chain AI competition.",

    # Slide 11 — Traction (25s)
    "Where we are right now. "
    "Six contracts deployed and source-verified on HashKey Chain Testnet. "
    "Four AI agents playing autonomously. Full spectating and sidebet UI live at railbird.fun. "
    "Real-time indexer with WebSocket streaming. Built in five weeks. "
    "Where we're going: ZK proofs for fully trustless dealing. "
    "Multi-table tournaments. Mobile-optimized spectating. "
    "And mainnet deployment — where sidebet markets create real economic activity.",

    # Slide 12 — Closing (15s)
    "Railbird proves that autonomous AI can operate transparently — "
    "every decision verifiable, every action auditable, fully on-chain. "
    "Every card is provably fair. Every AI decision is recorded. "
    "Every prediction settles on-chain. "
    "Built on HashKey Chain. Live at railbird.fun. "
    "We're Railbird. Thank you.",
]


# ── TTS Generation ───────────────────────────────────────────────
def generate_tts(text: str, out_path: Path, client) -> Path:
    """Generate TTS audio using Gemini API and save as WAV."""
    if out_path.exists() and out_path.stat().st_size > 1000:
        print(f"  [skip] {out_path.name} already exists")
        return out_path

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

    print(f"  [done] {out_path.name}  ({len(audio_data)} bytes)")
    return out_path


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
    print(f"\n=== Generating {n} TTS audio files (voice: {VOICE_NAME}) ===")
    client = genai.Client(api_key=GEMINI_API_KEY)
    audio_paths = []
    for i, text in enumerate(NARRATIONS):
        path = AUDIO_DIR / f"audio_{i+1:02d}.wav"
        generate_tts(text, path, client)
        audio_paths.append(path)
        # Small delay to avoid rate limiting
        if i < n - 1:
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
