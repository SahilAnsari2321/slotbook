
# Slotbook

Slotbook is a full-stack appointment booking application built with Next.js, TypeScript, PostgreSQL and Prisma.

Hosts can publish their availability, create event types and manage appointments. Guests can book, confirm, reschedule and cancel appointments without creating an account.

## Tech Stack

- Next.js 16
- TypeScript
- PostgreSQL 16
- Prisma ORM
- Docker and Docker Compose
- React

## Features

### Host
- Host authentication using secure session cookies
- Create and manage event types
- Configure weekly availability
- Configure date-specific availability overrides
- View upcoming confirmed bookings
- Cancel bookings with a reason

### Guest
- Public booking pages
- View available slots in browser timezone
- Five-minute booking holds
- Booking confirmation
- Private booking management links
- Reschedule and cancel bookings

### Reliability
- PostgreSQL as the source of truth
- Transaction-based booking protection
- Idempotent hold creation
- Booking expiration
- Capacity and buffer validation
- Minimum notice and booking horizon validation
- Notification event records

## Architecture

Next.js provides the frontend and API routes. Prisma connects the application to PostgreSQL.

PostgreSQL manages hosts, event types, availability, bookings and notification records.

## Run Locally

Requirements:
- Docker Desktop
- Node.js
- npm

1. Clone the repository.
2. Install dependencies:

   npm install

3. Create a `.env` file using `.env.example`.
4. Start PostgreSQL:

   docker compose up -d db

5. Start the application:

   npm run dev

Alternatively, start the application and database together:

   docker compose up --build

Open http://localhost:3000.

## Demo Login

Email: demo@slotbook.com

Password: SlotbookDemo@2026

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/hosts/{host}/events/{slug}/slots | Get available slots |
| POST | /api/holds | Create a booking hold |
| POST | /api/holds/{id}/confirm | Confirm booking |
| GET | /api/bookings/{token} | Get booking details |
| POST | /api/bookings/{token}/reschedule | Reschedule booking |
| POST | /api/bookings/{token}/cancel | Cancel booking |
| POST | /api/auth/login | Host login |
| GET | /api/host/bookings | Upcoming host bookings |

## Testing

- Booking concurrency tested against PostgreSQL.
- Capacity limits tested.
- Buffer overlap validation tested.
- Minimum notice and booking horizon tested.
- Idempotency tested.
- Hold expiration tested.
- Rescheduling and cancellation tested.

## Limitations

- Calendar synchronization is not implemented.
- Real email notifications are not configured.
- Payments are outside the current scope.
- Multi-host round-robin scheduling is not implemented.

## Security Note

The included demo credentials and environment configuration are for local development only. Use secure secrets and production authentication settings before deployment.
