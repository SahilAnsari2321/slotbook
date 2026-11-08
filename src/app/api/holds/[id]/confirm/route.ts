
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@prisma/client";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

export async function POST(
    request: NextRequest,
    context: RouteContext
) {
    try {
        const { id } = await context.params;
        const body = await request.json();

        const { guestName, guestEmail } = body;

        if (
            typeof guestName !== "string" ||
            !guestName.trim() ||
            typeof guestEmail !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)
        ) {
            return NextResponse.json(
                { error: "A valid guest name and email are required." },
                { status: 400 }
            );
        }

        const result = await prisma.$transaction(
            async (tx: Prisma.TransactionClient) => {
                const rows = await tx.$queryRaw<{ id: string }[]>`
                    SELECT "id"
                    FROM "Booking"
                    WHERE "id" = ${id}::uuid
                    FOR UPDATE
                `;

                if (rows.length === 0) {
                    throw new Error("HOLD_NOT_FOUND");
                }

                const booking = await tx.booking.findUnique({
                    where: { id },
                });

                if (!booking) {
                    throw new Error("HOLD_NOT_FOUND");
                }

                if (booking.status === "CONFIRMED") {
                    throw new Error("ALREADY_CONFIRMED");
                }

                if (booking.status !== "HELD") {
                    throw new Error("HOLD_NOT_ACTIVE");
                }

                const now = new Date();

                if (!booking.holdExpiresAt || booking.holdExpiresAt <= now) {
                    await tx.booking.update({
                        where: { id },
                        data: {
                            status: "EXPIRED",
                        },
                    });

                    // Return instead of throwing, so the update commits.
                    return { expired: true as const };
                }

                const confirmedBooking = await tx.booking.update({
                    where: { id },
                    data: {
                        guestName: guestName.trim(),
                        guestEmail: guestEmail.trim().toLowerCase(),
                        status: "CONFIRMED",
                        holdExpiresAt: null,
                    },
                });

                await tx.notification.create({
                    data: {
                        bookingId: confirmedBooking.id,
                        type: "BOOKING_CONFIRMED",
                        payload: {
                            guestName: confirmedBooking.guestName,
                            guestEmail: confirmedBooking.guestEmail,
                            startAt: confirmedBooking.startAt.toISOString(),
                            endAt: confirmedBooking.endAt.toISOString(),
                        },
                    },
                });

                return {
                    expired: false as const,
                    booking: confirmedBooking,
                };
            }
        );

        // The transaction has committed before this response is returned.
        if (result.expired) {
            return NextResponse.json(
                { error: "This booking hold has expired." },
                { status: 409 }
            );
        }

        return NextResponse.json({
            message: "Booking confirmed successfully.",
            booking: {
                id: result.booking.id,
                guestName: result.booking.guestName,
                guestEmail: result.booking.guestEmail,
                startAt: result.booking.startAt.toISOString(),
                endAt: result.booking.endAt.toISOString(),
                status: result.booking.status,
                manageToken: result.booking.manageToken,
            },
        });
    } catch (error) {
        if (error instanceof Error) {
            const messages: Record<string, string> = {
                HOLD_NOT_FOUND: "Booking hold not found.",
                ALREADY_CONFIRMED: "This booking has already been confirmed.",
                HOLD_NOT_ACTIVE: "This hold is no longer active.",
            };

            if (messages[error.message]) {
                return NextResponse.json(
                    { error: messages[error.message] },
                    { status: 409 }
                );
            }
        }

        console.error("Booking confirmation failed:", error);

        return NextResponse.json(
            { error: "Unable to confirm booking." },
            { status: 500 }
        );
    }
}
