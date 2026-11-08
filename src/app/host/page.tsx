
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Booking = {
    id: string;
    guestName: string | null;
    guestEmail: string | null;
    startAt: string;
    endAt: string;
    eventName: string;
    durationMinutes: number;
    manageToken: string;
};

export default function HostDashboard() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reasons, setReasons] = useState<Record<string, string>>({});
    const [message, setMessage] = useState("");
    const [cancelling, setCancelling] = useState("");

    async function loadBookings() {
        try {
            setLoading(true);

            const response = await fetch("/api/host/bookings");
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Unable to load bookings.");
            }

            setBookings(data.bookings);
            setError("");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Something went wrong."
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadBookings();
    }, []);

    async function cancelBooking(token: string, id: string) {
        const reason = reasons[id]?.trim();

        if (!reason) {
            setMessage("Please enter a cancellation reason.");
            return;
        }

        if (!window.confirm("Are you sure you want to cancel this booking?")) {
            return;
        }

        try {
            setCancelling(id);
            setMessage("");

            const response = await fetch(`/api/bookings/${token}/cancel`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ reason }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Cancellation failed.");
            }

            setMessage("Booking cancelled successfully.");
            await loadBookings();
        } catch (err) {
            setMessage(
                err instanceof Error ? err.message : "Cancellation failed."
            );
        } finally {
            setCancelling("");
        }
    }

    const pageStyle: React.CSSProperties = {
        minHeight: "100vh",
        backgroundColor: "#f8fafc",
        color: "#111827",
        colorScheme: "light",
        fontFamily: "Arial, sans-serif",
        padding: "40px 20px",
        boxSizing: "border-box",
    };

    return (
        <main style={pageStyle}>
            <div style={{ maxWidth: "900px", margin: "0 auto" }}>
                <header style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "35px",
                    flexWrap: "wrap",
                    gap: "15px",
                }}>
                    <div>
                        <h1 style={{
                            fontSize: "30px",
                            margin: 0,
                            color: "#111827",
                        }}>
                            Host Dashboard
                        </h1>

                        <p style={{ color: "#64748b", marginTop: "8px" }}>
                            Manage your upcoming appointments.
                        </p>
                    </div>

                    <Link href="/" style={{
                        color: "#5138f5",
                        textDecoration: "none",
                        fontWeight: "600",
                    }}>
                        Home
                    </Link>
                </header>

                <div style={{
                    backgroundColor: "#ffffff",
                    padding: "24px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    marginBottom: "25px",
                }}>
                    <h2 style={{
                        fontSize: "21px",
                        color: "#111827",
                        margin: 0,
                    }}>
                        Upcoming Bookings ({bookings.length})
                    </h2>
                </div>

                {message && (
                    <p style={{
                        padding: "14px",
                        backgroundColor: "#eef2ff",
                        color: "#3730a3",
                        borderRadius: "8px",
                    }}>
                        {message}
                    </p>
                )}

                {loading && (
                    <p style={{ color: "#475569" }}>Loading bookings...</p>
                )}

                {error && (
                    <div style={{
                        padding: "18px",
                        backgroundColor: "#fff1f2",
                        color: "#be123c",
                        borderRadius: "10px",
                    }}>
                        <p>{error}</p>

                        {error === "Unauthorized" && (
                            <Link href="/host/login">Login as host</Link>
                        )}

                        <button
                            onClick={loadBookings}
                            style={{
                                padding: "9px 15px",
                                cursor: "pointer",
                            }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!loading && !error && bookings.length === 0 && (
                    <div style={{
                        backgroundColor: "#ffffff",
                        padding: "35px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        textAlign: "center",
                    }}>
                        <h3 style={{ color: "#111827" }}>
                            No upcoming bookings
                        </h3>
                        <p style={{ color: "#64748b" }}>
                            New confirmed appointments will appear here.
                        </p>
                    </div>
                )}

                {!loading && bookings.map((booking) => (
                    <section
                        key={booking.id}
                        style={{
                            backgroundColor: "#ffffff",
                            color: "#111827",
                            border: "1px solid #e2e8f0",
                            borderRadius: "12px",
                            padding: "24px",
                            marginBottom: "18px",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                        }}
                    >
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "10px",
                        }}>
                            <h3 style={{
                                color: "#111827",
                                fontSize: "19px",
                                margin: 0,
                            }}>
                                {booking.eventName}
                            </h3>

                            <span style={{
                                backgroundColor: "#dcfce7",
                                color: "#166534",
                                padding: "6px 12px",
                                borderRadius: "20px",
                                fontSize: "12px",
                                fontWeight: "bold",
                            }}>
                                CONFIRMED
                            </span>
                        </div>

                        <div style={{
                            marginTop: "18px",
                            lineHeight: "1.9",
                            color: "#334155",
                        }}>
                            <p>
                                <strong>Guest:</strong> {booking.guestName || "N/A"}
                            </p>
                            <p>
                                <strong>Email:</strong> {booking.guestEmail || "N/A"}
                            </p>
                            <p>
                                <strong>Date & Time:</strong>{" "}
                                {new Date(booking.startAt).toLocaleString()}
                            </p>
                            <p>
                                <strong>Duration:</strong> {booking.durationMinutes} minutes
                            </p>
                        </div>

                        <div style={{ marginTop: "18px" }}>
                            <label style={{
                                display: "block",
                                fontWeight: "600",
                                marginBottom: "8px",
                                color: "#111827",
                            }}>
                                Cancellation reason
                            </label>

                            <textarea
                                placeholder="Enter reason for cancelling this booking"
                                value={reasons[booking.id] || ""}
                                onChange={(e) =>
                                    setReasons((previous) => ({
                                        ...previous,
                                        [booking.id]: e.target.value,
                                    }))
                                }
                                style={{
                                    width: "100%",
                                    minHeight: "75px",
                                    padding: "12px",
                                    boxSizing: "border-box",
                                    borderRadius: "7px",
                                    border: "1px solid #cbd5e1",
                                    backgroundColor: "#ffffff",
                                    color: "#111827",
                                    colorScheme: "light",
                                    fontSize: "14px",
                                }}
                            />

                            <button
                                onClick={() =>
                                    cancelBooking(booking.manageToken, booking.id)
                                }
                                disabled={cancelling === booking.id}
                                style={{
                                    marginTop: "12px",
                                    padding: "11px 18px",
                                    backgroundColor: "#dc2626",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "7px",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                }}
                            >
                                {cancelling === booking.id
                                    ? "Cancelling..."
                                    : "Cancel Booking"}
                            </button>
                        </div>
                    </section>
                ))}
            </div>
        </main>
    );
}
