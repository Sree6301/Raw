-- ==============================================================================
-- SMART XEROX HUB - ENTERPRISE DATABASE SCHEMA (20 NORMALIZED TABLES)
-- Target: PostgreSQL 15+ / Supabase
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES (Admins, Staff, Operators)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'STAFF')),
    phone_number TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GUEST SESSIONS (Secure isolated walk-in customer sessions)
CREATE TABLE IF NOT EXISTS guest_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token TEXT UNIQUE NOT NULL, -- Cryptographically secure token
    customer_name TEXT,
    customer_phone TEXT,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_token ON guest_sessions(session_token);

-- 3. PRINTER DEVICES (Physical Printers connected via USB/Wi-Fi)
CREATE TABLE IF NOT EXISTS printer_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    model TEXT NOT NULL, -- e.g. "HP Smart Tank 580-590 series"
    connection_type TEXT NOT NULL CHECK (connection_type IN ('USB', 'WIFI')),
    port_or_address TEXT NOT NULL, -- e.g. "USB001" or "WSD-uuid..."
    driver_name TEXT NOT NULL,
    device_instance_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE', 'PRINTING', 'ERROR', 'PAPER_JAM', 'OUT_OF_PAPER')),
    is_default BOOLEAN DEFAULT FALSE,
    active_queue_name TEXT NOT NULL,
    supports_color BOOLEAN DEFAULT TRUE,
    supports_a4 BOOLEAN DEFAULT TRUE,
    supports_4x6 BOOLEAN DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. AGENT DEVICES (Windows 11 Client Host Computer)
CREATE TABLE IF NOT EXISTS agent_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_name TEXT NOT NULL,
    os_version TEXT NOT NULL,
    agent_version TEXT NOT NULL,
    auth_token_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE', 'BUSY')),
    active_printer_id UUID REFERENCES printer_devices(id) ON DELETE SET NULL,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PRINTER PROFILES (Hardware Calibration & Duplex feed orientation settings)
CREATE TABLE IF NOT EXISTS printer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    printer_id UUID REFERENCES printer_devices(id) ON DELETE CASCADE,
    feed_edge TEXT NOT NULL DEFAULT 'SHORT_EDGE_FIRST',
    print_side_orientation TEXT NOT NULL DEFAULT 'PRINT_SIDE_FACE_UP',
    reversal_method TEXT NOT NULL DEFAULT 'FLIP_HORIZONTAL',
    calibration_confirmed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PAPER INVENTORY (A4 Normal, A4 Photo, 4x6 Photo paper stocks)
CREATE TABLE IF NOT EXISTS paper_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_type TEXT NOT NULL UNIQUE CHECK (paper_type IN ('NORMAL_A4', 'PHOTO_A4', 'PHOTO_4X6')),
    display_name TEXT NOT NULL,
    sheet_width_mm NUMERIC NOT NULL,
    sheet_height_mm NUMERIC NOT NULL,
    is_currently_loaded BOOLEAN DEFAULT FALSE,
    estimated_sheets_remaining INT DEFAULT 500,
    min_threshold_alert INT DEFAULT 50,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. PRINT ORDERS (Document Xerox & Print Requests)
CREATE TABLE IF NOT EXISTS print_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL, -- e.g. "DOC-20261122-001"
    guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL DEFAULT 'DOCUMENT' CHECK (service_type IN ('DOCUMENT')),
    status TEXT NOT NULL CHECK (status IN (
        'SUBMITTED', 'PENDING_ADMIN_APPROVAL', 'REJECTED', 'APPROVED',
        'WAITING_FOR_PAPER', 'READY_TO_PRINT', 'FIRST_SIDE_PREPARATION',
        'FIRST_SIDE_PRINTING', 'WAITING_FOR_PHYSICAL_CONFIRMATION',
        'SECOND_SIDE_PRINTING', 'QUALITY_CHECK', 'COMPLETED', 'PAUSED',
        'FAILED', 'CANCELLED'
    )),
    copies INT NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 100),
    page_range TEXT NOT NULL DEFAULT 'ALL',
    paper_size TEXT NOT NULL DEFAULT 'A4' CHECK (paper_size IN ('A4')),
    paper_type TEXT NOT NULL DEFAULT 'NORMAL_A4' CHECK (paper_type IN ('NORMAL_A4')),
    color_mode TEXT NOT NULL DEFAULT 'BW' CHECK (color_mode IN ('BW', 'COLOR')),
    sides TEXT NOT NULL DEFAULT 'SINGLE' CHECK (sides IN ('SINGLE', 'MANUAL_DUPLEX')),
    calculated_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'CASH_CONFIRMED', 'UPI_CONFIRMED')),
    payment_reference TEXT,
    admin_notes TEXT,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_print_orders_status ON print_orders(status);
