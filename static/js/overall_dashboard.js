let weeklyChartRef;

function formatIndianDateFromISO(dateStr) {
  if (!dateStr || !dateStr.includes('-')) return dateStr || '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function pctChipClass(value) {
  if (value >= 75) return 'chip-good';
  if (value >= 40) return 'chip-warn';
  return 'chip-bad';
}

async function loadDashboard() {
  const data = await apiCall('/api/dashboard/overall');

  if (!data || !data.task_sets || data.task_sets.length === 0) {
    document.getElementById('dashContent').innerHTML = `
      <div class="empty-dash">
        <i class="fas fa-chart-bar"></i>
        <h3>No data yet</h3>
        <p>Create task sets and start tracking to see your stats here.</p>
        <a href="/home" class="btn btn-primary" style="margin-top:16px;">Go to Home</a>
      </div>`;
    return;
  }

  let html = `
    <div class="section-card">
      <h3><i class="fas fa-layer-group"></i> 1. Overall Snapshot</h3>
      <div class="metric-grid-4">
        <div class="metric-card">
          <div class="metric-label">Total Task Sets</div>
          <div class="metric-value">${data.total_task_sets}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Current Overall Streak</div>
          <div class="metric-value">${data.current_overall_streak}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Best Overall Streak</div>
          <div class="metric-value">${data.best_overall_streak}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Productivity Score</div>
          <div class="metric-value">${data.productivity_score}%</div>
        </div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-calendar-day"></i> 2. Today's Overall Progress</h3>
      <div class="metric-grid-4">
        <div class="metric-card"><div class="metric-label">Today Progress %</div><div class="metric-value">${data.today_progress_pct}%</div></div>
        <div class="metric-card"><div class="metric-label">Total Tasks Today</div><div class="metric-value">${data.total_tasks_today}</div></div>
        <div class="metric-card"><div class="metric-label">Completed Tasks</div><div class="metric-value">${data.completed_tasks_today}</div></div>
        <div class="metric-card"><div class="metric-label">Remaining Tasks</div><div class="metric-value">${data.remaining_tasks_today}</div></div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-chart-pie"></i> 3. Task Set Performance</h3>
      <div class="section-note">
        <span class="chip ${pctChipClass(Math.max(...data.task_sets.map(ts => ts.completion_pct), 0))}">Best performing task set: ${data.best_performing_task_set}</span>
        <span class="chip chip-bad">Weakest task set: ${data.weakest_task_set}</span>
      </div>
      <div style="overflow-x:auto;">
        <table class="task-stats-table">
          <thead>
            <tr>
              <th>Task Set</th>
              <th>Individual Completion %</th>
              <th>Current Streak</th>
              <th>Best Streak</th>
            </tr>
          </thead>
          <tbody>
            ${data.task_sets.map(ts => {
              const donePct = ts.completed_pct_schedule || 0;
              const missedPct = ts.missed_pct_schedule || 0;
              const progressPct = ts.progress_pct_schedule || 0;
              const breakdownText = `${donePct}% + ${missedPct}% = ${progressPct}%`;
              return `
              <tr>
                <td><strong>${ts.name}</strong></td>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div class="task-progress-bar">
                      <div class="task-progress-fill done" style="width:${donePct}%"></div>
                      <div class="task-progress-fill missed" style="width:${missedPct}%"></div>
                    </div>
                    <span>${breakdownText}</span>
                  </div>
                </td>
                <td>${ts.current_streak || 0} 🔥</td>
                <td>${ts.max_streak || 0} ⭐</td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-calendar-check"></i> 4. Schedule Overview</h3>
      <div class="section-note">Overall period: ${formatIndianDateFromISO(data.period_start)} to ${formatIndianDateFromISO(data.period_end)}</div>
      <div class="metric-grid-4">
        <div class="metric-card"><div class="metric-label">Days Completed %</div><div class="metric-value">${data.days_completed_pct}%</div></div>
        <div class="metric-card"><div class="metric-label">Total Days Completed</div><div class="metric-value">${data.total_days_completed || 0}</div></div>
        <div class="metric-card"><div class="metric-label">Days Remaining</div><div class="metric-value">${data.days_remaining}</div></div>
        <div class="metric-card"><div class="metric-label">Total Days</div><div class="metric-value">${data.total_days_tracked}</div></div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-lightbulb"></i> 5. Global Task Insights</h3>
      <div class="two-col">
        <div class="insight-box">
          <div class="insight-title">Most Consistent Task Set</div>
          <div class="insight-value">${data.most_consistent_task_set}</div>
        </div>
        <div class="insight-box">
          <div class="insight-title">Most Missed Task Set</div>
          <div class="insight-value">${data.most_missed_task_set}</div>
        </div>
        <div class="insight-box">
          <div class="insight-title">Most Consistent Task</div>
          <div class="insight-value">${data.most_consistent_task}</div>
        </div>
        <div class="insight-box">
          <div class="insight-title">Most Missed Task</div>
          <div class="insight-value">${data.most_missed_task}</div>
        </div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-chart-bar"></i> 6. Productivity Analytics</h3>
      <div class="section-note">Weekly productivity trend for all task sets combined.</div>
      <div class="chart-wrap"><canvas id="weeklyProductivityChart"></canvas></div>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
        <span class="chip ${pctChipClass(data.best_day_of_week_score || 0)}">Best day of week: ${data.best_day_of_week}</span>
        <span class="chip chip-bad">Longest missed streak: ${data.longest_missed_streak}</span>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-th"></i> 7. Visual Overview</h3>
      <div class="section-note">GitHub heatmap</div>
      <div class="heatmap-container" id="heatmapContainer"></div>
      <div class="heatmap-legend">
        <span>Less</span>
        <div class="heatmap-legend-sq" style="background:#f0d9b5;"></div>
        <div class="heatmap-legend-sq" style="background:#d4a96a;"></div>
        <div class="heatmap-legend-sq" style="background:#c4863a;"></div>
        <div class="heatmap-legend-sq" style="background:#a0652a;"></div>
        <div class="heatmap-legend-sq" style="background:#5c3810;"></div>
        <span>More</span>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-bolt"></i> 8. Task Set Quick Access</h3>
    <div class="task-sets-list">
      ${data.task_sets.map(ts => `
        <a href="/dashboard/${ts.id}" class="ts-card">
          <div class="ts-card-top"></div>
          <div class="ts-card-body">
            ${(() => {
              const todayTotal = ts.today_total_tasks || 0;
              const todayDone = ts.today_completed_tasks || 0;
              const todayProgress = todayTotal > 0 ? ((todayDone / todayTotal) * 100).toFixed(1) : '0.0';
              return `
            <div class="ts-card-name">${ts.name}</div>
            <div class="ts-stats">
              <div class="ts-stat">
                <div class="ts-stat-val">${ts.task_count}</div>
                <div class="ts-stat-label">Tasks</div>
              </div>
              <div class="ts-stat">
                <div class="ts-stat-val">${ts.current_streak}</div>
                <div class="ts-stat-label">Streak</div>
              </div>
              <div class="ts-stat">
                <div class="ts-stat-val">${todayProgress}%</div>
                <div class="ts-stat-label">Today Progress %</div>
              </div>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" style="width:${todayProgress}%"></div>
            </div>
            <div class="section-note" style="margin-top:10px;margin-bottom:0;">
              Today: ${ts.today_completed_tasks}/${ts.today_total_tasks} tasks
            </div>
            `;
            })()}
          </div>
        </a>
      `).join('')}
    </div>
    </div>
  `;

  document.getElementById('dashContent').innerHTML = html;

  buildHeatmap(data.heatmap || {});

  if (weeklyChartRef) {
    weeklyChartRef.destroy();
  }
  weeklyChartRef = new Chart(document.getElementById('weeklyProductivityChart'), {
    type: 'bar',
    data: {
      labels: (data.weekly_productivity || []).map(item => item.label),
      datasets: [{
        label: 'Daily Productivity %',
        data: (data.weekly_productivity || []).map(item => item.productivity_pct),
        backgroundColor: (data.weekly_productivity || []).map((_, idx) => `hsla(${32 + idx * 3}, 68%, 52%, 0.85)`),
        borderRadius: 8
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { callback: v => `${v}%` }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => `${context.parsed.y}% productivity`
          }
        }
      }
    }
  });
}

function buildHeatmap(heatmapData) {
  const container = document.getElementById('heatmapContainer');
  const tooltip = document.getElementById('tooltip');

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364);
  while (startDate.getDay() !== 0) {
    startDate.setDate(startDate.getDate() - 1);
  }

  const weeks = [];
  let cur = new Date(startDate);
  while (cur <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      if (new Date(cur) <= today) week.push(new Date(cur));
      else week.push(null);
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let html = '<div style="display:flex;">';
  html += '<div class="heatmap-side-labels">';
  ['', 'M', '', 'W', '', 'F', ''].forEach(label => {
    html += `<div class="heatmap-day-label">${label}</div>`;
  });
  html += '</div><div>';

  html += '<div class="heatmap-labels">';
  let lastMonth = -1;
  weeks.forEach((week, index) => {
    const firstValid = week.find(day => day !== null);
    if (firstValid) {
      const month = firstValid.getMonth();
      if (month !== lastMonth) {
        html += `<div class="heatmap-month-label" style="min-width:${13 * (weeks.length - index) / weeks.length * 3}px">${months[month]}</div>`;
        lastMonth = month;
      }
    }
  });
  html += '</div>';

  html += '<div class="heatmap-weeks">';
  weeks.forEach(week => {
    html += '<div class="heatmap-col">';
    week.forEach(date => {
      if (!date) {
        html += '<div class="heatmap-day" data-level="0"></div>';
        return;
      }
      const dateStr = date.toISOString().split('T')[0];
      const pct = heatmapData[dateStr] || 0;
      const level = pct === 0 ? 0 : pct <= 25 ? 1 : pct <= 50 ? 2 : pct <= 75 ? 3 : 4;
      html += `<div class="heatmap-day" data-level="${level}" data-date="${dateStr}" data-pct="${pct}"></div>`;
    });
    html += '</div>';
  });
  html += '</div></div></div>';

  container.innerHTML = html;

  container.querySelectorAll('.heatmap-day[data-date]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const pct = el.dataset.pct;
      tooltip.style.display = 'block';
      tooltip.textContent = `${formatIndianDateFromISO(el.dataset.date)}: ${pct}% completed`;
    });
    el.addEventListener('mousemove', e => {
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY - 28}px`;
    });
    el.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}

loadDashboard();
