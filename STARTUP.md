# PrintShare - Startup Procedures

## Prerequisites
- Python 3.8+
- Node.js 18+
- npm or pnpm
- SQLite (default) or PostgreSQL

---

## Initial Setup (First Time Only)

### 1. Backend Setup
```bash
cd Printout_sharing_with_auto_pay-main
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser  # optional: create admin user
```

### 2. Frontend Setup
```bash
cd frontend
npm install
```

### 3. Build Frontend for Production (served by Django)
```bash
cd frontend
npm run build
cd ..
python manage.py collectstatic --noinput
```

### 4. Run Django Server
```bash
python manage.py runserver
```
Access at: `http://127.0.0.1:8000/`

---

## Development Workflow

### Option A: Full Django (Frontend Built + Backend)
Best for: Testing production build, backend API changes, full integration.

```bash
# Terminal 1: Backend
cd Printout_sharing_with_auto_pay-main
venv\Scripts\activate
python manage.py runserver

# Terminal 2: Frontend (auto-rebuild on changes)
cd frontend
npm run build -- --watch
# OR run dev server separately (see Option B)
```

### Option B: Split Dev Servers (Recommended for Frontend Work)
Best for: Frontend development with hot reload.

```bash
# Terminal 1: Backend API
cd Printout_sharing_with_auto_pay-main
venv\Scripts\activate
python manage.py runserver

# Terminal 2: Frontend Dev Server (Vite HMR)
cd frontend
npm run dev
```
Access frontend at: `http://127.0.0.1:5173/` (proxies API to Django on 8000)

> **Note:** Configure Vite proxy in `vite.config.js` if needed:
> ```js
> server: {
>   proxy: {
>     '/api': 'http://127.0.0.1:8000'
>   }
> }
> ```

---

## After Frontend Changes

### If using Option B (Vite Dev Server)
- **Automatic:** Hot Module Replacement (HMR) updates browser instantly.
- **No rebuild needed.**

### If using Option A (Django serves built frontend)
```bash
cd frontend
npm run build
cd ..
python manage.py collectstatic --noinput
```
Then refresh browser (Ctrl+Shift+R for hard refresh).

---

## After Backend Changes

### Python Code Changes (views, models, urls, etc.)
```bash
# Terminal running Django: Ctrl+C to stop, then
python manage.py runserver
```
Django auto-reloads on `.py` file changes (default `runserver` behavior).

### Database Model Changes
```bash
python manage.py makemigrations
python manage.py migrate
```

### New Static Assets (images, fonts, etc. in `static_src/`)
```bash
python manage.py collectstatic --noinput
```

### New Dependencies
```bash
# Backend
pip install <package>
pip freeze > requirements.txt

# Frontend
cd frontend
npm install <package>
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Start backend | `python manage.py runserver` |
| Start frontend dev | `cd frontend && npm run dev` |
| Build frontend | `cd frontend && npm run build` |
| Collect static | `python manage.py collectstatic` |
| Run migrations | `python manage.py migrate` |
| Create migrations | `python manage.py makemigrations` |
| Create superuser | `python manage.py createsuperuser` |
| Install Python deps | `pip install -r requirements.txt` |
| Install Node deps | `cd frontend && npm install` |

---

## Project Structure

```
Printout_sharing_with_auto_pay-main/
├── frontend/              # React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/         # LoginPage.jsx, AdminPortalPage.jsx, etc.
│   │   ├── components/
│   │   └── context/
│   ├── package.json
│   └── vite.config.js
├── printshare/            # Django project settings
├── print-host/            # Django app
├── templates/
│   └── index.html         # Django template loading built assets
├── static_src/            # Collected static files (including built frontend)
├── manage.py
├── requirements.txt
└── db.sqlite3
```

---

## Environment Variables

Create `.env` in project root if needed:
```env
DEBUG=1
SECRET_KEY=your-secret-key
ALLOWED_HOSTS=127.0.0.1,localhost
DATABASE_URL=sqlite:///db.sqlite3
```

---

## Troubleshooting

- **Port 8000 in use:** `python manage.py runserver 8001`
- **Port 5173 in use:** Vite auto-picks next port
- **Static files 404:** Run `collectstatic` after build
- **Template shows old hashes:** Rebuild frontend + collectstatic, or use `django-vite`
- **CORS errors:** Check `CORS_ALLOWED_ORIGINS` in Django settings