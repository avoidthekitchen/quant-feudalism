# Quant Feudalism

Quant Feudalism is a compact arena combat prototype about surviving corporate extraction while managing constrained compute resources.

## Language

**Cycle**:
A repeating real-time combat cadence made of one **Active Window** followed by one **Preparing Window**.
_Avoid_: Turn, Compute Cycle, Combat Cycle

**Active Window**:
The part of a **Cycle** where **Attack Cards** are available to play through the **Attack Queues**.
_Avoid_: Player turn

**Preparing Window**:
The part of a **Cycle** where attack cards are unavailable and the player survives while preparing the next active window.
_Avoid_: Cooldown phase, waiting phase

**Dash**:
A free repositioning move that remains available during both **Active Windows** and **Preparing Windows**.
_Avoid_: Dash card

**Attack Card**:
A drawn permission token that allows one **Statement** or **Function** attack attempt when its cost and action constraints are satisfied.
_Avoid_: Ability charge

**Card Type**:
The combat role of an **Attack Card**, such as **Statement** or **Function**.
_Avoid_: Suit

**Card Class**:
The deck-building rarity or rules group for an **Attack Card**, such as **Basic** or **Special**.
_Avoid_: Card Type

**Card Name**:
The player-facing name of a specific **Attack Card** design.
_Avoid_: Card ID

**Card ID**:
The stable internal identity of a specific **Attack Card** design used by deck lists and saved state.
_Avoid_: Derived name

**Deck**:
The run-scoped collection of **Attack Cards** used to create the draw pile for arena deployments.
_Avoid_: Starter Deck, loadout

**Copy Limit**:
The maximum number of copies of one **Attack Card** design allowed in a **Deck**.
_Avoid_: Deck size

**Deck Builder**:
The between-deployment interface where the player edits their current **Deck** before entering the arena.
_Avoid_: Reward screen

**Draft Deck**:
The editable current **Deck** state shown in the **Deck Builder**, including invalid intermediate deck counts.
_Avoid_: Saved deck

**Valid Deck**:
A **Draft Deck** that satisfies deck size, card availability, and copy-limit rules and can be used for arena deployment.
_Avoid_: Legal hand

**Statement**:
The close-range **Attack Card** and attack role played with left click.
_Avoid_: Melee

**Function**:
The projectile **Attack Card** and attack role played with right click.
_Avoid_: Ranged

**Slash**:
The **Basic** **Statement** card and named version of the existing close-range attack.
_Avoid_: Basic Statement

**Bolt**:
The **Basic** **Function** card and named version of the existing projectile attack.
_Avoid_: Basic Function

**Trim**:
The **Special** **Statement** card that trades Slash's damage efficiency for additional card draw.
_Avoid_: Special Statement

**Refund**:
The **Special** **Function** card that discounts upcoming attacks without dealing damage.
_Avoid_: Special Function

**Bug**:
An arena enemy that pursues, lunges, and blocks extraction bonuses until cleared.
_Avoid_: Droid, drone, hostile

**Bug Bounty Credits**:
The run-scoped currency earned from arena results and spent on Compute Credit refills.
_Avoid_: Shop credits

**Attack Queue**:
A HUD lane that shows available **Attack Cards** for one attack type.
_Avoid_: Hand, card pile

**Queue Limit**:
The maximum total number of **Attack Cards** available across both **Attack Queues** during an **Active Window**.
_Avoid_: Hand size

**Starter Deck**:
The default **Deck** assigned at the start of a new run.
_Avoid_: Build, loadout

**Cycle End**:
The transition from an **Active Window** to a **Preparing Window**, either because no queued attack card can be afforded or because the player ends the cycle early.
_Avoid_: End turn

## Relationships

