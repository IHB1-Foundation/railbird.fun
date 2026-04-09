/**
 * D-55: User-facing string constants.
 * Centralises all copy to simplify future i18n work.
 * Import from here rather than hard-coding strings in components.
 */

export const STRINGS = {
  // ── Common ───────────────────────────────────────────────────────────────
  loading: "Loading…",
  retry: "Try Again",
  goHome: "Go Home",
  back: "Back",
  refresh: "Refresh",
  close: "Close",
  copyAddress: "Copy address",
  copied: "Copied!",
  export: "Export CSV",

  // ── Errors ───────────────────────────────────────────────────────────────
  errors: {
    generic: "Something went wrong. Please refresh and try again.",
    serviceUnavailable: "The service could not be reached. This is usually temporary — please refresh in a few seconds.",
    tableLoad: "Unable to load table data. Check your connection and refresh.",
    agentLoad: "Unable to load agent profile. The agent may not exist on this chain.",
    leaderboardLoad: "Unable to load leaderboard. Please refresh.",
    evolutionLoad: "Unable to load evolution data. Please try again.",
  },

  // ── Navigation ───────────────────────────────────────────────────────────
  nav: {
    home: "Home",
    live: "Live",
    leaderboard: "Leaderboard",
    createAgent: "Create Agent",
    evolution: "Evolution",
    myAgents: "My Agents",
    railBets: "Rail Bets",
    verify: "Verify",
  },

  // ── Live Dashboard ───────────────────────────────────────────────────────
  live: {
    arenaTitle: "AI Poker Arena",
    waitingTitle: "Waiting for next hand…",
    waitingBody: "AI agents are being deployed.",
    communityCardsLabel: "Community Cards",
    communityCardsEmpty: "Cards dealt after preflop betting",
    potLabel: "POT",
    currentBetLabel: "CURRENT BET",
    allIn: "ALL-IN!",
    commentaryLabel: "COMMENTARY",
    backToHome: "Back",
  },

  // ── Leaderboard ──────────────────────────────────────────────────────────
  leaderboard: {
    title: "Leaderboard",
    subtitle: "Rankings are computed per-hand after settlement.",
    searchPlaceholder: "Search by name or address…",
    noResults: (query: string) => `No agents matching "${query}"`,
    previousPage: "Previous",
    nextPage: "Next",
    createAgentCta: "Think you can do better?",
    createAgentCtaBody: "Deploy your own AI agent and compete on-chain.",
    createAgentBtn: "Create Agent",
  },

  // ── Create Agent ─────────────────────────────────────────────────────────
  createAgent: {
    title: "Create Your AI Agent",
    subtitle: "Deploy a custom poker-playing AI agent to compete on-chain.",
    step1Title: "Connect Your Wallet",
    step1Body: "Your wallet identifies you as the agent owner. You control which table the agent plays on.",
    connectBtn: "🦊 Connect Wallet",
    configurePersonaBtn: "Configure Persona",
    step2Title: "Configure Persona",
    selectTableBtn: "Select Table",
    step3Title: "Select Table",
    deployBtn: "Deploy Agent",
    step4Title: "Fund & Deploy",
    deployAgentBtn: "🚀 Deploy Agent",
    deploying: "Deploying…",
    agentNameLabel: "Agent Name (1–24 chars)",
    agentNamePlaceholder: "e.g. Serpent",
    systemPromptLabel: "Personality Prompt (optional)",
    systemPromptPlaceholder: "e.g. Be mysterious, never reveal your hand strength…",
  },

  // ── My Agents (Me page) ──────────────────────────────────────────────────
  me: {
    title: "My Agents",
    connectPrompt: "Connect your wallet to view and manage your AI poker agents.",
    connectWalletStep: "Connect your wallet",
    connectWalletBody: "Link your MetaMask or compatible wallet to identify your agents.",
    signMessageStep: "Sign a message",
    signMessageBody: "Verify ownership without spending gas.",
    previewTitle: "Build your own AI poker agent",
    previewBody: "Design an agent persona, deploy it on HashKey Chain, and watch it compete autonomously with Gemini-powered decisions.",
  },

  // ── Betting ──────────────────────────────────────────────────────────────
  betting: {
    title: "Rail Bets",
    emptyTitle: "No live tables right now",
    emptyBody: "Betting opens when agents are seated and a hand is in progress. Tables usually start within a few minutes — refresh to check.",
    backToTable: "Back to Table",
  },

  // ── Evolution ────────────────────────────────────────────────────────────
  evolution: {
    title: "AI Strategy Evolution",
    subtitle: "How agents learn and adapt over time",
    emptyTitle: "No evolution data yet",
    emptyBody: "Agents update their strategy after every 20 hands. Check back once more hands have been played.",
  },

  // ── Table Viewer ─────────────────────────────────────────────────────────
  table: {
    joinSeat: "Join Seat",
    buyInLabel: "Buy-in",
    operatorLabel: "Operator (optional)",
    joinBtn: "Join Table",
    placeBet: "🎲 Place Rail Bet",
  },
} as const;
