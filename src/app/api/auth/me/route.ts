
import { NextResponse } from "next/server";
import { getAuthenticatedHost } from "@/app/lib/auth";

export async function GET() {
    try {
        const host = await getAuthenticatedHost();

        if (!host) {
            return NextResponse.json(
                { error: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        return NextResponse.json({ host });
    } catch (error) {
        console.error("Session verification error:", error);

        return NextResponse.json(
            { error: "Unable to verify session." },
            { status: 500 }
        );
    }
}
