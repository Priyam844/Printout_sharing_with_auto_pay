# PrintShare - Two-Part Architecture Plan

## Overview
Split into two independent services communicating via REST API:

1. **Print Host** - Runs on machine connected to printer/Xerox; executes print jobs
2. **Customer Web App** - Public-facing site for customers to upload, configure, pay, and track orders

---

## Part 1: Print Host (Printer Server)

### Responsibilities
- Connect to physical printer/Xerox via USB/Network/IPP
- Poll central API for pending print jobs
- Execute print with exact settings (paper size, color/B&W, duplex, copies, page range)
- Report job status back (printing/printed/failed)
- Handle printer-specific features (staple, punch, tray selection)

### Tech Stack
- **Python 3.11+** (lightweight, no Django)
- **FastAPI** or **Flask** for local REST endpoint
- **pyipp** / **cups** / **pywin32** for printer communication
- **requests** / **httpx** for central API polling
- **systemd** / **NSSM** / **Windows Service** for daemon

### Components
```
print-host/
├── config.yaml              # Printer connection, API endpoint, polling interval
├── main.py                  # Entry point, service lifecycle
├── printer/
│   ├── __init__.py
│   ├── ipp_client.py        # IPP/CUPS printing
│   ├── windows_print.py     # Win32 spooler fallback
│   └── capabilities.py      # Query printer caps (paper sizes, color, duplex)
├── api_client.py            # Central API communication
├── job_processor.py         # Poll → fetch → print → report
├── models.py                # Local job queue (SQLite)
└── requirements.txt
```

### API Contract (Print Host → Central)
```
GET    /api/print-host/jobs/pending/     # Fetch next job (with settings)
POST   /api/print-host/jobs/{id}/status/ # Update: printing/printed/failed
GET    /api/print-host/printer/status/   # Report printer online/offline, toner, paper
```

### Print Settings Passed from Central
```json
{
  "job_id": "uuid",
  "file_url": "https://central/media/documents/...",
  "settings": {
    "paper_size": "A4|A3|Letter|Legal",
    "color_mode": "color|bw",
    "duplex": true|false,
    "copies": 1,
    "page_range": "1-5,7",
    "orientation": "portrait|landscape"
  }
}
```

---

## Part 2: Customer Web App (Central Platform)

### Responsibilities
- Customer-facing upload & configuration
- Payment (UPI QR) & order management
- Print job queue & status tracking
- Admin dashboard for print shop owner
- Communicates with Print Host(s) via API

### Tech Stack (Existing - Refactored)
- **Django 6.1 + DRF** - API & admin
- **React 19 + Vite** - SPA frontend
- **SQLite** → **PostgreSQL** (production)
- **Celery + Redis** - Async tasks (payment verify, host notifications)

### Updated Models
```python
# documents/models.py
class PrintHost(models.Model):
    name = CharField(max_length=100)
    api_url = URLField()                    # e.g. http://192.168.1.50:8001
    api_key = CharField(max_length=64)      # Auth for host→central
    is_active = BooleanField(default=True)
    last_seen = DateTimeField(null=True)
    capabilities = JSONField(default=dict)  # Cached printer caps

class Document(models.Model):
    # ... existing fields ...
    print_host = ForeignKey(PrintHost, null=True, on_delete=SET_NULL)
    # status: pending → paid → queued → printing → printed/failed

class PrintJob(models.Model):
    # ... existing ...
    host_job_id = CharField(max_length=100, blank=True)  # ID on print host
    started_at = DateTimeField(null=True)
    completed_at = DateTimeField(null=True)
```

### API Endpoints (Central)
```
# Customer-facing
POST   /api/documents/                    # Upload + create job
GET    /api/documents/                    # List my documents
GET    /api/documents/{id}/               # Detail + status
POST   /api/documents/{id}/verify_payment/
GET    /api/documents/{id}/qr_code/

# Print Host communication (authenticated with API key)
GET    /api/print-host/jobs/pending/?host_id=...
POST   /api/print-host/jobs/{id}/status/
POST   /api/print-host/printer/status/

# Admin
GET    /api/print-hosts/                  # List configured hosts
POST   /api/print-hosts/                  # Register new host
GET    /api/dashboard/stats/              # Revenue, queue, printer health
```

### Frontend Pages (Updated)
| Page | Changes |
|------|---------|
| Upload | Add "Select Print Location" dropdown (if multiple hosts) |
| Share/Payment | Unchanged |
| Success | Show assigned printer host, estimated ready time |
| Documents | Filter by location/host; real-time status via polling/SSE |
| Admin Dashboard | New: printer health, host management, job queue oversight |

