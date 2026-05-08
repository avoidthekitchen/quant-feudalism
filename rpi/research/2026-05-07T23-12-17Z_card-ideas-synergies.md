# Card Ideas: Synergy Archetypes & Multi-Card Combos

Created: 2026-05-07T23:12:17Z
Updated: 2026-05-08

Status: Research / brainstorm. Not yet implemented.

## Design review notes — 2026-05-08

These notes capture follow-up design direction before implementation. They should be treated as current guidance over the earlier speculative tuning in this document.

- **Shatter is deprioritized.** The current version, `10 + 2×Shield` without consuming Shield, risks giving the player offense and defense from the same resource with too little execution pressure. Keep it documented as a considered concept, but do not include it in the active card implementation plan.
- **Phase Shift should be less safe.** Start by making Cloak break immediately when the player deals damage. A softer enemy-reacquisition variant can be tested later, but the hard break is cleaner and better for first implementation.
- **Iterate should ramp only on hit.** Do not increment the deployment-wide ramp counter from a whiff or blind play. Consider a cap around 5 successful hits, so it reaches a powerful but bounded 45 damage instead of scaling indefinitely.
- **Tag + Execute is probably acceptable if it stays single-target.** Its safety depends on Tag hit reliability and Mark persistence. Execute consuming all Marks, requiring melee range, and paying Statement cooldown gives it meaningful risk; watch it if Tag becomes too easy to apply at range.
- **Overflow should consume half the remaining Compute Rate Limit.** It can still turn unspent compute into damage, but it should be a deliberate finisher rather than a cheap add-on that preserves most of the window.
- **Shield, Thorns, and health-as-resource player builds are deprioritized.** These builds may be hard to balance without ruining the fragile, precision-positioning feel. For now, avoid making the player feel tanky or rewarded for passively absorbing hits.
- **Do not add a third lane yet.** The two-lane constraint is real, but keep it for the next pass and try alternatives first: state-based card redesigns, setup cards that modify the next attack, Scaffolds, and limited queue manipulation.

## Design constraints

Gathered from playtest feedback:

- No mechanics that mix rate-limit and allotment pools
- No micromanagement mid-combat — synergies are **state-based** (check enemy/player state, not card sequencing)
- No more discount mechanics (Refund already covers this)
- No changes to Active/Preparing Window timing
- Prefer slow/push-pull over hard CC (no root)
- Needs `onEffect` system on `AttackCardDefinition`
- Combos should work with the existing queue system (auto-play leftmost card per lane)

## Passes

- **First Pass** — explicit two-card combos with clear archetype identities (implemented below)
- **Second Pass** — flexible, multi-purpose cards that read shared game state and create non-obvious emergent synergies (implemented below)

---

## Existing Cards (baseline)

| ID | Lane | Cost | CD | Damage | Mechanic |
|---|---|---|---|---|---|
| Slash | Statement | 18 | 350ms | 23 | Basic melee. No special effect. |
| Bolt | Function | 40 | 820ms | 40 | Projectile. Splash 20. Pull enemies to impact. Siphon +6/enemy (max +18 allotment). |
| Trim | Statement | 18 | 350ms | 12 | Draw 1 bonus card into matching queue. |
| Refund | Function | 0 | 1000ms | 0 | -20 cost for next 3 non-Refund attacks this Active Window. |

---

## Archetype 1: Shadow Strike

*Teleport behind enemies, strike from the shadows.*

### Cards

#### Phase Shift

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 30 |
| Cooldown | 1200ms |
| Damage | 0 |

On play: teleport ~200px toward cursor position. Grants **Cloaked** state for 1.5s.

**Cloaked** effect:
- Enemies drop aggro (treat player as invisible)
- No enemy collision
- Visual: player becomes semi-transparent
- Breaks immediately when the player deals damage
- Does NOT grant invulnerability (unlike Dash)

**Relationship to Dash:** Dash is free i-frames for dodging. Phase Shift is a *positioning tool* that costs compute. They serve different roles.

**Design note — break cloak on damage:** Start with the hard-break version. This prevents chaining Backstabs freely, makes each cloak window precious, and preserves enemy pressure after the player commits to damage. A softer future variant could keep the visual/collision part of Cloak briefly while enemies reacquire aggro after the first hit.

#### Backstab

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 20 |
| Cooldown | 350ms |
| Damage | 15 base |

