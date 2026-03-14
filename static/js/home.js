let currentEditId = null;
const TODAY = new Date().toISOString().split('T')[0];

function openCreateModal() {
  currentEditId = null;
  document.querySelector('#createModal .modal-header h2').innerHTML = '<i class="fas fa-plus-circle" style="color:var(--brown-300);margin-right:8px;"></i>New Task Set';
  document.getElementById('createModal').style.display = 'flex';
  setDefaultDates();
}

function closeCreateModal() {
  document.getElementById('createModal').style.display = 'none';
  document.getElementById('tsName').value = '';
  currentEditId = null;
  resetTaskList();
}

function setDefaultDates() {
  const rows = document.querySelectorAll('.task-item-row');
  rows.forEach(row => {
    const startInput = row.querySelector('[data-task-start]');
    if (startInput && !startInput.value) startInput.value = TODAY;
  });
}

function resetTaskList() {
  const editor = document.getElementById('taskListEditor');
  editor.innerHTML = `
    <div class="task-item-row" data-task-index="0">
      <div class="task-row-header">
        <span style="color:var(--text-muted);font-size:0.85rem;">1.</span>
        <input type="text" class="task-input" placeholder="Task name..." data-task-name>
        <button class="remove-task-btn" onclick="removeTask(this)" type="button"><i class="fas fa-times"></i></button>
      </div>
      <div class="task-details">
        <input type="date" class="task-date-input" placeholder="Start" data-task-start>
        <input type="date" class="task-date-input" placeholder="End" data-task-end>
        <div class="task-weekday-picker" data-task-weekdays>
          <button class="task-weekday-btn active" data-day="0" type="button">M</button>
          <button class="task-weekday-btn active" data-day="1" type="button">T</button>
          <button class="task-weekday-btn active" data-day="2" type="button">W</button>
          <button class="task-weekday-btn active" data-day="3" type="button">T</button>
          <button class="task-weekday-btn active" data-day="4" type="button">F</button>
          <button class="task-weekday-btn" data-day="5" type="button">S</button>
          <button class="task-weekday-btn" data-day="6" type="button">S</button>
        </div>
      </div>
    </div>
    <button class="add-task-btn" onclick="addTask()" type="button"><i class="fas fa-plus"></i> Add Task</button>
  `;
  attachWeekdayListeners();
  setDefaultDates();
}

function addTask() {
  const editor = document.getElementById('taskListEditor');
  const rows = editor.querySelectorAll('.task-item-row');
  const addBtn = editor.querySelector('.add-task-btn');
  const newRow = document.createElement('div');
  newRow.className = 'task-item-row';
  newRow.dataset.taskIndex = rows.length;
  newRow.innerHTML = `
    <div class="task-row-header">
      <span style="color:var(--text-muted);font-size:0.85rem;">${rows.length + 1}.</span>
      <input type="text" class="task-input" placeholder="Task name..." data-task-name>
      <button class="remove-task-btn" onclick="removeTask(this)" type="button"><i class="fas fa-times"></i></button>
    </div>
    <div class="task-details">
      <input type="date" class="task-date-input" placeholder="Start" data-task-start value="${TODAY}">
      <input type="date" class="task-date-input" placeholder="End" data-task-end>
      <div class="task-weekday-picker" data-task-weekdays>
        <button class="task-weekday-btn active" data-day="0" type="button">M</button>
        <button class="task-weekday-btn active" data-day="1" type="button">T</button>
        <button class="task-weekday-btn active" data-day="2" type="button">W</button>
        <button class="task-weekday-btn active" data-day="3" type="button">T</button>
        <button class="task-weekday-btn active" data-day="4" type="button">F</button>
        <button class="task-weekday-btn" data-day="5" type="button">S</button>
        <button class="task-weekday-btn" data-day="6" type="button">S</button>
      </div>
    </div>
  `;
  editor.insertBefore(newRow, addBtn);
  newRow.querySelector('input').focus();
  attachWeekdayListeners(newRow);
  renumberTasks();
}

function removeTask(btn) {
  const editor = document.getElementById('taskListEditor');
  const rows = editor.querySelectorAll('.task-item-row');
  if (rows.length <= 1) return;
  btn.closest('.task-item-row').remove();
  renumberTasks();
}

function renumberTasks() {
  const rows = document.querySelectorAll('.task-item-row');
  rows.forEach((row, i) => {
    const label = row.querySelector('span');
    if (label) label.textContent = `${i + 1}.`;
    row.dataset.taskIndex = i;
  });
}

function attachWeekdayListeners(container = document) {
  container.querySelectorAll('.task-weekday-btn').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });
  container.querySelectorAll('.task-weekday-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      btn.classList.toggle('active');
    });
  });
}

