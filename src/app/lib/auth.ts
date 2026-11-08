
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";

export const SESSION_COOKIE = "slotbook_session";
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

export type SessionPayload = {
    hostId: string;
    email: string;
    expiresAt: number;
};

function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;

    if (!secret || secret.length < 32) {
        throw new Error("SESSION_SECRET must be at least 32 characters.");
    }

    return secret;
}

export function createSessionToken(
    hostId: string,
    email: string
): string {
    const payload: SessionPayload = {
        hostId,
        email,
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
    };

    const encodedPayload = Buffer
        .from(JSON.stringify(payload))
        .toString("base64url");

    const signature = createHmac("sha256", getSessionSecret())
        .update(encodedPayload)
        .digest("base64url");

    return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(
    token: string
): SessionPayload | null {
    try {
        const [encodedPayload, suppliedSignature] = token.split(".");

        if (!encodedPayload || !suppliedSignature) {
            return null;
        }

        const expectedSignature = createHmac("sha256", getSessionSecret())
            .update(encodedPayload)
            .digest();

        const actualSignature = Buffer.from(suppliedSignature, "base64url");

        if (
            actualSignature.length !== expectedSignature.length ||
            !timingSafeEqual(actualSignature, expectedSignature)
        ) {
            return null;
        }

        const payload = JSON.parse(
            Buffer.from(encodedPayload, "base64url").toString("utf8")
        ) as SessionPayload;

        if (
            typeof payload.hostId !== "string" ||
            typeof payload.email !== "string" ||
            typeof payload.expiresAt !== "number" ||
            payload.expiresAt <= Math.floor(Date.now() / 1000)
        ) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}
export async function getAuthenticatedHost() {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token) {
        return null;
    }

    const session = verifySessionToken(token);

    if (!session) {
        return null;
    }

    const host = await prisma.host.findUnique({
        where: { id: session.hostId },
        select: {
            id: true,
            name: true,
            email: true,
            slug: true,
            timezone: true,
        },
    });

    if (!host || host.email !== session.email) {
        return null;
    }

    return host;
}