# Smart Xerox Hub Cloud Deployment Guide

## 1. Hosting Architecture Overview

Smart Xerox Hub web applications are fully compatible with modern static and serverless hosting providers (Vercel, Netlify, Cloudflare Pages, AWS Amplify).

```
Customer Web (Vercel)  ──┐
                         ├──► Supabase Cloud / Node.js API (Backend)
Admin Dashboard (Vercel) ┘          ▲
                                    │ Outbound HTTPS / WebSocket
                         Windows 11 Agent (Local Shop PC)
```

---

## 2. Deploying Customer Web & Admin Dashboard to Vercel

### Customer Web:
1. Root directory: `customer-web`
2. Build command: `npm run build`
3. Output directory: `dist`
4. Environment variables:
   ```env
   VITE_API_BASE_URL=https://api.yourshop.com
   VITE_SUPABASE_URL=https://xyzcompany.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

### Admin Dashboard:
1. Root directory: `admin-dashboard`
2. Build command: `npm run build`
3. Output directory: `dist`
4. Set up restricted custom domain (e.g. `admin.yourshop.com`).

---

## 3. Windows Agent Connectivity to Cloud Backend
In `windows-agent`, configure `appsettings.json` or Backend Base URL in `Core/BackendSync.cs`:
```csharp
string backendBaseUrl = "https://api.yourshop.com";
```
The Windows Agent connects outbound via HTTPS without needing static public IP addresses or port forwarding on the shop router.
