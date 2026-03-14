from datetime import date, datetime, timedelta

from bson.objectid import ObjectId
from flask import Blueprint, jsonify, redirect, render_template, url_for
from flask_login import current_user, login_required

from modules.extensions import mongo

dashboard_bp = Blueprint('dashboard', __name__)


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


def _task_start_date(task, task_set):
    if isinstance(task, dict):
        task_start = _parse_iso_date(task.get('start_date'))
        if task_start:
            return task_start
    created_at = task_set.get('created_at')
    if isinstance(created_at, datetime):
        return created_at.date()
    return date.today()


def _task_end_date(task):
    if isinstance(task, dict):
        return _parse_iso_date(task.get('end_date'))
    return None


def _task_weekdays(task):
    if isinstance(task, dict):
        weekdays = task.get('weekdays')
        if isinstance(weekdays, list) and weekdays:
            return set(int(d) for d in weekdays)
    return {0, 1, 2, 3, 4, 5, 6}


def _is_task_scheduled_on(task, task_set, day):
    start = _task_start_date(task, task_set)
    end = _task_end_date(task)
    if day < start:
        return False
    if end and day > end:
        return False
    weekdays = _task_weekdays(task)
    return day.weekday() in weekdays


def _log_map(logs):
    return {l.get('date'): l for l in logs if l.get('date')}


def _compute_day_counts(task_set, log_by_date, day):
    iso = day.isoformat()
    log = log_by_date.get(iso, {})
    statuses = log.get('statuses', {}) if isinstance(log, dict) else {}

    scheduled = 0
    completed = 0
    for task in task_set.get('tasks', []):
        task_label = _task_name(task)
        if not task_label:
            continue
        if _is_task_scheduled_on(task, task_set, day):
            scheduled += 1
            if statuses.get(task_label) == 'completed':
                completed += 1

    return scheduled, completed


def _task_set_period_start(task_set, fallback_day):
    starts = [_task_start_date(t, task_set) for t in task_set.get('tasks', [])]
    starts = [s for s in starts if s]
    return min(starts) if starts else fallback_day


def _task_set_period_end(task_set, fallback_day):
    ends = [_task_end_date(t) for t in task_set.get('tasks', [])]
    ends = [e for e in ends if e]
    return max(ends) if ends else fallback_day


def _has_scheduled_tasks_on(task_set, day):
    for task in task_set.get('tasks', []):
        if _task_name(task) and _is_task_scheduled_on(task, task_set, day):
            return True
    return False


def _backfill_missed_logs(task_set_id, task_set):
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
            label = _task_name(task)
            if label and _is_task_scheduled_on(task, task_set, d):
                scheduled_task_names.append(label)

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


def _streak_from_days(task_set, log_by_date, start_day, end_day):
    max_streak = 0
    current_streak = 0
    running = 0

    d = start_day
    while d <= end_day:
        scheduled, completed = _compute_day_counts(task_set, log_by_date, d)
        if scheduled > 0 and completed == scheduled:
            running += 1
            max_streak = max(max_streak, running)
        elif scheduled > 0:
            running = 0
        d += timedelta(days=1)

    d = end_day
    while d >= start_day:
        scheduled, completed = _compute_day_counts(task_set, log_by_date, d)
        if scheduled == 0:
            d -= timedelta(days=1)
            continue
        if completed == scheduled:
            current_streak += 1
            d -= timedelta(days=1)
            continue
        break

    return current_streak, max_streak


@dashboard_bp.route('/dashboard')
@login_required
def overall_dashboard():
    return render_template('overall_dashboard.html', username=current_user.username)


@dashboard_bp.route('/dashboard/<task_set_id>')
@login_required
def task_set_dashboard(task_set_id):
    ts = mongo.db.task_sets.find_one({'_id': ObjectId(task_set_id), 'user_id': current_user.id})
    if not ts:
        return redirect(url_for('dashboard.overall_dashboard'))
    ts['_id'] = str(ts['_id'])
    return render_template('task_set_dashboard.html', task_set=ts)


