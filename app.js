/* ============================================================
   FinVision — app.js
   Full front-end logic: Auth, Goal Analysis, Progress, Popup
   ============================================================ */

const API = '/api';

/* ─── State ──────────────────────────────────────────────── */
let currentUser = null;
let currentGoal = null;
let selectedRisk = 'conservative';

/* ─── Motivational Quotes ────────────────────────────────── */

/* ─── Utility Functions ──────────────────────────────────── */

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = 'toast hidden'; }, 3500);
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(pageId);
  if (page) { page.classList.add('active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  if (pageId === 'page3') renderProgressPage();
}

function formatINR(num) {
  if (!num && num !== 0) return '—';
  const n = Math.round(num);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function setButtonLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.classList.add('btn-loading');
  } else {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
  }
}

/* ─── Motivation Popup ───────────────────────────────────── */

function showMotivationPopup() {
  const idx = Math.floor(Math.random() * MOTIVATIONS.length);
  const m = MOTIVATIONS[idx];
  document.getElementById('motivationText').textContent = m.text;
  document.getElementById('motivationMeta').textContent = m.tip;
  document.getElementById('motivationOverlay').classList.remove('hidden');
}

function setupMotivationPopup() {
  // Show on first visit
  const lastShown = localStorage.getItem('fv_last_motivation');
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (!lastShown || (now - parseInt(lastShown)) > ONE_DAY) {
    setTimeout(showMotivationPopup, 2000);
    localStorage.setItem('fv_last_motivation', now.toString());
  }

  // Show every 3 minutes while on the app
  setInterval(() => {
    if (currentUser) {
      showMotivationPopup();
      localStorage.setItem('fv_last_motivation', Date.now().toString());
    }
  }, 3 * 60 * 1000);
}

document.getElementById('motivationClose').addEventListener('click', () => {
  document.getElementById('motivationOverlay').classList.add('hidden');
});

/* ─── Tab Switching ──────────────────────────────────────── */

function switchTab(tab) {
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
  document.getElementById('tabSignin').classList.toggle('active', tab === 'signin');
  document.getElementById('signupForm').classList.toggle('active', tab === 'signup');
  document.getElementById('signinForm').classList.toggle('active', tab === 'signin');
  // Clear errors
  document.querySelectorAll('.field-error').forEach(e => e.textContent = '');
  document.querySelectorAll('input, select').forEach(el => el.classList.remove('error'));
}

/* ─── Form Validation ────────────────────────────────────── */

function validateSignup() {
  let valid = true;
  const fields = [
    { id: 'su-name',    errId: 'err-name',    label: 'First name' },
    { id: 'su-surname', errId: 'err-surname', label: 'Last name' },
    { id: 'su-email',   errId: 'err-email',   label: 'Email', type: 'email' },
    { id: 'su-gender',  errId: 'err-gender',  label: 'Gender' },
    { id: 'su-age',     errId: 'err-age',     label: 'Age', type: 'age' }
  ];

  fields.forEach(f => {
    const el = document.getElementById(f.id);
    const errEl = document.getElementById(f.errId);
    const val = el.value.trim();
    el.classList.remove('error');
    errEl.textContent = '';

    if (!val) {
      el.classList.add('error');
      errEl.textContent = `${f.label} is required.`;
      valid = false;
    } else if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      el.classList.add('error');
      errEl.textContent = 'Please enter a valid email address.';
      valid = false;
    } else if (f.type === 'age') {
      const age = parseInt(val);
      if (isNaN(age) || age < 13 || age > 100) {
        el.classList.add('error');
        errEl.textContent = 'Age must be between 13 and 100.';
        valid = false;
      }
    }
  });
  return valid;
}

function validateSignin() {
  const email = document.getElementById('si-email');
  const errEl = document.getElementById('err-si-email');
  email.classList.remove('error');
  errEl.textContent = '';
  const val = email.value.trim();
  if (!val) {
    email.classList.add('error');
    errEl.textContent = 'Email is required.';
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    email.classList.add('error');
    errEl.textContent = 'Please enter a valid email.';
    return false;
  }
  return true;
}

/* ─── Auth Handlers ──────────────────────────────────────── */

