
import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type RouteContext = {
    params: Promise<{
        host: string;
        slug: string;
    }>;
};

type AvailabilityRecord = {
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
};

type OverrideRecord = {
    date: Date;
    isUnavailable: boolean;
    windows: {
        startMinute: number;
        endMinute: number;
    }[];
};

type BookingRecord = {
    startAt: Date;
    endAt: Date;
};

function isValidTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return true;
    } catch {
        return false;
    }
}

function formatMinute(minute: number): string {
    const hours = Math.floor(minute / 60);
    const minutes = minute % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export async function GET(
    request: NextRequest,
    context: RouteContext
) {
    try {
        const { host: hostSlug, slug: eventSlug } = await context.params;

        const fromParam = request.nextUrl.searchParams.get("from");
        const toParam = request.nextUrl.searchParams.get("to");
        const guestTimeZone = request.nextUrl.searchParams.get("tz");

        if (!fromParam || !toParam || !guestTimeZone) {
            return NextResponse.json(
                { error: "from, to, and tz query parameters are required." },
                { status: 400 }
            );
        }

        if (!isValidTimeZone(guestTimeZone)) {
            return NextResponse.json(
                { error: "Invalid timezone." },
                { status: 400 }
            );
        }

        const from = new Date(fromParam);
        const to = new Date(toParam);

        if (
            Number.isNaN(from.getTime()) ||
            Number.isNaN(to.getTime()) ||
            from >= to
        ) {
            return NextResponse.json(
                { error: "Invalid date range." },
                { status: 400 }
            );
        }

        const maxRange = 31 * 24 * 60 * 60 * 1000;

        if (to.getTime() - from.getTime() > maxRange) {
            return NextResponse.json(
                { error: "The requested date range cannot exceed 31 days." },
                { status: 400 }
            );
        }

        // Find the host and requested event type.
        const eventType = await prisma.eventType.findFirst({
            where: {
                slug: eventSlug,
                host: {
                    slug: hostSlug,
                },
            },
            include: {
                host: true,
            },
        });

        if (!eventType) {
            return NextResponse.json(
                { error: "Host or event type not found." },
                { status: 404 }
            );
        }

        const hostTimeZone = eventType.host.timezone;
        const now = new Date();

        // Retrieve weekly availability.
        const availability: AvailabilityRecord[] =
            await prisma.availability.findMany({
                where: {
                    hostId: eventType.hostId,
                },
                select: {
                    dayOfWeek: true,
                    startMinute: true,
                    endMinute: true,
                },
            });

        // Determine the date range in the host's timezone.
        const firstDate = formatInTimeZone(
            from,
            hostTimeZone,
            "yyyy-MM-dd"
        );

        const lastDate = formatInTimeZone(
            to,
            hostTimeZone,
            "yyyy-MM-dd"
        );

        // Retrieve date-specific overrides.
        const dateOverrides: OverrideRecord[] =
            await prisma.dateOverride.findMany({
                where: {
                    hostId: eventType.hostId,
                    date: {
                        gte: new Date(`${firstDate}T00:00:00.000Z`),
                        lte: new Date(`${lastDate}T00:00:00.000Z`),
                    },
                },
                include: {
                    windows: {
                        select: {
                            startMinute: true,
                            endMinute: true,
                        },
                    },
                },
            });

        const overrideMap = new Map<string, OverrideRecord>(
            dateOverrides.map(
                (override: OverrideRecord): [string, OverrideRecord] => [
                    override.date.toISOString().slice(0, 10),
                    override,
                ]
            )
        );

        // Retrieve bookings that are confirmed or have active holds.
        const rangeStart = addMinutes(
            from,
            -eventType.bufferBeforeMinutes
        );

        const rangeEnd = addMinutes(
            to,
            eventType.bufferAfterMinutes
        );

        const existingBookings: BookingRecord[] =
            await prisma.booking.findMany({
                where: {
                    eventTypeId: eventType.id,
                    startAt: { lt: rangeEnd },
                    endAt: { gt: rangeStart },
                    OR: [
                        { status: "CONFIRMED" },
                        {
                            status: "HELD",
                            holdExpiresAt: { gt: now },
                        },
                    ],
                },
                select: {
                    startAt: true,
                    endAt: true,
                },
            });

        const slots: {
            startAt: string;
            endAt: string;
            startLocal: string;
            endLocal: string;
            availableSpots: number;
        }[] = [];

        let currentDate = new Date(`${firstDate}T00:00:00.000Z`);
        const finalDate = new Date(`${lastDate}T00:00:00.000Z`);

        // Generate possible slots for each host-local date.
        while (currentDate <= finalDate) {
            const dateKey = currentDate.toISOString().slice(0, 10);
            const dayOfWeek = currentDate.getUTCDay();

            const override = overrideMap.get(dateKey);

            let windows: {
                startMinute: number;
                endMinute: number;
            }[];

            if (override) {
                if (override.isUnavailable) {
                    currentDate = addDays(currentDate, 1);
                    continue;
                }

                windows = override.windows;
            } else {
                windows = availability.filter(
                    (item: AvailabilityRecord) =>
                        item.dayOfWeek === dayOfWeek
                );
            }

            for (const window of windows) {
                for (
                    let minute = window.startMinute;
                    minute + eventType.durationMinutes <= window.endMinute;
                    minute += 15
                ) {
                    const localStart =
                        `${dateKey}T${formatMinute(minute)}:00`;

                    const startAt = fromZonedTime(
                        localStart,
                        hostTimeZone
                    );

                    const endAt = addMinutes(
                        startAt,
                        eventType.durationMinutes
                    );

                    // Exclude slots outside the requested date range.
                    if (startAt < from || endAt > to) {
                        continue;
                    }

                    // Enforce minimum notice and booking horizon.
                    const minimumStart = addMinutes(
                        now,
                        eventType.minimumNoticeMinutes
                    );

                    const maximumStart = addDays(
                        now,
                        eventType.bookingHorizonDays
                    );

                    if (
                        startAt < minimumStart ||
                        startAt > maximumStart
                    ) {
                        continue;
                    }

                    // Include buffers when checking overlapping bookings.
                    const occupiedStart = addMinutes(
                        startAt,
                        -eventType.bufferBeforeMinutes
                    );

                    const occupiedEnd = addMinutes(
                        endAt,
                        eventType.bufferAfterMinutes
                    );

                    const overlappingBookings = existingBookings.filter(
                        (booking: BookingRecord) => {
                            const bookingOccupiedStart = addMinutes(
                                booking.startAt,
                                -eventType.bufferBeforeMinutes
                            );

                            const bookingOccupiedEnd = addMinutes(
                                booking.endAt,
                                eventType.bufferAfterMinutes
                            );

                            return (
                                occupiedStart < bookingOccupiedEnd &&
                                occupiedEnd > bookingOccupiedStart
                            );
                        }
                    );

                    const availableSpots =
                        eventType.capacity - overlappingBookings.length;

                    if (availableSpots <= 0) {
                        continue;
                    }

                    slots.push({
                        startAt: startAt.toISOString(),
                        endAt: endAt.toISOString(),

                        startLocal: formatInTimeZone(
                            startAt,
                            guestTimeZone,
                            "yyyy-MM-dd HH:mm"
                        ),

                        endLocal: formatInTimeZone(
                            endAt,
                            guestTimeZone,
                            "yyyy-MM-dd HH:mm"
                        ),

                        availableSpots,
                    });
                }
            }

            currentDate = addDays(currentDate, 1);
        }

        return NextResponse.json({
            host: eventType.host.name,
            event: eventType.name,
            hostTimeZone,
            guestTimeZone,
            slots,
        });
    } catch (error) {
        console.error(
            "Failed to retrieve available slots:",
            error
        );

        return NextResponse.json(
            { error: "Unable to retrieve available slots." },
            { status: 500 }
        );
    }
}
