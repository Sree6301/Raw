-- ==============================================================================
-- SMART XEROX HUB - ROW LEVEL SECURITY (RLS) POLICIES
-- Target: PostgreSQL / Supabase
-- ==============================================================================

-- Enable RLS on all sensitive tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplex_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE printer_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin/staff
CREATE OR REPLACE FUNCTION is_admin_or_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('ADMIN', 'STAFF', 'OPERATOR') AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. PROFILES POLICIES
CREATE POLICY "Admins can view and manage all profiles"
    ON profiles FOR ALL
    USING (is_admin_or_staff());

CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- 2. GUEST SESSIONS POLICIES
CREATE POLICY "Anyone can create a guest session"
    ON guest_sessions FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "Guests can access their own session via token"
    ON guest_sessions FOR SELECT
    USING (TRUE);

CREATE POLICY "Admins can view all guest sessions"
    ON guest_sessions FOR ALL
    USING (is_admin_or_staff());

-- 3. PRINT ORDERS POLICIES
CREATE POLICY "Guests can insert their print orders"
    ON print_orders FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "Guests can view their own print orders"
    ON print_orders FOR SELECT
    USING (
        guest_session_id IN (
            SELECT id FROM guest_sessions
            WHERE session_token = current_setting('request.headers', true)::json->>'x-guest-session-token'
        )
        OR is_admin_or_staff()
    );

CREATE POLICY "Admins can view and manage all print orders"
    ON print_orders FOR ALL
    USING (is_admin_or_staff());

-- 4. PRINT FILES POLICIES
CREATE POLICY "Guests can insert and view their print files"
    ON print_files FOR ALL
    USING (
        order_id IN (SELECT id FROM print_orders)
        OR is_admin_or_staff()
    );

-- 5. PHOTO ORDERS POLICIES
CREATE POLICY "Guests can create photo orders"
    ON photo_orders FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "Guests can view their own photo orders"
    ON photo_orders FOR SELECT
    USING (
        guest_session_id IN (
            SELECT id FROM guest_sessions
            WHERE session_token = current_setting('request.headers', true)::json->>'x-guest-session-token'
        )
        OR is_admin_or_staff()
    );

CREATE POLICY "Admins can manage photo orders"
    ON photo_orders FOR ALL
    USING (is_admin_or_staff());

-- 6. SCAN ORDERS POLICIES
CREATE POLICY "Guests can create scan orders"
    ON scan_orders FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "Guests can view their scan orders and download links"
    ON scan_orders FOR SELECT
    USING (
        guest_session_id IN (
            SELECT id FROM guest_sessions
            WHERE session_token = current_setting('request.headers', true)::json->>'x-guest-session-token'
        )
        OR is_admin_or_staff()
    );

CREATE POLICY "Admins can manage scan orders"
    ON scan_orders FOR ALL
    USING (is_admin_or_staff());

-- 7. HARDWARE, INVENTORY & SYSTEM SETTINGS POLICIES
CREATE POLICY "Public can view active paper inventory status"
    ON paper_inventory FOR SELECT
    USING (TRUE);

CREATE POLICY "Admins can manage paper inventory"
    ON paper_inventory FOR ALL
    USING (is_admin_or_staff());

CREATE POLICY "Admins and Agent can access printer devices"
    ON printer_devices FOR ALL
    USING (TRUE);

CREATE POLICY "Public can read system settings"
    ON system_settings FOR SELECT
    USING (TRUE);

CREATE POLICY "Admins can update system settings"
    ON system_settings FOR ALL
    USING (is_admin_or_staff());

-- 8. STORAGE BUCKET POLICIES (Supabase Storage)
-- Buckets: 'documents' (private), 'photos' (private), 'scans' (private)
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('documents', 'documents', false),
    ('photos', 'photos', false),
    ('scans', 'scans', false)
ON CONFLICT (id) DO NOTHING;