@dashboard_bp.route('/api/dashboard/overall', methods=['GET'])
@login_required
def get_overall_dashboard_data():
    task_sets = list(mongo.db.task_sets.find({'user_id': current_user.id}))
    if not task_sets:
        return jsonify({'task_sets': []})

    today = date.today()
    today_str = today.isoformat()
    summaries = []
    all_heatmap = {}
    all_daily_totals = {}
    all_active_days = set()
    all_future_active_days = set()
    best_day_scores = {i: [] for i in range(7)}

    total_completed_today = 0
    total_tasks_today = 0
    global_scheduled = 0
    global_completed = 0

    task_completion_rank = []

    ts_log_maps = {}
    overall_period_starts = []
    overall_period_ends = []

    for ts in task_sets:
        ts_id = str(ts['_id'])
        _backfill_missed_logs(ts_id, ts)
        task_names = [_task_name(t) for t in ts.get('tasks', []) if _task_name(t)]
        logs = list(mongo.db.task_logs.find({'task_set_id': ts_id, 'user_id': current_user.id}))

        log_by_date = _log_map(logs)
        ts_log_maps[ts_id] = log_by_date
        start_day = _task_set_period_start(ts, today)
        end_day = _task_set_period_end(ts, today)
        overall_period_starts.append(start_day)
        overall_period_ends.append(end_day)
        active_end = min(today, end_day)

        ts_scheduled = 0
        ts_completed = 0
        ts_active_days = 0
        ts_perfect_days = 0
        ts_heatmap = {}

        d = start_day
        while d <= active_end:
            scheduled, completed = _compute_day_counts(ts, log_by_date, d)
            if scheduled > 0:
                ts_active_days += 1
                all_active_days.add(d.isoformat())
                ts_scheduled += scheduled
                ts_completed += completed
                global_scheduled += scheduled
                global_completed += completed

                day_pct = round((completed / scheduled) * 100, 1)
                day_iso = d.isoformat()
                ts_heatmap[day_iso] = day_pct
                day_bucket = all_daily_totals.setdefault(day_iso, {'scheduled': 0, 'completed': 0})
                day_bucket['scheduled'] += scheduled
                day_bucket['completed'] += completed
                best_day_scores[d.weekday()].append(day_pct)

                if completed == scheduled:
                    ts_perfect_days += 1

            d += timedelta(days=1)

        if end_day > today:
            d = today + timedelta(days=1)
            while d <= end_day:
                if _has_scheduled_tasks_on(ts, d):
                    all_future_active_days.add(d.isoformat())
                d += timedelta(days=1)

        completion_pct = round((ts_completed / ts_scheduled * 100) if ts_scheduled > 0 else 0, 1)
        ts_total_days_in_period = 0
        d = start_day
        while d <= end_day:
            if _has_scheduled_tasks_on(ts, d):
                ts_total_days_in_period += 1
            d += timedelta(days=1)

        ts_missed_days = max(ts_active_days - ts_perfect_days, 0)
        ts_completed_pct_schedule = round((ts_perfect_days / ts_total_days_in_period * 100), 1) if ts_total_days_in_period else 0
        ts_missed_pct_schedule = round((ts_missed_days / ts_total_days_in_period * 100), 1) if ts_total_days_in_period else 0
        ts_progress_pct_schedule = round((ts_completed_pct_schedule + ts_missed_pct_schedule), 1)
        current_streak, max_streak = _streak_from_days(ts, log_by_date, start_day, today)

        today_scheduled, today_completed = _compute_day_counts(ts, log_by_date, today)
        total_completed_today += today_completed
        total_tasks_today += today_scheduled

        if task_names:
            for task in ts.get('tasks', []):
                t = _task_name(task)
                if not t:
                    continue
                t_scheduled = 0
                t_completed = 0
                d = start_day
                while d <= today:
                    if _is_task_scheduled_on(task, ts, d):
                        t_scheduled += 1
                        day_log = log_by_date.get(d.isoformat(), {})
                        if day_log.get('statuses', {}).get(t) == 'completed':
                            t_completed += 1
                    d += timedelta(days=1)
                if t_scheduled > 0:
                    task_completion_rank.append((f"{t} ({ts.get('name', 'Task Set')})", t_completed / t_scheduled))

        summaries.append({
            'id': ts_id,
            'name': ts.get('name', 'Untitled'),
            'task_count': len(task_names),
            'total_days': ts_active_days,
            'strike_days': ts_perfect_days,
            'completion_pct': completion_pct,
            'completed_pct_schedule': ts_completed_pct_schedule,
            'missed_pct_schedule': ts_missed_pct_schedule,
            'progress_pct_schedule': ts_progress_pct_schedule,
            'current_streak': current_streak,
            'max_streak': max_streak,
            'today_completed_tasks': today_completed,
            'today_total_tasks': today_scheduled,
        })

    for day_iso, totals in all_daily_totals.items():
        all_heatmap[day_iso] = round((totals['completed'] / totals['scheduled']) * 100, 1) if totals['scheduled'] else 0

    best_ts = max(summaries, key=lambda x: x['completion_pct']) if summaries else {'name': '-'}
    weak_ts = min(summaries, key=lambda x: x['completion_pct']) if summaries else {'name': '-'}

    current_overall_streak = max((ts['current_streak'] for ts in summaries), default=0)
    best_overall_streak = max((ts['max_streak'] for ts in summaries), default=0)

    productivity_score = round((global_completed / global_scheduled * 100), 1) if global_scheduled else 0

    weekday_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    weekday_avg = {
        i: (sum(scores) / len(scores) if scores else 0)
        for i, scores in best_day_scores.items()
    }
    best_day_idx = max(weekday_avg, key=weekday_avg.get)

    period_start = min(overall_period_starts).isoformat() if overall_period_starts else today_str
    period_end = max(overall_period_ends).isoformat() if overall_period_ends else today_str

    combined_schedule_by_day = {}
    for ts in task_sets:
        ts_id = str(ts['_id'])
        ts_start = _task_set_period_start(ts, today)
        ts_end = _task_set_period_end(ts, today)
        d = ts_start
        while d <= ts_end:
            scheduled, completed = _compute_day_counts(ts, ts_log_maps.get(ts_id, {}), d)
            if scheduled > 0:
                day_iso = d.isoformat()
                bucket = combined_schedule_by_day.setdefault(day_iso, {'scheduled': 0, 'completed': 0})
                bucket['scheduled'] += scheduled
                bucket['completed'] += completed
            d += timedelta(days=1)

    total_days_in_period = len(combined_schedule_by_day)
    total_days_completed = sum(1 for day_iso in combined_schedule_by_day.keys() if day_iso <= today_str)
    days_completed_pct = round((total_days_completed / total_days_in_period * 100), 1) if total_days_in_period else 0
    days_remaining = max(total_days_in_period - total_days_completed, 0)

    weekly_productivity = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        combined_scheduled = 0
        combined_completed = 0
        for ts in task_sets:
            ts_id = str(ts['_id'])
            day_log = ts_log_maps.get(ts_id, {}).get(day.isoformat(), {})
            statuses = day_log.get('statuses', {})
            for task in ts.get('tasks', []):
                label = _task_name(task)
                if not label:
                    continue
                if _is_task_scheduled_on(task, ts, day):
                    combined_scheduled += 1
                    if statuses.get(label) == 'completed':
                        combined_completed += 1
        pct = round((combined_completed / combined_scheduled) * 100, 1) if combined_scheduled else 0
        weekly_productivity.append({'label': day.strftime('%a'), 'productivity_pct': pct, 'date': day.isoformat()})

    sorted_task_rank = sorted(task_completion_rank, key=lambda x: x[1], reverse=True)
    most_consistent_task = sorted_task_rank[0][0] if sorted_task_rank else '-'
    most_missed_task = sorted_task_rank[-1][0] if sorted_task_rank else '-'

    return jsonify({
        'total_task_sets': len(task_sets),
        'task_sets': summaries,
        'current_overall_streak': current_overall_streak,
        'best_overall_streak': best_overall_streak,
        'productivity_score': productivity_score,
        'today_progress_pct': round((total_completed_today / total_tasks_today * 100), 1) if total_tasks_today else 0,
        'total_tasks_today': total_tasks_today,
        'completed_tasks_today': total_completed_today,
        'remaining_tasks_today': max(total_tasks_today - total_completed_today, 0),
        'best_performing_task_set': best_ts['name'],
        'weakest_task_set': weak_ts['name'],
        'most_consistent_task_set': best_ts['name'],
        'most_missed_task_set': weak_ts['name'],
        'most_consistent_task': most_consistent_task,
        'most_missed_task': most_missed_task,
        'period_start': period_start,
        'period_end': period_end,
        'total_days_tracked': total_days_in_period,
        'total_days_completed': total_days_completed,
        'days_completed_pct': days_completed_pct,
        'days_remaining': days_remaining,
        'best_day_of_week': weekday_names[best_day_idx],
        'best_day_of_week_score': round(weekday_avg[best_day_idx], 1),
        'longest_missed_streak': 0,
        'heatmap': all_heatmap,
        'weekly_productivity': weekly_productivity,
    })


