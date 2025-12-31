import os
import re
import tempfile
import subprocess
from datetime import datetime, UTC

# --- Core Flask and Authentication Imports ---
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user, login_required
from werkzeug.security import generate_password_hash, check_password_hash

# --- AI/NLP Imports ---
from textblob import TextBlob
from transformers import pipeline
import speech_recognition as sr

# --- App and Database Setup ---

app = Flask(__name__, template_folder='.')

# Flask Configuration
app.config['SECRET_KEY'] = 'your_super_secret_and_complex_key' 
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///mindcheck.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize Extensions
db = SQLAlchemy(app)
CORS(app)

# --- Flask-Login Setup ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- Database Models ---

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    
    # --- NEW: Added role column ---
    role = db.Column(db.String(20), nullable=False, default='user') 
    
    entries = db.relationship('CheckInEntry', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.username}>'

class CheckInEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(UTC))
    mood_score = db.Column(db.Integer, nullable=False)
    stress_score = db.Column(db.Integer, nullable=False)
    full_text = db.Column(db.Text, nullable=False)
    recommendations = db.Column(db.Text, nullable=True) 
    
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'mood_score': self.mood_score,
            'stress_score': self.stress_score,
            'full_text': self.full_text,
            'recommendations': self.recommendations.split('||') if self.recommendations else []
        }

# --- Flask-Login User Loader ---
@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

# --- Handle Unauthorized API Requests ---
@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/'):
        return jsonify(error="Unauthorized access. Please log in."), 401
    return redirect(url_for('login'))


# --- AI Model Initialization ---
print("Loading emotion classification model...")
try:
    emotion_classifier = pipeline(
        'text-classification',
        model='j-hartmann/emotion-english-distilroberta-base',
        top_k=None 
    )
    print("Emotion model loaded successfully.")
except Exception as e:
    print(f"Error loading AI model: {e}")
    emotion_classifier = None 

# --- Keyword Definitions (Revised) ---
DEPRESSION_KEYWORDS = {
    'high_risk': ['suicide', 'kill myself', 'end it all', 'want to die', 'better off dead', 'harm myself', 'no point living'],
    'medium_risk': ['hopeless', 'empty', 'numb', 'cant go on', 'cant cope', 'worthless', 'no future'],
    'low_risk': ['sad', 'unhappy', 'down', 'crying', 'exhausted', 'sleepy', 'lonely', 'alone']
}

STRESS_KEYWORDS = {
    'high': ['overwhelmed', 'cant handle', 'breaking down', 'drowning', 'too much on my plate', 'panic', 'panic attack', 'completely drained'],
    'medium': ['stressed', 'anxious', 'worried', 'pressure', 'nervous', 'tense', 'cant sleep', 'deadline', 'quizzes', 'assignments', 'piling up', 'not working', 'fed up', 'amount of work', 'never catch up', 'drained'],
    'low': ['busy', 'tired', 'concerned', 'apprehensive', 'distracted', 'coming up', 'overbooked', 'rushed']
}

POSITIVE_KEYWORDS = [
    'prepared', "i'll be fine", "ill be fine", 'ready', 'handling it', 'feeling good', 'okay', 
    'manageable', 'but i', 'however', 'mostly'
]

# ----------------------------------------------------
# --- AI Analysis Functions (FINAL REVISIONS) ---
# ----------------------------------------------------