**Backstab bonus:** If the attack lands from behind the enemy (angle > 120° from enemy's facing direction), deal **2.5x damage** (37 total). Brief forward lunge on attack (same as existing melee lunge behavior).

**Why 15 base (not higher):** Without the backstab bonus, this is weaker than Slash (23). This is intentional — you're paying a tax for the positional upside. The card is only worth running if you can consistently trigger the bonus.

### Combo: Phase Shift → Backstab

1. Phase Shift teleports behind enemy cluster
2. Backstab hits from behind for 37 damage each
3. Cloak breaks on damage, so the player must escape or continue the fight under normal enemy pressure

### Synergy with Vulnerable (Archetype 2)

Phase Shift behind → Expose (make vulnerable) → Backstab from behind = damage multiplied twice. See Archetype 2.

---

## Archetype 2: Expose & Punish

*Make enemies vulnerable, then exploit the weakness.*

### Cards

#### Expose

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 15 |
| Cooldown | 350ms |
| Damage | 8 |

Melee arc (same range as Slash). On hit: applies **Vulnerable** debuff.

**Vulnerable** effect:
- Target takes +40% damage from all sources
- Duration: 6 seconds (persists across Active Windows within the same arena deployment)
- Does not stack (binary state: vulnerable or not)
- Visual: enemy glows red/has a downward-chevron indicator

**Why melee (Statement lane)?** Originally designed as a ranged card, but moved to Statement lane so the Phase Shift → Expose → Backstab combo flows naturally: right-click (Phase Shift, Function) → left-click (Expose, Statement) → left-click (Backstab, Statement). The 350ms Statement cooldown means both melee cards play back-to-back within the cloak window.

**Lane timing analysis:**
```
t=0ms:     Phase Shift (Function), cloak starts (1.5s)
t=0ms:     Expose (Statement, 350ms CD) — Statement lane is free
t=350ms:   Backstab (Statement, 350ms CD) — CD clears, still 1.15s of cloak remaining
```

**Why not stack?** Keeps it simple. The design question is "who do I expose?" not "how many stacks do I apply." One application per enemy is enough to enable the combo.

#### Design consideration: stacking Vulnerable

If we want a stacking variant instead:
- Each stack: +15% damage taken
- Max 3 stacks (+45%)
- Each Expose hit adds 1 stack, refreshes duration
- This makes Expose better against single targets you focus down
- Tradeoff: more complex tracking, harder to balance

Recommendation: start with binary (non-stacking) and consider stacking later if it feels too weak.

### Combo: Expose → any damage card

- Expose → Slash: 23 × 1.4 = 32 damage (from 23)
- Expose → Backstab from behind: 37 × 1.4 = 52 damage
- Expose → Iterate (ramped): scales multiplicatively with ramp
- Expose → Bolt: 40 × 1.4 = 56 direct + 28 splash

### Three-way combo: Phase Shift → Expose → Backstab

1. Phase Shift behind enemy (right-click, Function lane)
2. Expose from behind (left-click, Statement lane)
3. Backstab from behind (left-click, Statement lane, 350ms later)
4. Total: 8 (Expose) + 37 × 1.4 (Backstab) = 8 + 52 = **60 damage** in ~0.35 seconds

This is the highest single-target burst in the game but requires all three cards, positional play, and both lanes. The input pattern (right-click → left-click → left-click) is intuitive and doesn't break combat flow.

---

## Archetype 3: Crowd Control

*Shape the battlefield. Group enemies, then punish the cluster.*

All four cards below are designed to coexist. They give the player two shaping tools (pull and push) and two payoff tools (AoE burst and DoT/slow).

### Cards

#### Singularity

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 35 |
| Cooldown | 900ms |
| Damage | 5 |

Projectile. On impact: creates a gravity well (180px radius) lasting 1.2s. Enemies within the well are pulled toward the center at ~150px/s.

**Key: this is a slow/pull, not a root.** Enemies can still attack and lunge, but they drift toward center. They are not helpless.

#### Detonate

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 45 |
| Cooldown | 1000ms |
| Damage | 10 + (4 × enemies in explosion radius) |

Projectile. On impact: AoE explosion (160px radius). Each enemy hit takes 10 base + 4 damage per enemy in the explosion radius.

**Damage per enemy by group size:**

| Enemies in radius | Damage each | Total damage | vs Bolt splash (20 each) |
|---|---|---|---|
| 1 | 14 | 14 | Weaker |
| 2 | 18 | 36 | Weaker |
| 3 | 22 | 66 | Weaker |
| 4 | 26 | 104 | Weaker per-enemy |
| 5 | 30 | 150 | **Stronger** — the AoE payoff |
| 6 | 34 | 204 | Stronger |

**Design intent:** Detonate is the "group punishment" card. At 1-4 enemies, it's weaker than Bolt's splash (20 per enemy). Only at 5+ grouped enemies does it become the most efficient AoE in the game. This makes Singularity essential for Detonate builds — without grouping, Detonate is overpriced (45 compute for 14 damage against a single target).

**Why it's not the highest damage spell:** Even at 5 enemies (30 each), Detonate deals less per-target than single-target setup cards like Execute (70) or Bolt direct hit (40). The value comes from total damage across many targets, not spike damage on one target. This is the correct AoE niche — efficient against groups, weak against singles.

#### Shockwave

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 25 |
| Cooldown | 500ms |
| Damage | 10 |

Melee arc (same range as Slash). All enemies hit are pushed ~120px directly away from the player.

**Uses:**
- Create breathing room when surrounded
- Push enemies into Singularity well
- Push enemies off the player during lunge attacks

#### Corrupt

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 20 |
| Cooldown | 820ms |
| Damage | 5 (on hit) |

Projectile. On hit: applies 1 stack of **Corrupt** debuff.

**Corrupt** effect (per stack):
- 3 damage per tick, every 0.5s, for 4 ticks (12 total damage per application)
- 30% movement slow on the target
- Stacks up to 3 times:
  - 1 stack: 3 dmg/tick, 30% slow
  - 2 stacks: 6 dmg/tick, 45% slow
  - 3 stacks: 9 dmg/tick, 60% slow (cap)
- Duration: 2 seconds, refreshed on each application
- Visual: enemy has a green/purple pulsing aura, intensity scales with stacks

**Why slow instead of root:** A 60% slow is powerful but still lets enemies move and attack. The player must keep kiting. A root would let you freely damage stationary targets — too strong for a stacking debuff.

### Combos

**Pull + Burst (Singularity → Detonate):**
1. Singularity fires into enemy cluster
2. Enemies pulled to center over 1.2s
3. Detonate hits the clump
4. 5 enemies: 30 damage each = 150 total (only efficient because they're grouped)

**Push + DoT (Shockwave → Corrupt):**
1. Enemies surround player
2. Shockwave pushes them all into a line/cluster
3. Corrupt hits 2-3 enemies, applies slow
4. Kite while DoT ticks, reapply Corrupt to stack

**Cross-archetype: Singularity → Detonate on Exposed enemies:**
1. Expose one or more enemies
2. Singularity groups them
3. Detonate for 30 each × 1.4 = **42 per enemy** (5 enemies = 210 total)

---

## Archetype 4: Ramp

*Grow stronger over the course of a deployment.*

### Cards

#### Iterate

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 20 |
| Cooldown | 350ms |
| Damage | 5 + 8 × N |

N = number of times Iterate has been played during this arena deployment (resets between deployments).

**Ramp progression:**

| Plays this deployment | Damage |
|---|---|
| 1st | 13 |
| 2nd | 21 |
| 3rd | 29 |
| 4th | 37 |
| 5th | 45 |
| 6th | 53 |
| 7th | 61 |

After 4+ plays, Iterate outdamages Slash (23). After 7+ plays, it's the highest damage melee card in the game.

**Design intent:** A deck with many Iterates starts weak but scales. The first few Active Windows feel bad, but by round 3-4 of an arena deployment, you're a powerhouse. This creates a natural tension: do you end the arena fast (Slash deck) or invest in scaling (Iterate deck)?

**Tracking:** N is stored on the arena state, not the card. All Iterate copies share the same counter.

#### Echo

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 20 |
| Cooldown | 350ms |
| Damage | (see below) |

Deals damage equal to the **last Statement card played this Active Window**. If no Statement card has been played yet this Active Window, deals 10 (base fallback).

**Interaction table:**

| Last Statement played | Echo damage |
|---|---|
| Slash | 23 |
| Trim | 12 |
| Backstab (no bonus) | 15 |
| Backstab (from behind) | 37 |
| Iterate (1st play) | 13 |
| Iterate (5th play) | 45 |
| Shockwave | 10 |
| None yet | 10 (fallback) |

**Design note:** Echo copies the *resolved* damage, including positional/ramp bonuses. A backstabbed Echo copies 37, not 15. This is what makes it exciting.

### Combo: Iterate → Echo (snowball)

1. Play Iterate several times over the deployment (13 → 21 → 29 → ...)
2. In a late Active Window, Echo copies the ramped Iterate
3. Two Iterate + one Echo in a single window = three hits at ramped value
4. At 5 plays: two Iterates (45 each) + one Echo (45) = 135 damage in one window

**Trim synergy:** Trim draws you into more Iterates and Echos, accelerating the ramp.

---

## Archetype 5: Mark & Execute

*Mark targets from range, detonate marks in melee.*

### Cards

#### Tag

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 15 |
| Cooldown | 700ms |
| Damage | 8 |

Projectile. On hit: applies 1 **Mark** stack to the target (max 5 stacks). Marks persist for the entire arena deployment.

**Visual:** Small diamond-shaped indicators orbit the marked enemy. 1 diamond per stack.

#### Execute

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 25 |
| Cooldown | 400ms |
| Damage | 10 + (12 × Mark stacks on target) |

Melee arc. Consumes all Marks on the target.

**Damage by Marks:**

| Marks | Damage |
|---|---|
| 0 | 10 |
| 1 | 22 |
| 2 | 34 |
| 3 | 46 |
| 4 | 58 |
| 5 | 70 |

**Mark persistence:** Marks last the entire deployment, so you can build Marks across multiple Active Windows and Execute when ready. This rewards patience.

### Combo: Tag × N → Execute

1. Tag an enemy 3-5 times across Active Windows (each Tag also deals 8 damage)
2. Close distance and Execute
3. 5 Tags (40 damage) + Execute at 5 Marks (70 damage) = **110 total damage** on a single target

### Cross-archetype synergy: Mark & Execute + Expose

1. Tag enemy × 5 (40 damage)
2. Expose (+40% vulnerability)
3. Execute for 70 × 1.4 = 98 damage
4. Total: 40 + 98 = **138 damage** on one target

---

## Considered But Deprioritized

These card concepts are documented for future experiments, but should not be included in the next implementation pass.

### Shield, Thorns, And Health-As-Resource Builds

These concepts are high tuning risk for the current direction. They may reward passive tanking, intentional damage intake, or standing in enemy pressure instead of precise movement and positioning. Keep the player feeling fragile for now; revisit these only after enemy variety proves the precision game can survive defensive build options.

#### Fortify

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 25 |
| Cooldown | 1500ms |
| Damage | 0 |

Grants **15 Shield** to the player. Shield stacks up to a maximum of 50.

**Reason deprioritized:** Shield can make mistakes too forgiving and can become a generic solution to enemy pressure. It also enables other damage-from-defense cards that risk making tank play optimal.

#### Bastion

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 30 |
| Cooldown | 600ms |
| Damage | 0 |

Consumes ALL current Shield. Deals **3× consumed Shield** as damage in a wide melee arc.

**Reason deprioritized:** Bastion is more disciplined than Shatter because it consumes Shield, but it still depends on adding player Shield as a major combat resource. Revisit only if defensive build paths become desirable.

#### Spike

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 20 |
| Cooldown | 1500ms |
| Damage | 0 |

Grants **Thorns: 14** for 4 seconds. Any enemy that deals contact damage to the player while Thorns is active takes 14 damage.

**Reason deprioritized:** Thorns risks rewarding players for being hit or for standing inside enemy clusters. That directly conflicts with the current goal that combat feel fragile and positioning-driven.

#### Fury

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 15 |
| Cooldown | 350ms |
| Damage | 10 + 6 × (hits taken this Active Window) |

Melee arc. Tracks how many times the player has taken damage during the current Active Window. Each hit adds +6 damage.

**Reason deprioritized:** Fury makes damage intake a direct offensive resource. Even if numerically fair, it can teach players that getting hit is part of optimal execution.

#### Blood Price

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 0 compute |
| Cooldown | 600ms |
| Damage | 40 |

Melee arc. Costs 0 compute but spends **15 Integrity** directly.

**Reason deprioritized:** Integrity-as-cost can create interesting deckbuilding, but it shifts the run toward health economy management. That is not the current priority while the combat should remain fragile, precise, and position-driven.

### Shatter

*Build defenses, then weaponize them without spending the defensive resource.*

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 15 |
| Cooldown | 400ms |
| Damage | 10 + (current Shield × 2) |

Melee arc. Deals 10 base damage plus **2× current Shield value** as bonus damage. Does NOT consume the Shield.

**Reason deprioritized:** This version risks making Shield too broadly optimal because the same resource provides both safety and repeatable damage. Partial Shield consumption makes Shatter overlap with Bastion, while no consumption lowers the execution and positioning demands too much. Revisit only if the Shield archetype needs a sustained-damage tool that is clearly distinct from Bastion.

**Damage examples:**

| Shield when played | Total damage |
|---|---|
| 0 | 10 |
| 15 (1 Fortify) | 40 |
| 30 (2 Fortifies) | 70 |
| 50 (3+ Fortifies) | 110 |

---

## Full Card Summary

### New Cards (11 total)

| # | Name | Lane | Class | Cost | CD | Dmg | Key Mechanic |
|---|---|---|---|---|---|---|---|
| 1 | Phase Shift | Function | special | 30 | 1200ms | 0 | Teleport 200px + 1.5s Cloak |
| 2 | Backstab | Statement | special | 20 | 350ms | 15 | 2.5× from behind (37 total) |
| 3 | Expose | Statement | special | 15 | 350ms | 8 | Melee arc, target takes +40% damage for 6s |
| 4 | Singularity | Function | special | 35 | 900ms | 5 | Pull enemies to impact for 1.2s |
| 5 | Detonate | Function | special | 45 | 1000ms | 10+4×enemies | AoE, scales with grouped enemies (strong at 5+) |
| 6 | Shockwave | Statement | special | 25 | 500ms | 10 | Push enemies 120px away |
| 7 | Corrupt | Function | special | 20 | 820ms | 5 | DoT 12 + slow 30% (×3 stacks) |
| 8 | Iterate | Statement | special | 20 | 350ms | 5+8N | +8 damage per play this deployment |
| 9 | Echo | Statement | special | 20 | 350ms | varies | Copies last Statement card's damage |
| 10 | Tag | Function | special | 15 | 700ms | 8 | Apply Mark (max 5, persists deployment) |
| 11 | Execute | Statement | special | 25 | 400ms | 10+12×Marks | Consume Marks for burst |

### New Status Effects (4 total)

| Status | Applied by | Stacks | Duration | Effect |
|---|---|---|---|---|
| Cloaked | Phase Shift | No | 1.5s | Invisible to enemies, no collision |
| Vulnerable | Expose | No | 6s | +40% damage taken |
| Corrupt | Corrupt | Yes (3 max) | 2s (refresh) | DoT 3/tick + slow (30/45/60%) |
| Mark | Tag | Yes (5 max) | Entire deployment | Consumed by Execute for bonus damage |

---

## Cross-Archetype Combo Matrix

The most interesting combos come from mixing archetypes:

| Combo | Cards | Setup | Payoff | Total burst |
|---|---|---|---|---|
| **Shadow Assassin** | Phase Shift + Expose + Backstab | Teleport behind, expose | Backstab from behind × 1.4 | 60 on one target (0.35s) |
| **Nuke** | Singularity + Expose + Detonate | Group + expose | AoE burst × 1.4 | ~42/enemy (5 enemies) |
| **Executioner** | Tag × 5 + Expose + Execute | Stack marks, expose | Consume marks | 138 on one target |
| **Ramp Echo** | Iterate × 5 + Echo | Ramp over deployment | Copy ramped damage | 135 in one window |
| **Poison Zone** | Singularity + Corrupt × 3 | Group + apply DoT/slow | Kite while DoT ticks | ~63 over 4 ticks (3 stacks × 5 enemies) |

---

## Implementation Notes

### onEffect system

`AttackCardDefinition` needs to support effects beyond raw damage. Proposed extension:

```ts
interface AttackCardDefinition {
  id: CardId;
  name: string;
  type: CardType;
  cardClass: CardClass;
  cost: number;
  cooldownMs: number;
  damage: number;
  copyLimit?: number;
  summary: string;

  // New fields
  onHitEffects?: OnHitEffect[];
  onPlayEffects?: OnPlayEffect[];
}

interface OnHitEffect {
  type: "vulnerable" | "corrupt" | "mark" | "pull" | "push" | "slow";
  duration?: number;        // ms
  stacks?: number;
  maxStacks?: number;
  magnitude?: number;       // e.g. push distance, pull force, slow %
}

interface OnPlayEffect {
  type: "teleport" | "cloak" | "draw" | "consume-marks";
  duration?: number;        // ms
  magnitude?: number;       // e.g. teleport distance
  maxStacks?: number;
}
```

### New state tracking

The arena state needs to track:

- **Per-enemy debuffs:** Vulnerable, Corrupt stacks, Mark stacks
- **Player buffs:** Cloaked (boolean + timer)
- **Deployment counters:** Iterate play count (persists across Active Windows)
- **Active Window tracking:** Last Statement card played (for Echo)

### Damage calculation pipeline

Damage resolution needs to apply multipliers in a defined order:

1. Base damage from card definition
2. Positional modifiers (Backstab: × 2.5 if behind)
3. Ramp modifiers (Iterate: +8 × N)
4. State modifiers (Vulnerable: × 1.4)
5. Mark-based modifiers (Execute: +12 × Marks)
6. Detonate bonus (+4 × enemies in radius, only efficient at 5+ enemies)

### CardId union type

```ts
export type CardId =
  | "slash" | "bolt" | "trim" | "refund"
  | "phase_shift" | "backstab"
  | "expose"
  | "singularity" | "detonate"
  | "shockwave" | "corrupt"
  | "iterate" | "echo"
  | "tag" | "execute";
```

### Recommended implementation order

1. **onEffect system** — extend `AttackCardDefinition`, add status tracking to arena state
2. **Expose + Backstab** — simplest combo, tests the vulnerable debuff and positional damage
3. **Iterate + Echo** — tests deployment-wide state tracking
4. **Corrupt** — tests stacking DoT + slow
5. **Singularity + Detonate + Shockwave** — tests AoE grouping and multipliers
6. **Tag + Execute** — tests Mark stacking and consumption
7. **Phase Shift** — tests teleport + cloak (most complex mechanically)

### Balance considerations

- All new cards are **special** class (max 10 copies each)
- Base damage on combo cards is intentionally lower than Slash/Bolt to prevent them from being auto-includes without combo support
- Vulnerable at +40% is strong but requires a Statement lane play on a low-damage melee card (8 damage vs Slash's 23)
- Corrupt slow caps at 60% — enemies still move
- Iterate needs 3+ plays to outdamage Slash — early investment cost
- Mark × 5 + Execute takes multiple Active Windows to set up — payoff is deserved

---

## SECOND PASS: Flexible & Emergent Synergies

*Cards that read shared game state rather than pairing with specific other cards.*

### The Problem with First Pass

First Pass cards have obvious pairings: Phase Shift → Backstab, Singularity → Detonate, Tag → Execute. The optimal build is clear: run both cards in the pair. This limits deckbuilding creativity.

Second Pass cards solve this by interacting with **shared game state** (enemy debuff count, nearby enemies, remaining compute, dashes, cards played) rather than with specific named cards. This means any card that changes the relevant state becomes a valid partner, creating emergent and non-obvious combos.

### Design inspiration from other games

**Slay the Spire patterns applied here:**
- **State readers:** "Deal X per Y in Z" — any card that produces Y works (e.g., Hemokinesis reads your HP, Fiend Fire reads your hand size)
- **Conditional scaling:** Cards that are weak in a vacuum but become premium with the right deck composition (e.g., Limit Break is useless without Strength)
- **Resource conversion:** Convert one resource into another at a cost (e.g., Rupture makes self-damage into Strength)
- **Multi-hit + on-hit triggers:** Hit many times, trigger effects per hit (e.g., Finisher deals damage per Attack played)

**Wizards of Legends patterns applied here:**
- **Element-agnostic enhancers:** Relics that buff a spell type, making any spell of that type better (not just one pair)
- **Charge mechanics:** Basic attacks charge a signature spell — any basic attack works

**Key principle:** A Second Pass card should have at least 3 valid "partners" across different First Pass archetypes.

---

### Card 1: Conduit

*Deals more damage the more messed-up the target is.*

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 20 |
| Cooldown | 400ms |
| Damage | 8 + 10 × (debuffs on target) |

Melee arc. Counts the number of **distinct debuff types** on the target: Vulnerable, Corrupt (any stacks = 1 type), Mark (any stacks = 1 type). Each debuff type adds +10 damage.

**Interaction table:**

| Debuffs on target | Damage |
|---|---|
| None | 8 |
| Vulnerable only | 18 |
| Corrupt only | 18 |
| Mark only | 18 |
| Vulnerable + Corrupt | 28 |
| Vulnerable + Mark | 28 |
| Corrupt + Mark | 28 |
| Vulnerable + Corrupt + Mark | 38 |

**Why this is flexible:** Conduit doesn't care *which* debuffs are on the target or *which card* applied them. Expose, Corrupt, and Tag all count equally. You can build a deck around any one debuff, any two, or all three.

**Cross-archetype partners:**
- Expose → Conduit (18 damage for cheap, uses Statement lane)
- Tag → Conduit (Tag applies Mark, then Conduit reads it — both lanes used)
- Corrupt → Conduit (Corrupt in Function lane, Conduit reads it in Statement lane)
- Expose + Tag + Corrupt → Conduit (38 damage — the "everything is wrong with you" build)

**From Slay the Spire:** This mirrors the design of cards like **Glass Knife** (better when you have more upgrades) or **Pressure Points** (damage scales with Mark stacks) — it reads a quantity that many different cards can produce.

---

### Card 2: Chain Lightning

*Bounces between debuffed enemies.*

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 30 |
| Cooldown | 900ms |
| Damage | 18 per bounce |

Projectile. On hit: if the target has any debuff (Vulnerable, Corrupt, Mark), the attack bounces to the nearest enemy within 200px. Bounces up to 3 times, dealing 18 damage per bounce. Each bounce can only hit each enemy once. If the first target has no debuffs, no bounces occur (just 18 single-target damage).

**Bounce damage:**

| Scenario | Total damage |
|---|---|
| No debuffs on primary target | 18 (no bounce) |
| 1 debuffed target, 2 nearby | 18 + 18 + 18 = 54 |
| 1 debuffed target, 3 nearby | 18 × 4 = 72 |

**Why this is flexible:** Any card that applies a debuff enables Chain Lightning. Expose, Tag, and Corrupt all qualify. You don't need a specific pair — you just need *some* debuff engine.

**Cross-archetype partners:**
- Expose → Chain Lightning: Expose one target (melee), Chain bounces to others (ranged)
- Tag → Chain Lightning: Tag applies Mark (debuff), Chain bounces off marked targets
- Corrupt → Chain Lightning: Corrupt applies DoT (debuff), Chain bounces to nearby corrupted enemies
- Singularity → Chain Lightning: Pull enemies together, then Chain bounces between the cluster (each is within 200px)
- Any mix of the above

**From Slay the Spire:** This is the **All-Out Attack + Status cards** pattern — cards that get better when enemies have "something wrong with them," regardless of what that something is.

---

### Card 3: Overflow

*Turns unused compute into damage.*

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 5 + half remaining Compute Rate Limit |
| Cooldown | 820ms |
| Damage | 0.5 × remaining Compute Rate Limit |

Projectile. After paying the printed 5 cost, consumes half of the remaining Compute Rate Limit and deals damage equal to that consumed amount. This makes Overflow a deliberate finisher rather than a cheap add-on.

**Damage examples (base rate limit 96):**

| Compute remaining after 5 cost | Extra compute consumed | Damage |
|---|---|---|
| 91 (first play, nothing else spent) | 45 | 45 |
| 50 (after playing some cards) | 25 | 25 |
| 20 (low compute) | 10 | 10 |

**Why this is flexible:** Overflow rewards any deck that plays few expensive cards. It creates a build tension: running cheap melee cards (Slash 18, Backstab 20, Expose 15) leaves more compute for Overflow. Running expensive ranged cards (Bolt 40, Detonate 45) leaves less.

**Cross-archetype partners:**
- Slash-heavy deck → Overflow: Slash costs 18, leaves plenty for Overflow
- Expose + Backstab → Overflow: Both cheap melee, leaves ~60+ compute for a 30-damage Overflow
- Iterate → Overflow: Iterate costs 20, cheap enough to leave room for Overflow
- Anti-synergy with Bolt + Detonate: Expensive Function cards compete for the same compute pool

**Design tension:** Overflow is a ranged card, but it rewards cheap melee builds. This is counter-intuitive and creates interesting deck decisions. Do you run a cheap melee deck with Overflow as your ranged finisher? Or a traditional Bolt deck that ignores Overflow?

**From Slay the Spire:** This is the **Dropkick + Vulnerable** pattern — a card that's generically okay but becomes premium in the right deck composition. It's also similar to **Offering** — converting one resource (energy/compute) into another (damage).

---

### Card 4: Momentum

*Rewards aggressive dashing.*

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 25 − (3 × dashes this Active Window) |
| Cooldown | 350ms |
| Damage | 20 |

Melee arc. Cost is reduced by 3 for each time the player has Dashed during the current Active Window. Minimum cost: 5.

**Cost by dashes:**

| Dashes this window | Cost | Effective value |
|---|---|---|
| 0 | 25 (expensive — worse than Slash at 18 for 23 damage) | Overpriced |
| 1 | 22 | Still expensive |
| 2 | 19 | Competitive with Slash |
| 3 | 16 | Cheaper than Slash for similar damage |
| 4 | 13 | Excellent value |
| 5+ | 5 (minimum) | Premium efficiency |

Counter resets each Active Window.

**Why this is flexible:** Everyone Dashes. It's a universal mechanic, not tied to any archetype. Momentum rewards aggressive Dash usage — dashing *into* enemies rather than just away from them. It changes how you use a tool you already have.

**Cross-archetype partners:**
- Phase Shift + Dash → Momentum: Double movement tools = lots of dashes, cheap Momentum
- Singularity → Momentum: Dash into grouped enemies, cheap Momentum, melee the cluster
- Any build that fights aggressively → Momentum: If you Dash offensively, Momentum is good value

**From Slay the Spire:** This is the **Finisher** pattern — a card that counts a universal action (playing attacks, in StS; dashing, here) and rewards you for doing more of it. It turns an implicit play pattern into an explicit reward.

---

### Card 5: Surge

*Gets cheaper the more cards you've played this Active Window.*

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 40 − (4 × cards played this Active Window) |
| Cooldown | 820ms |
| Damage | 30 |

Projectile with small splash (80px, 15 splash damage). Cost decreases by 4 for each card played this Active Window. Minimum cost: 5.

**Cost by cards played:**

| Cards played this window | Cost | Notes |
|---|---|---|
| 0 | 40 | Same as Bolt but less damage (30 vs 40) |
| 1 | 36 | |
| 2 | 32 | |
| 3 | 28 | Cheaper than Bolt |
| 4 | 24 | |
| 5 | 20 | Half of Bolt's cost |
| 6+ | 5 (minimum) | Extremely efficient |

**Why this is flexible:** Surge rewards *any* deck that plays many cards per Active Window. It doesn't care which cards — just volume. This makes it a natural fit for draw-heavy decks (Trim engine) and cheap-card decks, but a poor fit for expensive-card decks.

**Cross-archetype partners:**
- Trim → Surge: Trim draws more cards = more cards played = cheaper Surge. The classic "storm" combo
- Slash + Expose + Backstab → Surge: Three cheap melee cards, then cheap Surge as a ranged finisher
- Iterate → Surge: Cheap melee cards ramp Iterate and reduce Surge's cost simultaneously
- Anti-synergy with Bolt + Detonate: Expensive cards mean fewer plays per window, Surge stays expensive

**From Slay the Spire:** This is the **Zero-cost Storm** archetype. Cards like **Turbulence** (costs less per card played) and **Finisher** (damage per attack played) reward flooding your turn with cheap actions. In our game, Trim is the engine that makes this work.

---

### Card 6: Overwhelm

*Rewards being surrounded.*

| Property | Value |
|---|---|
| Lane | Statement (melee) |
| Card class | special |
| Cost | 20 |
| Cooldown | 350ms |
| Damage | 8 + 7 × (enemies within melee range) |

Melee arc. Counts enemies within melee range (~166px, same as Slash's reach). Each nearby enemy adds +7 damage to the single target hit.

**Damage by proximity:**

| Enemies in melee range | Damage |
|---|---|
| 1 | 15 (worse than Slash) |
| 2 | 22 (matches Slash) |
| 3 | 29 |
| 4 | 36 |
| 5 | 43 (matches Bolt) |
| 6 | 50 |

**Why this is flexible:** Overwhelm rewards being in danger. Any card that groups enemies near you makes Overwhelm better. This is the inverse of most cards (which want enemies spread out or at range).

**Cross-archetype partners:**
- Singularity → Overwhelm: Pull enemies to a point, walk into the cluster, Overwhelm hits for 40+
- Shockwave → Overwhelm: Wait... Shockwave pushes enemies AWAY. Anti-synergy! Unless you Overwhelm first, then Shockwave to create space. Order matters.
- Corrupt → Overwhelm: Corrupt slows enemies so they cluster around you longer

**From Slay the Spire:** This is the **Cleave + Whirlwind** pattern — cards that are explicitly about being in the middle of a swarm. It's the opposite of the ranged/kiting playstyle and creates a distinctly different feel.

---

### Card 7: Resonance

*Copies the last debuff applied.*

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 18 |
| Cooldown | 820ms |
| Damage | 5 |

Projectile. On hit: applies the **same debuff** that was most recently applied to any enemy this Active Window. If no debuff has been applied this Active Window, does nothing special (just 5 damage).

**Interaction table:**

| Last debuff applied | Resonance applies |
|---|---|
| Expose (Vulnerable) | Vulnerable to target (6s) |
| Tag (Mark) | +1 Mark stack to target |
| Corrupt (Corrupt) | +1 Corrupt stack to target (DoT + slow) |
| None this window | Nothing (just 5 damage) |

**Why this is flexible:** Resonance is a debuff amplifier that works with ANY debuff card. It effectively doubles your debuff application rate for a cheap cost (18 compute).

**Cross-archetype partners:**
- Expose → Resonance: Expose one target in melee, Resonance copies Vulnerable to a second target at range. Two Exposed enemies for the price of one Expose
- Tag → Resonance: Tag applies Mark, Resonance adds another Mark to a different target. Faster Mark stacking across multiple enemies
- Corrupt → Resonance: Corrupt applies DoT/slow, Resonance copies it to another target. Spreads the plague
- Conduit → Resonance: If you've applied multiple debuff types, Resonance copies the latest — which might be the one Conduit doesn't count yet. Layering

**Design subtlety:** Resonance only copies the LAST debuff. If you play Expose → Tag → Resonance, it copies Mark (not Vulnerable). This means the order you play debuff cards matters for Resonance but not for Conduit (which counts all debuffs). This creates a subtle sequencing decision without requiring micromanagement.

**From Slay the Spire:** This is the **Dual Wield + Any power** pattern — a card that duplicates whatever you're already doing, making it universally useful but never the star of the show.

---

### Card 8: Precision

*Rewards extreme distance — punishes normal range.*

| Property | Value |
|---|---|
| Lane | Function (ranged) |
| Card class | special |
| Cost | 25 |
| Cooldown | 820ms |
| Damage | 5 + 0.2 × (distance − 100), minimum 5 |

Projectile. Only starts scaling above 100px. Damage is based on distance between player and target at time of impact, capped at 500px. Below 100px, deals only 5 damage (minimum).

**Damage by distance:**

| Distance | Damage | Context |
|---|---|---|
| 0-100px | 5 | Terrible — worse than every card in the game |
| 150px | 15 | Still weak |
| 200px | 25 | Weaker than Bolt (40) |
| 250px | 35 | Getting closer to Bolt |
| 300px | 45 | Matches Bolt |
| 400px | 65 | Strong — the payoff begins |
| 500px (cap) | 85 | Very strong — extreme range reward |

**Damage tier comparison:**

| Range | Best card | Why |
|---|---|---|
| 0-150px (melee) | Slash, Backstab, Expose | Melee dominates |
| 100-250px (normal ranged) | Bolt | Bolt is king at standard combat range |
| 300px | Bolt ≈ Precision | Break-even point |
| 400px+ (extreme range) | Precision | Reward for maintaining extreme distance |

**Why this is flexible:** Precision rewards a specific playstyle (extreme-range kiting) rather than pairing with a specific card. Any card that creates or maintains distance from enemies is a partner.

**Cross-archetype partners:**
- Shockwave → Precision: Push enemies away, then Precision from newly-created distance
- Phase Shift → Precision: Teleport away from enemies, fire Precision from 400+ px
- Corrupt (slow) → Precision: Slowed enemies can't close distance, you maintain extreme range
- Singularity → Precision (anti-synergy!): Pulls enemies toward you, destroying Precision's damage

**Design tension:** Precision is the opposite of Overwhelm. One rewards extreme distance, the other rewards proximity. You can't run both effectively. This creates a meaningful deckbuilding fork: close-range brawler OR long-range sniper. The key difference from before: Precision is **actively bad** at normal combat ranges (25 damage at 200px vs Bolt's 40). You must commit to the kiting playstyle for it to be worth its deck slot.

**From Wizards of Legends:** This mirrors the design of long-range spell specializations — investing in distance-based damage changes your entire movement pattern and makes kiting a damage source rather than just defense. The "bad at normal range" tuning mirrors WoL's design where specialized spells are terrible outside their niche.

---

## Second Pass: Full Card Summary

| # | Name | Lane | Class | Cost | CD | Dmg | Key Mechanic |
|---|---|---|---|---|---|---|---|
| 16 | Conduit | Statement | special | 20 | 400ms | 8+10×debuffs | Bonus per debuff type on target |
| 17 | Chain Lightning | Function | special | 30 | 900ms | 18/bounce | Bounces between debuffed enemies (×3) |
| 18 | Overflow | Function | special | 5 + half remaining compute | 820ms | 0.5×compute | Consumes and converts remaining compute |
| 19 | Momentum | Statement | special | 25−3×dash | 350ms | 20 | Cost drops per Dash this window |
| 20 | Surge | Function | special | 40−4×plays | 820ms | 30 | Cost drops per card played this window |
| 21 | Overwhelm | Statement | special | 20 | 350ms | 8+7×nearby | Bonus per enemy in melee range |
| 22 | Resonance | Function | special | 18 | 820ms | 5 | Copies last debuff applied this window |
| 23 | Precision | Function | special | 25 | 820ms | 5+0.2×(dist−100) | Only beats Bolt at 300px+, max 85 at 500px |

---

## Second Pass: Emergent Combo Map

Unlike First Pass combos (A → B), Second Pass combos emerge from shared state. Here are the viable decks:

### Deck: The Plague Doctor

**Core:** Corrupt + Resonance + Chain Lightning + Conduit
**Flow:** Apply Corrupt (Function) → Resonance copies it (Function) → Chain Lightning bounces between corrupted enemies (Function) → Conduit hits high-debuff targets in melee (Statement)
**Why it works:** Every card in this deck either applies or exploits debuffs. No single obvious pair — the whole deck is the combo.

### Deck: The Storm

**Core:** Trim + Slash + Expose + Surge + Overflow
**Flow:** Trim draws cards (Statement) → Slash/Expose are cheap melee (Statement) → many cards played means Surge is cheap (Function) → remaining compute fuels Overflow as a finisher (Function)
**Why it works:** This is the Slay the Spire "zero-cost storm" pattern. Play many cheap cards, then close with efficiently-costed finishers. Overflow now spends a large chunk of remaining compute, so it is the closer rather than a free extra shot.

### Deck: The Sniper

**Core:** Precision + Shockwave + Corrupt + Tag + Overflow
**Flow:** Corrupt slows enemies at range → Shockwave pushes them back → maintain 400+ px distance → Precision deals 65-85 damage → Tag marks from afar → Overflow converts leftover compute into a finishing shot
**Why it works:** Every card rewards keeping enemies at extreme range. Corrupt's slow prevents them from closing. Shockwave creates distance. Precision converts extreme distance to damage. But you must actively kite — at normal range, Precision is terrible (25 damage at 200px).

### Deck: The Architect

**Core:** Singularity + Detonate + Expose + Chain Lightning + Resonance
**Flow:** Singularity groups enemies → Expose one target (Statement) → Resonance copies Vulnerable to another (Function) → Chain Lightning bounces between debuffed cluster → Detonate finishes for 30+ per enemy
**Why it works:** All about controlling enemy positioning and spreading debuffs through the group. Detonate only reaches its full potential (30+ per enemy) when 5+ enemies are grouped by Singularity. The multipliers stack because every enemy is debuffed AND grouped.

### Deck: The Ghost

**Core:** Phase Shift + Backstab + Expose + Momentum + Precision
**Flow:** Phase Shift behind enemies (Function) → Expose + Backstab from behind (Statement × 2) → Dash away → Precision from max range (Function) → repeat
**Why it works:** Hit-and-run playstyle. Phase Shift in, burst in melee, escape with Dash, snipe with Precision. Momentum gets cheaper from all the dashing.

---

## Second Pass: Implementation Considerations

### New state tracking required

Beyond First Pass state tracking:

- **Per-Active-Window counters:** cards played, dashes performed
- **Last debuff applied:** type and parameters, for Resonance
- **Distance calculation:** between player and projectile impact point, for Precision

### Cards that need special damage calculation

These Second Pass cards can't use a simple `damage` field — they need runtime calculation:

- Conduit: reads enemy debuff count at hit time
- Overflow: reads current Compute Rate Limit at play time and consumes half of the remaining Compute Rate Limit
- Momentum: reads dash counter for cost calculation
- Surge: reads cards-played counter for cost calculation
- Overwhelm: reads nearby enemy count at hit time
- Precision: reads distance at impact time

This means the damage/cost pipeline needs to support **dynamic resolution functions**, not just static values.

### Proposed extension to AttackCardDefinition

```ts
interface AttackCardDefinition {
  // ... existing fields ...

  // Dynamic cost (overrides `cost` if present)
  dynamicCost?: (state: CardPlayState) => number;

  // Dynamic damage (overrides `damage` if present)
  dynamicDamage?: (state: CardHitState) => number;

  // On-play effects
  onPlayEffects?: OnPlayEffect[];

  // On-hit effects
  onHitEffects?: OnHitEffect[];
}

interface CardPlayState {
  dashesThisWindow: number;
  cardsPlayedThisWindow: number;
  computeRemaining: number;
  allotmentRemaining: number;
}

interface CardHitState {
  targetDebuffs: Set<DebuffType>;
  enemiesInMeleeRange: number;
  distanceToTarget: number;
}
```

### Balance notes for Second Pass

- **Conduit** at 38 max (3 debuffs) is strong but requires applying all three debuff types to one target — significant setup
- **Chain Lightning** requires enemies to have debuffs AND be within 200px of each other — the grouping requirement is real
- **Overflow** at 45 damage now consumes roughly 50 total Compute Rate Limit including the printed 5 cost, making it a deliberate finisher rather than free efficiency
- **Precision** at 72 requires 400px distance — most combat happens at 100-200px, so this is hard to achieve consistently
- **Surge** reaches minimum cost (5) at 9 cards played — that's an expensive setup for one cheap finisher

---

## THIRD PASS: Scaffolds (Passive Build Modifiers)

*Persistent enchantments that reshape how your deck functions.*

**Current filter:** Scaffolds that grant Shield, reward Integrity damage, or trigger from Shield breaking should be considered deprioritized for the same reason as the Shield/Thorns/health-as-resource cards. They may be interesting later, but they push the player toward feeling tanky or optimizing around damage intake.

### What are Scaffolds?

Scaffolds are **passive rule-modifiers**, not cards. They sit outside your deck and modify the game's rules for your benefit. Think Slay the Spire relics, MtG enchantments, or Wizards of Legends relics — permanent effects that define your build.

**Key properties:**
- Purchased in the shop between arena rounds (like Quantum Tuners)
- Limited slots: **max 3 active** at a time (can swap at shop)
- Persist across arena deployments within a run
- No compute cost, no card slot, no lane usage — pure passive
- Trigger automatically based on game state (no micromanagement)

**Why Scaffolds add depth:**
- Cards are about *what you do in combat*. Scaffolds are about *what your deck is built to do*.
- Each Scaffold makes certain deck compositions optimal and others suboptimal.
- Choosing a Scaffold is a **commitment** — it shapes your entire deckbuilding strategy.
- Running conflicting Scaffolds is possible but inefficient, creating meaningful choice.

### Scaffold acquisition

- **Starting Scaffold:** None. Player begins with empty Scaffold slots.
- **Shop purchase:** Each shop visit offers 2-3 random Scaffolds for purchase (priced in Bug Bounty Credits, ~40-80 credits depending on power level).
- **Slot limit:** 3 active Scaffolds. Buying a 4th requires choosing one to discard.
- **No rerolls:** What the shop offers is what you get. Adapt your deck to what's available.

### Scaffold design tension

The most interesting Scaffolds create **mutual exclusivity** with each other or with certain deck compositions:

| Scaffold rewards | Conflicts with |
|---|---|
| Playing many cheap cards | Playing few expensive cards |
| High compute spending | Low compute spending |
| Melee focus | Ranged focus |
| Taking damage | Avoiding damage |
| Card variety | Card duplication |
| Aggressive positioning | Defensive positioning |

A Scaffold that's good in every deck is a bad Scaffold. Each one should make you think "I need to change my deck to make this work."

---

### Scaffold 1: Cascade Protocol

*"Play fast and loose."*

**Trigger:** When you play 5+ cards in a single Active Window.
**Effect:** Recycle the first discarded Statement card of that window back into the Statement queue. **That card costs 0 compute when played.**

**What it does:** After you've played 5 cards in a window, you get one of your melee cards back — and it's free. It's not a new card — it's a card you already played, returned to your queue at no cost.

**Decks it rewards:**
- Trim-heavy decks (draw engine = more cards played per window)
- Cheap melee decks (Slash 18, Expose 15, Backstab 20, Iterate 20 — easy to play 5+)
- Storm builds with Surge (Second Pass)

**Decks it punishes:**
- Expensive ranged decks (Bolt 40, Detonate 45 — you won't reach 5 cards)
- Slow single-card decks that do not reach the 5-card threshold
- Any deck that runs 2-3 expensive cards per window

**Numerical example:** A window where you play Slash, Trim (draw), Slash, Expose, Backstab = 5 cards. The first Slash returns to your queue for free. You now have a 6th melee play that costs 0 compute — effectively a bonus Slash.

**Synergy highlights:** The free recycled card creates compelling combos with cards that are expensive for their lane. A free Iterate at ramped damage (e.g., 45 damage for 0 compute) is extremely efficient. Since the recycled card is always your *first* discarded Statement, you have some control over what gets recycled — lead with your best melee card.

**From Slay the Spire:** This is the **Hovering Kite / TURBO** relic pattern — reward a specific play pattern (playing many cards) with a resource refund. It's also similar to the **Ironclad's Exhume** — recovering a used card. The "free" aspect mirrors the satisfaction of StS storm turns where accumulated discounts make cards cost 0.

---

### Scaffold 2: Overclock License

*"Go big or go home."*

**Trigger:** Passive. On every Function card play that costs 30+ compute.
**Effect:** That card has a **33% chance to double-cast** — offensive cards fire twice in rapid succession; utility cards are cast for free.

**What "double-cast" means:**
- **Offensive Function cards** (Bolt, Detonate, Singularity, Tag, Corrupt, Chain Lightning, Precision, Overflow, Surge): The card fires twice in rapid succession (~150ms apart). You pay the cost once. Both casts resolve independently — separate projectile, separate hit detection, separate on-hit effects. Lane cooldown starts after the second cast.
- **Utility Function cards** (Refund, Phase Shift): The card is cast for 0 compute instead. No double-cast.

**Qualifying cards (cost 30+):**

| Card | Cost | Qualifies? |
|---|---|---|
| Bolt | 40 | Yes |
| Detonate | 45 | Yes |
| Singularity | 35 | Yes |
| Phase Shift | 30 | Yes |
| Surge | 40−4×plays | Yes (at 0-2 plays) |
| Precision | 25 | No |
| Tag | 15 | No |
| Corrupt | 20 | No |
| Chain Lightning | 30 | Yes |
| Overflow | 5 | No |

**Expected double-casts per deployment:**

| Deck type | Qualifying Function plays/deployment | Expected double-casts |
|---|---|---|
| Bolt-heavy (10 Bolts) | 10 | ~3-4 |
| Detonate build (5 Detonates) | 5 | ~1-2 |
| Singularity + Detonate (3+3) | 6 | ~2 |
| Mixed (4 Bolts + 2 Singularity + 2 Detonate) | 8 | ~2-3 |

**Decks it rewards:**
- Bolt-heavy decks (40 cost qualifies → ~33% chance of double Bolt = two projectiles with separate splash/siphon = double siphon refund potential)
- Detonate builds (45 cost qualifies → ~33% chance of double Detonate = two AoE explosions against grouped enemies)
- Any deck running expensive Function cards (30+ compute)

**Decks it punishes:**
- Cheap ranged decks (Refund costs 0, Tag costs 15, Corrupt costs 20 — none qualify for the 30 threshold)
- Melee-heavy decks (Statement cards don't trigger this at all)
- Overflow builds (Second Pass — Overflow costs 5, never triggers this)

**Numerical examples:**
- Bolt (40 compute) → 33% chance → double Bolt fires → two projectiles, each dealing 40 direct + 20 splash, separate siphon calculations. Total: ~80 direct + ~40 splash + up to +36 siphon refund
- Detonate (45 compute) → 33% chance → double Detonate → two AoE explosions against grouped enemies. 5 enemies hit twice: first cast 30 each, second cast 30 each = 300 total damage potential
- Singularity (35 compute) → 33% chance → double Singularity → two gravity wells stacking. Extremely strong pull — intentionally powerful when it happens

**Why probability instead of guaranteed:** A guaranteed double-cast on every expensive card was too strong — it made Bolt decks strictly better than every other ranged build. The 33% chance introduces variance: sometimes you get the exciting double, sometimes you don't. You can't plan your entire strategy around it, so the base deck still needs to be good on its own. Overclock makes expensive Function decks better on average (~33% more value from qualifying cards) without making them dominant.

**Design note — why 30 threshold:** Includes Bolt, Detonate, Singularity, Phase Shift, and Chain Lightning — the "meaningful investment" cards. Excludes cards under 30 (Tag 15, Corrupt 20, Precision 25) which are cheap utility or setup tools. The threshold means you must commit real compute to roll the dice.

**Edge case: double Singularity.** Two gravity wells stacking creates an extremely strong pull. This is intentionally powerful but rare (~33% chance, and only if Singularity is in your hand).

**Edge case: Surge at variable cost.** Surge starts at 40 (qualifies) and drops to 5 minimum (doesn't qualify). Whether Surge triggers Overclock depends on how many cards you've played this window — early Surge qualifies, late Surge doesn't.

**From MtG:** This is the **Reverberate / Twincast** pattern with a **Mana Flare** twist — sometimes your expensive spells just... do more. In MtG terms, it's like having a chance to copy your own spell. The randomness mirrors mechanics like **Krark's Thumb** or **Chance Encounter** — gambling on your own power.

---

### Scaffold 3: Diversity Protocol

*"Be versatile."*

**Trigger:** Passive. Always active.
**Effect:** Each unique card type in your discard pile grants **+4% damage** to all attacks. Maximum bonus: +40% (10 unique types).

**What it does:** The more different cards you've played this arena deployment, the harder everything hits. Running a diverse deck is rewarded with a percentage damage bonus that scales with all your damage sources.

**Unique card types:** Slash, Bolt, Trim, Refund, Phase Shift, Backstab, Expose, Singularity, Detonate, Shockwave, Corrupt, Iterate, Echo, Tag, Execute, Conduit, Chain Lightning, Overflow, Momentum, Surge, Overwhelm, Resonance, Precision. (23 total, but max bonus caps at 10 unique.)

**Damage bonus by unique cards in discard:**

| Unique types | Bonus | Example: Slash (23) | Example: Bolt (40) |
|---|---|---|---|
| 1 | +4% | 24 | 42 |
| 2 | +8% | 25 | 43 |
| 3 | +12% | 26 | 45 |
| 4 | +16% | 27 | 46 |
| 5 | +20% | 28 | 48 |
| 6 | +24% | 29 | 50 |
| 7 | +28% | 29 | 51 |
| 8 | +32% | 30 | 53 |
| 9 | +36% | 31 | 54 |
| 10+ | +40% (cap) | 32 | 56 |

**Decks it rewards:**
- Rainbow decks with 10+ different card types (even 1-2 copies of each)
- Decks that naturally cycle through their whole deck (Trim draw engine)
- Long arena deployments (more time to play different cards)
- Decks that use Second Pass cards (Conduit, Resonance, Chain Lightning — these already reward variety)

**Decks it punishes:**
- Mono-card decks (15 Slash + 5 Bolt = 2 unique types = only +8%)
- Tight focused decks (3 card types = +12%)
- Decks that rely on duplicating one combo pair

**Why percent instead of flat:** A flat bonus (+2 per type) becomes less relevant as base damages scale higher — it's meaningful on Slash (23) but less relevant on a ramped Iterate (50+). A percentage bonus scales proportionally with all damage sources, keeping Diversity relevant throughout the entire deployment.

**Why cap at 10 instead of 7:** Diluting your deck with many card types has a real cost — less consistency, fewer copies of your best cards. A deck running 1 copy of 10 different cards in a 60-card deck will rarely see those cards. The higher cap (10 vs 7) makes the tradeoff worthwhile for players who commit to the diversity strategy.

**Design tension:** Diversity Protocol actively fights against focused archetypes. A Shadow Strike deck (Phase Shift + Backstab + maybe Expose) has 3 unique types (+12% bonus). Adding 7 more types dilutes the combo consistency but gives +40% to everything. Is it worth it?

**Stacking with other multipliers:** Diversity is multiplicative with Vulnerable (+40%). A 40% Diversity bonus + 40% Vulnerable = 96% total damage increase. This is significant but requires substantial setup (10 unique cards AND applying Vulnerable).

**Cross-Scaffold tension:** Diversity Protocol conflicts with Overclock License. Overclock wants expensive cards (few plays, high cost). Diversity wants many different cards (many plays, varied costs). You can't optimize for both.

**From MtG:** This is the **Domain / Chroma** mechanic — reward having diverse colors/types. In MtG, Domain cards get stronger for each basic land type you control. Here, your "land types" are the card types in your discard pile.

---

### Scaffold 4: Conservation Protocol

*"Waste not."*

**Status:** Considered but deprioritized while player Shield builds are out of scope.

**Trigger:** When an Active Window ends and you have 50+ Compute Rate Limit remaining.
**Effect:** Gain 12 Shield (stacks with Fortify, respects 50 Shield cap).

**What it does:** If you end a window without spending much compute, you get free Shield. This turns "not attacking" into a defensive resource.

**Decks it rewards:**
- Cheap melee decks (Slash 18, Expose 15 — easy to leave 50+ compute)
- Decks that rely on a few powerful plays per window (Iterate + Backstab, then stop)
- Overflow builds (Second Pass — you want high compute anyway)
- Precision/kiting builds (spend compute on one ranged card, save the rest → Shield)

**Decks it punishes:**
- Bolt + Detonate decks (spend 40-45 per Function play, easily exhaust compute)
- Storm decks (play many cards, exhaust compute)
- Surge builds (Second Pass — you want to play many cards to make Surge cheap)

**Design tension:** This Scaffold says "do less, get more." It directly opposes Cascade Protocol (play more cards). Running both creates a contradiction — Cascade wants you to play 5+ cards (expensive), Conservation wants you to spend less than 46 compute. You can't do both in the same window.

**Cross-card synergy:** Conservation Protocol + Bastion (First Pass). Free Shield from Conservation can be saved across windows, then consumed by Bastion for a burst payoff. This is slower and less repeatable than the deprioritized Shatter loop.

**From Slay the Spire:** This is the **Orichalcum** relic pattern — reward for NOT doing something (not blocking, here: not spending). In StS, Orichalcum gives Block when you end your turn without playing a Block card. Here, you get Shield when you end your window without spending.

---

### Scaffold 5: Symbiosis Engine

*"Balance is power."*

**Trigger:** When you play at least one Statement AND at least one Function card in the same Active Window.
**Effect:** Draw 1 bonus card into whichever queue has fewer cards.

**What it does:** Rewards using both lanes every window. If you only melee or only ranged, nothing happens. If you use both, you get a free card.

**Decks it rewards:**
- Balanced melee + ranged decks (Slash + Bolt, Backstab + Tag, etc.)
- Decks that naturally alternate lanes (Expose → Bolt, Phase Shift → Backstab)
- Any 50/50 split deck

**Decks it punishes:**
- Mono-lane decks (all Statement, no Function, or vice versa)
- Decks that rely heavily on one lane and only use the other for utilities (e.g., all melee + Refund only in Function)
- Decks where Function lane is purely utility (Refund, Phase Shift) and you don't always draw a ranged attack

**Design tension:** Symbiosis Engine pushes you toward balanced decks. A deck with 20 Slash + 20 Backstab + 10 Bolt would trigger Symbiosis every window (melee + ranged). A deck with 40 Slash + 10 Trim would never trigger it. This makes the "all melee, all the time" strategy weaker relative to balanced builds.

**Cross-archetype synergy:** Symbiosis Engine + Diversity Protocol. Symbiosis draws you more cards (more variety → higher Diversity bonus). Diversity makes those cards hit harder. Together they create a "broad but deep" build.

**From Wizards of Legends:** This mirrors the element-mixing system. In WoL, combining different elements gives bonus effects. Here, combining different lanes gives bonus draw.

---

### Scaffold 6: Decay Protocol

*"Let it rot."*

**Trigger:** Passive. Always active.
**Effect:** Enemies lose 2% of their max HP per second while any debuff is active on them.

**What it does:** Any debuffed enemy (Vulnerable, Corrupt, Mark — any debuff) takes passive damage over time. This stacks with direct damage — it's a background tick.

**Numerical example (Bug with 44 HP):**
- 2%/s = 0.88 damage/s per bug while debuffed
- Over a 10s fight with permanent uptime: ~9 damage per bug
- For 5 debuffed bugs: ~45 total passive damage over 10s

This sounds low, but it's **free** — you don't spend compute or cards on it. It's a background damage multiplier.

**Decks it rewards:**
- Any deck with Expose, Tag, or Corrupt (easy debuff uptime)
- Tag-heavy decks (Marks persist forever, so Decay ticks permanently)
- Corrupt builds (DoT stacks WITH Decay for double passive damage)
- Long arena deployments (more time for Decay to tick)

**Decks it punishes:**
- Pure damage decks (Slash + Bolt, no debuffs = no Decay)
- Burst builds that kill enemies before debuffs matter
- Phase Shift + Backstab (one-shot from stealth, no debuff application)

**Scaling consideration:** At higher rounds, enemy HP scales (× 1 + 0.06 × roundsFinished). Decay is %-based so it scales with enemy HP — always relevant.

**From MtG:** This is **Poison Counter / Toxic** mechanics. Passive damage that accumulates. Also similar to **Stasis** — a slow, inevitable grind that the opponent can't stop once started.

---

### Scaffold 7: Momentum Core

*"Never stop moving."*

**Trigger:** Each time you Dash during an Active Window.
**Effect:** Reduce Statement lane cooldown by 60ms per Dash (this window only). Resets at end of window. Floor: 150ms.

**What it does:** Every Dash makes your melee attacks faster for the rest of that window.

**Cooldown reduction:**

| Dashes this window | Statement CD | Notes |
|---|---|---|
| 0 | 350ms (base) | Normal |
| 1 | 290ms | Noticeable |
| 2 | 230ms | Meaningful speedup |
| 3 | 170ms | Dramatic — rapid melee |
| 4+ | 150ms (floor) | Melee machine gun |

**Decks it rewards:**
- Aggressive melee decks that Dash into combat (not away from it)
- Momentum (Second Pass) — both reward Dash frequency
- Overwhelm (Second Pass) — Dash into enemy cluster, then rapid melee
- Backstab builds — Dash behind enemies, then rapid Backstabs at reduced CD

**Decks it punishes:**
- Ranged kiting decks (you're not in melee range to benefit from faster melee CD)
- Defensive Dash users (Dashing away = no melee follow-up)
- Precision (Second Pass) — you want distance, not melee speed

**Design tension:** Momentum Core rewards being aggressive with your Dash — Dashing *into* enemies. This is counter-intuitive (Dash is for evasion) and changes how you use a core mechanic. It pairs beautifully with Momentum (the Second Pass card) because both reward the same behavior.

**Cross-Scaffold tension:** Momentum Core + Conservation Protocol. Momentum Core wants you to Dash a lot (aggressive play, spend compute on melee). Conservation wants you to spend less compute. Hard to optimize both.

**From Slay the Spire:** This is the **Kunai / Shuriken** relic pattern — reward a specific action (playing 3 attacks in a turn, here: Dashing) with a stat bonus (Dexterity/Strength, here: cooldown reduction).

---

### Scaffold 8: Berserker Protocol

*"Pain is fuel."*

**Status:** Considered but deprioritized while health-as-resource and damage-intake builds are out of scope.

**Trigger:** Each time you take Integrity damage (not Shield damage).
**Effect:** Your next melee attack deals +50% damage. Stacks up to 2 times.

**What it does:** Getting hit makes your next melee swing hit harder. If you take two hits without meleeing, your next melee deals +100% damage.

**Damage bonus:**

| Hits taken (since last melee) | Next melee damage multiplier |
|---|---|
| 0 | × 1.0 (normal) |
| 1 | × 1.5 |
| 2 | × 2.0 (cap) |

**Decks it rewards:**
- Aggressive melee decks that intentionally accept Integrity damage
- Overwhelm (Second Pass) — surrounded, taking hits, dealing bonus melee damage

**Decks it punishes:**
- Ranged-only decks (no melee to spend the bonus on)
- Phase Shift / stealth builds (avoiding damage means Berserker never triggers)
- Precision / kiting builds (avoiding hits = no bonus)
- Conservation Protocol users (don't get hit = don't trigger)

**Design tension:** Berserker Protocol creates a "masochist" build. You WANT to get hit, but only a controlled amount. Shield lets you absorb the first few hits safely, then when Shield breaks, the real damage triggers Berserker. It's a deliberate health management game.

**Cross-Scaffold synergy:** Berserker + Momentum Core. Dash INTO enemies, take a hit (trigger Berserker), swing at × 1.5 with reduced CD from Momentum Core. High risk, high reward.

**From Slay the Spire:** This is the **Rupture + Ragic Cake** build — self-damage becomes your primary damage scaling. The Ironclad's deepest archetype because it touches every system (healing, blocking, dealing damage).

---

### Scaffold 9: Convergence Matrix

*"Group punishment."*

**Trigger:** Passive. Always active.
**Effect:** When 3+ enemies are within 150px of each other, all attacks deal +30% damage to those enemies (even single-target attacks).

**What it does:** Just being grouped up makes enemies take more damage. Doesn't matter how they got grouped — Singularity, natural pathing, or just bad enemy AI.

**Decks it rewards:**
- Singularity builds (pull enemies together → +30% to everything)
- Shockwave builds (push enemies into walls where they cluster)
- Any deck fighting in tight corridors or arenas
- Detonate (First Pass) — grouped enemies take +30% AND Detonate's per-enemy bonus

**Decks it punishes:**
- Single-target assassin builds (Phase Shift + Backstab — you're isolating one enemy)
- Precision / kiting builds (keeping enemies spread out at range)
- Tag + Execute (focused on one enemy, doesn't care about grouping)

**Numerical example:** Singularity groups 5 bugs. All attacks deal +30%. Detonate hits for 30 × 1.3 = **39 per bug**. That's 195 total damage in one play.

**Cross-Scaffold tension:** Convergence Matrix + Diversity Protocol. Convergence rewards focused AoE builds (few card types, lots of grouping). Diversity rewards varied builds (many card types). You can run both, but it means spreading your deck thin.

**From Wizards of Legends:** This mirrors the **AoE specialization** relics — items that buff area damage or create zones. The "cluster detection" mechanic is similar to WoL's fusion effects that trigger when enemies overlap.

---

### Scaffold 10: Entropy Engine

*"Every fourth one's on the house."*

**Trigger:** Every 4th card you play this arena deployment.
**Effect:** That card costs 0 compute (both pools).

**What it does:** Every fourth card is free. No conditions, no restrictions. Just a steady drip of savings.

**Numerical value:** If you play 30 cards in a deployment, 7-8 of them are free. At an average cost of ~20 compute, that's ~150 compute saved — roughly 1.5 Active Windows worth of compute.

**Decks it rewards:**
- Every deck benefits equally — this is the most generic Scaffold
- Particularly good for expensive card decks (Bolt 40 → free every 4th play)
- Works well with Surge (Second Pass — cheaper cards mean more plays → more free plays)

**Decks it doesn't particularly reward or punish:**
- It's universally good, which is a design concern (see below)

**Design note — why every 4th instead of every 3rd:** At every 3rd card, Entropy Engine saved ~200 compute per deployment, which was deceptively strong — potentially outperforming conditional Scaffolds that require specific builds. Every 4th card saves ~150 compute, which is competitive with other Scaffolds but not dominant. The "training wheels" identity stays intact — always decent, never great, never requires build changes.

**Design concern — too generic?** Entropy Engine is the least "build-defining" Scaffold. It doesn't push you toward any specific deck composition. Every deck benefits equally. This makes it a safe pick but a boring one. Experienced players should replace it with something build-specific.

**From Slay the Spire:** This is the **Happy Flower / Incense Burner** pattern — a relic that triggers on a fixed cadence regardless of what you do. Simple, reliable, universally good.

---

### Scaffold 11: Precision Protocol

*"Sniper's discipline."*

**Trigger:** When you deal damage with a Function card from 300+ px away.
**Effect:** Gain 1 **Precision Stack** (max 5). Each stack: +8% damage to all Function cards. Stacks reset if an enemy enters 150px of the player.

**What it does:** Staying at range and sniping makes your ranged attacks stronger. Letting enemies get close resets your stacks. This is the "kiter's dream" Scaffold.

**Damage bonus:**

| Precision Stacks | Function damage bonus |
|---|---|
| 0 | +0% |
| 1 | +8% |
| 2 | +16% |
| 3 | +24% |
| 4 | +32% |
| 5 (max) | +40% |

**Decks it rewards:**
- Precision (Second Pass) — the card and Scaffold reinforce the same playstyle
- Bolt-heavy decks (stay at range, spam Bolts, stack Precision)
- Corrupt / Tag builds (apply debuffs at range, never melee)
- Shockwave (push enemies away to prevent reset)

**Decks it punishes:**
- Any melee deck (entering melee range resets stacks)
- Overwhelm, Backstab (both require close range)
- Singularity (pulls enemies toward you, risk of reset)
- Berserker Protocol (opposite playstyle)

**Design tension:** Precision Protocol is the anti-thesis of Berserker Protocol and Momentum Core. You literally cannot run all three effectively. Choosing Precision means committing to a ranged/kiting build and avoiding melee entirely.

**Reset condition nuance:** The reset is "enemy enters 150px" — this is inside melee range (166px) but outside touch damage range. You get a brief warning before you're in danger AND before you lose stacks. Dash can save you from the reset.

**From Wizards of Legends:** This is the **ranged specialization relics** in WoL — items that buff ranged spells but penalize close-range combat. The stack-and-reset mechanic creates a constant tension between "stay safe" and "go aggressive."

---

### Scaffold 12: Second Wind

*"The best defense is another offense."*

**Status:** Considered but deprioritized while player Shield builds are out of scope.

**Trigger:** When your Shield drops to 0 (from any amount above 0).
**Effect:** Immediately draw 2 bonus cards (1 into each queue).

**What it does:** When your Shield breaks, you get a burst of new options. It turns losing your defensive buffer into an offensive opportunity.

**Decks it rewards:**
- Spike + Fortify (Shield absorbs hits while Thorns deals damage, when Shield breaks → draw 2)
- Conservation Protocol (gain free Shield, then let enemies break it to draw 2)
- Any deck that cycles Shield frequently

**Decks it punishes:**
- Decks that never build Shield (no Shield = never triggers)
- Bastion builds (Bastion consumes Shield deliberately, it doesn't "break" — see note below)

**Design note — Bastion interaction:** When Bastion consumes Shield, does that trigger Second Wind? Two options:
- **Yes:** Makes Bastion + Second Wind a strong combo (consume Shield for damage + draw 2). This is more powerful but creates a clear pairing.
- **No:** "Drops to 0" means only from damage, not from consumption. This makes Second Wind purely defensive — it triggers when enemies break your Shield, not when you spend it.
- Recommendation: **Yes, Bastion triggers it.** This creates an interesting loop: Fortify → Bastion (consume Shield for damage + draw 2) → those drawn cards might include another Fortify → repeat. But you're spending compute on Fortify and a card slot on Bastion to enable this loop, so it has a cost.

**From Slay the Spire:** This is the **Centennial Puzzle / Sundial** relic pattern — trigger on a specific event (exhausting a card, here: Shield breaking) to draw cards. It turns a negative event (losing Shield) into a positive one (drawing cards).

---

## Scaffold Summary

### All Scaffolds

| # | Name | Trigger | Effect | Rewards |
|---|---|---|---|---|
| 1 | Cascade Protocol | Play 5+ cards in one window | Recycle first discarded Statement (free) | Cheap spam decks |
| 2 | Overclock License | Function card costs 30+ compute | 33% chance to double-cast (offensive) or free-cast (utility) | Expensive ranged |
| 3 | Diversity Protocol | Passive | +4% damage per unique card in discard (max +40%, 10 types) | Varied decks |
| 4 | Conservation Protocol | End window with 50+ compute | Gain 12 Shield | Deprioritized Shield builds |
| 5 | Symbiosis Engine | Play both lanes in one window | Draw 1 bonus card | Balanced decks |
| 6 | Decay Protocol | Passive | Debuffed enemies lose 2% HP/s | Debuff builds |
| 7 | Momentum Core | Dash during window | −60ms melee CD per Dash (floor 150ms) | Aggressive melee |
| 8 | Berserker Protocol | Take Integrity damage | Next melee +50% (max ×2.0) | Deprioritized damage-intake builds |
| 9 | Convergence Matrix | 3+ enemies within 150px | +30% damage to grouped enemies | AoE/grouping |
| 10 | Entropy Engine | Every 4th card | That card costs 0 | Universal |
| 11 | Precision Protocol | Function damage from 300+ px | +8% Function damage per stack (max +40%) | Ranged kiting |
| 12 | Second Wind | Shield drops to 0 | Draw 2 cards (1 per queue) | Deprioritized Shield builds |

### Scaffold Conflict Map

Scaffolds that create deckbuilding tension when chosen together:

```
                    ┌─────────────────┐
                    │  Cascade Proto. │  (play many cheap)
                    │  Symbiosis Eng. │
                    └────────┬────────┘
                             │ conflicts with
                    ┌────────▼────────┐
                    │ Overclock Lic.  │  (play few expensive)
                    │ Conservation P. │
                    └─────────────────┘

                    ┌─────────────────┐
                    │  Momentum Core  │  (melee + aggressive)
                    │  Berserker P.   │
                    │  Convergence M. │
                    └────────┬────────┘
                             │ conflicts with
                    ┌────────▼────────┐
                    │ Precision Proto.│  (ranged + kiting)
                    └─────────────────┘

                    ┌─────────────────┐
                    │  Diversity P.   │  (many card types)
                    │  Symbiosis Eng. │
                    └────────┬────────┘
                             │ conflicts with
                    ┌────────▼────────┐
                    │  Entropy Engine │  (rewards mono-type spam)
                    └─────────────────┘

                    ┌─────────────────┐
                    │  Decay Protocol │  (sustained debuffs)
                    │  Conservation P.│  (don't get hit)
                    └────────┬────────┘
                             │ conflicts with
                    ┌────────▼────────┐
                    │  Berserker P.   │  (want to get hit)
                    │  Second Wind    │  (want Shield to break)
                    └─────────────────┘
```

### Recommended Scaffold Trio Builds

**The Storm (Cascade + Symbiosis + Diversity):**
- Run a varied, cheap deck with both melee and ranged cards
- Cascade recycles a free melee card when you play 5+
- Symbiosis draws bonus cards for using both lanes
- Diversity boosts all damage +40% for 10+ unique card types
- Deck composition: 10+ different card types, all under 25 cost

**The Cannon (Overclock + Precision Protocol + Convergence):**
- Run expensive ranged cards (Bolt, Detonate, Singularity)
- Overclock gives 33% chance to double-cast on cards costing 30+
- Precision Protocol stacks damage from range
- Convergence boosts grouped enemies
- Detonate only efficient when Singularity groups 5+ enemies (30+ each)
- Deck composition: Bolt-heavy, Singularity for grouping, Detonate as group payoff

**The Plague (Decay + Diversity + Symbiosis):**
- Run debuff-heavy deck (Expose, Tag, Corrupt, Resonance, Chain Lightning)
- Decay ticks passive damage on everything debuffed
- Diversity boosts damage for variety
- Symbiosis keeps both lanes fed
- Every enemy you touch starts dying slowly

**The Minimalist (Conservation + Overclock + Precision Protocol) — deprioritized while Shield is out of scope:**
- Run a deck with 1-2 expensive ranged cards and nothing else
- Play one Bolt per window, end with 50+ compute → Conservation Shield
- Bolt (40 cost) has 33% chance to double-cast via Overclock
- Precision Protocol stacks from ranged distance
- Minimal plays, maximum efficiency per play

---

## Third Pass: Implementation Considerations

### Scaffold data model

```ts
interface ScaffoldDefinition {
  id: ScaffoldId;
  name: string;
  summary: string;
  shopCost: number;           // Bug Bounty Credits
  trigger: ScaffoldTrigger;
  effect: ScaffoldEffect;
}

type ScaffoldTrigger =
  | { type: "passive" }
  | { type: "cards_played_threshold"; threshold: number; scope: "window" | "deployment" }
  | { type: "compute_spend_threshold"; threshold: number }
  | { type: "compute_remaining_threshold"; threshold: number }
  | { type: "both_lanes_played" }
  | { type: "dash_performed" }
  | { type: "integrity_damage_taken" }
  | { type: "shield_broken" }
  | { type: "ranged_damage_from_distance"; minDistance: number }
  | { type: "enemies_grouped"; count: number; radius: number }
  | { type: "every_nth_card"; n: number };

type ScaffoldEffect =
  | { type: "recycle_statement_free" }
  | { type: "double_cast_function"; costThreshold: number; chance: number }
  | { type: "damage_percent_per_unique"; percentPerUnique: number; maxBonus: number }
  | { type: "gain_shield"; amount: number }
  | { type: "draw_card" }
  | { type: "percent_hp_damage_per_second"; percent: number }
  | { type: "reduce_melee_cooldown"; reductionMs: number }
  | { type: "melee_damage_multiplier"; multiplier: number; maxStacks: number }
  | { type: "grouped_damage_bonus"; percent: number }
  | { type: "free_card" }
  | { type: "function_damage_per_stack"; percentPerStack: number; maxStacks: number; resetCondition: string }
  | { type: "draw_per_queue"; perQueue: number };
```

### New state tracking required

- **Active Scaffolds:** array of equipped ScaffoldDefinitions (max 3)
- **Per-Active-Window counters:** cards played, dashes performed, compute spent per card, whether each lane was used
- **Per-deployment counters:** total cards played, unique card types in discard, Integrity damage taken
- **Precision stacks:** current stacks, with proximity-based reset check each frame
- **Berserker stacks:** current stacks, consumed on next melee hit
- **Entropy counter:** cards played this deployment modulo 3
- **Overclock state:** per-Function-card roll at play time (if cost ≥ 30, roll 33% for double-cast or free-cast), no persistent state needed
- **Cascade state:** whether 5-card threshold was reached this window (boolean), first discarded Statement card reference, flag marking it as free

### Shop integration

- Add a **Scaffold section** to the shop scene
- Offer 2-3 random Scaffolds per shop visit
- If player has 3 Scaffolds, buying a 4th shows a swap/discard UI
- Scaffolds are priced higher than card packs (40-80 Bug Bounty Credits) to make them a meaningful investment

### Scaffold balance philosophy

1. **No Scaffold should be strictly better than not having it in some deck.** Every Scaffold should have deck compositions where it's actively bad.
2. **Three Scaffolds should define a build.** After equipping 3, the player should have a clear sense of what their deck "wants to do."
3. **Conflicting Scaffolds are allowed.** The player CAN run Cascade + Conservation, but it's on them to make it work.
4. **Entropy Engine is the "training wheels" Scaffold.** It's always decent, never great. Every 4th card free is meaningful but not dominant. New players gravitate toward it. Experienced players replace it with something build-specific.
