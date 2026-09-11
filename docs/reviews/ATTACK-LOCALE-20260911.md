# Character attack language check — 2026-09-11

## Finding and scope

The current source, with all assets loaded, passed the existing 96 entity-motion checks before this change. That does not establish which cached build or loading state caused the reported Korean Bora screen. The audit did confirm two language leaks:

- `Player.playAttack()` used the original English key artwork if the Korean replacement atlas was absent. It also accepted an incomplete atlas.
- `ClassFx` always preferred the scholar atlas, whose image pixels contain Hangul, even during an English adventure.

The Korean attack atlas itself already has the correct four character rows and Hangul artwork. No image files were generated or edited in this change.

## Implementation

- `anims.ts` provides the shared Korean attack atlas key and validates all four frames per character.
- `StageIntroScene.ts` loads the Korean attack atlas with other adventure motion assets in both languages, including an English-first session. This adds the existing 250,632-byte WebP to the first non-home adventure load in English; the initial home boot stays unchanged.
- Navigation rejects missing frames and reloads an incomplete atlas. `Player` replaces an animation definition whose frame objects belong to the old texture after recovery.
- Korean attacks never use the original English key poses as a fallback. An unavailable replacement holds a neutral pose while preserving the existing impact and completion callbacks.
- English scholar spells use the existing procedural effect with `OK`, `A+`, and Latin letters. Korean scholar spells retain their illustrated Hangul atlas. The other three class effects are unchanged because their art contains no language-specific letters.
- Running still preserves the full walking cycle when typing and attacks occur; game damage, score, learning, and save behavior were not changed.

## Evidence

- `npm run typecheck`: passed after implementation.
- Existing pre-change entity motion baseline: **96/96 passed**, `tmp/attack-locale-before/results.json`.
- New actual-navigation matrix: **8/8 character/language cases, 96/96 focused checks passed**, `tmp/attack-locales-20260911/results.json`.
- Each case cold-loads Stage 4 introduction in a separate browser context, confirms the real atlas HTTP responses, then observes the real `Player` and class effects. It checks typing, attack callbacks, continuous running, all four spell strengths, a language change on the same actor, partial atlas removal and repair, complete atlas removal and recovery.
- No browser runtime errors occurred. The user browser or user save was not used.
- Visually inspected `tmp/attack-locales-20260911/ko-pink_girl-attack.png`: Bora's keyboard action shows `가`.
- Visually inspected `tmp/attack-locales-20260911/en-pink_girl-attack.png`: English Bora retains the intended Latin key artwork.

Run again with `node scripts/check-attack-locales.mjs`. `ATTACK_TEST_URL` and `ATTACK_TEST_OUT` optionally select the source server and evidence directory.

## Limits

This is runtime and art-selection validation, not a new art-generation pass. Existing original jump/crouch illustrations and their visual consistency are outside this change. The focused matrix calls actual animation methods inside a real loaded introduction scene; it does not claim to replay every learning exercise or every battle mode.
