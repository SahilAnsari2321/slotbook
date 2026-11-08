
import { NextResponse } from "next/server";
import { getAuthenticatedHost } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        const events = await prisma.eventType.findMany({
            where: {
                hostId: host.id,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                durationMinutes: true,
                capacity: true,
                bufferBeforeMinutes: true,
                bufferAfterMinutes: true,
                minimumNoticeMinutes: true,
                bookingHorizonDays: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: "asc",
            },
        });

        return NextResponse.json({
            events,
            count: events.length,
        });
    } catch (error) {
        console.error("List host events error:", error);

        return NextResponse.json(
            { error: "Unable to retrieve event types." },
            { status: 500 }
        );
    }
}


export async function POST(request: Request) {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        const body = await request.json();

        const name = typeof body.name === "string" ? body.name.trim() : "";
        const slug = typeof body.slug === "string"
            ? body.slug.trim().toLowerCase()
            : "";

        const durationMinutes = Number(body.durationMinutes);
        const capacity = Number(body.capacity ?? 1);
        const bufferBeforeMinutes = Number(body.bufferBeforeMinutes ?? 0);
        const bufferAfterMinutes = Number(body.bufferAfterMinutes ?? 0);
        const minimumNoticeMinutes = Number(body.minimumNoticeMinutes ?? 240);
        const bookingHorizonDays = Number(body.bookingHorizonDays ?? 30);

        if (
            !name ||
            name.length > 100 ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        ) {
            return NextResponse.json(
                { error: "Provide a valid event name and URL slug." },
                { status: 400 }
            );
        }

        if (
            !Number.isInteger(durationMinutes) ||
            durationMinutes < 15 ||
            durationMinutes > 120 ||
            !Number.isInteger(capacity) ||
            capacity < 1 ||
            !Number.isInteger(bufferBeforeMinutes) ||
            bufferBeforeMinutes < 0 ||
            bufferBeforeMinutes > 30 ||
            !Number.isInteger(bufferAfterMinutes) ||
            bufferAfterMinutes < 0 ||
            bufferAfterMinutes > 30 ||
            !Number.isInteger(minimumNoticeMinutes) ||
            minimumNoticeMinutes < 0 ||
            !Number.isInteger(bookingHorizonDays) ||
            bookingHorizonDays < 1 ||
            bookingHorizonDays > 365
        ) {
            return NextResponse.json(
                { error: "One or more event settings are invalid." },
                { status: 400 }
            );
        }

        const existingEvent = await prisma.eventType.findUnique({
            where: {
                hostId_slug: {
                    hostId: host.id,
                    slug,
                },
            },
        });

        if (existingEvent) {
            return NextResponse.json(
                { error: "An event with this slug already exists." },
                { status: 409 }
            );
        }

        const event = await prisma.eventType.create({
            data: {
                hostId: host.id,
                name,
                slug,
                durationMinutes,
                capacity,
                bufferBeforeMinutes,
                bufferAfterMinutes,
                minimumNoticeMinutes,
                bookingHorizonDays,
            },
        });

        return NextResponse.json(
            {
                message: "Event type created successfully.",
                event,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Create event error:", error);

        return NextResponse.json(
            { error: "Unable to create event type." },
            { status: 500 }
        );
    }
}

