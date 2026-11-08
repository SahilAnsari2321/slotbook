
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedHost } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";

type Context = {
    params: Promise<{ id: string }>;
};

type OverrideWindow = {
    startMinute: number;
    endMinute: number;
};

function validWindow(window: OverrideWindow) {
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

function validWindows(windows: OverrideWindow[]) {
    if (!Array.isArray(windows)) return false;

    const sorted = [...windows].sort(
        (a, b) => a.startMinute - b.startMinute
    );

    for (let i = 0; i < sorted.length; i++) {
        if (!validWindow(sorted[i])) return false;

        if (i > 0 && sorted[i].startMinute < sorted[i - 1].endMinute) {
            return false;
        }
    }

    return true;
}

export async function PATCH(request: NextRequest, context: Context) {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        const { id } = await context.params;
        const body = await request.json();

        const existing = await prisma.dateOverride.findFirst({
            where: { id, hostId: host.id },
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Date override not found." },
                { status: 404 }
            );
        }

        if (
            body.isUnavailable !== undefined &&
            typeof body.isUnavailable !== "boolean"
        ) {
            return NextResponse.json(
                { error: "isUnavailable must be a boolean." },
                { status: 400 }
            );
        }

        const isUnavailable =
            body.isUnavailable ?? existing.isUnavailable;

        const windows = body.windows;

        if (windows !== undefined) {
            if (!Array.isArray(windows) || !validWindows(windows)) {
                return NextResponse.json(
                    { error: "Invalid or overlapping custom windows." },
                    { status: 400 }
                );
            }
        }

        if (isUnavailable && windows?.length > 0) {
            return NextResponse.json(
                { error: "Unavailable dates cannot have custom windows." },
                { status: 400 }
            );
        }

        const updated = await prisma.$transaction(
            async (tx: Prisma.TransactionClient) => {
                const updateData: { isUnavailable: boolean } = {
                    isUnavailable,
                };

                await tx.dateOverride.update({
                    where: { id },
                    data: updateData,
                });

                if (windows !== undefined || isUnavailable) {
                    await tx.dateOverrideWindow.deleteMany({
                        where: { dateOverrideId: id },
                    });
                }

                if (windows && windows.length > 0 && !isUnavailable) {
                    await tx.dateOverrideWindow.createMany({
                        data: windows.map((window: OverrideWindow) => ({
                            dateOverrideId: id,
                            startMinute: window.startMinute,
                            endMinute: window.endMinute,
                        })),
                    });
                }

                return tx.dateOverride.findUnique({
                    where: { id },
                    include: { windows: true },
                });
            });

        return NextResponse.json({
            message: "Date override updated successfully.",
            override: updated,
        });
    } catch (error) {
        console.error("Update date override error:", error);

        return NextResponse.json(
            { error: "Unable to update date override." },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest, context: Context) {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        const { id } = await context.params;

        const existing = await prisma.dateOverride.findFirst({
            where: { id, hostId: host.id },
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Date override not found." },
                { status: 404 }
            );
        }

        await prisma.dateOverride.delete({
            where: { id },
        });

        return NextResponse.json({
            message: "Date override deleted successfully.",
        });
    } catch (error) {
        console.error("Delete date override error:", error);

        return NextResponse.json(
            { error: "Unable to delete date override." },
            { status: 500 }
        );
    }
}
