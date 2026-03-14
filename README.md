# Daily Task Tracker (Flask + MongoDB)

A task tracking web app built with Flask, MongoDB, and Flask-Login.
It supports task sets, daily logging, streak tracking, and dashboards.

## Features

- User authentication (signup/login/logout)
- Task sets with per-task schedule (start date, end date, weekdays)
- Daily tracker with task status updates
- Auto-mark past unmarked scheduled tasks as missed
- Overall dashboard and task-set dashboard analytics
- Modular Flask structure with blueprints

## Project Structure

- `app.py` - startup entrypoint
- `modules/` - app factory, config, extensions, routes, models
- `templates/` - Jinja templates
- `static/` - CSS and JavaScript assets
- `requirements.txt` - Python dependencies
- `.env.example` - example environment variables

## Requirements

- Python 3.10+
- MongoDB connection URI

## Setup

1. Create and activate a virtual environment.

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

2. Install dependencies.

```powershell
pip install -r requirements.txt
```

3. Create a `.env` file from `.env.example` and set values.

Example `.env`:

```env
SECRET_KEY=change-this-secret
MONGO_URI=mongodb://localhost:27017/task_tracker
PORT=5000
FLASK_DEBUG=True
```

## Run

```powershell
python app.py
```

Open `http://127.0.0.1:5000` in your browser.

## Notes

- Keep secrets in `.env` only.
- `venv/` and `.env` are ignored by git via `.gitignore`.
