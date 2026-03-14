const TASK_SET_ID = document.body.dataset.taskSetId;
let TASK_SET = null;
let TASKS = [];
const TODAY = new Date().toISOString().split('T')[0];
const STATUSES = ['none', 'completed', 'partial', 'incomplete'];
const STATUS_ICONS = { none: '', completed: '✅', partial: '🔶', incomplete: '❌' };
const STATUS_LABELS = { none: '—', completed: 'Done', partial: 'Partial', incomplete: 'Missed' };
const STRIKE_EMOJIS = { 0: '', 1: '🔥', 3: '⚡', 7: '💫', 14: '🌟', 30: '👑', 60: '🏆', 100: '🎯' };

let logs = {};
let undoStack = [];
let saveTimeout;

function normalizeTasks(taskSet) {
  return taskSet.tasks.map(t => {
    if (typeof t === 'string') {
      return {
        name: t,
        start_date: taskSet.start_date || null,
        end_date: taskSet.end_date || null,
        weekdays: taskSet.weekdays || [0, 1, 2, 3, 4]
      };
    }
    return {
      name: t.name,
      start_date: t.start_date || null,
      end_date: t.end_date || null,
      weekdays: t.weekdays || [0, 1, 2, 3, 4]
    };
  });
}

function initHeaderDate() {
  const todayDate = new Date(TODAY + 'T00:00:00');
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = n => String(n).padStart(2, '0');
  const formatIndianDate = dateObj => `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
  document.getElementById('todayInfo').textContent = `Today: ${weekdayNames[todayDate.getDay()]}, ${formatIndianDate(todayDate)}`;
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function isTaskActiveOnDate(task, dateStr) {
  const date = new Date(dateStr + 'T00:00:00');

  if (task.start_date) {
    const start = new Date(task.start_date + 'T00:00:00');
    if (date < start) return false;
  }
  if (task.end_date) {
    const end = new Date(task.end_date + 'T00:00:00');
    if (date > end) return false;
  }

  const dow = date.getDay();
  const monIdx = (dow + 6) % 7;
  if (task.weekdays && task.weekdays.length > 0) {
    return task.weekdays.includes(monIdx);
  }

  return true;
}

function getDatesInRange() {
  let minDate = null;
  let maxDate = null;

  if (TASK_SET.start_date) {
    minDate = new Date(TASK_SET.start_date + 'T00:00:00');
  }
  if (TASK_SET.end_date) {
    maxDate = new Date(TASK_SET.end_date + 'T00:00:00');
  }

  TASKS.forEach(task => {
    if (task.start_date) {
      const sd = new Date(task.start_date + 'T00:00:00');
      if (!minDate || sd < minDate) minDate = sd;
    }
    if (task.end_date) {
      const ed = new Date(task.end_date + 'T00:00:00');
      if (!maxDate || ed > maxDate) maxDate = ed;
    }
  });

  if (!minDate) minDate = new Date(TODAY + 'T00:00:00');
  if (!maxDate) maxDate = new Date(TODAY + 'T00:00:00');

  const dates = [];
  const cur = new Date(minDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(maxDate);
  end.setHours(0, 0, 0, 0);

  while (cur <= end) {
    dates.push(formatDate(new Date(cur)));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function getStrikeEmoji(count) {
  const levels = [100, 60, 30, 14, 7, 3, 1, 0];
  for (const lv of levels) {
    if (count >= lv && STRIKE_EMOJIS[lv]) return STRIKE_EMOJIS[lv];
  }
  return '';
}

function getRunningStrike(date, allDates) {
  const idx = allDates.indexOf(date);
  if (idx < 0) return 0;
  let streak = 0;
  for (let i = idx; i >= 0; i--) {
    const d = allDates[i];
    if (logs[d] && logs[d].strike === 1) streak++;
    else break;
  }
  return streak;
}

function getTaskRunningStreak(taskName, allDates) {
  const uptoToday = allDates.filter(d => d <= TODAY).sort((a, b) => b.localeCompare(a));
  let streak = 0;

  for (const d of uptoToday) {
    const task = TASKS.find(t => t.name === taskName);
    if (!task || !isTaskActiveOnDate(task, d)) continue;

    const status = (logs[d] && logs[d].statuses) ? (logs[d].statuses[taskName] || 'none') : 'none';
    if (status === 'completed') {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function updateTaskHeaderStreaks(allDates) {
  TASKS.forEach(task => {
    const badge = Array.from(document.querySelectorAll('[data-task-streak]')).find(el => el.getAttribute('data-task-streak') === task.name);
    if (!badge) return;

    const streak = getTaskRunningStreak(task.name, allDates);
    const countEl = badge.querySelector('span:last-child');
    if (countEl) {
      countEl.textContent = String(streak);
    }
    badge.style.opacity = streak > 0 ? '1' : '0.8';
  });
}

function buildTable() {
  const tbody = document.getElementById('trackerBody');
  tbody.innerHTML = '';
  const allDates = getDatesInRange();
  updateTaskHeaderStreaks(allDates);

  const futureDates = allDates.filter(date => date > TODAY).sort((a, b) => a.localeCompare(b));
  const pastDates = allDates.filter(date => date < TODAY).sort((a, b) => b.localeCompare(a));
  const hasToday = allDates.includes(TODAY);
  const sortedDates = hasToday ? [...futureDates, TODAY, ...pastDates] : [...futureDates, ...pastDates];

  sortedDates.forEach(date => {
    const row = document.createElement('tr');
    const isToday = date === TODAY;
    const isPast = date < TODAY;
    row.className = isToday ? 'today-row' : isPast ? 'past-row' : 'future-row';
    row.dataset.date = date;

    const dateObj = new Date(date + 'T00:00:00');
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dateCell = document.createElement('td');
    dateCell.className = 'date-cell';
    const pad = n => String(n).padStart(2, '0');
    const label = `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
    dateCell.innerHTML = `
      <div class="date-inner">
        <span class="date-label">${label}</span>
        <span class="date-weekday">${weekdays[dateObj.getDay()]}</span>
        ${isToday ? '<span class="today-badge">TODAY</span>' : ''}
      </div>
    `;
    row.appendChild(dateCell);

    TASKS.forEach(task => {
      const td = document.createElement('td');
      const taskActive = isTaskActiveOnDate(task, date);

      if (!taskActive) {
        td.className = 'status-cell locked';
        td.style.background = '#f5f5f5';
        td.innerHTML = '<span style="color:#ccc;">—</span>';
        row.appendChild(td);
        return;
      }

      td.className = 'status-cell' + (isToday ? '' : ' locked');
      const logEntry = logs[date] || {};
      const status = logEntry.statuses ? (logEntry.statuses[task.name] || 'none') : 'none';

      const btn = document.createElement('button');
      btn.className = `status-btn ${status}`;
      btn.disabled = !isToday;
      btn.dataset.task = task.name;
      btn.dataset.date = date;
      btn.dataset.status = status;
      btn.innerHTML = STATUS_ICONS[status] ? `${STATUS_ICONS[status]} <span>${STATUS_LABELS[status]}</span>` : '<span style="color:var(--text-muted)">—</span>';

      if (isToday) {
        btn.addEventListener('click', () => cycleStatus(btn, date, task.name, allDates));
      }
      td.appendChild(btn);
      row.appendChild(td);
    });

    const noteTd = document.createElement('td');
    noteTd.className = 'note-cell';
    const note = (logs[date] || {}).note || '';
    const noteInput = document.createElement('textarea');
    noteInput.className = 'note-input';
    noteInput.rows = 1;
    noteInput.placeholder = isToday ? 'Add a note...' : '';
    noteInput.value = note;
    noteInput.disabled = !isToday;
    if (isToday) {
      noteInput.addEventListener('input', () => scheduleSave(date, allDates));
    }
    noteTd.appendChild(noteInput);
    row.appendChild(noteTd);

    const strikeTd = document.createElement('td');
    strikeTd.className = 'strike-cell';
    strikeTd.id = `strike-${date}`;
    updateStrikeCell(strikeTd, date, allDates);
    row.appendChild(strikeTd);

    tbody.appendChild(row);
  });

  scrollToToday();
}

