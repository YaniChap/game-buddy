# GameBuddy

**Author:** YaniChap  
**Plugin ID:** `game-buddy`

GameBuddy is a Russian-speaking gaming companion for Astra.

## Implemented

- Subscribes only to the documented Astra events `companion_game_changed` and `games_changed`.
- Best-effort parsing of game names from explicit game-related JSON keys in `companion_game_changed`.
- Tracks session start, game switches, elapsed time, and session end while the plugin process is running.
- Sends a welcome message on a detected game switch and a recap prompt when a session ends, into GameBuddy's own Astra conversation.
- Captures achievement/milestone values only if those fields are actually present in one of the subscribed event payloads.
- Exposes `game_coach`, `current_game_session`, `record_game_moment`, and `session_report` tools.
- The player or assistant can record achievements, wins, funny moments, and milestones with `record_game_moment` for the final recap.
- Drains Astra's chat reply stream in the background so event handling does not wait for the model's response.

## Important limitations

Astra's supplied event vocabulary names `games_changed` and `companion_game_changed`, but the supplied docs do not define their payload schemas. The parser therefore uses conservative, best-effort key detection and must be verified against live Astra logs. It does not scan Windows processes, Steam, or other launchers. Session timing and recorded moments are held in memory and reset when the plugin process restarts. The supplied event list contains no dedicated achievement-unlocked event, so automatic achievement reactions work only if achievement-like fields appear inside one of the two documented event payloads; otherwise use `record_game_moment`.

The plugin sends proactive messages only on detected game transitions and detected achievement-like payload fields, not on every `games_changed` notification, to avoid chat spam.

## Permissions

- `subscribe_events`: only `games_changed` and `companion_game_changed`.
- `send_chat_message`: posts to the plugin's own durable Astra conversation. Astra asks the user for explicit consent because this permission allows proactive messages.
- `client`: declared because Astra gates `SendChatMessage` behind this capability.

For local development, use `astra-plugin dev .` with Astra Developer Mode enabled. Local sideloading is the intended way to test this permission before publication; a portable `.astraplugin` import may refuse high-risk `send_chat_message` until the plugin is trusted/listed.

## Build, test, and load

```bash
cargo test
astra-plugin locale sync
astra-plugin check . --strict
astra-plugin test .
astra-plugin dev .
```

`astra-plugin dev .` checks, builds, and sideloads into a running Astra instance with hot reload.

Author: YaniChap