def map_emotions_to_feelings(emotions, text_lower):
    """Maps dominant emotions and keywords to specific secondary feelings."""
    
    feelings = {k: v for k, v in emotions['all_emotions'].items()}
    dominant = emotions['dominant']
    
    if dominant == 'sadness':
        if 'lonely' in text_lower or 'alone' in text_lower:
            feelings['lonely'] = feelings['sadness'] * 0.9
        elif 'disappoint' in text_lower or 'fed up' in text_lower or 'not working' in text_lower or 'drained' in text_lower:
            feelings['disappointed'] = feelings['sadness'] * 0.9
        else:
            feelings['despair'] = feelings['sadness'] * 0.7
    
    elif dominant == 'anger':
        if 'fed up' in text_lower or 'not working' in text_lower or 'project' in text_lower:
            feelings['frustrated'] = feelings['anger'] * 0.95
        elif 'threat' in text_lower or 'mad' in text_lower:
            feelings['mad'] = feelings['anger'] * 0.8
        
    elif dominant == 'fear':
        if 'anxious' in text_lower or 'worried' in text_lower or 'deadline' in text_lower or 'overwhelmed' in text_lower:
            feelings['anxious'] = feelings['fear'] * 0.95
        else:
            feelings['scared'] = feelings['fear'] * 0.7
            
    elif dominant == 'joy':
        if 'optimistic' in text_lower or 'proud' in text_lower:
            feelings['optimistic'] = feelings['joy'] * 0.95
        else:
            feelings['peaceful'] = feelings['joy'] * 0.7
            
    if 'sadness' in feelings: del feelings['sadness']
    if 'anger' in feelings: del feelings['anger']
    if 'fear' in feelings: del feelings['fear']
    if 'joy' in feelings: del feelings['joy']
    
    return feelings

def analyze_mood_level(text, emotions):
    """Mood Rating (0=Bad, 100=Good). Penalizes for negative emotions/keywords."""
    text_lower = text.lower()
    
    high = sum(1 for k in DEPRESSION_KEYWORDS['high_risk'] if k in text_lower)
    med = sum(1 for k in DEPRESSION_KEYWORDS['medium_risk'] if k in text_lower)
    low = sum(1 for k in DEPRESSION_KEYWORDS['low_risk'] if k in text_lower)
    keyword_score = (high * 100) + (med * 40) + (low * 15)
    
    sentiment_polarity = TextBlob(text).sentiment.polarity
    sadness_score = emotions['all_emotions'].get('sadness', 0)
    anger_score = emotions['all_emotions'].get('anger', 0)
    fear_score = emotions['all_emotions'].get('fear', 0)
    neutral_score = emotions['all_emotions'].get('neutral', 0)
    
    negative_emotion_score = (sadness_score * 1.5) + (anger_score * 1.5) + (fear_score * 0.7)
    
    raw_low_mood = (
        (keyword_score * 0.3) + 
        ((1 - sentiment_polarity) * 30) + 
        (negative_emotion_score * 0.8)
    )

    if neutral_score > 50 and sentiment_polarity < 0.5:
        raw_low_mood += neutral_score * 0.15 
    
    stress_key_count = sum(1 for k in STRESS_KEYWORDS['high'] + STRESS_KEYWORDS['medium'] if k in text_lower)
    raw_low_mood += stress_key_count * 25 

    positive_key_count = sum(1 for k in POSITIVE_KEYWORDS if k in text_lower)
    raw_low_mood -= positive_key_count * 40 

    low_mood_score = min(100, raw_low_mood / 1.5) 
    low_mood_score = max(0, low_mood_score) 
    
    mood_rating_score = 100 - low_mood_score 

    
    if mood_rating_score >= 80:
        level, label_class = "GREAT MOOD", "great-mood"
        msg = "☀️ Your mood is excellent! Your reflections are very positive and light."
    elif mood_rating_score >= 60:
        level, label_class = "GOOD MOOD", "good-mood"
        msg = "😊 A good day! You're showing signs of positivity and balance."
    elif mood_rating_score >= 40:
        level, label_class = "NEUTRAL", "neutral-mood"
        msg = "☁️ You seem to be feeling mellow or perhaps numb. Pay attention to those subtle cues."
    elif mood_rating_score >= 20:
        level, label_class = "LOW MOOD", "low-mood"
        msg = "😔 We're noticing significant heaviness, sadness, or frustration. Be kind to yourself today."
    else:
        level, label_class = "VERY LOW MOOD", "very-low-mood"
        msg = "⚠️ Your words show significant signs of distress. Please reach out to a support line immediately. You are not alone."

    return {
        'level': level, 
        'score': int(mood_rating_score), 
        'explanation': msg, 
        'label_class': label_class 
    }