document.getElementById('signupForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!validateSignup()) return;

  const btn = document.getElementById('signupBtn');
  setButtonLoading(btn, true);

  try {
    const res = await fetch(`${API}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:    document.getElementById('su-name').value.trim(),
        surname: document.getElementById('su-surname').value.trim(),
        email:   document.getElementById('su-email').value.trim(),
        gender:  document.getElementById('su-gender').value,
        age:     document.getElementById('su-age').value
      })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('fv_user', JSON.stringify(currentUser));
      onLoggedIn();
      showToast(`Welcome, ${currentUser.name}! 🎉`, 'success');
    } else {
      showToast(data.message, 'error');
    }
  } catch {
    showToast('Server error. Please make sure the server is running.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
});

document.getElementById('signinForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!validateSignin()) return;

  const btn = document.getElementById('signinBtn');
  setButtonLoading(btn, true);

  try {
    const res = await fetch(`${API}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('si-email').value.trim() })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('fv_user', JSON.stringify(currentUser));
      onLoggedIn();
      showToast(`Welcome back, ${currentUser.name}! 💰`, 'success');
    } else {
      showToast(data.message, 'error');
    }
  } catch {
    showToast('Server error. Please make sure the server is running.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
});

function onLoggedIn() {
  document.getElementById('navbar').classList.remove('hidden');
  document.getElementById('navUserName').textContent = `👤 ${currentUser.name} ${currentUser.surname}`;
  loadUserGoal();
}

function handleLogout() {
  currentUser = null;
  currentGoal = null;
  localStorage.removeItem('fv_user');
  document.getElementById('navbar').classList.add('hidden');
  showPage('page1');
  switchTab('signin');
  showToast('You have been signed out.', 'info');
}

/* ─── Risk Selection ─────────────────────────────────────── */

function selectRisk(riskVal, el) {
  selectedRisk = riskVal;
  document.getElementById('riskProfile').value = riskVal;
  document.querySelectorAll('.risk-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  updatePreview();
}

/* ─── Live Preview Calculation ───────────────────────────── */

function calcProjected(savings, initial, months, riskVal) {
  const rate = riskVal === 'aggressive' ? 0.14 : riskVal === 'moderate' ? 0.10 : 0.06;
  const monthlyRate = rate / 12;
  const fvC = savings * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
  const fvL = initial * Math.pow(1 + monthlyRate, months);
  return { projected: fvC + fvL, annualRate: rate };
}

function updatePreview() {
  const target    = parseFloat(document.getElementById('targetAmount').value) || 0;
  const years     = parseFloat(document.getElementById('timelineYears').value) || 0;
  const savings   = parseFloat(document.getElementById('monthlySavings').value) || 0;
  const initial   = parseFloat(document.getElementById('currentSavings').value) || 0;
  const risk      = selectedRisk;

  document.getElementById('prev-target').textContent   = target   ? formatINR(target)   : '—';
  document.getElementById('prev-timeline').textContent = years    ? `${years} Years`     : '—';
  document.getElementById('prev-savings').textContent  = savings  ? formatINR(savings) + '/mo' : '—';

  const rateLabels = { conservative: '6%', moderate: '10%', aggressive: '14%' };
  document.getElementById('prev-rate').textContent = rateLabels[risk] + ' p.a.';

  if (savings && years) {
    const { projected } = calcProjected(savings, initial, years * 12, risk);
    document.getElementById('prev-corpus').textContent = formatINR(projected);

    const feasEl = document.getElementById('prev-feasible');
    if (target) {
      if (projected >= target) {
        feasEl.className = 'preview-feasibility yes';
        feasEl.textContent = '✅ Goal is achievable!';
      } else {
        feasEl.className = 'preview-feasibility no';
        feasEl.textContent = `⚠️ Shortfall: ${formatINR(target - projected)}`;
      }
    } else {
      feasEl.className = 'preview-feasibility';
      feasEl.textContent = '';
    }
  } else {
    document.getElementById('prev-corpus').textContent = '—';
  }
}

['targetAmount', 'timelineYears', 'monthlyIncome', 'monthlySavings', 'currentSavings'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updatePreview);
});

/* ─── Goal Form Submission ───────────────────────────────── */

