
"use client";

import { useEffect, useMemo, useState } from "react";

type Slot = {
    startAt: string;
    endAt: string;
    startLocal: string;
    endLocal: string;
    availableSpots: number;
};

type SlotsResponse = {
    host: string;
    event: string;
    hostTimeZone: string;
    guestTimeZone: string;
    slots: Slot[];
    error?: string;
};

type HoldResponse = {
    holdId?: string;
    expiresAt?: string | null;
    error?: string;
};

type ConfirmationResponse = {
    message?: string;
    error?: string;
    booking?: {
        id: string;
        guestName: string;
        guestEmail: string;
        startAt: string;
        endAt: string;
        status: string;
        manageToken: string;
    };
};

export default function BookingClient({
    host,
    slug,
}: {
    host: string;
    slug: string;
}) {
    const [data, setData] = useState<SlotsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

    const [hold, setHold] = useState<HoldResponse | null>(null);
    const [guestName, setGuestName] = useState("");
    const [guestEmail, setGuestEmail] = useState("");
    const [holding, setHolding] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [holdError, setHoldError] = useState("");
    const [confirmation, setConfirmation] =
        useState<ConfirmationResponse["booking"] | null>(null);

    const guestTimeZone = useMemo(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
        []
    );

    useEffect(() => {
        async function loadSlots() {
            try {
                setLoading(true);
                setError("");

                const from = new Date();
                const to = new Date(from);
                to.setDate(to.getDate() + 30);

                const query = new URLSearchParams({
                    from: from.toISOString(),
                    to: to.toISOString(),
                    tz: guestTimeZone,
                });

                const response = await fetch(
                    `/api/hosts/${encodeURIComponent(host)}/events/${encodeURIComponent(slug)}/slots?${query}`
                );

                const result: SlotsResponse = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || "Unable to load available slots.");
                }

                setData(result);

                const firstDate = result.slots[0]?.startLocal.split(" ")[0];
                if (firstDate) setSelectedDate(firstDate);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong.");
            } finally {
                setLoading(false);
            }
        }

        loadSlots();
    }, [host, slug, guestTimeZone]);

    const availableDates = useMemo(
        () =>
            Array.from(
                new Set(data?.slots.map((slot) => slot.startLocal.split(" ")[0]) || [])
            ),
        [data]
    );

    const selectedSlots =
        data?.slots.filter(
            (slot) => slot.startLocal.split(" ")[0] === selectedDate
        ) || [];

    async function createHold() {
        if (!selectedSlot) return;

        try {
            setHolding(true);
            setHoldError("");

            const response = await fetch("/api/holds", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": crypto.randomUUID(),
                },
                body: JSON.stringify({
                    hostSlug: host,
                    eventSlug: slug,
                    startAt: selectedSlot.startAt,
                }),
            });

            const result: HoldResponse = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Unable to reserve this time.");
            }

            setHold(result);
        } catch (err) {
            setHoldError(err instanceof Error ? err.message : "Unable to create hold.");
        } finally {
            setHolding(false);
        }
    }

    async function confirmBooking(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!hold?.holdId) return;

        try {
            setConfirming(true);
            setHoldError("");

            const response = await fetch(
                `/api/holds/${encodeURIComponent(hold.holdId)}/confirm`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        guestName,
                        guestEmail,
                    }),
                }
            );

            const result: ConfirmationResponse = await response.json();

            if (!response.ok || !result.booking) {
                throw new Error(result.error || "Unable to confirm booking.");
            }

            setConfirmation(result.booking);
        } catch (err) {
            setHoldError(
                err instanceof Error ? err.message : "Unable to confirm booking."
            );
        } finally {
            setConfirming(false);
        }
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-50 p-10 text-center">
                Loading available appointments...
            </main>
        );
    }

    if (error) {
        return (
            <main className="min-h-screen bg-slate-50 p-10 text-center text-red-600">
                {error}
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900">
            <div className="mx-auto max-w-3xl">
                <a href="/" className="text-2xl font-bold text-indigo-600">
                    slotbook.
                </a>

                <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-9">
                    {confirmation ? (
                        <div className="py-8">
                            <h1 className="text-3xl font-bold text-green-700">
                                Booking confirmed!
                            </h1>

                            <p className="mt-3 text-slate-600">
                                Thank you, {confirmation.guestName}. Your appointment is confirmed.
                            </p>

                            <div className="mt-6 rounded-xl bg-slate-50 p-5">
                                <p><strong>Event:</strong> {data?.event}</p>
                                <p className="mt-2">
                                    <strong>Date and time:</strong>{" "}
                                    {new Date(confirmation.startAt).toLocaleString()}
                                </p>
                                <p className="mt-2">
                                    <strong>Email:</strong> {confirmation.guestEmail}
                                </p>
                                <p className="mt-2">
                                    <strong>Status:</strong> {confirmation.status}
                                </p>
                            </div>

                            <a
                                href={`/bookings/${confirmation.manageToken}`}
                                className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700"
                            >
                                Manage your booking
                            </a>

                            <p className="mt-4 break-all text-xs text-slate-500">
                                Keep this private link safe. Anyone with it can manage your booking.
                            </p>
                        </div>
                    ) : hold ? (
                        <div className="py-5">
                            <h1 className="text-2xl font-bold">Complete your booking</h1>

                            <p className="mt-2 text-slate-600">
                                Your selected time is temporarily reserved for five minutes.
                            </p>

                            <div className="mt-5 rounded-lg bg-indigo-50 p-4 text-sm">
                                <p>
                                    <strong>Selected time:</strong>{" "}
                                    {selectedSlot
                                        ? new Date(selectedSlot.startAt).toLocaleString()
                                        : ""}
                                </p>
                                <p className="mt-2">
                                    <strong>Hold expires:</strong>{" "}
                                    {hold.expiresAt
                                        ? new Date(hold.expiresAt).toLocaleTimeString()
                                        : "In five minutes"}
                                </p>
                            </div>

                            <form onSubmit={confirmBooking} className="mt-7 space-y-5">
                                <div>
                                    <label className="mb-2 block text-sm font-medium">
                                        Your name
                                    </label>
                                    <input
                                        required
                                        maxLength={100}
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                        className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-indigo-600"
                                        placeholder="Enter your full name"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium">
                                        Email address
                                    </label>
                                    <input
                                        required
                                        type="email"
                                        value={guestEmail}
                                        onChange={(e) => setGuestEmail(e.target.value)}
                                        className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-indigo-600"
                                        placeholder="you@example.com"
                                    />
                                </div>

                                {holdError && (
                                    <p className="text-sm text-red-600">{holdError}</p>
                                )}

                                <button
                                    type="submit"
                                    disabled={confirming}
                                    className="w-full rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {confirming ? "Confirming..." : "Confirm booking"}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm font-semibold text-indigo-600">
                                BOOK AN APPOINTMENT
                            </p>

                            <h1 className="mt-2 text-3xl font-bold">{data?.event}</h1>
                            <p className="mt-2 text-slate-600">Hosted by {data?.host}</p>

                            <div className="mt-7 rounded-lg bg-slate-50 p-4 text-sm">
                                <p><strong>Host timezone:</strong> {data?.hostTimeZone}</p>
                                <p className="mt-1"><strong>Your timezone:</strong> {guestTimeZone}</p>
                            </div>

                            <h2 className="mt-8 text-lg font-semibold">Select a date</h2>

                            {availableDates.length === 0 ? (
                                <p className="mt-4 rounded-lg bg-amber-50 p-4 text-amber-800">
                                    No appointments are available in the next 30 days.
                                </p>
                            ) : (
                                <>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {availableDates.map((date) => (
                                            <button
                                                key={date}
                                                onClick={() => {
                                                    setSelectedDate(date);
                                                    setSelectedSlot(null);
                                                }}
                                                className={`rounded-lg border px-4 py-3 text-sm font-medium ${selectedDate === date
                                                        ? "border-indigo-600 bg-indigo-600 text-white"
                                                        : "border-slate-200 bg-white hover:border-indigo-400"
                                                    }`}
                                            >
                                                {new Date(`${date}T12:00:00`).toLocaleDateString(
                                                    undefined,
                                                    { weekday: "short", month: "short", day: "numeric" }
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    <h2 className="mt-8 text-lg font-semibold">Available times</h2>

                                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                        {selectedSlots.map((slot) => (
                                            <button
                                                key={slot.startAt}
                                                onClick={() => setSelectedSlot(slot)}
                                                className={`rounded-lg border px-4 py-3 text-sm font-semibold ${selectedSlot?.startAt === slot.startAt
                                                        ? "border-indigo-600 bg-indigo-600 text-white"
                                                        : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                    }`}
                                            >
                                                {new Date(slot.startAt).toLocaleTimeString(undefined, {
                                                    hour: "numeric",
                                                    minute: "2-digit",
                                                })}
                                                {slug === "group-session" && (
                                                    <span className="block text-xs font-normal">
                                                        {slot.availableSpots} spots left
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    {selectedSlot && (
                                        <div className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50 p-5">
                                            <h3 className="font-semibold">Your selected time</h3>
                                            <p className="mt-2 text-sm">
                                                {new Date(selectedSlot.startAt).toLocaleString()}
                                            </p>

                                            <button
                                                onClick={createHold}
                                                disabled={holding}
                                                className="mt-5 w-full rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                            >
                                                {holding ? "Reserving..." : "Reserve this time"}
                                            </button>

                                            {holdError && (
                                                <p className="mt-3 text-sm text-red-600">{holdError}</p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </section>
            </div>
        </main>
    );
}
