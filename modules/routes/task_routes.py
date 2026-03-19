from datetime import date, datetime, timedelta

from bson.objectid import ObjectId
from flask import Blueprint, jsonify, redirect, render_template, request, url_for
from flask_login import current_user, login_required
from modules.extensions import mongo

tasks_bp = Blueprint('tasks', __name__)


def _task_name(task):
    return task.get('name') if isinstance(task, dict) else task


def _parse_iso_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value), '%Y-%m-%d').date()
    except Exception:
        return None


def _is_task_scheduled_on(task, task_set, day):
    if isinstance(task, dict):
        start = _parse_iso_date(task.get('start_date'))
        end = _parse_iso_date(task.get('end_date'))
        weekdays = task.get('weekdays') if isinstance(task.get('weekdays'), list) else [0, 1, 2, 3, 4, 5, 6]
    else:
        start = None
        end = None
        weekdays = [0, 1, 2, 3, 4, 5, 6]

    if not start:
        created_at = task_set.get('created_at')
        if isinstance(created_at, datetime):
            start = created_at.date()
    if not start:
        start = day

    if day < start:
        return False
    if end and day > end:
        return False

    return day.weekday() in set(int(d) for d in weekdays)


def _normalize_tasks(tasks):
    normalized = []
    for task in tasks:
        if isinstance(task, str):
            normalized.append({
                'name': task,
                'start_date': None,
                'end_date': None,
                'weekdays': [0, 1, 2, 3, 4],
            })
        else:
            normalized.append({
                'name': task.get('name', '').strip(),
                'start_date': task.get('start_date'),
                'end_date': task.get('end_date'),
                'weekdays': task.get('weekdays', [0, 1, 2, 3, 4]),
            })
    return [t for t in normalized if t['name']]


def _compute_task_set_dates(task_set):
    start_dates = []
    end_dates = []
    for task in task_set.get('tasks', []):
        if isinstance(task, dict):
            if task.get('start_date'):
                start_dates.append(task['start_date'])
            if task.get('end_date'):
                end_dates.append(task['end_date'])
    task_set['start_date'] = min(start_dates) if start_dates else None
    task_set['end_date'] = max(end_dates) if end_dates else None


def _task_set_period_start(task_set, fallback_day):
    starts = []
    for task in task_set.get('tasks', []):
        if isinstance(task, dict):
            parsed = _parse_iso_date(task.get('start_date'))
            if parsed:
                starts.append(parsed)
    return min(starts) if starts else fallback_day


def _backfill_missed_logs(task_set_id, task_set):
    """Auto-mark past scheduled but unmarked tasks as incomplete (missed)."""
    today = date.today()
    start_day = _task_set_period_start(task_set, today)
    end_limit = today - timedelta(days=1)
    if start_day > end_limit:
        return

    existing_logs = list(mongo.db.task_logs.find({'task_set_id': task_set_id, 'user_id': current_user.id}))
    logs_by_date = {l.get('date'): l for l in existing_logs if l.get('date')}

    d = start_day
    while d <= end_limit:
        day_iso = d.isoformat()
        scheduled_task_names = []
        for task in task_set.get('tasks', []):
            name = _task_name(task)
            if name and _is_task_scheduled_on(task, task_set, d):
                scheduled_task_names.append(name)

        if not scheduled_task_names:
            d += timedelta(days=1)
            continue

        existing = logs_by_date.get(day_iso)
        statuses = dict(existing.get('statuses', {})) if existing else {}
        changed = False

        for task_name in scheduled_task_names:
            if statuses.get(task_name) in (None, '', 'none'):
                statuses[task_name] = 'incomplete'
                changed = True

        if changed:
            strike = 1 if all(statuses.get(t) == 'completed' for t in scheduled_task_names) else 0
            log_data = {
                'task_set_id': task_set_id,
                'user_id': current_user.id,
                'date': day_iso,
                'statuses': statuses,
                'note': existing.get('note', '') if existing else '',
                'strike': strike,
                'updated_at': datetime.utcnow(),
            }
            if existing:
                mongo.db.task_logs.update_one({'_id': existing['_id']}, {'$set': log_data})
            else:
                mongo.db.task_logs.insert_one(log_data)

        d += timedelta(days=1)


@tasks_bp.route('/home')
@login_required
def home():
    task_sets = list(mongo.db.task_sets.find({'user_id': current_user.id}))
    for ts in task_sets:
        ts['_id'] = str(ts['_id'])
        _compute_task_set_dates(ts)
    return render_template('home.html', task_sets=task_sets, username=current_user.username)


@tasks_bp.route('/api/task-sets', methods=['POST'])
@login_required
def create_task_set():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    tasks = _normalize_tasks(data.get('tasks', []))

    if not name or not tasks:
        return jsonify({'success': False, 'message': 'Name and tasks are required'})

    task_set_id = mongo.db.task_sets.insert_one({
        'user_id': current_user.id,
        'name': name,
        'tasks': tasks,
        'created_at': datetime.utcnow(),
    }).inserted_id

    return jsonify({'success': True, 'id': str(task_set_id)})


