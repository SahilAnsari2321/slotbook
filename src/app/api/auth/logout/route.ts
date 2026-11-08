
import { NextResponse } from "next/server";
import {
    SESSION_COOKIE,
} from "@/app/lib/auth";

export async function POST() {
    const response = NextResponse.json({
        message: "Logged out successfully.",
    });

    response.cookies.set({
        name: SESSION_COOKIE,
        value: "",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
    });

    return response;
}
