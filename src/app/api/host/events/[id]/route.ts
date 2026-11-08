
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedHost } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

type Context = {
    params: Promise<{ id: string }>;
};

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

        const existing = await prisma.eventType.findFirst({
            where: { id, hostId: host.id },
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Event type not found." },
                { status: 404 }
            );
        }

        const data: Record<string, string | number> = {};

        if (body.name !== undefined) {
            if (
                typeof body.name !== "string" ||
                !body.name.trim() ||
                body.name.trim().length > 100
            ) {
                return NextResponse.json(
                    { error: "Invalid event name." },
                    { status: 400 }
                );
            }
            data.name = body.name.trim();
        }

        if (body.slug !== undefined) {
            if (
                typeof body.slug !== "string" ||
                !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug.trim().toLowerCase())
            ) {
                return NextResponse.json(
                    { error: "Invalid event slug." },
                    { status: 400 }
                );
            }
            data.slug = body.slug.trim().toLowerCase();
        }

        const numericFields = [
            ["durationMinutes", 15, 120],
            ["capacity", 1, 1000],
            ["bufferBeforeMinutes", 0, 30],
            ["bufferAfterMinutes", 0, 30],
            ["minimumNoticeMinutes", 0, 525600],
            ["bookingHorizonDays", 1, 365],
        ] as const;

        for (const [field, min, max] of numericFields) {
            if (body[field] !== undefined) {
                const value = body[field];

                if (
                    typeof value !== "number" ||
                    !Number.isInteger(value) ||
                    value < min ||
                    value > max
                ) {
                    return NextResponse.json(
                        { error: `Invalid ${field}.` },
                        { status: 400 }
                    );
                }

                data[field] = value;
            }
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json(
                { error: "Provide at least one field to update." },
                { status: 400 }
            );
        }

        const updated = await prisma.eventType.update({
            where: { id },
            data,
        });

        return NextResponse.json({
            message: "Event type updated successfully.",
            event: updated,
        });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return NextResponse.json(
                { error: "An event with this slug already exists." },
                { status: 409 }
            );
        }

        console.error("Update event error:", error);

        return NextResponse.json(
            { error: "Unable to update event type." },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    context: Context
) {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        const { id } = await context.params;

        const event = await prisma.eventType.findFirst({
            where: {
                id,
                hostId: host.id,
            },
        });

        if (!event) {
            return NextResponse.json(
                { error: "Event type not found." },
                { status: 404 }
            );
        }

        const bookingCount = await prisma.booking.count({
            where: {
                eventTypeId: id,
            },
        });

        if (bookingCount > 0) {
            return NextResponse.json(
                {
                    error: "This event has booking history and cannot be deleted.",
                },
                { status: 409 }
            );
        }

        await prisma.eventType.delete({
            where: { id },
        });

        return NextResponse.json({
            message: "Event type deleted successfully.",
        });
    } catch (error) {
        console.error("Delete event error:", error);

        return NextResponse.json(
            { error: "Unable to delete event type." },
            { status: 500 }
        );
    }
}