function applyToAllTasks() {
  const rows = document.querySelectorAll('.task-item-row');
  if (rows.length < 2) return;

  const firstRow = rows[0];
  const firstStart = firstRow.querySelector('[data-task-start]').value;
  const firstEnd = firstRow.querySelector('[data-task-end]').value;
  const firstWeekdays = Array.from(firstRow.querySelectorAll('.task-weekday-btn.active')).map(b => parseInt(b.dataset.day, 10));

  rows.forEach((row, idx) => {
    if (idx === 0) return;
    row.querySelector('[data-task-start]').value = firstStart;
    row.querySelector('[data-task-end]').value = firstEnd;

    row.querySelectorAll('.task-weekday-btn').forEach(btn => {
      const day = parseInt(btn.dataset.day, 10);
      if (firstWeekdays.includes(day)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  });

  showToast('Settings applied to all tasks', 'success');
}

function getTaskData() {
  const rows = document.querySelectorAll('.task-item-row');
  const tasks = [];

  rows.forEach(row => {
    const name = row.querySelector('[data-task-name]').value.trim();
    if (!name) return;

    const startDate = row.querySelector('[data-task-start]').value;
    const endDate = row.querySelector('[data-task-end]').value;
    const weekdays = Array.from(row.querySelectorAll('.task-weekday-btn.active')).map(b => parseInt(b.dataset.day, 10));

    tasks.push({
      name,
      start_date: startDate,
      end_date: endDate,
      weekdays
    });
  });

  return tasks;
}

async function createTaskSet() {
  const name = document.getElementById('tsName').value.trim();
  if (!name) { showToast('Please enter a task set name', 'error'); return; }

  const tasks = getTaskData();
  if (tasks.length === 0) { showToast('Please add at least one task', 'error'); return; }

  const data = { name, tasks };

  const url = currentEditId ? `/api/task-sets/${currentEditId}` : '/api/task-sets';
  const method = currentEditId ? 'PUT' : 'POST';

  const res = await apiCall(url, method, data);
  if (res.success) {
    showToast(currentEditId ? 'Task set updated!' : 'Task set created!', 'success');
    closeCreateModal();
    setTimeout(() => window.location.reload(), 800);
  } else {
    showToast(res.message || 'Error saving task set', 'error');
  }
}

async function editTaskSet(id) {
  const res = await apiCall(`/api/task-sets/${id}`, 'GET');
  if (!res) return;

  currentEditId = id;
  document.querySelector('#createModal .modal-header h2').innerHTML = '<i class="fas fa-edit" style="color:var(--brown-300);margin-right:8px;"></i>Edit Task Set';
  document.getElementById('tsName').value = res.name;

  const editor = document.getElementById('taskListEditor');
  editor.innerHTML = '';

  res.tasks.forEach((task, idx) => {
    const taskData = typeof task === 'string' ? { name: task, start_date: '', end_date: '', weekdays: [0,1,2,3,4] } : task;
    const newRow = document.createElement('div');
    newRow.className = 'task-item-row';
    newRow.dataset.taskIndex = idx;
    newRow.innerHTML = `
      <div class="task-row-header">
        <span style="color:var(--text-muted);font-size:0.85rem;">${idx + 1}.</span>
        <input type="text" class="task-input" placeholder="Task name..." data-task-name value="${taskData.name || taskData}">
        <button class="remove-task-btn" onclick="removeTask(this)" type="button"><i class="fas fa-times"></i></button>
      </div>
      <div class="task-details">
        <input type="date" class="task-date-input" placeholder="Start" data-task-start value="${taskData.start_date || TODAY}">
        <input type="date" class="task-date-input" placeholder="End" data-task-end value="${taskData.end_date || ''}">
        <div class="task-weekday-picker" data-task-weekdays>
          ${[0,1,2,3,4,5,6].map(d => `<button class="task-weekday-btn ${(taskData.weekdays || [0,1,2,3,4]).includes(d) ? 'active' : ''}" data-day="${d}" type="button">${['M','T','W','T','F','S','S'][d]}</button>`).join('')}
        </div>
      </div>
    `;
    editor.appendChild(newRow);
    attachWeekdayListeners(newRow);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'add-task-btn';
  addBtn.type = 'button';
  addBtn.onclick = addTask;
  addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Task';
  editor.appendChild(addBtn);

  document.getElementById('createModal').style.display = 'flex';
}

async function deleteTaskSet(id, btn) {
  if (!confirm('Delete this task set and all its data?')) return;
  const res = await apiCall(`/api/task-sets/${id}`, 'DELETE');
  if (res.success) {
    showToast('Task set deleted', 'success');
    btn.closest('.task-set-card').remove();
    const grid = document.getElementById('taskSetsGrid');
    if (grid && grid.children.length === 0) window.location.reload();
  }
}

(function initHomePage() {
  attachWeekdayListeners();
  setDefaultDates();

  document.getElementById('createModal').addEventListener('click', function(e) {
    if (e.target === this) closeCreateModal();
  });
})();
