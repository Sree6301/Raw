# Smart Xerox Hub - System Architecture Specification

## 1. High-Level Architectural Model

Smart Xerox Hub operates on a 4-tier distributed architecture:

```
[ Customer (Mobile Browser) ]
           │
           │ HTTPS (Guest Session Token)
           ▼
[ Cloud / Local Backend Server (Node.js/Express + Supabase PostgreSQL) ]
           ▲
           │ Authenticated Outbound Polling & WebSockets
           ▼
[ Windows 11 Desktop Agent (C# / .NET 8 WPF & Worker Service) ]
           │
           ├── Windows Print Spooler (winspool.drv / System.Drawing.Printing)
           │     └── HP Smart Tank 589 (USB001 or Wi-Fi WSD)
           │
           └── Windows Image Acquisition (WIA COM Interop)
                 └── HP Smart Tank 589 Flatbed Scanner Glass
```

---

## 2. Core Architectural Principles

1. **Customer Controls the Request**:
   - Guests scan a permanent counter QR code.
   - Zero account registration needed: a cryptographically secure 24-byte hex token is generated and stored in browser `localStorage`.
   - Guest session isolation: customers can only view and track orders matching their unique session token.

2. **Admin Controls the Physical Operation**:
   - Every submitted document, photo, or scan order lands in the Admin Dashboard queue.
   - The admin checks the request, confirms appropriate paper stock (A4 Plain, A4 Photo, or 4×6 Photo) is physically loaded into the feed tray, and approves the job.

3. **Windows Agent Controls the Hardware**:
   - Runs locally on the Windows 11 computer connected to the HP Smart Tank 589.
   - Communicates outbound to backend via HTTPS and WebSockets.
   - Never exposes an inbound public HTTP server.
   - Interacts with physical hardware via official HP drivers, Windows Spooler API, and WIA 2.0.

4. **Backend Controls the Data & Workflow**:
   - 20 normalized PostgreSQL tables.
   - Enforces strict state machines for document xerox, manual duplex, photo printing, and flatbed scanning.
   - Manages temporary file lifecycle and data retention compliance.

---

## 3. Manual Duplex Mathematical Engine

Because the HP Smart Tank 589 does not have automatic duplex hardware, Smart Xerox Hub implements a dedicated mathematical duplex engine:

1. Let $N$ be the total page count of the uploaded document.
2. If $N$ is odd, a blank page is automatically appended: $N' = N + 1$. If $N$ is even: $N' = N$.
3. **Pass 1 (Odd Pages)**:
   $$\text{Pages} = 1, 3, 5, \dots, N' - 1 \quad (\text{Ascending})$$
4. **Physical Reversal Step**:
   The admin removes the printed stack from the output tray, flips it horizontally without shuffling, and reinserts it into the rear feed tray.
5. **Pass 2 (Even Pages in Reverse)**:
   $$\text{Pages} = N', N'-2, N'-4, \dots, 2 \quad (\text{Descending})$$

### Multi-Copy Duplex Guarantee:
Multiple copies are sequenced strictly **one physical copy at a time** (Copy 1 Side 1 $\rightarrow$ Reversal $\rightarrow$ Copy 1 Side 2 $\rightarrow$ Complete $\rightarrow$ Copy 2 Side 1 ...). This prevents collation errors and paper wastage.

---

## 4. Hardware Discovery & Queue Arbitration

The HP Smart Tank 589 exposes two communication ports on Windows 11:
- **USB**: Port `USB001`, Hardware ID `USB\VID_03F0&PID_4454`
- **Wi-Fi**: Port `WSD-2101c964-4c10-4c6b-a4b4-fbb5c652032a`

`DeviceManager.cs` automatically detects both queues and sets the **USB connection as active default** for maximum physical throughput and zero network dropouts, while allowing instant hot-switching to Wi-Fi via the System Tray menu.
