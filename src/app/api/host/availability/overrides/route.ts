
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedHost } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

function isValidDate(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function isValidWindow(window: {
    startMinute: number;
    endMinute: number;
}) {
    return (
        Number.isInteger(window.startMinute) &&
        Number.isInteger(window.endMinute) &&
        window.startMinute >= 0 &&
        window.endMinute <= 1440 &&
        window.startMinute < window.endMinute &&
        window.startMinute % 15 === 0 &&
        window.endMinute % 15 === 0
    );
}

export async function GET() {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        const overrides = await prisma.dateOverride.findMany({
            where: { hostId: host.id },
            include: {
                windows: {
                    orderBy: { startMinute: "asc" },
                },
            },
            orderBy: { date: "asc" },
        });

        return NextResponse.json({ overrides });
    } catch (error) {
        console.error("Get date overrides error:", error);

        return NextResponse.json(
            { error: "Unable to retrieve date overrides." },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        const body = await request.json();

        if (!isValidDate(body.date)) {
            return NextResponse.json(
                { error: "Date must be a valid YYYY-MM-DD value." },
                { status: 400 }
            );
        }

        if (typeof body.isUnavailable !== "boolean") {
            return NextResponse.json(
                { error: "isUnavailable must be a boolean." },
                { status: 400 }
            );
        }

        const windows = body.windows ?? [];

        if (!Array.isArray(windows)) {
            return NextResponse.json(
                { error: "Windows must be an array." },
                { status: 400 }
            );
        }

        if (body.isUnavailable && windows.length > 0) {
            return NextResponse.json(
                { error: "Unavailable dates cannot have custom windows." },
                { status: 400 }
            );
        }

        for (const window of windows) {
            if (
                !window ||
                typeof window !== "object" ||
                !isValidWindow(window)
            ) {
                return NextResponse.json(
                    { error: "Invalid date override window." },
                    { status: 400 }
                );
            }
        }

        const sortedWindows = [...windows].sort(
            (a, b) => a.startMinute - b.startMinute
        );

        for (let i = 1; i < sortedWindows.length; i++) {
            if (sortedWindows[i].startMinute < sortedWindows[i - 1].endMinute) {
                return NextResponse.json(
                    { error: "Custom windows must not overlap." },
                    { status: 400 }
                );
            }
        }

        const override = await prisma.dateOverride.create({
            data: {
                hostId: host.id,
                date: new Date(`${body.date}T00:00:00.000Z`),
                isUnavailable: body.isUnavailable,
                windows: {
                    create: windows.map(
                        (window: { startMinute: number; endMinute: number }) => ({
                            startMinute: window.startMinute,
                            endMinute: window.endMinute,
                        })
                    ),
                },
            },
            include: { windows: true },
        });

        return NextResponse.json(
            {
                message: "Date override created successfully.",
                override,
            },
            { status: 201 }
        );
    }
    catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return NextResponse.json(
                { error: "An override already exists for this date." },
                { status: 409 }
            );
        }

        console.error("Create date override error:", error);

        return NextResponse.json(
            { error: "Unable to create date override." },
            { status: 500 }
        );
    }
}