function validateGoalForm() {
  let valid = true;
  const fields = [
    { id: 'goalName',       errId: 'err-goalName',       label: 'Goal name' },
    { id: 'targetAmount',   errId: 'err-targetAmount',   label: 'Target amount', type: 'num', min: 1000 },
    { id: 'timelineYears',  errId: 'err-timelineYears',  label: 'Timeline', type: 'num', min: 1, max: 40 },
    { id: 'monthlyIncome',  errId: 'err-monthlyIncome',  label: 'Monthly income', type: 'num', min: 0 },
    { id: 'monthlySavings', errId: 'err-monthlySavings', label: 'Monthly savings', type: 'num', min: 0 }
  ];

  fields.forEach(f => {
    const el = document.getElementById(f.id);
    const errEl = document.getElementById(f.errId);
    const val = el.value.trim();
    el.classList.remove('error');
    errEl.textContent = '';

    if (!val) {
      el.classList.add('error');
      errEl.textContent = `${f.label} is required.`;
      valid = false;
    } else if (f.type === 'num') {
      const n = parseFloat(val);
      if (isNaN(n) || (f.min !== undefined && n < f.min)) {
        el.classList.add('error');
        errEl.textContent = f.min !== undefined ? `Minimum value is ${f.min}.` : 'Invalid value.';
        valid = false;
      } else if (f.max !== undefined && n > f.max) {
        el.classList.add('error');
        errEl.textContent = `Maximum value is ${f.max} years.`;
        valid = false;
      }
    }
  });
  return valid;
}

document.getElementById('goalForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentUser) { showToast('Please sign in first.', 'error'); return; }
  if (!validateGoalForm()) return;

  const btn = document.getElementById('analyzeBtn');
  setButtonLoading(btn, true);

  try {
    const payload = {
      userId:          currentUser.id,
      goalName:        document.getElementById('goalName').value.trim(),
      targetAmount:    document.getElementById('targetAmount').value,
      timelineYears:   document.getElementById('timelineYears').value,
      monthlyIncome:   document.getElementById('monthlyIncome').value,
      monthlySavings:  document.getElementById('monthlySavings').value,
      currentSavings:  document.getElementById('currentSavings').value || '0',
      riskProfile:     selectedRisk
    };

    const res = await fetch(`${API}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      currentGoal = data.goal;
      showToast('Goal analyzed! Redirecting to your dashboard... 🚀', 'success');
      setTimeout(() => showPage('page3'), 800);
    } else {
      showToast(data.message, 'error');
    }
  } catch {
    showToast('Server error. Please make sure the server is running.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
});

/* ─── Load User Goal on Login ────────────────────────────── */

async function loadUserGoal() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API}/goals/${currentUser.id}`);
    const data = await res.json();
    if (data.success) {
      currentGoal = data.goal;
      prefillGoalForm();
      showPage('page3');
    } else {
      showPage('page2');
    }
  } catch {
    showPage('page2');
  }
}

function prefillGoalForm() {
  if (!currentGoal) return;
  document.getElementById('goalName').value       = currentGoal.goalName || '';
  document.getElementById('targetAmount').value   = currentGoal.targetAmount || '';
  document.getElementById('timelineYears').value  = currentGoal.timelineYears || '';
  document.getElementById('monthlyIncome').value  = currentGoal.monthlyIncome || '';
  document.getElementById('monthlySavings').value = currentGoal.monthlySavings || '';
  document.getElementById('currentSavings').value = currentGoal.currentSavings || '';
  selectRisk(currentGoal.riskProfile || 'conservative', document.querySelector(`[data-risk="${currentGoal.riskProfile || 'conservative'}"]`));
  updatePreview();
}

/* ─── Progress Page Rendering ────────────────────────────── */