function updateStrikeCell(td, date, allDates) {
  const streak = getRunningStrike(date, allDates);
  const emoji = getStrikeEmoji(streak);
  td.innerHTML = emoji
    ? `<span style="font-size:1.3rem;">${emoji}</span><span class="strike-count">${streak > 0 ? streak : ''}</span>`
    : '<span class="strike-count" style="color:var(--text-muted);">—</span>';
}

function cycleStatus(btn, date, taskName, allDates) {
  const cur = btn.dataset.status;
  const idx = STATUSES.indexOf(cur);
  const next = STATUSES[(idx + 1) % STATUSES.length];

  const prev = JSON.parse(JSON.stringify(logs[date] || {}));
  undoStack.push({ date, prev });
  if (undoStack.length > 20) undoStack.shift();

  if (!logs[date]) logs[date] = { statuses: {}, note: '', strike: 0 };
  if (next === 'none') {
    delete logs[date].statuses[taskName];
  } else {
    if (!logs[date].statuses) logs[date].statuses = {};
    logs[date].statuses[taskName] = next;
  }

  btn.className = `status-btn ${next}`;
  btn.dataset.status = next;
  btn.innerHTML = STATUS_ICONS[next] ? `${STATUS_ICONS[next]} <span>${STATUS_LABELS[next]}</span>` : '<span style="color:var(--text-muted)">—</span>';

  checkAllComplete(date, allDates);
  scheduleSave(date, allDates);
}