CREATE INDEX IF NOT EXISTS idx_print_orders_session ON print_orders(guest_session_id);

-- 8. PRINT FILES (Uploaded Document Assets with Secure Hash & Page Counts)
CREATE TABLE IF NOT EXISTS print_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES print_orders(id) ON DELETE CASCADE,
    original_file_name TEXT NOT NULL,
    file_path TEXT NOT NULL, -- Supabase Storage private path
    file_size_bytes BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    total_pages INT NOT NULL,
    checksum_sha256 TEXT,
    thumbnail_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. PRINT SETTINGS (Per-job driver & spooler settings)
CREATE TABLE IF NOT EXISTS print_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES print_orders(id) ON DELETE CASCADE,
    dpi INT NOT NULL DEFAULT 600,
    orientation TEXT NOT NULL DEFAULT 'PORTRAIT' CHECK (orientation IN ('PORTRAIT', 'LANDSCAPE')),
    media_tray TEXT NOT NULL DEFAULT 'MAIN_TRAY',
    quality TEXT NOT NULL DEFAULT 'NORMAL' CHECK (quality IN ('DRAFT', 'NORMAL', 'BEST')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. PRINT JOBS (Local Windows Agent Executable Job Queue)
CREATE TABLE IF NOT EXISTS print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES print_orders(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agent_devices(id) ON DELETE SET NULL,
    printer_id UUID REFERENCES printer_devices(id) ON DELETE SET NULL,
    windows_spooler_job_id INT,
    job_type TEXT NOT NULL CHECK (job_type IN ('SINGLE_PASS', 'DUPLEX_FIRST_SIDE', 'DUPLEX_SECOND_SIDE', 'PHOTO')),
    status TEXT NOT NULL CHECK (status IN ('QUEUED', 'SENDING_TO_SPOOLER', 'SPOOLING', 'PRINTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. DUPLEX JOBS (Manual Duplex Engine State Machine & Calibration Tracking)
CREATE TABLE IF NOT EXISTS duplex_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES print_orders(id) ON DELETE CASCADE,
    original_page_count INT NOT NULL,
    normalized_page_count INT NOT NULL, -- N' = N if even, N+1 if odd
    has_blank_page_inserted BOOLEAN NOT NULL DEFAULT FALSE,
    odd_pages_file_path TEXT, -- Ascending 1, 3, 5...
    reverse_even_pages_file_path TEXT, -- Descending N', N'-2, ... 2
    current_copy_index INT NOT NULL DEFAULT 1,
    total_copies INT NOT NULL DEFAULT 1,
    stage TEXT NOT NULL CHECK (stage IN (
        'AWAITING_APPROVAL', 'PREPARING_FIRST_SIDE', 'PRINTING_FIRST_SIDE',
        'FIRST_SIDE_COMPLETED', 'AWAITING_PAPER_REVERSAL', 'PAPER_REVERSAL_CONFIRMED',
        'PRINTING_SECOND_SIDE', 'SECOND_SIDE_COMPLETED', 'AWAITING_QUALITY_CHECK',
        'COMPLETED', 'ERROR_RECOVERY_PAUSED'
    )),
    first_side_completed_at TIMESTAMPTZ,
    physical_reversal_confirmed_at TIMESTAMPTZ,
    physical_reversal_confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    second_side_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. PHOTO ORDERS (Dedicated Photo Printing Engine Orders)
CREATE TABLE IF NOT EXISTS photo_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL, -- e.g. "PHO-20261122-001"
    guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN (
        'SUBMITTED', 'PENDING_ADMIN_APPROVAL', 'APPROVED',
        'WAITING_FOR_PHOTO_PAPER', 'PRINTING', 'COMPLETED',
        'FAILED', 'CANCELLED'
    )),
    paper_type TEXT NOT NULL CHECK (paper_type IN ('PHOTO_A4', 'PHOTO_4X6')),
    color_mode TEXT NOT NULL DEFAULT 'COLOR' CHECK (color_mode IN ('COLOR', 'BW')),
    copies INT NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 50),
    photos_per_sheet INT NOT NULL DEFAULT 1 CHECK (photos_per_sheet IN (1, 2, 4)),
    calculated_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'CASH_CONFIRMED', 'UPI_CONFIRMED')),
    payment_reference TEXT,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_photo_orders_session ON photo_orders(guest_session_id);

