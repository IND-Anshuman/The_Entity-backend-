const BASE_URL = "https://maincloud.spacetimedb.com/v1/database/the-entity-ty5fs";

function decodeJwtPayload(jwt) {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
}

async function run() {
    // 1. Create room, capture token
    const initRes = await fetch(`${BASE_URL}/call/initiate_room`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{"some":"The Entity"}])
    });
    const token = initRes.headers.get("spacetime-identity-token");
    const identityHeader = initRes.headers.get("spacetime-identity");
    console.log("spacetime-identity header:", identityHeader);

    const payload = decodeJwtPayload(token);
    console.log("JWT payload:", JSON.stringify(payload, null, 2));
    const identityInJwt = payload?.hex_identity || payload?.sub || payload?.identity;
    console.log("Identity from JWT:", identityInJwt);

    // 2. Get the room ticket for this identity
    const sqlRes = await fetch(`${BASE_URL}/sql`, {
        method: "POST", headers: { "Content-Type": "text/plain", "Authorization": `Bearer ${token}` },
        body: "select * from room_ticket"
    });
    const sqlData = await sqlRes.json();
    console.log("\nroom_ticket rows:", JSON.stringify(sqlData[0]?.rows, null, 2));

    // 3. Get game_room rows to see host_identity type
    const sqlRes2 = await fetch(`${BASE_URL}/sql`, {
        method: "POST", headers: { "Content-Type": "text/plain", "Authorization": `Bearer ${token}` },
        body: "select * from game_room"
    });
    const sqlData2 = await sqlRes2.json();
    const latestRoom = sqlData2[0]?.rows?.[sqlData2[0].rows.length - 1];
    console.log("\nLatest game_room row:", JSON.stringify(latestRoom, null, 2));

    if (latestRoom) {
        const roomId = latestRoom[0];
        const hostIdentity = latestRoom[2]; // host_identity column

        console.log("\nroom_id:", roomId);
        console.log("host_identity in DB:", JSON.stringify(hostIdentity));
        console.log("spacetime-identity from header:", identityHeader);
        console.log("Match?", JSON.stringify(hostIdentity) === JSON.stringify(identityHeader));

        // Try to call generate with this room - same token
        console.log("\nTrying generate_clue_manual_for_room...");
        const genRes = await fetch(`${BASE_URL}/call/generate_clue_manual_for_room`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify([roomId, "round_1", "{\"requested_persona\":\"1920s Detective\"}", ""])
        });
        console.log("Status:", genRes.status);
        const genBody = await genRes.text();
        console.log("Body:", genBody);
    }
}

run().catch(console.error);