- A **Cycle** contains exactly one **Active Window** and exactly one **Preparing Window**.
- An **Active Window** exposes **Attack Cards** through two **Attack Queues**: **Statement** and **Function**.
- **Attack Queues** are shown in the lower-center arena HUD during gameplay.
- Draw pile and discard pile counts are visible near the **Attack Queues**.
- An **Active Window** draws until the two **Attack Queues** contain the **Queue Limit** in total.
- Card movement is shown with lightweight deal, play, discard, and shuffle animations.
- The **Starter Deck** contains 15 **Slash** cards and 5 **Bolt** cards.
- A new run starts with the **Starter Deck** as the player's current **Deck**.
- Between arena deployments, the player can edit their current **Deck** in the **Deck Builder**.
- The **Deck Builder** is part of the existing shop and operations flow.
- The **Deck Builder** edits the run's **Draft Deck** directly.
- A **Draft Deck** can be below the minimum deck size while the player edits.
- A **Valid Deck** contains 20 to 100 total **Attack Cards**.
- A **Valid Deck** references only available **Card IDs**.
- A **Valid Deck** respects each **Attack Card** design's **Copy Limit**.
- **Basic** cards have no **Copy Limit**.
- **Special** cards have a **Copy Limit** of 10 copies per **Card ID**.
- The **Deck Builder** prevents normal increment controls from exceeding a card's **Copy Limit** or the 100-card maximum.
- Existing saved counts that exceed a **Copy Limit** remain visible as invalid **Draft Deck** entries until reduced.
- The **Deck Builder** can reset the **Draft Deck** back to the **Starter Deck**, removing unavailable entries and restoring a valid deck.
- Arena deployment is blocked until the **Draft Deck** is a **Valid Deck**, with player-facing messaging explaining why deployment is unavailable.
- Deck invalidity messaging prioritizes unavailable cards, then minimum deck size, then maximum deck size, then **Copy Limit** violations.
- A missing **Card ID** remains visible in the **Deck Builder** as an unavailable **Draft Deck** entry until the player removes it.
- Missing **Card IDs** count toward displayed deck size but block arena deployment and are not playable.
- Each arena deployment begins with a freshly shuffled copy of the player's current **Deck**.
- The **Deck Builder** does not mutate an in-progress arena deployment.
- Reloading mid-arena abandons the in-progress deployment and returns to the pre-arena shop state.
- **Collapse** restores the deck state captured in the selected arena snapshot.
- Each arena deployment starts in an **Active Window**.
- **Attack Cards** are named card designs within a **Card Type** lane.
- A specific **Attack Card** design has one **Card ID**, one **Card Name**, one **Card Type**, and one **Card Class**.
- A **Deck** records **Card ID** counts rather than individual card instances.
- **Card Type** and **Card Class** are separate axes: **Statement** and **Function** are **Card Types**; **Basic** and **Special** are **Card Classes**.
- The first **Deck Builder** version makes **Slash**, **Bolt**, **Trim**, and **Refund** available from the start of every run.
- **Trim** uses the same input, reach, stun, cooldown, and animation lock as **Slash**.
- **Trim** costs the same as **Slash**, deals half of **Slash** damage, and draws one additional **Attack Card** after its attack resolves.
- **Trim** draws exactly one **Attack Card** and can draw even when the **Attack Queues** are already at the **Queue Limit**.
- **Refund** is played from the **Function** **Attack Queue** but resolves as an immediate self-effect rather than a projectile.
- **Refund** costs no compute, deals no damage, and arms a flat Compute discount for the next three non-Refund attacks during the current **Active Window**.
- **Refund** discounts those attacks by 20 Compute each, but never below a 1 Compute cost.
- **Refund** discounts both Compute Rate Limit and Compute Credits and the remaining discount count is lost at **Cycle End**.
- **Refund** can be played when both compute pools are already full, still moving to discard and arming the discount.
- **Refund** displays an in-world fiery player aura with one visible charge per remaining discounted attack.
- A queued **Refund** can keep an **Active Window** from ending automatically while its **Function** lane cooldown clears.
- An **Attack Card** belongs to exactly one **Attack Queue** while it is available.
- **Attack Queues** are ordered lanes, but unaffordable cards do not block later affordable cards in the same lane.
- Playing a **Card Type** uses the leftmost currently affordable **Attack Card** in that **Card Type** lane.
- Per-card unavailable styling in an **Attack Queue** indicates resource affordability, not lane cooldown.
- Lane cooldown and committed action locks are shown as lane or input availability constraints rather than per-card affordability.
- A played **Attack Card** moves from its **Attack Queue** to discard immediately.
- An **Attack Card** is played only when its attack commits; rejected inputs do not consume cards.
- If no **Attack Card** in a selected lane is currently affordable, the input is rejected without starting cooldowns, animations, or card movement.
- A played **Attack Card** spends both short-term Compute Rate Limit and long-term Compute Credits, and can be played only when both resources can pay its full cost.
- **Attack Card** cooldowns are tracked by **Card Type** lane, while cooldown duration is determined by the specific **Attack Card** played.
- A cooling down **Statement** lane blocks all **Statement** cards, and a cooling down **Function** lane blocks all **Function** cards.
- **Function** siphon can restore long-term Compute Credits, but it does not restore Compute Rate Limit or change the **Cycle**.
- **Dash** does not consume **Attack Cards** and is not limited to one part of the **Cycle**.
- During a **Preparing Window**, attacks are unavailable, movement is slowed, and Dash remains available.
- **Bugs** behave the same during **Active Windows** and **Preparing Windows**.
- Compute Rate Limit is not upgraded by the first **Deck Builder** version.
- A **Cycle End** discards any remaining queued **Attack Cards** before the **Preparing Window** begins.
- Player-requested **Cycle End** is available only during an **Active Window**.
- A player-requested **Cycle End** does not cancel an attack, dash, extraction, or collapse that has already committed.
- Automatic **Cycle End** is checked after committed attacks finish resolving, so attack outcomes can affect whether the cycle continues.
- Automatic **Cycle End** scans each **Attack Queue** for any currently affordable or cooldown-waiting **Attack Card**, not only the front card.
- Shuffling is a visible part of dealing new **Attack Cards**, not an additional penalty after the **Preparing Window**.
- The **Active Window** can begin while **Attack Cards** are still visibly dealing into the **Attack Queues**.
- Current deck state is part of authoritative arena state for Collapse.

## Example Dialogue

> **Dev:** "When the **Active Window** starts, do we show the player's whole hand?"
> **Domain expert:** "No — drawn **Attack Cards** are sorted into the **Statement** and **Function** **Attack Queues** in the HUD."

## Flagged Ambiguities

- "Turn" was used for the real-time attack-spending phase, but this can imply enemies stop acting; resolved: use **Cycle** for the full cadence and **Active Window** for the attack-spending portion.
- "Basic Card Type" and "Special Card Type" were used during deck-building design, but **Card Type** already means **Statement** or **Function**; resolved: use **Card Class** for **Basic** and **Special**.
