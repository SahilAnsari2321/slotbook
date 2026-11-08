
import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@prisma/client";

type RouteContext = {
    params: Promise<{ token: string }>;
};

export async function POST(
    request: NextRequest,
    context: RouteContext
) {
    try {
        const { token } = await context.params;
        const body = await request.json();
        const { startAt: startAtValue } = body;

        if (typeof startAtValue !== "string") {
            return NextResponse.json(
                { error: "A valid startAt is required." },
                { status: 400 }
            );
        }

        const startAt = new Date(startAtValue);

        if (
            Number.isNaN(startAt.getTime()) ||
            startAt.getSeconds() !== 0 ||
            startAt.getMilliseconds() !== 0
        ) {
            return NextResponse.json(
                { error: "Invalid startAt date. Use a valid time with zero seconds." },
                { status: 400 }
            );
        }

        const existingBooking = await prisma.booking.findUnique({
            where: { manageToken: token },
            include: {
                eventType: {
                    include: { host: true },
                },
            },
        });

        if (!existingBooking) {
            return NextResponse.json(
                { error: "Booking not found." },
                { status: 404 }
            );
        }

        const eventType = existingBooking.eventType;
        const hostTimeZone = eventType.host.timezone;
        const now = new Date();
        const endAt = addMinutes(startAt, eventType.durationMinutes);

        if (
            startAt < addMinutes(now, eventType.minimumNoticeMinutes) ||
            startAt > addDays(now, eventType.bookingHorizonDays)
        ) {
            return NextResponse.json(
                { error: "This time is outside the permitted booking window." },
                { status: 409 }
            );
        }

        // Convert the selected instant to the host's local date and time.
        const dateKey = formatInTimeZone(
            startAt,
            hostTimeZone,
            "yyyy-MM-dd"
        );

        const localHour = Number(
            formatInTimeZone(startAt, hostTimeZone, "HH")
        );

        const localMinute = Number(
            formatInTimeZone(startAt, hostTimeZone, "mm")
        );

        const startMinute = localHour * 60 + localMinute;
        const endMinute = startMinute + eventType.durationMinutes;

        // Check date-specific availability first.
        const dateOverride = await prisma.dateOverride.findUnique({
            where: {
                hostId_date: {
                    hostId: eventType.hostId,
                    date: new Date(`${dateKey}T00:00:00.000Z`),
                },
            },
            include: { windows: true },
        });

        let isWithinAvailability = false;

        if (dateOverride) {
            if (!dateOverride.isUnavailable) {
                isWithinAvailability = dateOverride.windows.some(
                    (window: { startMinute: number; endMinute: number }) =>
                        startMinute >= window.startMinute &&
                        endMinute <= window.endMinute
                );
            }
        } else {
            const dayOfWeek = Number(
                formatInTimeZone(startAt, hostTimeZone, "i")
            ) % 7;

            const windows = await prisma.availability.findMany({
                where: {
                    hostId: eventType.hostId,
                    dayOfWeek,
                },
            });

            isWithinAvailability = windows.some(
                (window: { startMinute: number; endMinute: number }) =>
                    startMinute >= window.startMinute &&
                    endMinute <= window.endMinute
            );
        }

        if (!isWithinAvailability || startMinute % 15 !== 0) {
            return NextResponse.json(
                { error: "The selected time is not within host availability." },
                { status: 409 }
            );
        }

        const result = await prisma.$transaction(
            async (tx: Prisma.TransactionClient) => {
                // Lock the event type to serialize booking operations.
                await tx.$queryRaw`
                    SELECT "id"
                    FROM "EventType"
                    WHERE "id" = ${eventType.id}::uuid
                    FOR UPDATE
                `;

                // Lock the guest's existing booking.
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

                const transactionNow = new Date();

                // Expire old holds before checking capacity.
                await tx.booking.updateMany({
                    where: {
                        eventTypeId: eventType.id,
                        status: "HELD",
                        holdExpiresAt: { lte: transactionNow },
                    },
                    data: { status: "EXPIRED" },
                });

                // Exclude the current booking so it doesn't block itself.
                const activeBookings = await tx.booking.findMany({
                    where: {
                        eventTypeId: eventType.id,
                        id: { not: booking.id },
                        OR: [
                            { status: "CONFIRMED" },
                            {
                                status: "HELD",
                                holdExpiresAt: { gt: transactionNow },
                            },
                        ],
                    },
                    select: {
                        startAt: true,
                        endAt: true,
                    },
                });

                const occupiedStart = addMinutes(
                    startAt,
                    -eventType.bufferBeforeMinutes
                );

                const occupiedEnd = addMinutes(
                    endAt,
                    eventType.bufferAfterMinutes
                );

                const overlappingBookings = activeBookings.filter(
                    (active: { startAt: Date; endAt: Date }) => {
                        const activeStart = addMinutes(
                            active.startAt,
                            -eventType.bufferBeforeMinutes
                        );

                        const activeEnd = addMinutes(
                            active.endAt,
                            eventType.bufferAfterMinutes
                        );

                        return (
                            occupiedStart < activeEnd &&
                            occupiedEnd > activeStart
                        );
                    }
                );

                if (overlappingBookings.length >= eventType.capacity) {
                    throw new Error("SLOT_UNAVAILABLE");
                }

                const updatedBooking = await tx.booking.update({
                    where: { id: booking.id },
                    data: {
                        startAt,
                        endAt,
                    },
                });

                // Record the reschedule notification.
                await tx.notification.create({
                    data: {
                        bookingId: updatedBooking.id,
                        type: "BOOKING_RESCHEDULED",
                        payload: {
                            guestName: updatedBooking.guestName,
                            guestEmail: updatedBooking.guestEmail,
                            startAt: updatedBooking.startAt.toISOString(),
                            endAt: updatedBooking.endAt.toISOString(),
                        },
                    },
                });

                return updatedBooking;
            }
        );

        return NextResponse.json({
            message: "Booking rescheduled successfully.",
            booking: {
                id: result.id,
                startAt: result.startAt.toISOString(),
                endAt: result.endAt.toISOString(),
                status: result.status,
                manageToken: result.manageToken,
            },
        });
    } catch (error) {
        if (error instanceof Error) {
            const messages: Record<string, string> = {
                BOOKING_NOT_FOUND: "Booking not found.",
                BOOKING_NOT_ACTIVE: "Only confirmed bookings can be rescheduled.",
                SLOT_UNAVAILABLE: "The selected slot is no longer available.",
            };

            if (messages[error.message]) {
                return NextResponse.json(
                    { error: messages[error.message] },
                    {
                        status: error.message === "BOOKING_NOT_FOUND"
                            ? 404
                            : 409,
                    }
                );
            }
        }

        console.error("Booking rescheduling failed:", error);

        return NextResponse.json(
            { error: "Unable to reschedule booking." },
            { status: 500 }
        );
    }
}
