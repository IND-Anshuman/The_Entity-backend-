const BASE_URL =
  process.env.STDB_BASE_URL ||
  "https://maincloud.spacetimedb.com/v1/database/the-entity-ty5fs";
const HIDDEN_WORD = process.env.HIDDEN_WORD || "blue diamond";
const WRONG_INPUT = process.env.WRONG_INPUT || "a sapphire gem";
const USE_LOCAL_MOCK =
  (process.env.USE_LOCAL_MOCK || "true").toLowerCase() !== "false";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeOptional(value) {
  if (Array.isArray(value)) {
    if (value[0] === 0) return value[1];
    if (value[0] === 1) return null;
  }

  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "some")) {
      return value.some;
    }
    if (Object.prototype.hasOwnProperty.call(value, "none")) {
      return null;
    }
  }

  return value ?? null;
}

function formatVariant(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1) return keys[0];
  }

  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0];
  }

  return String(value);
}

function decodeTerminalStatus(value) {
  if (Array.isArray(value) && typeof value[0] === "number") {
    const byIndex = [
      "Idle",
      "PendingArmorIq",
      "PendingGeminiValidator",
      "Rejected",
      "Failed",
      "Succeeded",
    ];
    return byIndex[value[0]] || String(value[0]);
  }
  return formatVariant(value);
}

async function callReducer(name, args, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}/call/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });

  const text = await res.text();
  return {
    reducer: name,
    args,
    status: res.status,
    ok: res.ok,
    body: text || "<empty>",
    identityToken: res.headers.get("spacetime-identity-token"),
  };
}

async function sql(query, token) {
  const headers = { "Content-Type": "text/plain" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}/sql`, {
    method: "POST",
    headers,
    body: query,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SQL ${res.status}: ${text}`);
  }

  const parsed = JSON.parse(text);
  return parsed?.[0]?.rows ?? [];
}

async function resolveRoomId(hostToken) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const rows = await sql("select owner_identity, room_id, room_status, updated_at from room_ticket", hostToken);
    const latest = rows[rows.length - 1];
    if (!latest) {
      await sleep(500);
      continue;
    }

    const roomId = decodeOptional(latest[1]);
    if (roomId) {
      return roomId;
    }

    await sleep(500);
  }

  throw new Error("Timed out resolving room_id from room_ticket");
}

async function resolveGameId(hostToken, roomId) {
  const rows = await sql("select room_id, game_id from game_room", hostToken);
  const row = rows.find((entry) => entry[0] === roomId);
  if (!row) {
    throw new Error(`Could not resolve game_id for room ${roomId}`);
  }
  return row[1];
}

async function readGameState(hostToken, gameId) {
  const rows = await sql(
    "select game_id, terminal_status, last_terminal_result, last_terminal_message, updated_at from game_state",
    hostToken
  );
  const row = rows.find((entry) => entry[0] === gameId);
  if (!row) {
    throw new Error(`Could not find game_state for game_id ${gameId}`);
  }

  return {
    game_id: row[0],
    terminal_status: decodeTerminalStatus(row[1]),
    last_terminal_result: decodeOptional(row[2]),
    last_terminal_message: decodeOptional(row[3]),
    updated_at: row[4],
  };
}

async function waitForTerminalSettled(hostToken, gameId, previousUpdatedAt) {
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    const state = await readGameState(hostToken, gameId);
    const status = state.terminal_status.toLowerCase();
    const changed = state.updated_at !== previousUpdatedAt;
    const settled = !status.includes("pending");

    if (changed && settled) {
      return state;
    }

    await sleep(600);
  }

  throw new Error("Timed out waiting for game_state terminal status to settle");
}

function printReducerStep(index, result) {
  console.log(`\n[${index}] POST /call/${result.reducer}`);
  console.log(`request body: ${JSON.stringify(result.args)}`);
  console.log(`status: ${result.status}`);
  console.log(`response: ${result.body}`);
}

async function run() {
  const sequence = [];

  if (USE_LOCAL_MOCK) {
    const cfg = await callReducer(
      "configure_local_dev_integrations",
      ["http://localhost", "mock-key"],
      null
    );
    sequence.push(cfg);
    if (!cfg.ok) {
      throw new Error(`configure_local_dev_integrations failed: ${cfg.status} ${cfg.body}`);
    }
  }

  const init = await callReducer("initiate_room", [{ some: "The Entity" }], null);
  sequence.push(init);
  if (!init.ok || !init.identityToken) {
    throw new Error(`initiate_room failed: ${init.status} ${init.body}`);
  }

  const hostToken = init.identityToken;
  const roomId = await resolveRoomId(hostToken);
  const gameId = await resolveGameId(hostToken, roomId);

  const join = await callReducer("join_room", [roomId], null);
  sequence.push(join);
  if (!join.ok) {
    throw new Error(`join_room failed: ${join.status} ${join.body}`);
  }

  const setHidden = await callReducer(
    "set_hidden_answer_for_room",
    [roomId, HIDDEN_WORD],
    hostToken
  );
  sequence.push(setHidden);
  if (!setHidden.ok) {
    throw new Error(`set_hidden_answer_for_room failed: ${setHidden.status} ${setHidden.body}`);
  }

  const beforeWrong = await readGameState(hostToken, gameId);

  const wrongSubmit = await callReducer(
    "submit_terminal_for_room",
    [roomId, WRONG_INPUT],
    hostToken
  );
  sequence.push(wrongSubmit);
  if (!wrongSubmit.ok) {
    throw new Error(`submit_terminal_for_room(wrong) failed: ${wrongSubmit.status} ${wrongSubmit.body}`);
  }

  const wrongState = await waitForTerminalSettled(
    hostToken,
    gameId,
    beforeWrong.updated_at
  );

  const beforeCorrect = wrongState;

  const correctSubmit = await callReducer(
    "submit_terminal_for_room",
    [roomId, HIDDEN_WORD],
    hostToken
  );
  sequence.push(correctSubmit);
  if (!correctSubmit.ok) {
    throw new Error(`submit_terminal_for_room(hidden) failed: ${correctSubmit.status} ${correctSubmit.body}`);
  }

  const correctState = await waitForTerminalSettled(
    hostToken,
    gameId,
    beforeCorrect.updated_at
  );

  const state = await readGameState(hostToken, gameId);

  console.log("\n=== COMPLETE API CALL SEQUENCE ===");
  sequence.forEach((step, idx) => printReducerStep(idx + 1, step));

  console.log("\n=== DERIVED SESSION CONTEXT ===");
  console.log(JSON.stringify({ room_id: roomId, game_id: gameId }, null, 2));

  console.log("\n=== TERMINAL RESPONSE SEQUENCE (from game_state) ===");
  console.log("After wrong input:");
  console.log(JSON.stringify(wrongState, null, 2));
  console.log("\nHidden-word result:");
  console.log(JSON.stringify(correctState, null, 2));

  console.log("\n=== FINAL GAME STATE ===");
  console.log(JSON.stringify(state, null, 2));

  console.log("\nSequence complete.");
}

run().catch((err) => {
  console.error("Sequence failed:", err.message);
  process.exit(1);
});
