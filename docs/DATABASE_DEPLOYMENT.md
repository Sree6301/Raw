# Smart Xerox Hub Database Deployment Guide

## 1. PostgreSQL & Supabase Prerequisites
Smart Xerox Hub requires PostgreSQL 15+ or a Supabase cloud project.

Required extensions:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

---

## 2. Running Schema Migrations

Run migrations in numeric order:

1. `database/schema.sql` (Creates all 20 normalized tables, foreign keys, triggers)
2. `database/migrations/002_rls_policies.sql` (Enables Row Level Security and guest session isolation policies)
3. `database/migrations/003_seed_data.sql` (Populates HP Smart Tank 589 devices, paper inventory profiles, and shop pricing)

### Executing via Supabase CLI:
```bash
supabase db push
# or run via Supabase SQL Editor:
# Copy contents of database/schema.sql, 002_rls_policies.sql, and 003_seed_data.sql
```

---

## 3. Storage Bucket Configuration
Create 3 private storage buckets in the Supabase Dashboard:
- `documents` (Private, max file size: 50MB, allowed MIME: `application/pdf`)
- `photos` (Private, max file size: 25MB, allowed MIME: `image/jpeg`, `image/png`)
- `scans` (Private, max file size: 50MB, allowed MIME: `application/pdf`, `image/jpeg`)