def analyze_stress_level(text, emotions):
    """Stress Score (0=Low, 100=High)."""
    text_lower = text.lower()
    
    high = sum(1 for k in STRESS_KEYWORDS['high'] if k in text_lower)
    med = sum(1 for k in STRESS_KEYWORDS['medium'] if k in text_lower)
    low = sum(1 for k in STRESS_KEYWORDS['low'] if k in text_lower)

    keyword_score = (high * 60) + (med * 35) + (low * 15)
    
    fear_score = emotions['all_emotions'].get('fear', 0)
    anger_score = emotions['all_emotions'].get('anger', 0) 
    surprise_score = emotions['all_emotions'].get('surprise', 0)
    sadness_score = emotions['all_emotions'].get('sadness', 0)
    
    polarity = TextBlob(text).sentiment.polarity 
    general_stress_penalty = (1 - polarity) * 15 
        
    raw_stress = keyword_score + (fear_score * 0.9) + (anger_score * 0.5) + (surprise_score * 0.3) + (sadness_score * 0.6) + general_stress_penalty
    
    positive_key_count = sum(1 for k in POSITIVE_KEYWORDS if k in text_lower)
    raw_stress -= positive_key_count * 50 

    final_score = min(100, raw_stress / 1.7) 
    final_score = max(0, final_score) 

    if final_score >= 70:
        level, msg = "HIGH STRESS", "🔴 High stress detected. You seem overwhelmed. Take immediate steps to find a moment of calm."
    elif final_score >= 40:
        level, msg = "MODERATE STRESS", "🟡 Moderate stress. We're noticing tension. Try mindfulness or rest."
    else:
        level, msg = "LOW STRESS", "🟢 You appear calm and balanced. Keep up the healthy habits."

    return {'level': level, 'score': int(final_score), 'explanation': msg}

def analyze_emotions(text):
    """Analyzes emotions and includes overrides for 'overwhelmed' and 'nervous'."""
    text_lower = text.lower()
    
    if 'overwhelmed' in text_lower or 'amount of work' in text_lower or 'too much' in text_lower or 'drained' in text_lower or 'never catch up' in text_lower:
        print("Override: Forcing high FEAR/ANXIETY/SADNESS due to 'overwhelmed' or 'drained' keywords.")
        custom_emotions = {
            'fear': 50.0, 'sadness': 40.0, 'anger': 5.0, 'neutral': 2.0,
            'surprise': 1.0, 'joy': 1.0, 'disgust': 1.0,
        }
        dominant = 'fear' if 'overwhelmed' in text_lower else 'sadness'
        return {'dominant': dominant, 'all_emotions': custom_emotions}
        
    is_nervous = 'nervous' in text_lower or 'anxious' in text_lower
    is_mitigated = any(k in text_lower for k in POSITIVE_KEYWORDS)
    
    if is_nervous and is_mitigated:
        print("Override: Mitigating 'nervous' due to positive keywords.")
        custom_emotions = {
            'neutral': 60.0, 'joy': 20.0, 'fear': 15.0,     
            'sadness': 0.0, 'anger': 0.0, 'disgust': 0.0, 'surprise': 5.0
        }
        dominant = 'neutral'
        return {'dominant': dominant, 'all_emotions': custom_emotions}
        
    if not emotion_classifier:
        return {'dominant': 'neutral', 'all_emotions': {'neutral': 100.0}}
    try:
        truncated_text = text[:1000]
        results = emotion_classifier(truncated_text)[0]
        emotions = {r['label']: round(r['score'] * 100, 1) for r in results}
        dominant = max(emotions, key=emotions.get)
        return {'dominant': dominant, 'all_emotions': emotions}
    except Exception as e:
        print(f"Error in emotion analysis: {e}")
        return {'dominant': 'neutral', 'all_emotions': {'neutral': 100.0}}

