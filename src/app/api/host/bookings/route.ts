
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getAuthenticatedHost } from "@/app/lib/auth";

export async function GET() {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const bookings = await prisma.booking.findMany({
            where: {
                eventType: {
                    hostId: host.id,
                },
                status: "CONFIRMED",
                startAt: {
                    gte: new Date(),
                },
            },
            include: {
                eventType: {
                    select: {
                        name: true,
                        durationMinutes: true,
                    },
                },
            },
            orderBy: {
                startAt: "asc",
            },
        });

        return NextResponse.json({
            bookings: bookings.map((booking) => ({
                id: booking.id,
                guestName: booking.guestName,
                guestEmail: booking.guestEmail,
                startAt: booking.startAt.toISOString(),
                endAt: booking.endAt.toISOString(),
                eventName: booking.eventType.name,
                durationMinutes: booking.eventType.durationMinutes,
                manageToken: booking.manageToken,
            })),
        });
    } catch (error) {
        console.error("Failed to fetch host bookings:", error);

        return NextResponse.json(
            { error: "Unable to fetch bookings." },
            { status: 500 }
        );
    }
}