function checkAllComplete(date, allDates) {
  const statuses = (logs[date] || {}).statuses || {};
  const activeTasks = TASKS.filter(t => isTaskActiveOnDate(t, date));
  const allDone = activeTasks.every(t => statuses[t.name] === 'completed');
  if (!logs[date]) logs[date] = { statuses: {}, note: '', strike: 0 };
  logs[date].strike = (activeTasks.length > 0 && allDone) ? 1 : 0;

  const strikeTd = document.getElementById(`strike-${date}`);
  if (strikeTd) updateStrikeCell(strikeTd, date, allDates);

  updateTaskHeaderStreaks(allDates);
}

function scheduleSave(date, allDates) {
  clearTimeout(saveTimeout);
  document.getElementById('saveStatus').textContent = '...saving';
  saveTimeout = setTimeout(() => saveLog(date, allDates), 800);
}

async function saveLog(date, allDates) {
  const logData = logs[date] || {};
  const row = document.querySelector(`tr[data-date="${date}"]`);
  const noteEl = row ? row.querySelector('.note-input') : null;
  const note = noteEl ? noteEl.value : (logData.note || '');

  const payload = {
    task_set_id: TASK_SET._id,
    date,
    statuses: logData.statuses || {},
    note,
    strike: logData.strike || 0
  };

  try {
    const res = await apiCall('/api/logs', 'POST', payload);
    if (res.success) {
      if (!logs[date]) logs[date] = {};
      logs[date].strike = res.strike;
      document.getElementById('saveStatus').textContent = '✓ Saved';
      checkAllComplete(date, allDates);
    }
  } catch (e) {
    document.getElementById('saveStatus').textContent = '⚠ Save error';
  }
}

function markAllDone() {
  if (!confirm('Mark all tasks for today as Completed?')) return;
  const allDates = getDatesInRange();
  const prev = JSON.parse(JSON.stringify(logs[TODAY] || {}));
  undoStack.push({ date: TODAY, prev });

  if (!logs[TODAY]) logs[TODAY] = { statuses: {}, note: '', strike: 0 };

  TASKS.forEach(t => {
    if (isTaskActiveOnDate(t, TODAY)) {
      if (!logs[TODAY].statuses) logs[TODAY].statuses = {};
      logs[TODAY].statuses[t.name] = 'completed';
    }
  });

  const row = document.querySelector(`tr[data-date="${TODAY}"]`);
  if (row) {
    row.querySelectorAll('.status-btn').forEach(btn => {
      btn.className = 'status-btn completed';
      btn.dataset.status = 'completed';
      btn.innerHTML = `${STATUS_ICONS.completed} <span>${STATUS_LABELS.completed}</span>`;
    });
  }
  checkAllComplete(TODAY, allDates);
  scheduleSave(TODAY, allDates);
}

