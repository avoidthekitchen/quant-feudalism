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

**Statement**:
The close-range **Attack Card** and attack role played with left click.
_Avoid_: Melee

**Function**:
The projectile **Attack Card** and attack role played with right click.
_Avoid_: Ranged

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
The fixed initial set of attack cards used to test whether **Cycles** improve arena combat.
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
- The prototype **Starter Deck** contains **Statement** and **Function** **Attack Cards** but is not constructed or upgraded during a run.
- Each arena deployment begins with a freshly shuffled **Starter Deck**.
- Each arena deployment starts in an **Active Window**.
- Prototype **Attack Cards** are player-facing **Card Types**, not unique card designs.
- An **Attack Card** belongs to exactly one **Attack Queue** while it is available.
- A played **Attack Card** moves from its **Attack Queue** to discard immediately.
- An **Attack Card** is played only when its attack commits; rejected inputs do not consume cards.
- A played **Attack Card** spends both short-term Compute Rate Limit and long-term Compute Credits, and can be played only when both resources can pay its full cost.
- **Function** siphon can restore long-term Compute Credits, but it does not restore Compute Rate Limit or change the **Cycle**.
- **Dash** does not consume **Attack Cards** and is not limited to one part of the **Cycle**.
- During a **Preparing Window**, attacks are unavailable, movement is slowed, and Dash remains available.
- **Bugs** behave the same during **Active Windows** and **Preparing Windows**.
- Compute Rate Limit is not upgraded during the prototype **Starter Deck** branch.
- A **Cycle End** discards any remaining queued **Attack Cards** before the **Preparing Window** begins.
- Player-requested **Cycle End** is available only during an **Active Window**.
- A player-requested **Cycle End** does not cancel an attack, dash, extraction, or collapse that has already committed.
- Automatic **Cycle End** is checked after committed attacks finish resolving, so attack outcomes can affect whether the cycle continues.
- Shuffling is a visible part of dealing new **Attack Cards**, not an additional penalty after the **Preparing Window**.
- The **Active Window** can begin while **Attack Cards** are still visibly dealing into the **Attack Queues**.
- Current deck state is part of authoritative arena state for reloads and Collapse.

## Example Dialogue

> **Dev:** "When the **Active Window** starts, do we show the player's whole hand?"
> **Domain expert:** "No — drawn **Attack Cards** are sorted into the **Statement** and **Function** **Attack Queues** in the HUD."

## Flagged Ambiguities

- "Turn" was used for the real-time attack-spending phase, but this can imply enemies stop acting; resolved: use **Cycle** for the full cadence and **Active Window** for the attack-spending portion.