@dashboard_bp.route('/api/dashboard/<task_set_id>', methods=['GET'])
@login_required
def get_task_set_dashboard_data(task_set_id):
    ts = mongo.db.task_sets.find_one({'_id': ObjectId(task_set_id), 'user_id': current_user.id})
    if not ts:
        return jsonify({'error': 'Not found'}), 404

    _backfill_missed_logs(task_set_id, ts)
    logs = list(mongo.db.task_logs.find({'task_set_id': task_set_id, 'user_id': current_user.id}))
    log_by_date = _log_map(logs)
    task_names = [_task_name(t) for t in ts.get('tasks', []) if _task_name(t)]
    today = date.today()
    start_day = _task_set_period_start(ts, today)
    end_day = _task_set_period_end(ts, today)
    active_end = min(today, end_day)

    task_stats = {}
    for t in task_names:
        task_obj = next((x for x in ts.get('tasks', []) if _task_name(x) == t), None)
        completed = 0
        partial = 0
        total = 0
        streak = 0
        max_streak = 0
        max_missed_streak = 0
        missed_streak = 0
        missed_days = 0

        d = start_day
        while d <= end_day:
            if task_obj and _is_task_scheduled_on(task_obj, ts, d):
                total += 1
                if d <= active_end:
                    status = log_by_date.get(d.isoformat(), {}).get('statuses', {}).get(t, 'none')
                    is_missed = status == 'incomplete' or (d < today and status in (None, '', 'none'))

                    if status == 'completed':
                        completed += 1
                        streak += 1
                        max_streak = max(max_streak, streak)
                        missed_streak = 0
                    else:
                        if status == 'partial':
                            partial += 1
                        if is_missed:
                            missed_days += 1
                            missed_streak += 1
                            max_missed_streak = max(max_missed_streak, missed_streak)
                        else:
                            missed_streak = 0
                        streak = 0
            d += timedelta(days=1)

        completed_pct = round((completed / total * 100) if total > 0 else 0, 1)
        missed_pct = round((missed_days / total * 100) if total > 0 else 0, 1)
        progress_pct = round((completed_pct + missed_pct), 1)

        task_stats[t] = {
            'completed': completed,
            'partial': partial,
            'missed_days': missed_days,
            'total': total,
            'completion_pct': completed_pct,
            'completed_pct_schedule': completed_pct,
            'missed_pct_schedule': missed_pct,
            'progress_pct_schedule': progress_pct,
            'current_streak': streak,
            'max_streak': max_streak,
            'max_missed_streak': max_missed_streak,
        }

    total_days_past = 0
    strike_days = 0
    total_scheduled = 0
    total_completed = 0
    heatmap = {}

    weekday_scores = {i: [] for i in range(7)}

    d = start_day
    while d <= active_end:
        scheduled, completed = _compute_day_counts(ts, log_by_date, d)
        if scheduled > 0:
            total_days_past += 1
            total_scheduled += scheduled
            total_completed += completed
            day_pct = round((completed / scheduled) * 100, 1)
            heatmap[d.isoformat()] = day_pct
            weekday_scores[d.weekday()].append(day_pct)
            if completed == scheduled:
                strike_days += 1
        d += timedelta(days=1)

    total_days_in_period = 0
    d = start_day
    while d <= end_day:
        if _has_scheduled_tasks_on(ts, d):
            total_days_in_period += 1
        d += timedelta(days=1)

    total_days_completed = total_days_past
    remaining_active_days = max(total_days_in_period - total_days_completed, 0)
    total_days_completed_pct = round((total_days_completed / total_days_in_period * 100), 1) if total_days_in_period else 0

    overall_pct = round((total_completed / total_scheduled * 100), 1) if total_scheduled else 0
    current_overall_streak, max_overall_streak = _streak_from_days(ts, log_by_date, start_day, today)

    today_scheduled, today_completed = _compute_day_counts(ts, log_by_date, today)

    most_consistent_task = max(task_stats.items(), key=lambda x: x[1]['completion_pct'])[0] if task_stats else '-'
    most_missed_task = min(task_stats.items(), key=lambda x: x[1]['completion_pct'])[0] if task_stats else '-'

    period_start = start_day.isoformat()
    period_end = end_day.isoformat()

    recent_logs = sorted(logs, key=lambda x: x['date'], reverse=True)[:10]
    recent_logs = sorted(recent_logs, key=lambda x: x['date'])

    today_total_tasks = today_scheduled
    today_progress_pct = round((today_completed / today_total_tasks * 100), 1) if today_total_tasks else 0

    weekly_productivity = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        scheduled, completed = _compute_day_counts(ts, log_by_date, day)
        pct = round((completed / scheduled) * 100, 1) if scheduled else 0
        weekly_productivity.append({'label': day.strftime('%a'), 'productivity_pct': pct, 'date': day.isoformat()})

    weekday_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    weekday_avg = {i: (sum(v) / len(v) if v else 0) for i, v in weekday_scores.items()}
    best_day_idx = max(weekday_avg, key=weekday_avg.get) if weekday_avg else 0

    return jsonify({
        'name': ts.get('name', 'Untitled'),
        'tasks': task_names,
        'task_stats': task_stats,
        'total_days': total_days_past,
        'total_days_in_period': total_days_in_period,
        'strike_days': strike_days,
        'overall_pct': overall_pct,
        'heatmap': heatmap,
        'current_streak': current_overall_streak,
        'max_streak': max_overall_streak,
        'productivity_score': overall_pct,
        'today_progress_pct': today_progress_pct,
        'today_total_tasks': today_total_tasks,
        'today_completed_tasks': today_completed,
        'today_remaining_tasks': max(today_total_tasks - today_completed, 0),
        'most_consistent_task': most_consistent_task,
        'most_missed_task': most_missed_task,
        'period_start': period_start,
        'period_end': period_end,
        'total_days_completed_pct': total_days_completed_pct,
        'total_days_completed': total_days_completed,
        'total_days_remaining': remaining_active_days,
        'best_day_of_week': weekday_names[best_day_idx],
        'best_day_of_week_score': round(weekday_avg.get(best_day_idx, 0), 1),
        'longest_missed_streak': 0,
        'weekly_productivity': weekly_productivity,
        'recent_logs': [
            {
                'date': l.get('date'),
                'statuses': l.get('statuses', {}),
                'strike': l.get('strike', 0),
                'note': l.get('note', ''),
                'productivity_pct': round(
                    (
                        sum(
                            1 if l.get('statuses', {}).get(t) == 'completed' else 0
                            for t in task_names
                        )
                        / len(task_names)
                        * 100
                    )
                    if task_names else 0,
                    1,
                ),
            }
            for l in recent_logs
        ],
    })
