# PrintShare - Document Printing & Sharing Platform

A full-stack web application for document upload, sharing, and automated printing with payment integration.

## Features

- **Customer Upload Portal**: Drag-and-drop document upload with print settings
- **Admin Dashboard**: Manage documents, view print jobs, configure store settings
- **Auto Printing**: Background service (`print-host`) monitors and prints queued documents
- **Payment Integration**: UPI QR code generation for automatic payments
- **Secure Authentication**: JWT-based auth with role separation (admin/customer)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, Tailwind CSS, React Router |
| Backend | Django 5, Django REST Framework |
| Database | SQLite (dev), PostgreSQL (prod) |
| Print Service | Python `print-host` (IPP/Windows Print) |
| Auth | JWT (djangorestframework-simplejwt) |

## Project Structure

```
Printout_sharing_with_auto_pay-main/
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── pages/            # LoginPage, AdminPortalPage, UploadPage, etc.
│   │   ├── components/       # Reusable UI components
│   │   ├── context/          # AuthContext, ToastContext
│   │   └── hooks/            # Custom React hooks
│   ├── package.json
│   └── vite.config.js
├── printshare/               # Django project settings
├── documents/                # Main Django app (models, views, API)
├── print-host/               # Background print service (Windows/Linux)
├── templates/                # Django template (serves React build)
├── static_src/               # Collected static files (incl. built frontend)
├── manage.py
├── requirements.txt
└── STARTUP.md                # Detailed startup procedures
```

## Quick Start

### Prerequisites
- Python 3.8+
- Node.js 18+
- Git

### 1. Clone & Setup Backend
```bash
git clone https://github.com/Priyam844/Printout_sharing_with_auto_pay.git
cd Printout_sharing_with_auto_pay
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
```

### 2. Setup Frontend
```bash
cd frontend
npm install
npm run build
cd ..
python manage.py collectstatic --noinput
```

### 3. Run
```bash
# Terminal 1: Django server
python manage.py runserver

# Terminal 2 (optional): Print host service
cd print-host
pip install -r requirements.txt
python main.py
```

Access at `http://127.0.0.1:8000/`

## Development

### Split Dev Servers (Recommended)
```bash
# Terminal 1: Backend API
python manage.py runserver

# Terminal 2: Frontend with HMR
cd frontend && npm run dev
```
Frontend at `http://127.0.0.1:5173/` (proxies `/api` to Django)

### After Frontend Changes
- **Dev server**: Auto-reload via Vite HMR
- **Django-served**: `cd frontend && npm run build && python manage.py collectstatic`

### After Backend Changes
- Django auto-reloads on `.py` changes
- Models: `python manage.py makemigrations && python manage.py migrate`

## Environment Variables

Create `.env` in project root:
```env
DEBUG=1
SECRET_KEY=your-secret-key
ALLOWED_HOSTS=127.0.0.1,localhost
DATABASE_URL=sqlite:///db.sqlite3
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login/` | Obtain JWT token |
| `POST /api/auth/refresh/` | Refresh JWT token |
| `GET /api/documents/` | List documents (admin) |
| `POST /api/documents/` | Upload document (customer) |
| `GET /api/store/settings/` | Get store configuration |
| `POST /api/store/settings/` | Update store settings |

## Print Host Service

The `print-host/` service runs independently:
- Polls Django API for pending print jobs
- Supports IPP (network printers) and Windows Print API
- Configure via `print-host/config.yaml`

```bash
cd print-host
pip install -r requirements.txt
python main.py
```

## Deployment Notes

1. Set `DEBUG=False` in production
2. Use PostgreSQL instead of SQLite
3. Serve static files via nginx/whitenoise
4. Run print-host as systemd service (Linux) or Windows Service
5. Configure HTTPS and secure `SECRET_KEY`

## License

MIT