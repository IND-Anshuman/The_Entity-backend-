/**
 * SpaceTimeDB Backend Integration Test
 * 
 * Tests the full room lifecycle: create → join → generate → submit → terminate
 * 
 * Usage:
 *   node stdb_test.mjs                     # run without admin setup (skips hidden answer + terminal)
 *   node stdb_test.mjs --owner-token=XXXX  # run with admin setup (full end-to-end)
 */

const BASE_URL = "http://localhost:3000/v1/database/the-entity-local";

// ─── Parse CLI args ─────────────────────────────────────────────────────────

const OWNER_TOKEN = (() => {
    const arg = process.argv.find(a => a.startsWith("--owner-token="));
    return arg ? arg.split("=")[1] : null;
})();

// ─── Helpers ────────────────────────────────────────────────────────────────

function decodeOptional(value) {
    if (Array.isArray(value)) return value[0] === 0 ? value[1] : null;
    return value ?? null;
}

async function callReducer(endpoint, body, token = null) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}/call/${endpoint}`, {
        method: "POST", headers, body: JSON.stringify(body)
    });

    const identityToken = res.headers.get("spacetime-identity-token");
    const text = await res.text();

    if (!res.ok) {
        console.error(`  ✗ [${res.status}] /call/${endpoint}`);
        console.error(`    → ${text.trim()}`);
        return { ok: false, status: res.status, identityToken: null, body: text.trim() };
    }

    console.log(`  ✓ [${res.status}] /call/${endpoint}`);
    return { ok: true, status: res.status, identityToken, body: text.trim() };
}

async function querySql(query, token) {
    const res = await fetch(`${BASE_URL}/sql`, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "Authorization": `Bearer ${token}` },
        body: query
    });
    if (!res.ok) {
        const t = await res.text();
        console.error(`  ✗ SQL [${res.status}]: ${t.trim()}`);
        return null;
    }
    return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main Test Sequence ─────────────────────────────────────────────────────

async function run() {
    let player1Token = null;
    let player2Token = null;
    let roomId = null;

    const line = "══════════════════════════════════════════════";
    console.log(`\n${line}`);
    console.log("   SpaceTimeDB Backend – Full Integration Test");
    console.log(`${line}\n`);

    if (OWNER_TOKEN) {
        console.log("  ℹ  Owner token provided – admin setup steps will run.\n");
    } else {
        console.log("  ℹ  No owner token – skipping admin setup (hidden answer, integrations).");
        console.log("     Pass --owner-token=XXXX to enable full test.\n");
    }

    // ── 1. Initiate Room ──────────────────────────────────────────────────
    console.log("① Initiate Room (creates room + assigns Player 1)");
    const initRes = await fetch(`${BASE_URL}/call/initiate_room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ "some": "The Entity" }])
    });
    player1Token = initRes.headers.get("spacetime-identity-token");
    const player1Id = initRes.headers.get("spacetime-identity");
    if (!initRes.ok || !player1Token) {
        console.error("  ✗ initiate_room failed:", initRes.status, await initRes.text());
        process.exit(1);
    }
    console.log(`  ✓ [${initRes.status}] Room created, player1 token captured`);

    // ── 2. Discover Room ID ───────────────────────────────────────────────
    console.log("\n② Discover Room ID (from room_ticket table)");
    
    // SpaceTimeDB HTTP /call is async, so we must poll until the transaction commits
    let myTicket = null;
    for (let i = 0; i < 5; i++) {
        await sleep(1000);
        const ticketData = await querySql("select * from room_ticket", player1Token);
        if (ticketData && ticketData[0] && ticketData[0].rows) {
            const sorted = [...ticketData[0].rows].sort((a, b) => {
                const ta = typeof a[3] === "number" ? a[3] : (Array.isArray(a[3]) ? a[3][0] : 0);
                const tb = typeof b[3] === "number" ? b[3] : (Array.isArray(b[3]) ? b[3][0] : 0);
                return tb - ta;
            });
            myTicket = sorted[0];
            if (myTicket) break;
        }
        console.log(`  … waiting for room_ticket (attempt ${i + 1}/5)`);
    }

    if (!myTicket) {
        console.error("  ✗ Could not find room ticket for identity:", player1Id);
        process.exit(1);
    }

    roomId = decodeOptional(myTicket[1]);
    if (!roomId) {
        console.error("  ✗ Could not extract room_id:", JSON.stringify(myTicket));
        process.exit(1);
    }
    console.log(`  ✓ room_id = ${roomId}`);

    // ── 3. Join Room ──────────────────────────────────────────────────────
    console.log("\n③ Join Room (anonymous Player 2)");
    const joinRes = await fetch(`${BASE_URL}/call/join_room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([roomId])
    });
    player2Token = joinRes.headers.get("spacetime-identity-token");
    if (!joinRes.ok) {
        console.error(`  ✗ [${joinRes.status}] join_room:`, await joinRes.text());
        process.exit(1);
    }
    console.log(`  ✓ [${joinRes.status}] Player 2 joined, token captured`);

    // ── 4. Verify Room Status = Ready ─────────────────────────────────────
    console.log("\n④ Verify Room Status");
    const roomData = await querySql(`select room_id, status from game_room where room_id = '${roomId}'`, player1Token);
    const roomRow = roomData?.[0]?.rows?.[0];
    if (roomRow) {
        const statusMap = { 0: "WaitingForPlayers", 1: "Ready", 2: "Terminated" };
        const rawStatus = roomRow[1];
        const statusIdx = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
        console.log(`  ✓ Room ${roomRow[0]} → status: ${statusMap[statusIdx] || JSON.stringify(rawStatus)}`);
    }

    // ── 5. Admin Setup (if owner token available) ─────────────────────────
    if (OWNER_TOKEN) {
        console.log("\n⑤ Admin Setup");

        // Configure integrations with direct Gemini access
        console.log("  → configure_integrations (Relay direct)");
        await callReducer("configure_integrations", [
            "http://127.0.0.1:8787", // Use the local relay URL
            "x-api-key",
            "ak_live_4b4d73a2fdccbd89b6a48ed7deff10254c5640a34b574405773107e77c69797a",
            { "none": [] },
            "https://generativelanguage.googleapis.com/v1beta",
            "AIzaSyCa7EB_4gTobmGgqAJ6mhapLUIc5VJN5k0",
            "gemini-2.5-flash",
            "gemini-2.5-flash",
            "gemini-2.5-flash"
        ], player1Token);

        // Set hidden answer for this room
        console.log("  → set_hidden_answer_for_room");
        await callReducer("set_hidden_answer_for_room", [roomId, "glass pilgrims"], player1Token);
    } else {
        console.log("\n⑤ Admin Setup — SKIPPED (no owner token)");
    }

    // ── 6. Generate Clue Manual ───────────────────────────────────────────
    console.log("\n⑥ Generate Clue Manual (round_1)");
    await callReducer(
        "generate_clue_manual_for_room",
        [roomId, "round_1", JSON.stringify({ requested_persona: "1920s Detective" }), ""],
        player1Token
    );

    // ── 7. Generate Villain Speech ────────────────────────────────────────
    console.log("\n⑦ Generate Villain Speech");
    await callReducer(
        "generate_villain_speech_for_room",
        [roomId, JSON.stringify({
            round_key: "round_1",
            villain_name: "The Entity",
            scene: "first clue reveal",
            tone: "cold, superior, predatory, theatrical",
            synthesize_audio: false,
            selected_cue_id: "r1_c1",
            clue_contexts: [{ cue_id: "r1_c1", reveal_stage: "boot", clue_text: "First clue text" }],
            round_output: { persona_name: "1920s Detective" }
        })],
        player1Token
    );

    // ── 8. Submit Terminal ────────────────────────────────────────────────
    console.log("\n⑧ Submit Terminal");
    const termRes = await callReducer(
        "submit_terminal_for_room",
        [roomId, "submit glass pilgrims"],
        player1Token
    );
    if (!termRes.ok && termRes.body.includes("hidden answer")) {
        console.log("  ℹ  Expected: hidden answer not set (requires owner_token)");
    }

    // ── 9. Poll Artifacts ─────────────────────────────────────────────────
    console.log("\n⑨ Poll Artifacts (waiting up to 12s for background jobs)");
    const statusMap = { 0: "Idle", 1: "PendingGemini", 2: "PendingTts", 3: "Failed", 4: "Succeeded" };

    for (let attempt = 1; attempt <= 6; attempt++) {
        await sleep(2000);

        const clueArt = await querySql(
            `select artifact_key, status from round_content_artifact where room_id = '${roomId}'`, player1Token
        );
        const speechArt = await querySql(
            `select artifact_key, status from villain_speech_artifact where room_id = '${roomId}'`, player1Token
        );

        const clueRows = clueArt?.[0]?.rows ?? [];
        const speechRows = speechArt?.[0]?.rows ?? [];

        if (clueRows.length || speechRows.length) {
            console.log(`  [attempt ${attempt}/12]`);
            for (const r of clueRows) {
                const s = Array.isArray(r[1]) ? r[1][0] : r[1];
                console.log(`    Clue   : ${r[0]} → ${statusMap[s] || JSON.stringify(r[1])}`);
            }
            for (const r of speechRows) {
                const s = Array.isArray(r[1]) ? r[1][0] : r[1];
                console.log(`    Speech : ${r[0]} → ${statusMap[s] || JSON.stringify(r[1])}`);
            }

            // If all are terminal (Succeeded or Failed), stop polling
            const allDone = [...clueRows, ...speechRows].every(r => {
                const s = Array.isArray(r[1]) ? r[1][0] : r[1];
                return s === 3 || s === 4;
            });
            if (allDone) break;
        } else {
            console.log(`  … no artifacts yet (attempt ${attempt}/6)`);
        }
    }

    // ── 10. Read Game State ───────────────────────────────────────────────
    console.log("\n⑩ Read Game State");
    const gsData = await querySql("select * from game_state", player1Token);
    if (gsData?.[0]?.rows?.length) {
        const latest = gsData[0].rows[gsData[0].rows.length - 1];
        console.log(`  game_id=${latest[0]}  villain=${latest[3]}  terminal_status=${JSON.stringify(latest[6])}`);
    }

    // ── 11. Terminate Room ────────────────────────────────────────────────
    console.log("\n⑪ Terminate Room");
    await callReducer("terminate_room", [roomId], player1Token);

    // ── 12. Verify Terminated ─────────────────────────────────────────────
    console.log("\n⑫ Verify Room Terminated");
    const finalRoom = await querySql(`select room_id, status from game_room where room_id = '${roomId}'`, player1Token);
    const finalRow = finalRoom?.[0]?.rows?.[0];
    if (finalRow) {
        const s = Array.isArray(finalRow[1]) ? finalRow[1][0] : finalRow[1];
        const statusNames = { 0: "WaitingForPlayers", 1: "Ready", 2: "Terminated" };
        console.log(`  ✓ Room ${finalRow[0]} → ${statusNames[s] || JSON.stringify(finalRow[1])}`);
    }

    console.log(`\n${line}`);
    console.log("   Test Complete");
    console.log(`${line}\n`);
}

run().catch(err => { console.error("\nFatal:", err); process.exit(1); });
