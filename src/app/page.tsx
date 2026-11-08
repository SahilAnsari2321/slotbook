
import Link from "next/link";

const events = [
  {
    name: "Quick Meeting",
    slug: "quick-meeting",
    duration: "30 minutes",
    description: "A focused one-on-one meeting with our host.",
    capacity: "1 guest",
  },
  {
    name: "Group Session",
    slug: "group-session",
    duration: "60 minutes",
    description: "Join a shared session with other participants.",
    capacity: "Up to 5 guests",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5 md:px-16">
        <Link href="/" className="text-2xl font-bold tracking-tight text-indigo-600">
          slotbook<span className="text-slate-900">.</span>
        </Link>

        <Link
          href="/host/login"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold hover:bg-slate-50"
        >
          Host Login
        </Link>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-20 text-center md:py-28">
        <div className="mb-5 inline-block rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700">
          Simple scheduling. No double bookings.
        </div>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          Your time matters.
          <span className="block text-indigo-600">Book it effortlessly.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-slate-600">
          Choose a convenient time, book your appointment, and let Slotbook
          take care of the scheduling.
        </p>

        <a
          href="#events"
          className="mt-9 inline-block rounded-lg bg-indigo-600 px-7 py-3.5 font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          Explore available sessions
        </a>
      </section>

      <section id="events" className="mx-auto max-w-5xl px-6 pb-24">
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
            Available events
          </p>
          <h2 className="mt-2 text-3xl font-bold">Choose your session</h2>
          <p className="mt-2 text-slate-600">
            Select an event to view available appointment times.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {events.map((event) => (
            <article
              key={event.slug}
              className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  {event.duration}
                </span>
                <span className="text-sm text-slate-500">
                  {event.capacity}
                </span>
              </div>

              <h3 className="text-2xl font-bold">{event.name}</h3>

              <p className="mt-3 min-h-12 leading-6 text-slate-600">
                {event.description}
              </p>

              <Link
                href={`/demo/${event.slug}`}
                className="mt-7 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-indigo-600"
              >
                View available times →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-6 py-7 text-center text-sm text-slate-500">
        © 2026 Slotbook. Simple and reliable scheduling.
      </footer>
    </main>
  );
}
