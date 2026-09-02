# Fortune Market (ෆෝචුන් වෙළඳපොළ)

A Sri Lankan online marketplace connecting home-based producers and small businesses directly with buyers. Features full bilingual support in Sinhala and English.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Database:** SQLite (Prisma ORM)
- **Auth:** NextAuth.js (JWT + Credentials)

## Features

- **Multi-role system** — Buyers, Producers, and Admins with role-based access
- **Producer verification** — 4-step onboarding with admin approval workflow
- **Bilingual UI** — Sinhala (default) and English with bilingual database fields
- **Product marketplace** — Search, filter by category, sort, pagination
- **Special offers** — Time-limited discounts with countdown timers
- **Purchase-gated reviews** — Only verified buyers can leave reviews
- **Content moderation** — Product reporting, admin flag/unflag system
- **Shopping cart** — Client-side (localStorage) with server-side stock validation
- **Order tracking** — Status lifecycle: Pending → Confirmed → Processing → Shipped → Delivered

## Getting Started

```bash
# Install dependencies
npm install

# Initialize database
npm run db:generate
npm run db:push
npm run db:seed

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Demo Accounts

All passwords: `password123`

| Role | Email |
|------|-------|
| Buyer | `buyer@fortune.lk` |
| Producer (Approved) | `kamal@fortune.lk` |
| Producer (Approved) | `nimali@fortune.lk` |
| Producer (Pending) | `sunil@fortune.lk` |
| Admin | `admin@fortune.lk` |

## Database Scripts

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database
npm run db:seed       # Seed demo data
npm run db:reset      # Reset and reseed database
```

## Project Structure

```
src/
├── app/
│   ├── (marketplace)/   # Public routes (home, search, cart, checkout, orders, offers)
│   ├── api/             # REST API endpoints
│   ├── auth/            # Login, signup, OTP verification
│   ├── producer/        # Producer onboarding and dashboard
│   └── admin/           # Admin panel
├── components/          # React components
├── i18n/                # Translation files (si.json, en.json)
├── lib/                 # Utilities, auth config, i18n helper
├── types/               # TypeScript type definitions
└── middleware.ts         # Route protection by role
```

## User Roles

- **Buyer** — Browse, search, purchase, leave reviews, report products
- **Producer** — Manage products, create offers, view orders (requires admin approval)
- **Admin** — Approve producers, moderate content, view platform analytics

## Environment Variables

See `.env.example` for required configuration:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```
