const TASK_SET_ID = document.body.dataset.taskSetId;
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
  const d = await apiCall(`/api/dashboard/${TASK_SET_ID}`);

  if (d.error) {
    document.getElementById('dashContent').innerHTML = '<p class="section-card">Error loading data.</p>';
    return;
  }
  let html = `
    <div class="section-card">
      <h3><i class="fas fa-layer-group"></i> 1. Overview</h3>
      <div class="metric-grid-3">
        <div class="metric-card">
          <div class="metric-label">Current Streak</div>
          <div class="metric-value">${d.current_streak}</div>
          <div class="metric-sub">consecutive perfect days</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Best Streak</div>
          <div class="metric-value">${d.max_streak}</div>
          <div class="metric-sub">highest run till now</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Productivity Score</div>
          <div class="metric-value">${d.productivity_score}%</div>
          <div class="metric-sub">completed tasks / scheduled tasks</div>
        </div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-calendar-day"></i> 2. Today's Progress</h3>
      <div class="metric-grid-4">
        <div class="metric-card"><div class="metric-label">Today Progress %</div><div class="metric-value">${d.today_progress_pct}%</div></div>
        <div class="metric-card"><div class="metric-label">Total Tasks Today</div><div class="metric-value">${d.today_total_tasks}</div></div>
        <div class="metric-card"><div class="metric-label">Tasks Completed</div><div class="metric-value">${d.today_completed_tasks}</div></div>
        <div class="metric-card"><div class="metric-label">Tasks Remaining</div><div class="metric-value">${d.today_remaining_tasks}</div></div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-chart-pie"></i> 3. Overall Progress</h3>
      <div class="section-note section-note-chips">Overall Completion: <span class="chip ${pctChipClass(d.overall_pct)}">${d.overall_pct}%</span></div>
      <div style="overflow-x:auto;">
        <table class="task-stats-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Individual Completion %</th>
              <th>Current Strike</th>
              <th>Best Strike</th>
              <th>Longest Missed Streak</th>
            </tr>
          </thead>
          <tbody>
            ${d.tasks.map(task => {
              const s = d.task_stats[task] || {};
              const donePct = s.completed_pct_schedule || 0;
              const missedPct = s.missed_pct_schedule || 0;
              const progressPct = s.progress_pct_schedule || 0;
              const breakdownText = `${donePct}% + ${missedPct}% = ${progressPct}%`;
              return `
                <tr class="mobile-stat-row">
                  <td data-label="Task"><strong>${task}</strong></td>
                  <td data-label="Individual Completion %" class="completion-cell">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <div class="task-progress-bar">
                        <div class="task-progress-fill done" style="width:${donePct}%"></div>
                        <div class="task-progress-fill missed" style="width:${missedPct}%"></div>
                      </div>
                      <span>${breakdownText}</span>
                    </div>
                  </td>
                  <td data-label="Current Strike">${s.current_streak || 0} 🔥</td>
                  <td data-label="Best Strike">${s.max_streak || 0} ⭐</td>
                  <td data-label="Longest Missed Streak">${s.max_missed_streak || 0}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-lightbulb"></i> 4. Task Insights</h3>
      <div class="two-col">
        <div class="insight-box">
          <div class="insight-title">Most Consistent Task</div>
          <div class="insight-value">${d.most_consistent_task}</div>
        </div>
        <div class="insight-box">
          <div class="insight-title">Most Missed Task</div>
          <div class="insight-value">${d.most_missed_task}</div>
        </div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-calendar-check"></i> 5. Schedule Progress</h3>
      <div class="section-note">Period: ${formatIndianDateFromISO(d.period_start)} to ${formatIndianDateFromISO(d.period_end)}</div>
      <div class="metric-grid-4">
        <div class="metric-card"><div class="metric-label">Total Days Completed %</div><div class="metric-value">${d.total_days_completed_pct}%</div></div>
        <div class="metric-card"><div class="metric-label">Total Days Completed</div><div class="metric-value">${d.total_days_completed}</div></div>
        <div class="metric-card"><div class="metric-label">Total Days Remaining</div><div class="metric-value">${d.total_days_remaining}</div></div>
        <div class="metric-card"><div class="metric-label">Total Days</div><div class="metric-value">${d.total_days_in_period || 0}</div></div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-chart-bar"></i> 6. Productivity Analytics</h3>
      <div class="section-note">Weekly Productivity Trend (last 7 days): Daily Productivity % = completed tasks / scheduled tasks.</div>
      <div class="chart-wrap"><canvas id="weeklyProductivityChart"></canvas></div>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
        <span class="chip ${pctChipClass(d.best_day_of_week_score || 0)}">Best Day of Week: ${d.best_day_of_week}</span>
        <span class="chip chip-bad">Longest Missed Streak: ${d.longest_missed_streak}</span>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-th"></i> 7. Visual Insights</h3>
      <div class="section-note">GitHub Heatmap</div>
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
      <h3><i class="fas fa-history"></i> 8. History</h3>
      <div class="section-note">Recent Log (Last 10 Days)</div>
      <div style="overflow-x:auto;">
        <table class="task-stats-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Productivity %</th>
              ${d.tasks.map(t => `<th>${t.slice(0,10)}${t.length > 10 ? '...' : ''}</th>`).join('')}
              <th>Strike</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${(d.recent_logs || []).map(log => `
              <tr>
                <td>${formatIndianDateFromISO(log.date)}</td>
                <td>${log.productivity_pct}%</td>
                ${d.tasks.map(t => {
                  const st = (log.statuses || {})[t] || 'none';
                  const icon = st === 'completed' ? '✅' : st === 'partial' ? '🔶' : st === 'incomplete' ? '❌' : '—';
                  return `<td style="text-align:center;">${icon}</td>`;
                }).join('')}
                <td style="text-align:center;">${log.strike === 1 ? '🔥' : '—'}</td>
                <td>${log.note || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('dashContent').innerHTML = html;

  buildHeatmap(d.heatmap || {});

  const week = d.weekly_productivity || [];
  const ctx = document.getElementById('weeklyProductivityChart');
  if (weeklyChartRef) {
    weeklyChartRef.destroy();
  }
  weeklyChartRef = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: week.map(item => item.label),
      datasets: [{
        label: 'Daily Productivity %',
        data: week.map(item => item.productivity_pct),
        backgroundColor: week.map((_, idx) => `hsla(${32 + idx * 3}, 68%, 52%, 0.85)`),
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
      if (new Date(cur) <= today) {
        week.push(new Date(cur));
      } else {
        week.push(null);
      }
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let html = '<div style="display:flex;">';
  html += '<div class="heatmap-side-labels">';
  ['', 'M', '', 'W', '', 'F', ''].forEach(l => {
    html += `<div class="heatmap-day-label">${l}</div>`;
  });
  html += '</div>';

  html += '<div>';

  html += '<div class="heatmap-labels">';
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstValid = week.find(d => d !== null);
    if (firstValid) {
      const m = firstValid.getMonth();
      if (m !== lastMonth) {
        html += `<div class="heatmap-month-label" style="min-width:${13 * (weeks.length - wi) / weeks.length * 3}px">${months[m]}</div>`;
        lastMonth = m;
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
  html += '</div>';

  html += '</div></div>';

  container.innerHTML = html;

  container.querySelectorAll('.heatmap-day[data-date]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const pct = el.dataset.pct;
      tooltip.style.display = 'block';
      tooltip.textContent = `${formatIndianDateFromISO(el.dataset.date)}: ${pct}% completed`;
    });
    el.addEventListener('mousemove', e => {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY - 28) + 'px';
    });
    el.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}

loadDashboard();
