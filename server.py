#!/usr/bin/env python3
"""
FinVision - Financial Goal Tracker Backend
Python HTTP server replacing Node.js/Express
Handles all API routes + serves static files
"""

import json
import os
import uuid
import re
from datetime import datetime, timezone
from typing import List, Dict, Any
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import math

PORT = int(os.environ.get('PORT', 3000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
DATA_DIR   = os.path.join(BASE_DIR, 'data')
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
GOALS_FILE = os.path.join(DATA_DIR, 'goals.json')

# ── Init Data Dir ────────────────────────────────────────────
os.makedirs(DATA_DIR, exist_ok=True)

def init_file(path, default):
    if not os.path.exists(path):
        with open(path, 'w') as f:
            json.dump(default, f, indent=2)

init_file(USERS_FILE, [])
init_file(GOALS_FILE, [])

# ── Helpers ──────────────────────────────────────────────────
def read_json(path) -> list:
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except Exception:
        return []

def write_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def json_response(handler, status, data):
    body = json.dumps(data).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Content-Length', str(len(body)))
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type')
    handler.end_headers()
    handler.wfile.write(body)

def read_body(handler):
    length = int(handler.headers.get('Content-Length', 0))
    if length == 0:
        return {}
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode('utf-8'))
    except Exception:
        return {}

def calculate_goal(payload):
    risk        = payload.get('riskProfile', 'conservative')
    annual_rate = 0.14 if risk == 'aggressive' else 0.10 if risk == 'moderate' else 0.06
    monthly_rate = annual_rate / 12
    months       = int(payload.get('timelineYears', 1)) * 12
    savings      = float(payload.get('monthlySavings', 0))
    initial      = float(payload.get('currentSavings', 0))
    target       = float(payload.get('targetAmount', 0))

    if monthly_rate == 0:
        fv_contributions = savings * months
    else:
        fv_contributions = savings * ((math.pow(1 + monthly_rate, months) - 1) / monthly_rate)
    fv_lump   = initial * math.pow(1 + monthly_rate, months)
    projected = fv_contributions + fv_lump
    feasible  = projected >= target
    shortfall = 0 if feasible else target - projected

    # Monthly savings needed
    if shortfall > 0 and monthly_rate > 0:
        monthly_needed = (target - fv_lump) * monthly_rate / (math.pow(1 + monthly_rate, months) - 1)
    else:
        monthly_needed = savings

    return {
        'annualRate':      annual_rate,
        'projectedTotal':  round(projected),
        'feasible':        feasible,
        'shortfall':       round(shortfall),
        'monthlyNeeded':   round(monthly_needed),
    }


# ── Request Handler ──────────────────────────────────────────
class FinVisionHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve static files from public/
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def log_message(self, format: str, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {format % args}")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path

        # ── API Routes ──
        if path == '/api/users':
            users = read_json(USERS_FILE)
            json_response(self, 200, {'success': True, 'count': len(users)})
            return

        m = re.match(r'^/api/goals/([^/]+)$', path)
        if m:
            user_id = m.group(1)
            goals   = read_json(GOALS_FILE)
            goal    = next((g for g in goals if g['userId'] == user_id), None)
            if goal:
                json_response(self, 200, {'success': True, 'goal': goal})
            else:
                json_response(self, 404, {'success': False, 'message': 'No goal found.'})
            return

        # ── Static File Fallback ──
        # For any non-API GET, serve index.html (SPA)
        if not path.startswith('/api'):
            # Check if a real file exists in public/
            file_path = os.path.join(PUBLIC_DIR, path.lstrip('/'))
            if os.path.isfile(file_path):
                super().do_GET()
            else:
                # Serve index.html for SPA routes
                self.path = '/index.html'
                super().do_GET()
            return

        json_response(self, 404, {'success': False, 'message': 'Route not found.'})

    def do_POST(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        body   = read_body(self)

        # ── POST /api/signup ──
        if path == '/api/signup':
            name    = (body.get('name', '') or '').strip()
            surname = (body.get('surname', '') or '').strip()
            email   = (body.get('email', '') or '').strip().lower()
            gender  = (body.get('gender', '') or '').strip()
            age_raw = body.get('age', '')

            if not all([name, surname, email, gender, age_raw]):
                json_response(self, 400, {'success': False, 'message': 'All fields are required.'})
                return

            try:
                age = int(age_raw)
                if not (13 <= age <= 100):
                    raise ValueError()
            except (ValueError, TypeError):
                json_response(self, 400, {'success': False, 'message': 'Invalid age.'})
                return

            users = read_json(USERS_FILE)
            if any(u['email'] == email for u in users):
                json_response(self, 409, {'success': False, 'message': 'Email already registered. Please sign in.'})
                return

            user = {
                'id':        str(uuid.uuid4()),
                'name':      name,
                'surname':   surname,
                'email':     email,
                'gender':    gender,
                'age':       age,
                'createdAt': datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + 'Z'
            }
            users.append(user)
            write_json(USERS_FILE, users)
            json_response(self, 201, {'success': True, 'message': 'Account created!', 'user': user})
            return

        # ── POST /api/signin ──
        if path == '/api/signin':
            email = (body.get('email', '') or '').strip().lower()
            if not email:
                json_response(self, 400, {'success': False, 'message': 'Email is required.'})
                return
            users = read_json(USERS_FILE)
            user  = next((u for u in users if u['email'] == email), None)
            if not user:
                json_response(self, 400, {'success': False, 'message': 'No account found with this email.'})
                return
            json_response(self, 200, {'success': True, 'message': 'Welcome back!', 'user': user})
            return

        # ── POST /api/goals ──
        if path == '/api/goals':
            user_id      = body.get('userId', '')
            goal_name    = (body.get('goalName', '') or '').strip()
            target_amt   = body.get('targetAmount', '')
            timeline     = body.get('timelineYears', '')
            monthly_inc  = body.get('monthlyIncome', '')
            monthly_sav  = body.get('monthlySavings', '')

            if not all([user_id, goal_name, target_amt, timeline, monthly_inc, monthly_sav]):
                json_response(self, 400, {'success': False, 'message': 'All fields are required.'})
                return

            calc = calculate_goal(body)
            goals = read_json(GOALS_FILE)
            idx   = next((i for i, g in enumerate(goals) if g['userId'] == user_id), -1)

            profit_loss = float(body.get('profitLoss', 0) or 0)

            # ── Compare same-goal / different-amount for chart comparison ──
            previous_goal_data = None
            if idx >= 0:
                old = goals[idx]
                old_name  = old.get('goalName', '').lower().strip()
                new_name  = goal_name.lower().strip()
                old_amt   = float(old.get('targetAmount', 0))
                new_amt_f = float(target_amt)
                if old_name == new_name and abs(old_amt - new_amt_f) > 0.01:
                    # Same goal name, different amount → store snapshot
                    previous_goal_data = {
                        'goalName':       old.get('goalName'),
                        'targetAmount':   old_amt,
                        'projectedTotal': old.get('projectedTotal', 0),
                        'timelineYears':  old.get('timelineYears', 0),
                        'monthlySavings': old.get('monthlySavings', 0),
                        'annualRate':     old.get('annualRate', 0.06),
                        'feasible':       old.get('feasible', False),
                        'shortfall':      old.get('shortfall', 0),
                    }
                elif old_name == new_name:
                    # Same goal, same amount → preserve existing previousGoal
                    previous_goal_data = old.get('previousGoal', None)
                # Different goal name → clear previous comparison

            goal_entry = {
                'id':             goals[idx]['id'] if idx >= 0 else str(uuid.uuid4()),
                'userId':         user_id,
                'goalName':       goal_name,
                'targetAmount':   float(target_amt),
                'timelineYears':  int(timeline),
                'monthlyIncome':  float(monthly_inc),
                'monthlySavings': float(monthly_sav),
                'currentSavings': float(body.get('currentSavings', 0) or 0),
                'profitLoss':     profit_loss,
                'riskProfile':    body.get('riskProfile', 'conservative'),
                'annualRate':     calc['annualRate'],
                'projectedTotal': calc['projectedTotal'],
                'feasible':       calc['feasible'],
                'shortfall':      calc['shortfall'],
                'monthlyNeeded':  calc['monthlyNeeded'],
                'previousGoal':   previous_goal_data,
                'progress':       goals[idx]['progress'] if idx >= 0 else [],
                'lastUpdated':    datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + 'Z'
            }

            if idx >= 0:
                goals[idx] = goal_entry
            else:
                goals.append(goal_entry)

            write_json(GOALS_FILE, goals)
            json_response(self, 201, {'success': True, 'goal': goal_entry})
            return

        # ── POST /api/goals/:userId/progress ──
        m = re.match(r'^/api/goals/([^/]+)/progress$', path)
        if m:
            user_id = m.group(1)
            goals   = read_json(GOALS_FILE)
            idx     = next((i for i, g in enumerate(goals) if g['userId'] == user_id), -1)
            if idx == -1:
                json_response(self, 404, {'success': False, 'message': 'Goal not found.'})
                return

            amount = body.get('amount', 0)
            try:
                amount = float(amount)
                if amount < 1:
                    raise ValueError()
            except (ValueError, TypeError):
                json_response(self, 400, {'success': False, 'message': 'Invalid amount.'})
                return

            entry = {
                'id':     str(uuid.uuid4()),
                'amount': amount,
                'note':   (body.get('note', '') or '').strip(),
                'date':   datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + 'Z'
            }
            goals[idx]['progress'].append(entry)
            goals[idx]['lastUpdated'] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + 'Z'
            write_json(GOALS_FILE, goals)
            json_response(self, 200, {'success': True, 'progress': goals[idx]['progress']})
            return

        json_response(self, 404, {'success': False, 'message': 'Route not found.'})


# ── Start Server ─────────────────────────────────────────────
class FinVisionServer(HTTPServer):
    # Allow reuse of port immediately after server stops
    allow_reuse_address = True

if __name__ == '__main__':
    try:
        server = FinVisionServer(('', PORT), FinVisionHandler)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"""
❌  Port {PORT} is already in use!

    Fix: Run this command first to free the port:
         lsof -ti:{PORT} | xargs kill -9

    Then run:  python3 server.py
""")
        else:
            print(f"❌  Server error: {e}")
        exit(1)

    print(f"FinVision - Financial Goal Tracker")
    print(f"Server running at: http://localhost:{PORT}")
    print(f"Press Ctrl+C to stop")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