def get_recommendations(mood, stress):
    recs = []
    
    if mood['score'] <= 15: 
        recs.append("Please connect with someone immediately. You can call or text 988 (US) or your local crisis line. They are there to listen.")
    if stress['score'] >= 70:
        recs.append("You seem overwhelmed. Try a 5-4-3-2-1 grounding exercise: Name 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste.")
    
    if stress['score'] >= 50 and mood['score'] >= 40 and mood['score'] < 70:
        recs.append("Your workload is creating hidden stress. Try scheduling 3 specific tasks and blocking out 1 hour of 'no-work' time to regain control.")

    if mood['score'] <= 35 and mood['score'] > 15: 
        recs.append("It sounds like you're carrying a heavy load. It might be a good time to talk to a therapist or a trusted friend about these feelings.")
    if stress['score'] >= 40 and stress['score'] < 70:
        recs.append("Your tension levels seem elevated. A short 10-minute walk outside, without your phone, can make a big difference.")
    if mood['score'] >= 75 and stress['score'] < 40:
        recs.append("It's great that you're checking in. Keep up the self-awareness! Maintaining this balance is a healthy practice.")
    if not recs:
        recs.append("Taking a moment to check in with yourself is a healthy step. Continue to be mindful of your feelings as you go about your day.")

    return list(dict.fromkeys(recs))[:3]

def speech_to_text(audio_file_path):
    recognizer = sr.Recognizer()
    try:
        with sr.AudioFile(audio_file_path) as source:
            audio_data = recognizer.record(source)
        text = recognizer.recognize_google(audio_data)
        return text
    except Exception:
        return None

# ----------------------------------------------------
# --- Application Routes (Integrated) ---
# ----------------------------------------------------

@app.route('/')
@login_required 
def home():
    # --- UPDATED: Pass the user's role to the template ---
    return render_template('index.html', user_role=current_user.role) 

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    
    if request.method == 'POST':
        username = request.form.get('username') 
        email = request.form.get('email')
        password = request.form.get('password')
        
        user = db.session.execute(db.select(User).filter_by(username=username)).scalar_one_or_none()
        if user:
            flash('Username already exists. Please choose a different one.', 'error')
            return redirect(url_for('register'))

        new_user = User(username=username, email=email)
        new_user.set_password(password)
        
        db.session.add(new_user)
        db.session.commit()
        flash('Registration successful! You can now log in.', 'success')
        return redirect(url_for('login'))
        
    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('home'))

    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = db.session.execute(db.select(User).filter_by(username=username)).scalar_one_or_none()
        
        if user is None or not user.check_password(password):
            flash('Invalid username or password.', 'error')
            return redirect(url_for('login'))
        
        login_user(user)
        return redirect(url_for('home')) 
        
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/analyze', methods=['POST'])
@login_required 
def analyze():
    text_input = None
    temp_webm_path = None 
    temp_wav_path = None 
    
    try:
        if 'text' in request.form and request.form['text'].strip():
            text_input = request.form['text'].strip()
        
        elif 'audio' in request.files:
            file = request.files['audio']
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
                file.save(temp_audio.name)
                temp_webm_path = temp_audio.name

            temp_wav_path = temp_webm_path.replace(".webm", ".wav")
            
            command = ["ffmpeg", "-i", temp_webm_path, "-ac", "1", "-ar", "16000", "-y", temp_wav_path, "-loglevel", "quiet"]
            subprocess.run(command, capture_output=True, text=True, check=True)
            
            text_input = speech_to_text(temp_wav_path)
            
        if not text_input or len(text_input) < 10:
            return jsonify({'error': 'No valid text input detected, or audio was unclear/too short.'}), 400

        emotion_results = analyze_emotions(text_input) 
        mood = analyze_mood_level(text_input, emotion_results) 
        stress = analyze_stress_level(text_input, emotion_results) 
        recs = get_recommendations(mood, stress)
        
        secondary_feelings = map_emotions_to_feelings(emotion_results, text_input.lower())
        
        # --- NEW: Join recommendations into a single string for DB ---
        recs_string = "||".join(recs)
        
        new_entry = CheckInEntry(
            # timestamp is now handled by default=
            mood_score=mood['score'],
            stress_score=stress['score'],
            full_text=text_input,
            recommendations=recs_string, # Save the string
            user_id=current_user.id
        )
        db.session.add(new_entry)
        db.session.commit()

        return jsonify({
            'text': text_input,
            'mood': mood, 
            'stress': stress,
            'emotion': {'dominant': emotion_results['dominant'], 'all_emotions': secondary_feelings},
            'recommendations': recs 
        })

    except subprocess.CalledProcessError as e:
        print(f"ffmpeg conversion failed: {e.stderr}")
        return jsonify({'error': 'Audio conversion failed. Please ensure ffmpeg is installed and accessible.'}), 500
    except Exception as e:
        print(f"!!! FATAL ANALYSIS/SAVE ERROR: {e}")
        return jsonify({'error': f'An internal server error occurred: {str(e)}'}), 500
    
    finally:
        if temp_webm_path and os.path.exists(temp_webm_path):
            os.remove(temp_webm_path)
        if temp_wav_path and os.path.exists(temp_wav_path):
            os.remove(temp_wav_path)


