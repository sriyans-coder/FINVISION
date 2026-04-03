const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GOALS_FILE = path.join(DATA_DIR, 'goals.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files if they don't exist
function initFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

initFile(USERS_FILE, []);
initFile(GOALS_FILE, []);

// Helper functions
function readJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ─── AUTH ROUTES ────────────────────────────────────────────────────────────

// POST /api/signup
app.post('/api/signup', (req, res) => {
  const { name, surname, email, gender, age } = req.body;
  if (!name || !surname || !email || !gender || !age) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const users = readJSON(USERS_FILE);
  const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email already registered. Please sign in.' });
  }

  const newUser = {
    id: uuidv4(),
    name,
    surname,
    email: email.toLowerCase(),
    gender,
    age: parseInt(age),
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJSON(USERS_FILE, users);

  return res.status(201).json({ success: true, message: 'Account created!', user: newUser });
});

// POST /api/signin
app.post('/api/signin', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ success: false, message: 'No account found with this email.' });
  }

  return res.json({ success: true, message: 'Welcome back!', user });
});

// ─── GOAL ROUTES ─────────────────────────────────────────────────────────────

// POST /api/goals
app.post('/api/goals', (req, res) => {
  const { userId, goalName, targetAmount, timelineYears, monthlyIncome, monthlySavings, currentSavings, riskProfile } = req.body;
  if (!userId || !goalName || !targetAmount || !timelineYears || !monthlyIncome || !monthlySavings) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const goals = readJSON(GOALS_FILE);
  const existingIndex = goals.findIndex(g => g.userId === userId);

  const annualRate = riskProfile === 'aggressive' ? 0.14 : riskProfile === 'moderate' ? 0.10 : 0.06;
  const monthlyRate = annualRate / 12;
  const months = parseInt(timelineYears) * 12;
  const savings = parseFloat(monthlySavings);
  const initial = parseFloat(currentSavings) || 0;

  // Future value of monthly contributions
  const fvContributions = savings * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
  // Future value of current savings lump sum
  const fvLump = initial * Math.pow(1 + monthlyRate, months);
  const projectedTotal = fvContributions + fvLump;
  const target = parseFloat(targetAmount);
  const feasible = projectedTotal >= target;
  const shortfall = feasible ? 0 : target - projectedTotal;

  // Monthly needed to reach goal
  const monthlyNeeded = shortfall > 0
    ? (target - fvLump) * monthlyRate / (Math.pow(1 + monthlyRate, months) - 1)
    : savings;

  const goalEntry = {
    id: existingIndex >= 0 ? goals[existingIndex].id : uuidv4(),
    userId,
    goalName,
    targetAmount: target,
    timelineYears: parseInt(timelineYears),
    monthlyIncome: parseFloat(monthlyIncome),
    monthlySavings: savings,
    currentSavings: initial,
    riskProfile: riskProfile || 'moderate',
    annualRate,
    projectedTotal: Math.round(projectedTotal),
    feasible,
    shortfall: Math.round(shortfall),
    monthlyNeeded: Math.round(monthlyNeeded),
    progress: [],
    lastUpdated: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    goals[existingIndex] = { ...goalEntry, progress: goals[existingIndex].progress };
  } else {
    goals.push(goalEntry);
  }
  writeJSON(GOALS_FILE, goals);

  return res.status(201).json({ success: true, goal: goalEntry });
});

// GET /api/goals/:userId
app.get('/api/goals/:userId', (req, res) => {
  const goals = readJSON(GOALS_FILE);
  const userGoal = goals.find(g => g.userId === req.params.userId);
  if (!userGoal) {
    return res.status(404).json({ success: false, message: 'No goal found.' });
  }
  return res.json({ success: true, goal: userGoal });
});

// POST /api/goals/:userId/progress
app.post('/api/goals/:userId/progress', (req, res) => {
  const { amount, note } = req.body;
  const goals = readJSON(GOALS_FILE);
  const index = goals.findIndex(g => g.userId === req.params.userId);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Goal not found.' });
  }

  const entry = {
    id: uuidv4(),
    amount: parseFloat(amount),
    note: note || '',
    date: new Date().toISOString()
  };

  goals[index].progress.push(entry);
  goals[index].lastUpdated = new Date().toISOString();
  writeJSON(GOALS_FILE, goals);

  return res.json({ success: true, progress: goals[index].progress });
});

// GET /api/users
app.get('/api/users', (req, res) => {
  const users = readJSON(USERS_FILE);
  return res.json({ success: true, count: users.length });
});

// Catch-all: serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Financial Goal Tracker Server running at http://localhost:${PORT}`);
});
