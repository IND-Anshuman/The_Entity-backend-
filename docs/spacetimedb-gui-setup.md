# SpacetimeDB GUI Setup (Maincloud + Android)

This guide matches the current module behavior:

- ArmorIQ check runs first.
- Gemini validator runs second.
- Integration and secret reducers are owner-only.

## 1. Publish the module

From project root:

```powershell
spacetime login
spacetime publish <your-db-name> --server maincloud
```

If this is a fresh publish, the `init` reducer writes `module_owner` using the publishing identity.

## 2. Open SpacetimeDB GUI

1. Open <https://spacetimedb.com>.
2. Sign in.
3. Open your database.
4. Use:
   - Overview for health and metadata.
   - Logs for reducer/procedure failures.
   - SQL Console for read-only checks of public/private table state (subject to auth).

## 3. Create an owner token for API calls (Postman)

Generate token:

```http
POST https://maincloud.spacetimedb.com/v1/identity
```

Response shape:

```json
{
  "identity": "...",
  "token": "..."
}
```

Use header on all admin reducer calls:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

## 4. Configure integrations (owner-only)

Reducer HTTP pattern:

```http
POST https://maincloud.spacetimedb.com/v1/database/<db-name>/call/<reducer>
```

### Option A: Direct Gemini from module (recommended for simple production)

Reducer: `configure_integrations`

Body (JSON array):

```json
[
  "https://<your-armoriq-verify-endpoint>",
  "x-api-key",
  "<your-armoriq-api-key>",
  null,
  "https://generativelanguage.googleapis.com/v1beta",
  "<your-gemini-api-key>",
  "gemini-2.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash"
]
```

### Option B: Hosted relay for Gemini/ArmorIQ orchestration

If using relay, `local_llm_relay_base_url` must be a public HTTPS URL reachable by Maincloud.

Reducer: `configure_integrations`

Body example:

```json
[
  "https://<your-relay-domain>/api/armoriq/verify",
  "x-api-key",
  "<your-armoriq-api-key>",
  "https://<your-relay-domain>",
  "",
  "",
  "gemini-2.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash"
]
```

## 5. Seed game secret (owner-only)

Default game secret:

Reducer: `set_hidden_answer`

Body:

```json
["<your-hidden-answer>"]
```

Room game secret:

Reducer: `set_hidden_answer_for_room`

Body:

```json
["<ROOM_ID>", "<your-hidden-answer>"]
```

## 6. Android runtime flow

The Android app should only call gameplay reducers and read public state:

1. Create room: `initiate_room([optional_villain_name])`
2. Join room: `join_room(room_id)`
3. Submit terminal text: `submit_terminal_for_room(room_id, input)`
4. Observe result from public `game_state` row:
   - `terminal_status`
   - `last_terminal_result`
   - `last_terminal_message`

This keeps Gemini and ArmorIQ credentials off-device.

## 7. Verification checklist

- `module_owner` has one row.
- `server_config` has one active row.
- `game_secret.hidden_answer` is non-empty for the target game.
- `submit_terminal*` transitions through:
  - `PendingArmorIq`
  - `PendingGeminiValidator`
  - `Succeeded` or `Rejected` or `Failed`

## 8. Common issue

If admin reducers return:

- `module owner is not initialized; republish with clear to run init reducer`

Run a clear publish once:

```powershell
spacetime publish <your-db-name> --server maincloud --clear
```

Then re-apply integration and secret config.
