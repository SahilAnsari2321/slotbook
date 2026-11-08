
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedHost } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";

type AvailabilityWindow = {
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
};

export async function GET() {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        const availability = await prisma.availability.findMany({
            where: { hostId: host.id },
            orderBy: [
                { dayOfWeek: "asc" },
                { startMinute: "asc" },
            ],
        });

        return NextResponse.json({
            timezone: host.timezone,
            availability,
        });
    } catch (error) {
        console.error("Get availability error:", error);

        return NextResponse.json(
            { error: "Unable to retrieve availability." },
            { status: 500 }
        );
    }
}

export async function PUT(request: NextRequest) {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        const body = await request.json();

        if (!Array.isArray(body.availability)) {
            return NextResponse.json(
                { error: "Availability must be an array." },
                { status: 400 }
            );
        }

        const windows = body.availability as AvailabilityWindow[];

        for (const window of windows) {
            if (
                !Number.isInteger(window.dayOfWeek) ||
                window.dayOfWeek < 0 ||
                window.dayOfWeek > 6 ||
                !Number.isInteger(window.startMinute) ||
                !Number.isInteger(window.endMinute) ||
                window.startMinute < 0 ||
                window.endMinute > 1440 ||
                window.startMinute >= window.endMinute ||
                window.startMinute % 15 !== 0 ||
                window.endMinute % 15 !== 0
            ) {
                return NextResponse.json(
                    { error: "Invalid availability window." },
                    { status: 400 }
                );
            }
        }

        // Reject overlapping windows on the same day.
        for (let day = 0; day <= 6; day++) {
            const dayWindows = windows
                .filter((window) => window.dayOfWeek === day)
                .sort((a, b) => a.startMinute - b.startMinute);

            for (let i = 1; i < dayWindows.length; i++) {
                if (dayWindows[i].startMinute < dayWindows[i - 1].endMinute) {
                    return NextResponse.json(
                        { error: "Availability windows must not overlap." },
                        { status: 400 }
                    );
                }
            }
        }

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.availability.deleteMany({
                where: { hostId: host.id },
            });

            if (windows.length > 0) {
                await tx.availability.createMany({
                    data: windows.map((window) => ({
                        hostId: host.id,
                        dayOfWeek: window.dayOfWeek,
                        startMinute: window.startMinute,
                        endMinute: window.endMinute,
                    })),
                });
            }
        });

        const updatedAvailability = await prisma.availability.findMany({
            where: { hostId: host.id },
            orderBy: [
                { dayOfWeek: "asc" },
                { startMinute: "asc" },
            ],
        });

        return NextResponse.json({
            message: "Weekly availability updated successfully.",
            availability: updatedAvailability,
        });
    } catch (error) {
        console.error("Update availability error:", error);

        return NextResponse.json(
            { error: "Unable to update availability." },
            { status: 500 }
        );
    }
}