-- 13. PHOTO FILES (Uploaded Photo Assets with crop, orientation, fit mode)
CREATE TABLE IF NOT EXISTS photo_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_order_id UUID REFERENCES photo_orders(id) ON DELETE CASCADE,
    original_file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    fit_mode TEXT NOT NULL DEFAULT 'FIT' CHECK (fit_mode IN ('FIT', 'FILL', 'CROP')),
    rotation_degrees INT NOT NULL DEFAULT 0 CHECK (rotation_degrees IN (0, 90, 180, 270)),
    crop_x NUMERIC,
    crop_y NUMERIC,
    crop_width NUMERIC,
    crop_height NUMERIC,
    preview_thumbnail_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. SCAN ORDERS (Flatbed Scanner Requests)
CREATE TABLE IF NOT EXISTS scan_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL, -- e.g. "SCN-20261122-001"
    guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN (
        'SUBMITTED', 'PENDING_ADMIN_APPROVAL', 'APPROVED',
        'WAITING_FOR_DOCUMENT', 'SCANNER_READY', 'SCANNING',
        'REVIEWING_PAGES', 'GENERATING_FILE', 'UPLOADING',
        'DOWNLOAD_AVAILABLE', 'COMPLETED', 'FAILED', 'CANCELLED'
    )),
    format TEXT NOT NULL DEFAULT 'PDF' CHECK (format IN ('PDF', 'JPEG')),
    resolution INT NOT NULL DEFAULT 300 CHECK (resolution IN (150, 300, 600)),
    color_mode TEXT NOT NULL DEFAULT 'COLOR' CHECK (color_mode IN ('COLOR', 'GRAYSCALE')),
    requested_pages INT NOT NULL DEFAULT 1 CHECK (requested_pages >= 1 AND requested_pages <= 50),
    final_file_path TEXT,
    final_file_size_bytes BIGINT,
    calculated_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'CASH_CONFIRMED', 'UPI_CONFIRMED')),
    payment_reference TEXT,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'), -- Retention policy
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scan_orders_session ON scan_orders(guest_session_id);

-- 15. SCAN PAGES (Individual Flatbed Scanner captures before assembly)
CREATE TABLE IF NOT EXISTS scan_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_order_id UUID REFERENCES scan_orders(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    raw_image_path TEXT NOT NULL,
    rotation_degrees INT NOT NULL DEFAULT 0 CHECK (rotation_degrees IN (0, 90, 180, 270)),
    file_size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. JOB EVENTS (Fine-grained state transition history)
CREATE TABLE IF NOT EXISTS job_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID,
    service_type TEXT NOT NULL,
    event_type TEXT NOT NULL,
    from_state TEXT,
    to_state TEXT NOT NULL,
    triggered_by TEXT NOT NULL, -- e.g. "CUSTOMER", "ADMIN", "WINDOWS_AGENT", "SYSTEM"
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_events_order ON job_events(order_id);

-- 17. PAYMENTS (Cash & UPI Transaction Registry)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('DOCUMENT', 'PHOTO', 'SCAN')),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'UPI', 'ONLINE')),
    amount NUMERIC(10, 2) NOT NULL,
    upi_transaction_ref TEXT,
    is_verified_by_admin BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. NOTIFICATIONS (Real-time updates for customer and admin)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('GUEST', 'ADMIN', 'AGENT')),
    recipient_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. SYSTEM SETTINGS (Dynamic Shop Pricing & Configuration)
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. AUDIT LOGS (Security and Compliance Logs)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_resource TEXT NOT NULL,
    ip_address TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Enable updated_at auto-updating triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_print_orders_updated_at BEFORE UPDATE ON print_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_photo_orders_updated_at BEFORE UPDATE ON photo_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scan_orders_updated_at BEFORE UPDATE ON scan_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_duplex_jobs_updated_at BEFORE UPDATE ON duplex_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
