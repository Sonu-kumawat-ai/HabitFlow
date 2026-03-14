from datetime import datetime

from bson.objectid import ObjectId
from flask import Blueprint, jsonify, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from modules.extensions import bcrypt, login_manager, mongo
from modules.models import User

auth_bp = Blueprint('auth', __name__)


@login_manager.user_loader
def load_user(user_id):
    user_data = mongo.db.users.find_one({'_id': ObjectId(user_id)})
    if user_data:
        return User(user_data)
    return None


@auth_bp.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('tasks.home'))
    return redirect(url_for('auth.login'))


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('tasks.home'))

    if request.method == 'POST':
        data = request.get_json() or {}
        username = data.get('username', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        if not username or not email or not password:
            return jsonify({'success': False, 'message': 'All fields are required'})

        if mongo.db.users.find_one({'email': email}):
            return jsonify({'success': False, 'message': 'Email already registered'})
        if mongo.db.users.find_one({'username': username}):
            return jsonify({'success': False, 'message': 'Username already taken'})

        hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')
        user_id = mongo.db.users.insert_one({
            'username': username,
            'email': email,
            'password': hashed_pw,
            'created_at': datetime.utcnow(),
        }).inserted_id

        user_data = mongo.db.users.find_one({'_id': user_id})
        login_user(User(user_data))
        return jsonify({'success': True, 'redirect': url_for('tasks.home')})

    return render_template('auth.html', mode='register')


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('tasks.home'))

    if request.method == 'POST':
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        user_data = mongo.db.users.find_one({'email': email})
        if user_data and bcrypt.check_password_hash(user_data['password'], password):
            login_user(User(user_data))
            return jsonify({'success': True, 'redirect': url_for('tasks.home')})

        return jsonify({'success': False, 'message': 'Invalid email or password'})

    return render_template('auth.html', mode='login')


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.login'))
