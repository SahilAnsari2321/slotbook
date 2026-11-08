
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@prisma/client";

type RouteContext = {
    params: Promise<{
        token: string;
    }>;
};

export async function POST(
    request: NextRequest,
    context: RouteContext
) {
    try {
        const { token } = await context.params;
        const body = await request.json();
        const { reason } = body;

        if (
            typeof reason !== "string" ||
            reason.trim().length < 3 ||
            reason.trim().length > 500
        ) {
            return NextResponse.json(
                { error: "A cancellation reason between 3 and 500 characters is required." },
                { status: 400 }
            );
        }

        // Find the event type so we can lock it before locking the booking.
        const existingBooking = await prisma.booking.findUnique({
            where: { manageToken: token },
            select: { eventTypeId: true },
        });

        if (!existingBooking) {
            return NextResponse.json(
                { error: "Booking not found." },
                { status: 404 }
            );
        }

        const result = await prisma.$transaction(
            async (tx: Prisma.TransactionClient) => {
                // Lock the event type to coordinate with other booking operations.
                await tx.$queryRaw`
                    SELECT "id"
                    FROM "EventType"
                    WHERE "id" = ${existingBooking.eventTypeId}::uuid
                    FOR UPDATE
                `;

                // Lock the booking row.
                const rows = await tx.$queryRaw<{ id: string }[]>`
                    SELECT "id"
                    FROM "Booking"
                    WHERE "manageToken" = ${token}
                    FOR UPDATE
                `;

                if (rows.length === 0) {
                    throw new Error("BOOKING_NOT_FOUND");
                }

                const booking = await tx.booking.findUnique({
                    where: { manageToken: token },
                });

                if (!booking) {
                    throw new Error("BOOKING_NOT_FOUND");
                }

                if (booking.status !== "CONFIRMED") {
                    throw new Error("BOOKING_NOT_ACTIVE");
                }

                const cancelledBooking = await tx.booking.update({
                    where: { id: booking.id },
                    data: {
                        status: "CANCELLED",
                        cancelReason: reason.trim(),
                    },
                });

                // Save a cancellation notification in the database.
                await tx.notification.create({
                    data: {
                        bookingId: cancelledBooking.id,
                        type: "BOOKING_CANCELLED",
                        payload: {
                            guestName: cancelledBooking.guestName,
                            guestEmail: cancelledBooking.guestEmail,
                            reason: reason.trim(),
                            startAt: cancelledBooking.startAt.toISOString(),
                            endAt: cancelledBooking.endAt.toISOString(),
                        },
                    },
                });

                return cancelledBooking;
            }
        );

        return NextResponse.json({
            message: "Booking cancelled successfully.",
            booking: {
                id: result.id,
                status: result.status,
                cancelReason: result.cancelReason,
            },
        });
    } catch (error) {
        if (error instanceof Error) {
            const messages: Record<string, string> = {
                BOOKING_NOT_FOUND: "Booking not found.",
                BOOKING_NOT_ACTIVE: "Only confirmed bookings can be cancelled.",
            };

            if (messages[error.message]) {
                return NextResponse.json(
                    { error: messages[error.message] },
                    { status: error.message === "BOOKING_NOT_FOUND" ? 404 : 409 }
                );
            }
        }

        console.error("Booking cancellation failed:", error);

        return NextResponse.json(
            { error: "Unable to cancel booking." },
            { status: 500 }
        );
    }
}