function renderProgressPage() {
  if (!currentGoal) return;

  const g = currentGoal;
  const totalSaved = (g.progress || []).reduce((sum, p) => sum + p.amount, 0);
  const pct = Math.min(100, Math.round((totalSaved / g.targetAmount) * 100));
  const yearsGone = /* approximate */ 0;

  // Stats
  document.getElementById('sc-target').textContent    = formatINR(g.targetAmount);
  document.getElementById('sc-projected').textContent = formatINR(g.projectedTotal);
  document.getElementById('sc-saved').textContent     = formatINR(totalSaved);
  document.getElementById('sc-years').textContent     = `${g.timelineYears} yrs`;
  document.getElementById('p3-subtitle').textContent  = `Goal: "${g.goalName}" • ${g.timelineYears} years timeline`;

  // AI Banner
  const banner = document.getElementById('aiBanner');
  banner.classList.remove('hidden', 'feasible', 'not-feasible');
  if (g.feasible) {
    banner.classList.add('feasible');
    document.getElementById('aiBannerIcon').textContent  = '🤖';
    document.getElementById('aiBannerTitle').textContent = '✅ AI says: Your goal is achievable!';
    document.getElementById('aiBannerText').textContent  =
      `Based on your ${(g.annualRate * 100).toFixed(0)}% annual return expectation, you are projected to accumulate ${formatINR(g.projectedTotal)} — which exceeds your target of ${formatINR(g.targetAmount)} by ${formatINR(g.projectedTotal - g.targetAmount)}. Keep it up!`;
  } else {
    banner.classList.add('not-feasible');
    document.getElementById('aiBannerIcon').textContent  = '⚠️';
    document.getElementById('aiBannerTitle').textContent = '⚠️ AI says: You need to increase savings';
    document.getElementById('aiBannerText').textContent  =
      `Your current plan may fall short by ${formatINR(g.shortfall)}. You need to save about ${formatINR(g.monthlyNeeded)}/month to meet your goal of ${formatINR(g.targetAmount)}.`;
  }

  // Progress Bar
  document.getElementById('bigProgressFill').style.width = `${pct}%`;
  document.getElementById('progressPercent').textContent = `${pct}% funded`;
  document.getElementById('progressRemaining').textContent = `${formatINR(g.targetAmount - totalSaved)} remaining`;

  // Bar Chart (year-by-year)
  renderBarChart(g);

  // Milestones
  renderMilestones(g, totalSaved);

  // AI Recommendations
  renderAIRecommendations(g);

  // Saving History
  renderSavingHistory(g.progress || []);
}

function renderBarChart(g) {
  const chart = document.getElementById('barChart');
  const labels = document.getElementById('barChartLabels');
  chart.innerHTML = '';
  labels.innerHTML = '';

  const years = Math.min(g.timelineYears, 20);
  const monthlyRate = g.annualRate / 12;
  const values = [];
  let maxVal = 0;

  for (let y = 1; y <= years; y++) {
    const months = y * 12;
    const fvC = g.monthlySavings * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
    const fvL = g.currentSavings * Math.pow(1 + monthlyRate, months);
    const val = fvC + fvL;
    values.push(val);
    if (val > maxVal) maxVal = val;
  }

  values.forEach((val, i) => {
    const heightPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
    const isTarget = val >= g.targetAmount;
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = `${heightPct}%`;
    bar.style.background = isTarget
      ? 'linear-gradient(180deg, #00b894, #00d2d3)'
      : 'linear-gradient(180deg, #6c63ff, #a29bfe)';
    bar.setAttribute('data-label', `Yr ${i + 1}: ${formatINR(val)}`);
    chart.appendChild(bar);

    const lbl = document.createElement('div');
    lbl.className = 'chart-label';
    lbl.textContent = `Y${i + 1}`;
    labels.appendChild(lbl);
  });
}