function copyYesterday() {
  const allDates = getDatesInRange();
  const todayIdx = allDates.indexOf(TODAY);
  if (todayIdx <= 0) { showToast('No previous day found', 'error'); return; }
  const yesterday = allDates[todayIdx - 1];
  const yLog = logs[yesterday];
  if (!yLog || !yLog.statuses) { showToast('No data for previous day', 'error'); return; }

  const prev = JSON.parse(JSON.stringify(logs[TODAY] || {}));
  undoStack.push({ date: TODAY, prev });

  if (!logs[TODAY]) logs[TODAY] = { statuses: {}, note: '', strike: 0 };
  logs[TODAY].statuses = JSON.parse(JSON.stringify(yLog.statuses));

  const row = document.querySelector(`tr[data-date="${TODAY}"]`);
  if (row) {
    row.querySelectorAll('.status-btn').forEach(btn => {
      const taskName = btn.dataset.task;
      const status = logs[TODAY].statuses[taskName] || 'none';
      btn.className = `status-btn ${status}`;
      btn.dataset.status = status;
      btn.innerHTML = STATUS_ICONS[status] ? `${STATUS_ICONS[status]} <span>${STATUS_LABELS[status]}</span>` : '<span style="color:var(--text-muted)">—</span>';
    });
  }

  checkAllComplete(TODAY, allDates);
  scheduleSave(TODAY, allDates);
  showToast("Copied yesterday's status", 'success');
}

function undoToday() {
  if (undoStack.length === 0) { showToast('Nothing to undo', 'error'); return; }
  const { date, prev } = undoStack.pop();
  logs[date] = JSON.parse(JSON.stringify(prev));

  const allDates = getDatesInRange();
  const row = document.querySelector(`tr[data-date="${date}"]`);
  if (row) {
    row.querySelectorAll('.status-btn').forEach(btn => {
      const taskName = btn.dataset.task;
      const status = (prev.statuses || {})[taskName] || 'none';
      btn.className = `status-btn ${status}`;
      btn.dataset.status = status;
      btn.innerHTML = STATUS_ICONS[status] ? `${STATUS_ICONS[status]} <span>${STATUS_LABELS[status]}</span>` : '<span style="color:var(--text-muted)">—</span>';
    });
  }
  checkAllComplete(date, allDates);
  scheduleSave(date, allDates);
  showToast('Undone', 'success');
}

function scrollToToday() {
  setTimeout(() => {
    const container = document.getElementById('tableContainer');
    const todayRow = document.querySelector('.today-row');
    if (container && todayRow) {
      const targetTop = Math.max(0, todayRow.offsetTop - 2);
      container.scrollTop = targetTop;
    }
  }, 100);
}

async function loadLogs() {
  try {
    const rawLogs = await apiCall(`/api/logs/${TASK_SET._id}`);
    rawLogs.forEach(log => {
      logs[log.date] = {
        statuses: log.statuses || {},
        note: log.note || '',
        strike: log.strike || 0
      };
    });
    buildTable();
  } catch (e) {
    buildTable();
  }
}

async function initTracker() {
  try {
    const res = await apiCall(`/api/task-sets/${TASK_SET_ID}`, 'GET');
    if (!res || res.error) {
      showToast('Unable to load tracker data', 'error');
      return;
    }
    TASK_SET = res;
    TASKS = normalizeTasks(TASK_SET);
    initHeaderDate();
    loadLogs();
  } catch (e) {
    showToast('Unable to load tracker data', 'error');
  }
}

initTracker();