---

## Communication Flow

```
Customer                          Central API                         Print Host
   │                                  │                                  │
   ├─ POST /documents/ ──────────────►│                                  │
   │   (file + settings)              │                                  │
   │                                  │                                  │
   │                                  │── Creates Document (status=pending)
   │                                  │                                  │
   ├─ POST /verify_payment/ ────────►│                                  │
   │   (UPI transaction)              │                                  │
   │                                  │── status=paid → queued
   │                                  │                                  │
   │                                  │                    ◄── Poll /jobs/pending/
   │                                  │                                  │
   │                                  │                    ──► Returns job + file_url + settings
   │                                  │                                  │
   │                                  │                    ──► Download file, print with settings
   │                                  │                                  │
   │                                  │                    ──► POST /jobs/{id}/status/ (printing)
   │                                  │                                  │
   │                                  │                    ──► POST /jobs/{id}/status/ (printed/failed)
   │                                  │                                  │
   │                                  │── Updates Document status, notifies customer
   │                                  │                                  │
   ├─ GET /documents/{id}/ (poll) ───►│                                  │
   │   Returns status=printed         │                                  │
   │                                  │                                  │
```

---

## Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUD / SERVER                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Nginx     │───►│   Django    │───►│  PostgreSQL │     │
│  │  (SSL,      │    │  (API +     │    │  (jobs,     │     │
│  │  static)    │    │   Admin)    │    │   hosts,    │     │
│  └─────────────┘    └─────────────┘    │   users)    │     │
│         │               │              └─────────────┘     │
│         │               │                    │              │
│         │               ▼                    │              │
│         │        ┌─────────────┐            │              │
│         │        │   Redis     │◄───────────┤              │
│         │        │  (Celery    │   API key  │              │
│         │        │   broker)   │   auth     │              │
│         └────────┴─────────────┴────────────┘              │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS + API Key
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  PRINT SHOP (Local Network)                 │
│  ┌─────────────────┐    USB/Network/IPP    ┌─────────────┐  │
│  │  Print Host     │◄──────────────────────►│  Xerox /    │  │
│  │  (FastAPI       │                        │  Printer    │  │
│  │   daemon)       │                        │             │  │
│  └─────────────────┘                        └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Migration Steps from Current Codebase

### Phase 1: Extract Print Host
1. Move `documents/print_service.py` → `print-host/printer/`
2. Create FastAPI app with polling logic
2. Add printer capability detection (paper sizes, duplex, color)
3. Package as standalone service with config file

### Phase 2: Refactor Central (Django)
1. Add `PrintHost` model + admin
2. Update `Document` with `print_host` FK
3. Modify `verify_payment` to assign host + set status=queued
4. Add host-authenticated endpoints (`/api/print-host/...`)
5. Add Celery task to notify host (or rely on host polling)

### Phase 3: Frontend Updates
1. Upload page: add host selector (if >1 active host)
2. Documents page: show host badge, real-time status
3. Admin: host management UI, printer health dashboard

### Phase 4: Deployment
1. Central on cloud VPS (Docker Compose: nginx + django + redis + postgres)
2. Print Host on shop PC (Windows service / systemd)
3. Configure firewall/VPN for host↔central communication

---

## Configuration Files

### Print Host (`print-host/config.yaml`)
```yaml
printer:
  connection: "ipp://192.168.1.100:631/printers/Xerox"  # or "auto" for USB
  # connection: "usb://Xerox/WorkCentre"                 # Windows USB fallback

central_api:
  base_url: "https://printshare.example.com/api"
  api_key: "host-secret-key-from-admin"
  poll_interval_seconds: 10

logging:
  level: "INFO"
  file: "print-host.log"
```

### Central (`printshare/settings.py` additions)
```python
PRINT_HOST_API_KEY_HEADER = "X-Print-Host-Key"
CELERY_BROKER_URL = "redis://localhost:6379/0"
CELERY_RESULT_BACKEND = "redis://localhost:6379/1"
```

---

## Security
- Print Host → Central: API key in header (`X-Print-Host-Key`)
- Central → Print Host: mTLS or VPN (host only accepts local/VPN)
- Customer data: HTTPS only, JWT auth for API
- File storage: S3-compatible (production) or local media (dev)

---

## Future Extensions
- Multiple print hosts per location (load balancing)
- Print job scheduling (print at specific time)
- Cost tracking per host/printer
- Customer notifications (SMS/Email/WhatsApp) on ready
- Mobile app for customers
- Print shop marketplace (multiple shops, customer chooses nearest)