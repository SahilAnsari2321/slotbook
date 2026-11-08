
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/app/lib/prisma";
import {
    createSessionToken,
    SESSION_COOKIE,
    SESSION_DURATION_SECONDS,
} from "@/app/lib/auth";

function safeCompare(value: string, expected: string): boolean {
    const valueBuffer = Buffer.from(value);
    const expectedBuffer = Buffer.from(expected);

    if (valueBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(valueBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const email =
            typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password =
            typeof body.password === "string" ? body.password : "";

        const configuredEmail = process.env.HOST_LOGIN_EMAIL?.toLowerCase();
        const configuredPassword = process.env.HOST_LOGIN_PASSWORD;

        if (!configuredEmail || !configuredPassword) {
            return NextResponse.json(
                { error: "Host login is not configured." },
                { status: 500 }
            );
        }

        if (
            !email ||
            !password ||
            !safeCompare(email, configuredEmail) ||
            !safeCompare(password, configuredPassword)
        ) {
            return NextResponse.json(
                { error: "Invalid email or password." },
                { status: 401 }
            );
        }

        const host = await prisma.host.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                name: true,
                slug: true,
            },
        });

        if (!host) {
            return NextResponse.json(
                { error: "Host account not found." },
                { status: 401 }
            );
        }

        const token = createSessionToken(host.id, host.email);

        const response = NextResponse.json({
            message: "Login successful.",
            host,
        });

        response.cookies.set({
            name: SESSION_COOKIE,
            value: token,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: SESSION_DURATION_SECONDS,
        });

        return response;
    } catch (error) {
        console.error("Host login error:", error);

        return NextResponse.json(
            { error: "Unable to log in." },
            { status: 500 }
        );
    }
}