function renderMilestones(g, totalSaved) {
  const tl = document.getElementById('milestoneTimeline');
  tl.innerHTML = '';

  const milestones = [
    { label: 'Journey Started!', desc: 'Account created & goal set', pct: 0 },
    { label: '25% Funded',       desc: `Save ${formatINR(g.targetAmount * 0.25)}`, pct: 25 },
    { label: '50% Halfway',      desc: `Save ${formatINR(g.targetAmount * 0.5)}`,  pct: 50 },
    { label: '75% Almost There', desc: `Save ${formatINR(g.targetAmount * 0.75)}`, pct: 75 },
    { label: '🎉 Goal Achieved!', desc: `Reach ${formatINR(g.targetAmount)}`,      pct: 100 }
  ];

  const pct = Math.min(100, (totalSaved / g.targetAmount) * 100);

  milestones.forEach(m => {
    const done   = pct > m.pct;
    const active = !done && pct >= m.pct - 5;
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div class="timeline-dot ${done ? 'done' : active ? 'active' : 'pending'}"></div>
      <div class="timeline-content">
        <div class="timeline-label">${m.label}</div>
        <div class="timeline-desc">${m.desc}</div>
      </div>
    `;
    tl.appendChild(item);
  });
}

function renderAIRecommendations(g) {
  const container = document.getElementById('aiRecommendations');
  container.innerHTML = '';

  const recommendations = [];

  // Based on savings rate
  const savingsRate = (g.monthlySavings / g.monthlyIncome) * 100;
  if (savingsRate < 20) {
    recommendations.push({ icon: '📈', text: `Your savings rate is ${savingsRate.toFixed(1)}%. Try to save at least 20% of your income for faster goal achievement.` });
  } else {
    recommendations.push({ icon: '✅', text: `Great savings discipline! Your ${savingsRate.toFixed(1)}% savings rate is above the recommended 20%.` });
  }

  // Based on feasibility
  if (!g.feasible) {
    recommendations.push({ icon: '💡', text: `Increase monthly savings by ${formatINR(g.monthlyNeeded - g.monthlySavings)} to close the gap of ${formatINR(g.shortfall)}.` });
    recommendations.push({ icon: '⏰', text: `Consider extending your timeline — even 2 more years can dramatically increase your corpus via compounding.` });
  } else {
    recommendations.push({ icon: '🚀', text: `You're on track! Consider switching to a higher risk profile to build an even larger corpus.` });
  }

  // Risk-based
  if (g.riskProfile === 'conservative') {
    recommendations.push({ icon: '⚖️', text: `Conservative investors often miss out on equity returns. Consider adding a 30% equity SIP for better long-term growth.` });
  } else if (g.riskProfile === 'aggressive') {
    recommendations.push({ icon: '🛡️', text: `Balance your aggressive investments with some debt/gold allocation for stability (80:10:10 portfolio).` });
  }

  // Emergency fund
  recommendations.push({ icon: '🆘', text: `Maintain an emergency fund of 6× monthly expenses (${formatINR(g.monthlyIncome * 6)}) before aggressive investing.` });

  recommendations.push({ icon: '📊', text: `Review and rebalance your portfolio at least once a year to stay aligned with your ${g.goalName} goal.` });

  recommendations.forEach(r => {
    const el = document.createElement('div');
    el.className = 'ai-rec-item';
    el.innerHTML = `<span class="ai-rec-icon">${r.icon}</span><span>${r.text}</span>`;
    container.appendChild(el);
  });
}

function renderSavingHistory(progress) {
  const container = document.getElementById('savingHistory');
  container.innerHTML = '';

  if (!progress.length) {
    container.innerHTML = '<p class="empty-state">No savings logged yet. Start by logging your first saving above!</p>';
    return;
  }

  [...progress].reverse().forEach(p => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const date = new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    item.innerHTML = `
      <span class="history-amount">+${formatINR(p.amount)}</span>
      <span class="history-note">${p.note || '—'}</span>
      <span class="history-date">${date}</span>
    `;
    container.appendChild(item);
  });
}

/* ─── Log Saving Form ────────────────────────────────────── */

document.getElementById('progressForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentUser || !currentGoal) { showToast('Please set up your goal first.', 'error'); return; }

  const amountEl = document.getElementById('progAmount');
  const amount = parseFloat(amountEl.value);
  if (!amount || amount < 1) {
    amountEl.classList.add('error');
    showToast('Please enter a valid amount.', 'error');
    return;
  }

  const btn = document.getElementById('logSavingBtn');
  setButtonLoading(btn, true);

  try {
    const res = await fetch(`${API}/goals/${currentUser.id}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amount,
        note: document.getElementById('progNote').value.trim()
      })
    });
    const data = await res.json();
    if (data.success) {
      currentGoal.progress = data.progress;
      renderProgressPage();
      document.getElementById('progressForm').reset();
      showToast(`Saving of ${formatINR(amount)} logged! 💰`, 'success');
    } else {
      showToast(data.message, 'error');
    }
  } catch {
    showToast('Server error. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
});

/* ─── App Init ───────────────────────────────────────────── */

function init() {
  const savedUser = localStorage.getItem('fv_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      onLoggedIn();
    } catch {
      localStorage.removeItem('fv_user');
    }
  }

}

document.addEventListener('DOMContentLoaded', init);
