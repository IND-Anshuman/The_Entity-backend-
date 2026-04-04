const BASE_URL = "https://maincloud.spacetimedb.com/v1/database/the-entity-ty5fs";

async function run() {
    const initRes = await fetch(`${BASE_URL}/call/initiate_room`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{"some":"The Entity"}])
    });
    const token = initRes.headers.get("spacetime-identity-token");
    const id = initRes.headers.get("spacetime-identity");
    console.log("Token:", token.substring(0, 10));
    console.log("ID:", id);

    await new Promise(r => setTimeout(r, 2000));

    const sqlRes = await fetch(`${BASE_URL}/sql`, {
        method: "POST", headers: { "Content-Type": "text/plain", "Authorization": `Bearer ${token}` },
        body: "select * from room_ticket"
    });
    const result = await sqlRes.json();
    console.log("\nRAW tickets:");
    const tickets = result[0].rows;
    for (const t of tickets.slice(-5)) { // Look at last 5
        console.log(JSON.stringify(t[0]));
    }
}
run();
