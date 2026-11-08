
const url = "http://localhost:3000/api/holds";

const bookingRequest = (idempotencyKey: string) =>
    fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
            hostSlug: "demo",
            eventSlug: "quick-meeting",
            startAt: "2026-11-17T03:30:00.000Z",
        }),
    });

async function main() {
    console.log("Starting concurrent booking test...");

    const [first, second] = await Promise.all([
        bookingRequest(`concurrency-test-${Date.now()}-A`),
        bookingRequest(`concurrency-test-${Date.now()}-B`),
    ]);

    const results = await Promise.all([
        first.json(),
        second.json(),
    ]);

    console.log("\nGuest 1:", first.status, results[0]);
    console.log("\nGuest 2:", second.status, results[1]);

    const successCount = [first.status, second.status]
        .filter((status) => status === 201).length;

    const conflictCount = [first.status, second.status]
        .filter((status) => status === 409).length;

    if (successCount === 1 && conflictCount === 1) {
        console.log("\nPASS: Only one guest successfully booked the slot.");
    } else {
        console.error("\nFAIL: Unexpected concurrency result.");
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error("Concurrency test failed:", error);
    process.exitCode = 1;
});
