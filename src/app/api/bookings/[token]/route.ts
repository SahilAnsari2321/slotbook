
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type RouteContext = {
    params: Promise<{
        token: string;
    }>;
};

export async function GET(
    request: Request,
    context: RouteContext
) {
    try {
        const { token } = await context.params;

        if (!token || token.length > 255) {
            return NextResponse.json(
                { error: "Invalid booking management token." },
                { status: 400 }
            );
        }

        const booking = await prisma.booking.findUnique({
            where: {
                manageToken: token,
            },
            include: {
                eventType: {
                    include: {
                        host: {
                            select: {
                                name: true,
                                timezone: true,
                            },
                        },
                    },
                },
            },
        });

        if (!booking) {
            return NextResponse.json(
                { error: "Booking not found." },
                { status: 404 }
            );
        }

        return NextResponse.json({
            booking: {
                id: booking.id,
                guestName: booking.guestName,
                guestEmail: booking.guestEmail,
                startAt: booking.startAt.toISOString(),
                endAt: booking.endAt.toISOString(),
                status: booking.status,
                cancelReason: booking.cancelReason,
                manageToken: booking.manageToken,
            },
            event: {
                name: booking.eventType.name,
                durationMinutes: booking.eventType.durationMinutes,
                hostName: booking.eventType.host.name,
                hostTimeZone: booking.eventType.host.timezone,
            },
        });
    } catch (error) {
        console.error("Failed to retrieve booking:", error);

        return NextResponse.json(
            { error: "Unable to retrieve booking details." },
            { status: 500 }
        );
    }
}
