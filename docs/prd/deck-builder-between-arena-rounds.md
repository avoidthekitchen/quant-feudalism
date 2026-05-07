# Deck Builder Between Arena Rounds

## Goal

Add a between-deployment **Deck Builder** to Quant Feudalism so players can tune the composition of their run-scoped **Deck** before entering the arena. The first version should test deck composition and named card behavior without adding rewards, drafting, unlock progression, or individual card instances.

## In Scope

- Add a Deck Builder to the existing shop and operations flow.
- Represent the player's Deck as `CardId -> count`.
- Let players edit card counts between arena deployments.
- Enforce deck validity before deployment.
- Add named card definitions for Slash, Bolt, Trim, and Refund.
- Update arena card queues to display named cards and support first-affordable-card play within each Card Type lane.
- Persist the run's Draft Deck across shop navigation and reloads.
- Preserve existing authoritative Collapse behavior; mid-arena reloads return to the pre-arena shop state.

## Out Of Scope

- Card rewards, drafting, purchases, unlock progression, or rarity acquisition.
- Individual card instances, upgrades, modifiers, or card-specific ownership.
- Multiple saved decks, deck import/export, or deck presets beyond resetting to Starter Deck.
- Changing Dash into a card.
- Increasing Compute Rate Limit caps through deck construction.

## Domain Terms

- **Card Type**: Statement or Function.
- **Card Class**: Basic or Special.
- **Card Name**: player-facing card name.
- **Card ID**: stable internal key used in deck lists and saved state.
- **Deck**: run-scoped card-count map used to create arena draw piles.
- **Draft Deck**: editable Deck state in the Deck Builder, including invalid intermediate states.
- **Valid Deck**: Draft Deck that can be deployed.
- **Copy Limit**: per-card maximum copies in a Valid Deck.

## Card Catalog

| Card ID | Card Name | Card Type | Card Class | Copy Limit | Cost | Cooldown | Damage | Behavior |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| `slash` | Slash | Statement | Basic | Unlimited | 18 | 350ms | 24 | Existing close-range Statement attack. Keeps current reach, stun, and animation lock. |
| `bolt` | Bolt | Function | Basic | Unlimited | 40 | 820ms | 31 | Existing projectile Function attack. Keeps current movement pause, projectile, pull splash, and Compute Credit siphon. |
| `trim` | Trim | Statement | Special | 10 | 18 | 350ms | 12 | Same input, reach, stun, and animation lock as Slash. Draws exactly one additional Attack Card after its attack resolves. |
| `refund` | Refund | Function | Special | 10 | 0 | 1000ms | 0 | Immediate self-effect. Arms a 20 Compute discount for the next three non-Refund attacks this Active Window, with discounted costs floored at 1. |

All four cards are available from the start of every run in this version.

## Starter Deck

New runs start with the Starter Deck:

- 15 Slash
- 5 Bolt
- 0 Trim
- 0 Refund

After the player edits the deck, it is simply the run's current Deck. Each new arena deployment creates a freshly shuffled copy of that current Deck.

## Deck Rules

A Valid Deck must satisfy all of these rules:

- Total card count is at least 20.
- Total card count is at most 100.
- Every referenced Card ID exists in the current card catalog.
- Every card count is a non-negative integer.
- Basic cards have no per-card Copy Limit.
- Special cards are limited to 10 copies per Card ID.

Deck invalidity messaging uses this priority:

1. Unavailable card references: `Deck contains unavailable cards. Remove them to deploy.`
2. Below minimum: `Add {n} more cards to reach the 20-card minimum.`
3. Above maximum: `Remove {n} cards to stay under the 100-card maximum.`
4. Copy limit: `Special cards are limited to 10 copies each. Reduce {Card Name} to deploy.`

## Deck Builder UX

The Deck Builder lives in the Workshop modal that is opened from the existing shop and operations screen. The Operations Access panel stays focused on deployment actions and shows a compact Draft Deck readiness summary.

- Card rows are grouped or filterable by Card Type and Card Class.
- Each row shows Card Name, Card Type, Card Class, cost, damage, cooldown, and a short behavior summary.
- Each row has count controls for decrementing and incrementing.
- The player may reduce the Draft Deck below 20 while editing.
- The Deploy button is disabled unless the Draft Deck is valid.
- The disabled Deploy state must show the highest-priority reason deployment is blocked.
- Normal increment controls do not allow a Special card above 10 copies.
- Normal increment controls do not allow the total deck above 100 cards.
- Basic cards can be incremented until the total deck reaches 100.
- Saved over-limit counts remain visible as invalid entries until reduced.
- A Reset to Starter Deck action resets counts to 15 Slash and 5 Bolt, removes unavailable entries, and restores a valid Deck.
- Reset to Starter Deck should require confirmation when it would discard current edits.

## Missing Card References

If saved state references a Card ID that no longer exists:

- Show a dimmed unavailable row with an X.
- Use the Card ID as the label if no Card Name is available.
- Count it toward displayed deck size.
- Do not count it as playable.
- Block deployment until removed.
- Allow reducing/removing the missing entry, but do not allow increasing it.

## Arena Queue Behavior

The arena keeps two Attack Queue lanes: Statement and Function.

