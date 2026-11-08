
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { formatInTimeZone } from "date-fns-tz";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
    try {
        const idempotencyKey = request.headers
            .get("Idempotency-Key")
            ?.trim();

        if (!idempotencyKey || idempotencyKey.length > 255) {
            return NextResponse.json(
                { error: "A valid Idempotency-Key header is required." },
                { status: 400 }
            );
        }

        const body = await request.json();
        const { hostSlug, eventSlug, startAt: startAtInput } = body;

        if (
            typeof hostSlug !== "string" ||
            typeof eventSlug !== "string" ||
            typeof startAtInput !== "string"
        ) {
            return NextResponse.json(
                { error: "hostSlug, eventSlug, and startAt are required." },
                { status: 400 }
            );
        }

        const startAt = new Date(startAtInput);

        if (
            Number.isNaN(startAt.getTime()) ||
            startAt.getUTCSeconds() !== 0 ||
            startAt.getUTCMilliseconds() !== 0
        ) {
            return NextResponse.json(
                { error: "startAt must have zero seconds and milliseconds." },
                { status: 400 }
            );
        }

        const eventType = await prisma.eventType.findFirst({
            where: {
                slug: eventSlug,
                host: { slug: hostSlug },
            },
            include: { host: true },
        });

        if (!eventType) {
            return NextResponse.json(
                { error: "Event type not found." },
                { status: 404 }
            );
        }

        const now = new Date();

        const minimumStart = new Date(
            now.getTime() + eventType.minimumNoticeMinutes * 60_000
        );

        const maximumStart = new Date(
            now.getTime() +
            eventType.bookingHorizonDays * 24 * 60 * 60_000
        );

        if (startAt < minimumStart) {
            return NextResponse.json(
                { error: "This time does not meet the minimum notice requirement." },
                { status: 409 }
            );
        }

        if (startAt > maximumStart) {
            return NextResponse.json(
                { error: "This time is beyond the booking horizon." },
                { status: 409 }
            );
        }

        const endAt = new Date(
            startAt.getTime() + eventType.durationMinutes * 60_000
        );

        // Convert the requested time to the host's local timezone.
        const hostTimezone = eventType.host.timezone;

        const localDate = formatInTimeZone(
            startAt,
            hostTimezone,
            "yyyy-MM-dd"
        );

        const localTime = formatInTimeZone(
            startAt,
            hostTimezone,
            "HH:mm"
        );

        const [hours, minutes] = localTime.split(":").map(Number);
        const startMinute = hours * 60 + minutes;
        const endMinute = startMinute + eventType.durationMinutes;

        if (startMinute % 15 !== 0) {
            return NextResponse.json(
                { error: "Bookings must start on a 15-minute boundary." },
                { status: 400 }
            );
        }

        // Look up date-specific availability.
        const localDateKey = new Date(`${localDate}T00:00:00.000Z`);

        const dateOverride = await prisma.dateOverride.findUnique({
            where: {
                hostId_date: {
                    hostId: eventType.hostId,
                    date: localDateKey,
                },
            },
            include: { windows: true },
        });

        let isAvailable = false;

        if (dateOverride) {
            if (!dateOverride.isUnavailable) {
                isAvailable = dateOverride.windows.some(
                    (window: { startMinute: number; endMinute: number }) =>
                        startMinute >= window.startMinute &&
                        endMinute <= window.endMinute
                );
            }
        } else {
            const localDay = localDateKey.getUTCDay();

            const weeklyWindows = await prisma.availability.findMany({
                where: {
                    hostId: eventType.hostId,
                    dayOfWeek: localDay,
                },
            });

            isAvailable = weeklyWindows.some(
                (window: { startMinute: number; endMinute: number }) =>
                    startMinute >= window.startMinute &&
                    endMinute <= window.endMinute
            );
        }

        if (!isAvailable) {
            return NextResponse.json(
                { error: "This time is outside the host's availability." },
                { status: 409 }
            );
        }

        // Create the hold inside a transaction.
        const result = await prisma.$transaction(
            async (tx: Prisma.TransactionClient) => {
                // Serialize booking attempts for this event type.
                await tx.$queryRaw<{ id: string }[]>`
                    SELECT "id"
                    FROM "EventType"
                    WHERE "id" = ${eventType.id}::uuid
                    FOR UPDATE
                `;

                const transactionNow = new Date();

                // Check idempotency before creating another hold.
                const existingRequest = await tx.booking.findUnique({
                    where: { idempotencyKey },
                });

                if (existingRequest) {
                    if (
                        existingRequest.eventTypeId !== eventType.id ||
                        existingRequest.startAt.getTime() !== startAt.getTime()
                    ) {
                        throw new Error("IDEMPOTENCY_CONFLICT");
                    }

                    if (
                        existingRequest.status === "HELD" &&
                        (!existingRequest.holdExpiresAt ||
                            existingRequest.holdExpiresAt <= transactionNow)
                    ) {
                        await tx.booking.update({
                            where: { id: existingRequest.id },
                            data: { status: "EXPIRED" },
                        });

                        return { expiredExisting: true as const };
                    }

                    if (
                        existingRequest.status === "EXPIRED" ||
                        existingRequest.status === "CANCELLED"
                    ) {
                        throw new Error("HOLD_NO_LONGER_ACTIVE");
                    }

                    return {
                        expiredExisting: false as const,
                        booking: existingRequest,
                        alreadyExists: true,
                    };
                }

                // Expire old holds before checking capacity.
                await tx.booking.updateMany({
                    where: {
                        eventTypeId: eventType.id,
                        status: "HELD",
                        OR: [
                            { holdExpiresAt: null },
                            { holdExpiresAt: { lte: transactionNow } },
                        ],
                    },
                    data: { status: "EXPIRED" },
                });

                // Include buffers when checking occupied time.
                const occupiedStart = new Date(
                    startAt.getTime() -
                    eventType.bufferBeforeMinutes * 60_000
                );

                const occupiedEnd = new Date(
                    endAt.getTime() +
                    eventType.bufferAfterMinutes * 60_000
                );

                const existingBookings = await tx.booking.findMany({
                    where: {
                        eventTypeId: eventType.id,
                        status: {
                            in: ["HELD", "CONFIRMED"],
                        },
                        startAt: {
                            lt: new Date(
                                occupiedEnd.getTime() +
                                eventType.bufferBeforeMinutes * 60_000
                            ),
                        },
                        endAt: {
                            gt: new Date(
                                occupiedStart.getTime() -
                                eventType.bufferAfterMinutes * 60_000
                            ),
                        },
                    },
                });

                const overlappingBookings = existingBookings.filter(
                    (booking: { startAt: Date; endAt: Date }) => {
                        const existingOccupiedStart = new Date(
                            booking.startAt.getTime() -
                            eventType.bufferBeforeMinutes * 60_000
                        );

                        const existingOccupiedEnd = new Date(
                            booking.endAt.getTime() +
                            eventType.bufferAfterMinutes * 60_000
                        );

                        return (
                            occupiedStart < existingOccupiedEnd &&
                            occupiedEnd > existingOccupiedStart
                        );
                    }
                );

                if (overlappingBookings.length >= eventType.capacity) {
                    throw new Error("SLOT_FULL");
                }

                const booking = await tx.booking.create({
                    data: {
                        eventTypeId: eventType.id,
                        startAt,
                        endAt,
                        status: "HELD",
                        holdExpiresAt: new Date(
                            transactionNow.getTime() + 5 * 60_000
                        ),
                        idempotencyKey,
                    },
                });

                return {
                    expiredExisting: false as const,
                    booking,
                    alreadyExists: false,
                };
            }
        );

        if (result.expiredExisting) {
            return NextResponse.json(
                { error: "The previous hold has expired. Use a new Idempotency-Key." },
                { status: 409 }
            );
        }

        return NextResponse.json(
            {
                message: result.alreadyExists
                    ? "This hold already exists."
                    : "Booking hold created successfully.",
                holdId: result.booking.id,
                status: result.booking.status,
                startAt: result.booking.startAt.toISOString(),
                endAt: result.booking.endAt.toISOString(),
                expiresAt: result.booking.holdExpiresAt?.toISOString() ?? null,
                alreadyExists: result.alreadyExists,
            },
            {
                status: result.alreadyExists ? 200 : 201,
            }
        );
    } catch (error: unknown) {
        if (error instanceof Error) {
            const messages: Record<string, string> = {
                IDEMPOTENCY_CONFLICT:
                    "This Idempotency-Key was already used for a different booking request.",
                HOLD_NO_LONGER_ACTIVE:
                    "The previous hold is no longer active. Use a new Idempotency-Key.",
                SLOT_FULL:
                    "This time slot is no longer available.",
            };

            if (messages[error.message]) {
                return NextResponse.json(
                    { error: messages[error.message] },
                    { status: 409 }
                );
            }
        }

        // Handle Prisma unique constraint errors without a runtime Prisma import.
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return NextResponse.json(
                { error: "This Idempotency-Key has already been used." },
                { status: 409 }
            );
        }

        console.error("Booking hold creation failed:", error);

        return NextResponse.json(
            { error: "Unable to create booking hold." },
            { status: 500 }
        );
    }
}