@tasks_bp.route('/api/task-sets', methods=['GET'])
@login_required
def get_task_sets():
    task_sets = list(mongo.db.task_sets.find({'user_id': current_user.id}))
    for ts in task_sets:
        ts['_id'] = str(ts['_id'])
        _compute_task_set_dates(ts)
    return jsonify(task_sets)


@tasks_bp.route('/api/task-sets/<task_set_id>', methods=['GET'])
@login_required
def get_task_set(task_set_id):
    ts = mongo.db.task_sets.find_one({'_id': ObjectId(task_set_id), 'user_id': current_user.id})
    if not ts:
        return jsonify({'error': 'Not found'}), 404
    ts['_id'] = str(ts['_id'])
    _compute_task_set_dates(ts)
    return jsonify(ts)


@tasks_bp.route('/api/task-sets/<task_set_id>', methods=['PUT'])
@login_required
def update_task_set(task_set_id):
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    tasks = _normalize_tasks(data.get('tasks', []))

    if not name or not tasks:
        return jsonify({'success': False, 'message': 'Name and tasks are required'})

    result = mongo.db.task_sets.update_one(
        {'_id': ObjectId(task_set_id), 'user_id': current_user.id},
        {
            '$set': {
                'name': name,
                'tasks': tasks,
                'updated_at': datetime.utcnow(),
            }
        },
    )

    if result.matched_count == 0:
        return jsonify({'success': False, 'message': 'Task set not found'})

    return jsonify({'success': True})


@tasks_bp.route('/api/task-sets/<task_set_id>', methods=['DELETE'])
@login_required
def delete_task_set(task_set_id):
    mongo.db.task_sets.delete_one({'_id': ObjectId(task_set_id), 'user_id': current_user.id})
    mongo.db.task_logs.delete_many({'task_set_id': task_set_id, 'user_id': current_user.id})
    return jsonify({'success': True})


@tasks_bp.route('/tracker/<task_set_id>')
@login_required
def tracker(task_set_id):
    ts = mongo.db.task_sets.find_one({'_id': ObjectId(task_set_id), 'user_id': current_user.id})
    if not ts:
        return redirect(url_for('tasks.home'))
    ts['_id'] = str(ts['_id'])
    _compute_task_set_dates(ts)
    return render_template('tracker.html', task_set=ts)


@tasks_bp.route('/api/logs/<task_set_id>', methods=['GET'])
@login_required
def get_logs(task_set_id):
    ts = mongo.db.task_sets.find_one({'_id': ObjectId(task_set_id), 'user_id': current_user.id})
    if not ts:
        return jsonify({'error': 'Not found'}), 404

    _backfill_missed_logs(task_set_id, ts)

    logs = list(mongo.db.task_logs.find({'task_set_id': task_set_id, 'user_id': current_user.id}))
    for log in logs:
        log['_id'] = str(log['_id'])
    return jsonify(logs)


@tasks_bp.route('/api/logs', methods=['POST'])
@login_required
def save_log():
    data = request.get_json() or {}
    task_set_id = data.get('task_set_id')
    log_date = data.get('date')
    statuses = data.get('statuses', {})
    note = data.get('note', '')

    if not task_set_id or not log_date:
        return jsonify({'success': False, 'message': 'task_set_id and date are required'}), 400

    existing = mongo.db.task_logs.find_one({
        'task_set_id': task_set_id,
        'user_id': current_user.id,
        'date': log_date,
    })

    ts = mongo.db.task_sets.find_one({'_id': ObjectId(task_set_id), 'user_id': current_user.id})
    if not ts:
        return jsonify({'success': False, 'message': 'Task set not found'}), 404

    day = _parse_iso_date(log_date)
    scheduled_task_names = []
    for task in ts.get('tasks', []):
        name = _task_name(task)
        if not name:
            continue
        if day and _is_task_scheduled_on(task, ts, day):
            scheduled_task_names.append(name)

    # If a past day is saved with unmarked tasks, treat them as missed.
    if day and day < date.today():
        for task_name in scheduled_task_names:
            if statuses.get(task_name) in (None, '', 'none'):
                statuses[task_name] = 'incomplete'

    all_done = bool(scheduled_task_names) and all(statuses.get(t, 'incomplete') == 'completed' for t in scheduled_task_names)
    strike = 1 if all_done else 0

    log_data = {
        'task_set_id': task_set_id,
        'user_id': current_user.id,
        'date': log_date,
        'statuses': statuses,
        'note': note,
        'strike': strike,
        'updated_at': datetime.utcnow(),
    }

    if existing:
        mongo.db.task_logs.update_one({'_id': existing['_id']}, {'$set': log_data})
    else:
        mongo.db.task_logs.insert_one(log_data)

    return jsonify({'success': True, 'strike': strike})