- Queued cards display Card Name.
- Card Class should have a secondary visual marker, such as a Special badge or accent.
- Per-card dimmed/X styling means the card cannot be afforded with current Compute Rate Limit or Compute Credits.
- Lane cooldown and committed action locks are displayed as lane/input availability constraints, not per-card affordability.
- Pressing or clicking a Card Type lane plays the leftmost currently affordable card in that lane.
- Unaffordable cards earlier in the lane remain queued and do not block later affordable cards.
- If no card in the selected lane is currently affordable, the input is rejected without consuming cards, starting cooldowns, or starting animations.
- Rejected input should produce a short prompt such as `Insufficient Compute Rate Limit.`, `Insufficient Compute Credits.`, or `Insufficient compute.`

## Cooldowns

Cooldowns remain lane-based, with duration determined by the card played.

- Slash starts a 350ms Statement cooldown.
- Trim starts a 350ms Statement cooldown.
- Bolt starts an 820ms Function cooldown.
- Refund starts a 1000ms Function cooldown.
- While the Statement lane is cooling down, no Statement card can be played.
- While the Function lane is cooling down, no Function card can be played.

## Trim Resolution

Trim resolves in this order:

1. Spend Compute Rate Limit and Compute Credits.
2. Deal 12 damage using Slash's reach, stun, and animation lock.
3. Draw exactly one Attack Card.
4. Run automatic Cycle End checks after the committed attack finishes resolving.

Trim's bonus draw:

- Uses the same visible draw/deal animation style as normal queue filling.
- Can draw even when Attack Queues are already at the Queue Limit.
- Draws from the draw pile.
- Adds the drawn card to the back/rightmost position of its matching Statement or Function queue.
- Does not reorder existing Statement or Function queued cards.
- If the draw pile is empty, shuffles the discard pile into a new draw pile and continues.
- If both piles are empty, draws nothing.
- If Cycle End happens after Trim resolves, the freshly drawn card is discarded with the rest of the queued cards.

## Refund Resolution

Refund resolves as an immediate self-effect:

1. Confirm Function lane is playable and the player is not action-locked.
2. Move Refund from the Function Attack Queue to discard.
3. Arm three attack discounts for the current Active Window.
4. Each discounted non-Refund attack costs 20 less Compute, but never less than 1 Compute.
5. Start a 1000ms Function cooldown.
6. Show feedback with the armed discount count and amount.
7. Run automatic Cycle End checks.

Refund is always resource-affordable because it costs 0. It can be played when both compute pools are full; in that case it still moves to discard, arms the discount, and starts Function cooldown. Any remaining Refund discount count is lost at Cycle End.

Example feedback:

- `Refund armed. Next 3 attacks this Active Window cost -20 Compute.`

## Automatic Cycle End

Automatic Cycle End must scan the entire Statement and Function queues.

- It must not end just because the front card in a lane is unaffordable.
- It should continue the Active Window when any queued card is currently resource-affordable and can be played after normal lane cooldown clears.
- A queued Refund can keep the Active Window alive while Function cooldown clears, even if Compute Rate Limit and Compute Credits are otherwise exhausted.
- After Slash, Bolt, Trim, or Refund resolves, automatic Cycle End checks run against the updated queues, resources, and cooldowns.

## Save, Resume, And Collapse

- The run's Draft Deck persists while the player is in the shop and across reloads.
- Deck Builder edits apply to the next fresh arena deployment.
- Deck Builder edits do not mutate an in-progress arena deployment.
- Reloading mid-arena abandons the in-progress deployment and resumes at the pre-arena shop state.
- Collapse restores the deck state captured in the selected arena snapshot, not the current Draft Deck from the shop.

## Acceptance Criteria

- A new run starts with 15 Slash and 5 Bolt.
- The Deck Builder can create valid decks from 20 to 100 cards.
- The Deck Builder allows temporary below-minimum drafts but blocks Deploy with explanatory messaging.
- Special cards cannot be increased above 10 copies through normal controls.
- Missing Card IDs show as unavailable rows and block deployment.
- Reset to Starter Deck removes unavailable entries and restores a valid deck.
- Arena queues show named cards and resource-unaffordable cards with the existing dimmed/X treatment.
- Playing a lane consumes the leftmost currently affordable card, not necessarily the front card.
- Auto Cycle End does not trigger while any queued card can be played now or after normal lane cooldown clears.
- Trim draws exactly one card with the existing draw/deal presentation.
- Trim's bonus draw preserves current queue order and appends the drawn card to the right side of its matching lane.
- Refund arms a three-attack flat discount, reports the armed discount, shows an in-world player aura, and uses Function lane cooldown.
- Collapse preserves authoritative arena state instead of rebuilding from the Draft Deck.

## Test Notes

Suggested automated coverage:

- Deck validation for min, max, missing IDs, Special Copy Limit, and non-negative integer counts.
- Starter Deck creation and reset behavior.
- Save/load of Draft Deck including invalid drafts.
- Creation of arena draw pile from current valid Deck.
- First-affordable-card selection in each queue.
- Rejected lane input when no card in lane is affordable.
- Auto Cycle End scanning past unaffordable front cards.
- Trim bonus draw with normal draw pile, empty draw pile plus discard shuffle, and empty both piles.
- Refund discount affordability, discount consumption, and Cycle End reset.
- Lane cooldown duration by played card.
- Collapse preserving saved queue/draw/discard state.
