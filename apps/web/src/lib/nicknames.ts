/**
 * G-15: Deterministic nickname generator
 * address hash → {Adjective}{Noun}#{3-digit}
 * Poker/danger/luck themed word set (200×200 combinations)
 */

const ADJECTIVES = [
  "Reckless", "Cold", "Iron", "Silent", "Shadow", "Neon", "Dark", "Crimson",
  "Phantom", "Blind", "Dead", "Ace", "Wild", "Hollow", "Steel", "Frozen",
  "Burning", "Midnight", "Obsidian", "Gilded", "Scarlet", "Ivory", "Velvet",
  "Copper", "Ashen", "Venom", "Black", "Jade", "Amber", "Onyx", "Hex",
  "Cursed", "Lucky", "Risky", "Savage", "Bold", "Grim", "Hungry", "Shifty",
  "Marked", "Broken", "Lone", "Dusty", "Rusty", "Blunt", "Cracked", "Sharp",
  "Slick", "Wicked", "Stacked", "Short", "Deep", "Pocket", "Folded", "Raised",
  "Checked", "Busted", "Tilted", "Cooled", "Slow", "Fast", "Ghost", "Stone",
  "Glass", "Silver", "Golden", "Neon", "Electric", "Static", "Cursed", "Final",
  "Faded", "Lost", "Found", "Crooked", "Straight", "Flush", "Royal", "Dead",
  "Live", "River", "Turn", "Flop", "Street", "Alley", "Back", "Dark", "Deep",
  "Heavy", "Light", "Hard", "Soft", "Open", "Closed", "Loaded", "Empty", "Cold",
  "Hot", "Burnt", "Raw", "Smooth", "Rough", "Tight", "Loose", "Lean", "Mean",
  "Clean", "Dirty", "Lucky", "Unlucky", "Last", "First", "Zero", "Double", "Triple",
  "Broken", "Fixed", "Bent", "Twisted", "Straight", "Narrow", "Wide", "Thin", "Thick",
  "Tall", "Short", "Fell", "Risen", "Buried", "Crowned", "Marked", "Cursed", "Blessed",
  "Hunted", "Hunting", "Stalking", "Waiting", "Watching", "Bleeding", "Winning", "Losing",
  "Folding", "Calling", "Raising", "Grinding", "Bluffing", "Trapping", "Squeezing",
  "Floating", "Tanking", "Shoving", "Jamming", "Limping", "Checking", "Stabbing",
];

const NOUNS = [
  "Raven", "Ember", "Fang", "Wolf", "Hawk", "Viper", "Cobra", "Fox",
  "Bear", "Owl", "Mule", "Turtle", "Monkey", "Coyote", "Crow", "Eagle",
  "Tiger", "Shark", "Snake", "Panther", "Lynx", "Falcon", "Jaguar", "Puma",
  "Dagger", "Blade", "Spike", "Bullet", "Knife", "Sword", "Arrow", "Lance",
  "Chip", "Stack", "Pot", "Blind", "Ante", "River", "Flop", "Turn",
  "Hand", "Card", "Deck", "Hole", "Rail", "Bet", "Raise", "Call",
  "Ace", "King", "Queen", "Jack", "Joker", "Deuce", "Trey", "Eight",
  "Crown", "Ring", "Mark", "Brand", "Scar", "Tattoo", "Sigil", "Glyph",
  "Ghost", "Shadow", "Phantom", "Specter", "Wraith", "Shade", "Echo", "Trace",
  "Spark", "Flame", "Ash", "Smoke", "Mist", "Fog", "Dust", "Sand",
  "Stone", "Rock", "Cliff", "Peak", "Ridge", "Vale", "Gorge", "Canyon",
  "Storm", "Thunder", "Lightning", "Rain", "Frost", "Ice", "Snow", "Hail",
  "Bone", "Blood", "Vein", "Nerve", "Pulse", "Beat", "Tick", "Clock",
  "Coin", "Gold", "Silver", "Token", "Chip", "Shard", "Fragment", "Piece",
  "Path", "Trail", "Track", "Road", "Route", "Lane", "Way", "Gate",
  "Door", "Wall", "Tower", "Keep", "Vault", "Cage", "Chain", "Lock",
  "Key", "Cipher", "Code", "Sign", "Signal", "Beacon", "Flare", "Torch",
  "Eye", "Hand", "Fist", "Grip", "Claw", "Talon", "Hook", "Barb",
  "Node", "Point", "Edge", "Tip", "End", "Cap", "Crown", "Base",
  "Line", "Curve", "Angle", "Arc", "Loop", "Coil", "Spiral", "Ring",
  "Drop", "Pool", "Wave", "Tide", "Surge", "Rush", "Flow", "Stream",
  "Fire", "Blaze", "Inferno", "Ember", "Coal", "Soot", "Char", "Cinder",
  "Night", "Dusk", "Dawn", "Noon", "Dark", "Light", "Void", "Abyss",
  "Dealer", "Player", "Grinder", "Shark", "Fish", "Donkey", "Nit", "Maniac",
];

/**
 * Simple deterministic hash from a string
 */
function simpleHash(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, keep 32-bit unsigned
  }
  return hash;
}

/**
 * Generate a deterministic nickname from an Ethereum address.
 * Format: "{Adjective}{Noun}#{3-digit}"
 *
 * @param address - Ethereum address (0x...)
 * @returns e.g. "RecklessRaven#724"
 */
export function generateNickname(address: string): string {
  const normalized = address.toLowerCase().trim();
  const hash = simpleHash(normalized);

  // Use different bit regions for each component
  const adjIndex = hash % ADJECTIVES.length;
  const nounIndex = (hash >>> 8) % NOUNS.length;
  const suffix = (hash >>> 16) % 1000;

  const adjective = ADJECTIVES[adjIndex];
  const noun = NOUNS[nounIndex];
  const paddedSuffix = String(suffix).padStart(3, "0");

  return `${adjective}${noun}#${paddedSuffix}`;
}

/**
 * Truncate an Ethereum address for display
 * @param address - Full 0x address
 * @param chars - Characters to show on each side (default 4)
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/**
 * Get display name: nickname if no custom name set, else custom name
 */
export function getDisplayName(address: string, customName?: string): string {
  return customName || generateNickname(address);
}
