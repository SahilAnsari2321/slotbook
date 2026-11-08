import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    // Create the demo host
    const host = await prisma.host.upsert({
        where: { email: "demo@slotbook.com" },
        update: {},
        create: {
            name: "Demo Host",
            email: "demo@slotbook.com",
            slug: "demo",
            timezone: "Asia/Kolkata",
        },
    });

    // Create a one-on-one event
    await prisma.eventType.upsert({
        where: {
            hostId_slug: {
                hostId: host.id,
                slug: "quick-meeting",
            },
        },
        update: {},
        create: {
            hostId: host.id,
            name: "Quick Meeting",
            slug: "quick-meeting",
            durationMinutes: 30,
            capacity: 1,
            minimumNoticeMinutes: 60,
            bookingHorizonDays: 30,
        },
    });

    // Create a group event
    await prisma.eventType.upsert({
        where: {
            hostId_slug: {
                hostId: host.id,
                slug: "group-session",
            },
        },
        update: {},
        create: {
            hostId: host.id,
            name: "Group Session",
            slug: "group-session",
            durationMinutes: 60,
            capacity: 5,
            minimumNoticeMinutes: 240,
            bookingHorizonDays: 30,
        },
    });

    // Monday to Friday, 9 AM to 5 PM
    await prisma.availability.deleteMany({
        where: { hostId: host.id },
    });

    await prisma.availability.createMany({
        data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
            hostId: host.id,
            dayOfWeek,
            startMinute: 540,
            endMinute: 1020,
        })),
    });

    console.log("Demo host, events, and availability created!");
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });