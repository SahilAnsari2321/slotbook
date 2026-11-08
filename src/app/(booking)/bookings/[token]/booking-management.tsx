
"use client";

import { useEffect, useState } from "react";

type BookingData = {
    id: string;
    guestName: string | null;
    guestEmail: string | null;
    startAt: string;
    endAt: string;
    status: string;
    cancelReason: string | null;
};

type EventData = {
    name: string;
    durationMinutes: number;
    hostName: string;
    hostTimeZone: string;
};

export default function BookingManagement({ token }: { token: string }) {
    const [booking, setBooking] = useState<BookingData | null>(null);
    const [event, setEvent] = useState<EventData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [newStart, setNewStart] = useState("");
    const [cancelReason, setCancelReason] = useState("");
    const [message, setMessage] = useState("");
    const [working, setWorking] = useState(false);

    async function loadBooking() {
        try {
            const response = await fetch(`/api/bookings/${encodeURIComponent(token)}`);
            const result = await response.json();

            if (!response.ok) throw new Error(result.error || "Unable to load booking.");

            setBooking(result.booking);
            setEvent(result.event);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadBooking();
    }, [token]);

    async function reschedule() {
        if (!newStart) {
            setMessage("Please select a new appointment time.");
            return;
        }

        try {
            setWorking(true);
            setMessage("");

            const response = await fetch(
                `/api/bookings/${encodeURIComponent(token)}/reschedule`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        startAt: new Date(newStart).toISOString(),
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok) throw new Error(result.error || "Rescheduling failed.");

            setMessage("Your booking has been rescheduled successfully.");
            setNewStart("");
            await loadBooking();
        } catch (err) {
            setMessage(err instanceof Error ? err.message : "Rescheduling failed.");
        } finally {
            setWorking(false);
        }
    }

    async function cancelBooking() {
        if (cancelReason.trim().length < 3) {
            setMessage("Please enter a cancellation reason (at least 3 characters).");
            return;
        }

        if (!window.confirm("Are you sure you want to cancel this booking?")) return;

        try {
            setWorking(true);
            setMessage("");

            const response = await fetch(
                `/api/bookings/${encodeURIComponent(token)}/cancel`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason: cancelReason }),
                }
            );

            const result = await response.json();

            if (!response.ok) throw new Error(result.error || "Cancellation failed.");

            setMessage("Your booking has been cancelled.");
            setCancelReason("");
            await loadBooking();
        } catch (err) {
            setMessage(err instanceof Error ? err.message : "Cancellation failed.");
        } finally {
            setWorking(false);
        }
    }

    if (loading) {
        return <main className="min-h-screen p-10 text-center">Loading booking...</main>;
    }

    if (error || !booking || !event) {
        return (
            <main className="min-h-screen bg-slate-50 p-10 text-center text-red-600">
                {error || "Booking not found."}
            </main>
        );
    }

    const isConfirmed = booking.status === "CONFIRMED";

    return (
        <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900">
            <div className="mx-auto max-w-2xl">
                <a href="/" className="text-2xl font-bold text-indigo-600">
                    slotbook.
                </a>

                <section className="mt-10 rounded-2xl border bg-white p-7 shadow-sm">
                    <h1 className="text-2xl font-bold">Manage your booking</h1>

                    <div className="mt-6 space-y-3 rounded-xl bg-slate-50 p-5">
                        <p><strong>Event:</strong> {event.name}</p>
                        <p><strong>Host:</strong> {event.hostName}</p>
                        <p><strong>Guest:</strong> {booking.guestName}</p>
                        <p><strong>Email:</strong> {booking.guestEmail}</p>
                        <p>
                            <strong>Date:</strong>{" "}
                            {new Date(booking.startAt).toLocaleString()}
                        </p>
                        <p><strong>Duration:</strong> {event.durationMinutes} minutes</p>
                        <p>
                            <strong>Status:</strong>{" "}
                            <span className={isConfirmed ? "text-green-700" : "text-red-600"}>
                                {booking.status}
                            </span>
                        </p>
                        {booking.cancelReason && (
                            <p><strong>Cancellation reason:</strong> {booking.cancelReason}</p>
                        )}
                    </div>

                    {message && (
                        <p className="mt-5 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800">
                            {message}
                        </p>
                    )}

                    {isConfirmed && (
                        <>
                            <div className="mt-8 border-t pt-6">
                                <h2 className="text-lg font-semibold">Reschedule appointment</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Select a new date and time.
                                </p>

                                <input
                                    type="datetime-local"
                                    value={newStart}
                                    onChange={(e) => setNewStart(e.target.value)}
                                    className="mt-4 w-full rounded-lg border px-4 py-3"
                                />

                                <button
                                    onClick={reschedule}
                                    disabled={working}
                                    className="mt-3 w-full rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
                                >
                                    Reschedule booking
                                </button>
                            </div>

                            <div className="mt-8 border-t pt-6">
                                <h2 className="text-lg font-semibold">Cancel appointment</h2>

                                <textarea
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    maxLength={500}
                                    placeholder="Enter your reason for cancellation"
                                    className="mt-4 w-full rounded-lg border px-4 py-3"
                                    rows={3}
                                />

                                <button
                                    onClick={cancelBooking}
                                    disabled={working}
                                    className="mt-3 w-full rounded-lg bg-red-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
                                >
                                    Cancel booking
                                </button>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </main>
    );
}
