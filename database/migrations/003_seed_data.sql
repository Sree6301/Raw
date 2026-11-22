-- ==============================================================================
-- SMART XEROX HUB - SEED DATA FOR HP SMART TANK 589 & SHOP SETUP
-- ==============================================================================

-- 1. Hardware Devices Seed (HP Smart Tank 589)
INSERT INTO printer_devices (
    id, name, model, connection_type, port_or_address, driver_name, 
    status, is_default, active_queue_name, supports_color, supports_a4, supports_4x6
) VALUES 
(
    '00000000-0000-0000-0000-000000000001',
    'HP Smart Tank 580-590 series (USB)',
    'HP Smart Tank 589',
    'USB',
    'USB001',
    'Microsoft IPP Class Driver',
    'ONLINE',
    TRUE,
    'HP Smart Tank 580-590 series',
    TRUE,
    TRUE,
    TRUE
),
(
    '00000000-0000-0000-0000-000000000002',
    'HP Smart Tank 580-590 series (Wi-Fi)',
    'HP Smart Tank 589',
    'WIFI',
    'WSD-2101c964-4c10-4c6b-a4b4-fbb5c652032a',
    'Microsoft IPP Class Driver',
    'ONLINE',
    FALSE,
    'HP Smart Tank 580-590 series [5C4AE8]',
    TRUE,
    TRUE,
    TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 2. Paper Inventory Profiles
INSERT INTO paper_inventory (
    id, paper_type, display_name, sheet_width_mm, sheet_height_mm, 
    is_currently_loaded, estimated_sheets_remaining, min_threshold_alert
) VALUES
(
    '10000000-0000-0000-0000-000000000001',
    'NORMAL_A4',
    'Normal Plain Paper A4 (75-80 GSM)',
    210.0,
    297.0,
    TRUE,
    450,
    50
),
(
    '10000000-0000-0000-0000-000000000002',
    'PHOTO_A4',
    'Glossy Photo Paper A4 (180-200 GSM)',
    210.0,
    297.0,
    FALSE,
    80,
    15
),
(
    '10000000-0000-0000-0000-000000000003',
    'PHOTO_4X6',
    'Glossy Photo Paper 4x6 inch (101.6 x 152.4 mm)',
    101.6,
    152.4,
    FALSE,
    120,
    20
)
ON CONFLICT (paper_type) DO UPDATE SET
    sheet_width_mm = EXCLUDED.sheet_width_mm,
    sheet_height_mm = EXCLUDED.sheet_height_mm;

-- 3. Shop Pricing Configuration
INSERT INTO system_settings (key, value, description)
VALUES 
(
    'shop_pricing',
    '{
        "a4BwSingleSideRate": 2.00,
        "a4BwDoubleSideRate": 3.00,
        "a4ColorSingleSideRate": 10.00,
        "a4ColorDoubleSideRate": 18.00,
        "photoA4Rate": 40.00,
        "photo4x6Rate": 20.00,
        "scanPerPageRate": 10.00,
        "shopUpiId": "smartxerox@upi",
        "shopName": "SMART XEROX HUB"
    }'::jsonb,
    'Configurable pricing per print side, photo print, and scanner page'
),
(
    'shop_info',
    '{
        "shopName": "SMART XEROX HUB",
        "tagline": "Self-Service Smart Xerox, Photo Printing & Flatbed Scanning",
        "phone": "+91 98765 43210",
        "operatingHours": "8:30 AM - 9:30 PM",
        "address": "Opp. University Campus, Smart Street, Tech City",
        "permanentQrUrl": "https://smartxeroxhub.local"
    }'::jsonb,
    'Shop contact details and public signage configuration'
),
(
    'file_retention_policy',
    '{
        "guestDocumentRetentionHours": 24,
        "scannedFileRetentionHours": 48,
        "autoDeleteProcessedFiles": true
    }'::jsonb,
    'Privacy compliance and temporary storage cleanup rules'
)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value;
