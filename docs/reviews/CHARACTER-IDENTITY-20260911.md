# Character name and selected identity — 2026-09-11

## Problem and corrected behavior

Setup previously reused `profile.name` unchanged when saving a different `characterId`. A save created as Jiho could therefore show Bora's portrait and sprite with Jiho's name. Equipping a character from the collection passed the same old name to `SaveSystem.setProfile`.

Automatic character names now follow the selected character during setup, collection equipment changes, existing-save loading, normal saves, and language-archive restoration. For example, an existing `{ name: '지호', characterId: 'pink_girl' }` profile is read as Bora without clearing its adventure records. The corrected canonical name is persisted by the next normal save.

## Identity rules

- Automatic-name aliases are the four Korean names, their English names, and legacy `Luka`. Matching is case-insensitive for English and normalizes Korean to NFC.
- Automatic names are stored canonically in Korean and displayed for the current language: 하늘/Haneul, 보라/Bora, 지호/Jiho, 루카/Luca.
- Other saved names are treated as personal nicknames and preserved. Home, HUD, certificate, and celebration labels explicitly protect personal names from the general UI translation observer. A nickname such as `도전` remains `도전` in English; it does not become `Challenge`.
- An empty name remains empty when loading, saving settings, or switching language before setup. Choosing a character and completing setup creates its automatic name.
- The current app has no separate nickname input or historical automatic/custom marker. The known character-name aliases are therefore the compatibility rule for old saves; other strings are personal names.
- Save version and field schema are unchanged. Stars, coins, unlocks, difficulty, learning records, statistics, language archives, and self-assessment are preserved.

Setup and Result's cast captions already read the selected character ID directly. They remain character captions, independently of any personal nickname.

## Source changes

| File | Responsibility |
| --- | --- |
| `src/game/data/characters.ts` | Shared `characterName`, `isCharacterDefaultName`, `nameForCharacter`, and `profileDisplayName` helpers. |
| `src/game/systems/SaveSystem.ts` | Central name synchronization for profile changes, load, save, and restored language profiles; no new-adventure creation from an empty name. |
| `src/game/ui/screens/SetupScreen.ts` | Delegates default-name selection to `SaveSystem`; preserves the existing tutorial/new-adventure decision. |
| `src/game/ui/screens/HomeScreen.ts` | Localized player name and greeting; personal-name text is excluded from automatic translation. |
| `src/game/ui/screens/BattleScreen.ts` | Passes the resolved player display name to the HUD. |
| `src/game/ui/HudController.ts` | Protects the supplied name from dictionary translation. |
| `src/game/ui/ModalController.ts` | Resolves certificate and finale display names, while keeping certificate title translation separate. |
| `src/game/ui/FinalePlayer.ts` | Explicit Korean/English congratulation heading with an unchanged supplied name. |
| `scripts/check-character-identity.mjs` | Isolated browser verification of actual selection buttons, stored profiles, rendered labels, and battle actor identity. |

## Verification

Final result: **4/4 scenario groups passed**. The two selection groups cover **16 combinations**: four characters × Korean/English × automatic name/personal nickname. Each combination checks Setup selection, Home label and portrait, HUD label and portrait, the actual Wave scene player's sheet, Result cast caption, and certificate name.

| Character | Korean automatic name | English automatic name | Personal nickname in both languages |
| --- | --- | --- | --- |
| `brown_boy` | 하늘 — passed | Haneul — passed | 도전 — passed |
| `pink_girl` | 보라 — passed | Bora — passed | 도전 — passed |
| `glasses_boy` | 지호 — passed | Jiho — passed | 도전 — passed |
| `blond_explorer` | 루카 — passed | Luca — passed | 도전 — passed |

Additional assertions passed:

- Existing Jiho-name/Bora-character mismatch recovers when loaded.
- Korean → English → Korean → English restores each language's selected identity.
- Collection equipment changes update the name and Home preview after closing; the selection survives a reload.
- Both Korean and English new adventures keep the name empty before setup, keep Luca locked, and save Bora's correct name when selected. Skipping the story, leaving the tutorial for the map, and returning Home display the same identity.
- Saved progress, records, collection, statistics, self-assessment, and save version are unchanged by character selection.
- No browser runtime errors were observed. `npm run typecheck` and scoped `git diff --check` passed.

All browser runs used disposable contexts against the local source server, never the user's browser storage. Setup, collection, language, certificate, and new-adventure actions use actual UI buttons. Battle and Result checks use the actual screens/scenes with a presentation fixture that bypasses unrelated mandatory practice and score awards; this test does not revalidate typing judgment or reward calculations.

Evidence: `tmp/character-identity/results.json` (combined final groups), `tmp/character-identity-new/results.json` (new-adventure rerun), and `tmp/character-identity/automatic-en-home.png` / `custom-en-home.png`. The initial new-adventure harness assumed tutorial exit returned directly Home; the final script follows its actual map → Home route.
