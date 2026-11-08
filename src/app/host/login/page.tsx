
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function HostLogin() {
    const router = useRouter();

    const [email, setEmail] = useState("demo@slotbook.com");
    const [password, setPassword] = useState("SlotbookDemo@2026");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Login failed.");
            }

            router.push("/host");
            router.refresh();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to log in."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <main style={{
            maxWidth: "420px",
            margin: "80px auto",
            padding: "30px",
            border: "1px solid #dbe1ea",
            borderRadius: "14px",
            fontFamily: "Arial, sans-serif",
        }}>
            <Link href="/" style={{
                color: "#5138f5",
                textDecoration: "none",
            }}>
                ← Slotbook
            </Link>

            <h1 style={{ marginTop: "25px" }}>Host Login</h1>

            <p style={{ color: "#64748b" }}>
                Sign in to manage your appointments.
            </p>

            <form onSubmit={handleLogin}>
                <label>Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{
                        display: "block",
                        width: "100%",
                        padding: "12px",
                        margin: "8px 0 18px",
                        boxSizing: "border-box",
                        border: "1px solid #cbd5e1",
                        borderRadius: "7px",
                    }}
                />

                <label>Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{
                        display: "block",
                        width: "100%",
                        padding: "12px",
                        margin: "8px 0 20px",
                        boxSizing: "border-box",
                        border: "1px solid #cbd5e1",
                        borderRadius: "7px",
                    }}
                />

                {error && (
                    <p style={{ color: "red" }}>{error}</p>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        width: "100%",
                        padding: "13px",
                        background: "#5138f5",
                        color: "white",
                        border: "none",
                        borderRadius: "7px",
                        fontWeight: "bold",
                        cursor: "pointer",
                    }}
                >
                    {loading ? "Signing in..." : "Login"}
                </button>
            </form>

            <p style={{
                marginTop: "20px",
                fontSize: "13px",
                color: "#64748b",
            }}>
                Demo account: demo@slotbook.com
            </p>
        </main>
    );
}