@app.route('/api/user_data', methods=['GET'])
@login_required
def get_user_data():
    """API endpoint to fetch all historical check-in entries for the logged-in user."""
    
    entries = db.session.execute(
        db.select(CheckInEntry)
          .filter_by(user_id=current_user.id)
          .order_by(CheckInEntry.timestamp.desc())
    ).scalars().all()

    data = [entry.to_dict() for entry in entries]
    
    return jsonify(data)


# --- NEW: ADMIN ROUTES ---

@app.route('/admin')
@login_required
def admin_dashboard():
    # Protect this route
    if current_user.role != 'admin':
        flash('You do not have permission to access this page.', 'error')
        return redirect(url_for('home'))
        
    # We will create this HTML file in the next step
    return render_template('admin.html') 


@app.route('/api/admin_data', methods=['GET'])
@login_required
def get_admin_data():
    # Double-check that only an admin can get this data
    if current_user.role != 'admin':
        return jsonify(error="Forbidden"), 403

    # --- Database Queries ---
    total_users = db.session.scalar(db.select(db.func.count(User.id)))
    total_checkins = db.session.scalar(db.select(db.func.count(CheckInEntry.id)))
    
    avg_mood = 0
    avg_stress = 0
    
    # Calculate averages, handle division by zero if no entries
    if total_checkins > 0:
        avg_mood = db.session.scalar(db.select(db.func.avg(CheckInEntry.mood_score)))
        avg_stress = db.session.scalar(db.select(db.func.avg(CheckInEntry.stress_score)))

    # --- NEW: Per-User Aggregate Data (Privacy-Safe) ---
    users_data = []
    users = db.session.execute(db.select(User)).scalars().all()
    
    for user in users:
        user_checkins = db.session.execute(
            db.select(CheckInEntry)
            .filter_by(user_id=user.id)
            .order_by(CheckInEntry.timestamp.desc())
        ).scalars().all()
        
        if not user_checkins:
            users_data.append({
                'username': user.username,
                'email': user.email,
                'role': user.role,
                'totalCheckins': 0,
                'avgMood': 0,
                'avgStress': 0,
                'lastActivity': None
            })
            continue

        user_avg_mood = sum(e.mood_score for e in user_checkins) / len(user_checkins)
        user_avg_stress = sum(e.stress_score for e in user_checkins) / len(user_checkins)
        
        users_data.append({
            'username': user.username,
            'email': user.email,
            'role': user.role,
            'totalCheckins': len(user_checkins),
            'avgMood': round(user_avg_mood, 1),
            'avgStress': round(user_avg_stress, 1),
            'lastActivity': user_checkins[0].timestamp.isoformat()
        })

    # Return all data as JSON
    return jsonify({
        'platformStats': {
            'totalUsers': total_users,
            'totalCheckins': total_checkins,
            'avgMoodScore': round(avg_mood, 1),
            'avgStressScore': round(avg_stress, 1)
        },
        'usersData': users_data
    })

# --- END NEW ADMIN ROUTES ---


# --- Main Run Block ---
if __name__ == '__main__':
    with app.app_context():
        db.create_all() 
    app.run(debug=True)