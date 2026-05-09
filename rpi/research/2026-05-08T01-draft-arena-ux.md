# Draft Arena UX — MtG-Style Run Structure

**Date:** 2026-05-08
**Status:** Research / Planning

## Core Concept

Each Arena Run is a Magic: The Gathering "Draft" format. The player starts with no cards except basics and builds their deck through pack openings and round rewards. Every round requires adaptability — scout the enemy composition, tune your deck, then deploy.

## Run Flow

```
[New Run Started]
     │
     ▼
[PACK OPENING: 3 packs × 5 cards, pick 2 each] → 6 cards enter pool
     │
     ▼
[SHOP HUB]
 ├── ENEMY INTELLIGENCE BOARD → see next round's enemies + behaviors
 ├── WORKSHOP → deck builder (gated by run card pool), repairs, quantum tuners
 ├── COMPUTE MARKET → buy compute credit refills
 └── ARENA GATE → deploy
     │
     ▼
[FIGHT ROUND]
     │
     ▼
[DRAFT REWARD: Pick 1 of 3 new cards] → card enters pool
     │
     ▼
[BACK TO SHOP HUB] → loop
```

## Pack Opening (Start of Run)

- 3 sequential packs, each containing 5 cards from the full catalog (excluding basics)
- Cards are randomly selected, weighted by rarity tier (Common / Uncommon / Rare)
- No duplicate cards within a single pack
- Player picks 2 cards from each pack (6 total)
- Each card displays: name, type (Statement/Function), compute cost, cooldown, damage, summary, archetype tag
- This gives the run its initial "flavor" — commit to an archetype or hedge

## Draft Reward (After Each Round Clear)

- Present 3 card options, pick 1
- Cards drawn from catalog (not yet in pool), rarity-weighted
- Optional: "Skip" or "Take credits instead" if none fit the build
- Optional: spend Bug Bounty Credits to re-roll the 3 options

## Enemy Intelligence Board (In Shop Hub)

The enemy preview is **a station in the Shop**, visible before deploying. The player walks to it, presses F, and sees:

- **Enemy composition** for the next round (types and counts)
- **Behavior descriptions** for each enemy type, written to imply counterplay:
  - *"Bug: Chase-and-lunge melee attacker. Telegraphed windup. Stunnable."*
  - *"Hopper: Maintains distance, fires charged shots while hopping. Vulnerable during landing recovery."*
- **Threat summary** — e.g., *"Round 3: 8 Bugs (melee swarm) + 2 Hoppers (ranged harassment)"*
- Maybe a **round number indicator** and **escalation note** (e.g., *"Enemy count increasing"*, *"New enemy type next round"*)

**Why it's in the Shop, not a pre-deploy modal:**

- The player can see the intel, walk to the Workshop, adjust their deck, then walk to the Arena Gate and deploy
- It makes the Shop feel like a strategic hub, not just a store
- It's opt-in — experienced players who know the enemies can skip it
- It creates a physical "scout → prepare → deploy" loop within the walkable space

## Deck Builder (Workshop — Gated by Run Card Pool)

- The existing Workshop deck builder, but rows are filtered by `RunCardPool`
- Cards not yet drafted this run show as locked/unknown
- Basics (`slash`, `bolt`) are always available with no copy limit
- Special cards obey existing copy limits (max 10)
- Players can add drafted cards AND remove cards they don't want in the deck
- Min deck size: 20, Max: 100 (existing rules)

## Shop Economy (Unchanged)

- **Bug Bounty Credits** earned from arena clears (existing formula)
- **Compute Market** sells compute credit refills in 3 tiers with scaling costs
- **Workshop** offers repairs (+25 integrity for 180 credits) and quantum tuners (250 credits)
- Drafting is free — no credit cost for packs or draft rewards

## Card Catalog Requirements

- **Minimum 20-30 unique cards** before drafting feels meaningful
- Each card tagged with:
  - `rarity`: Common / Uncommon / Rare
  - `archetype`: e.g., "ramp", "mark-execute", "crowd-control", "shadow-strike", "expose-punish"
- Research doc `2026-05-07T23-12-17Z_card-ideas-synergies.md` already designs ~28 cards across 5 archetypes

## Enemy Counterplay (Behavioral, Not Explicit Modifiers)

No damage-type weaknesses or resistances. Counterplay is emergent from enemy behavior:

- Fast melee enemies dodge projectiles → melee/short-range cards are better
- Ranged enemies keep distance → gap-closers, speed, or long-range cards shine
- Swarms of weak enemies → AoE and multi-target cards excel
- Single tough enemies → high single-target damage cards are worth the compute cost
- Telegraphed attacks → cards with stun/interrupt can punish windups

The **behavior descriptions on the Intel Board** must be written didactically to help players infer these counterplays.

## New Data Structures

```
RunCardPool: Set<CardId>           — unlocked cards this run
PackGenerator(packSize, catalog)   — generates weighted-random packs
DraftOfferGenerator(catalog, pool) — generates 3-card selection
EnemyType.behaviorDescription      — didactic text for Intel Board
AttackCardDefinition.rarity        — Common | Uncommon | Rare
AttackCardDefinition.archetype     — archetype tag string
```

## New UI Screens

| Screen | Trigger | Notes |
|--------|---------|-------|
| Pack Opening overlay | New run start | 3 sequential packs, flip-and-pick |
| Draft Reward overlay | Arena clear | Pick 1 of 3 cards |
| Enemy Intel Board | Shop station interaction | New walkable station in ShopScene |

## Build Order

1. Expand card catalog (rarity, archetype, 20+ cards)
2. RunCardPool + pack/draft generators (data layer, testable)
3. Pack Opening UI
4. Draft Reward UI
5. Enemy Intel Board station in ShopScene
6. Gate Workshop deck builder by RunCardPool
7. Flow integration (state.ts, main.ts, scene transitions)

## Open Questions

- Should draft re-rolls cost Bug Bounty Credits?
- Should there be a "skip reward, take credits" option?
- Boss rounds — every 5th round? Special draft reward after bosses?
- Meta-progression — any unlocks persist between runs?
- How does the Intel Board handle rounds where new enemy types appear for the first time (spoilers vs. surprise)?
