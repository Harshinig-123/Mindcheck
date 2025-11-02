# app.py
from flask import Flask, render_template, request, jsonify
from textblob import TextBlob
from transformers import pipeline
import re

# Load emotion analysis model
emotion_classifier = pipeline('text-classification', model='j-hartmann/emotion-english-distilroberta-base', return_all_scores=True)

app = Flask(__name__)

# Depression keywords and patterns
DEPRESSION_KEYWORDS = {
    'high_risk': ['suicide', 'kill myself', 'end it all', 'want to die', 'better off dead', 'harm myself', 'no point living'],
    'medium_risk': ['hopeless', 'empty', 'numb', 'cant go on', 'cant cope', 'overwhelmed', 'dont care anymore'],
    'low_risk': ['sad', 'unhappy', 'down', 'tired', 'sleepy', 'lonely', 'alone']
}

STRESS_KEYWORDS = {
    'high': ['overwhelmed', 'cant handle', 'breaking down', 'too much pressure', 'drowning', 'panic'],
    'medium': ['stressed', 'anxious', 'worried', 'pressure', 'nervous', 'tense'],
    'low': ['busy', 'tired', 'concerned', 'apprehensive']
}

def analyze_depression_level(text):
    """Analyze text for depression indicators and determine risk level"""
    text_lower = text.lower()
    
    # Count keyword matches
    high_risk_count = sum(1 for keyword in DEPRESSION_KEYWORDS['high_risk'] if keyword in text_lower)
    medium_risk_count = sum(1 for keyword in DEPRESSION_KEYWORDS['medium_risk'] if keyword in text_lower)
    low_risk_count = sum(1 for keyword in DEPRESSION_KEYWORDS['low_risk'] if keyword in text_lower)
    
    # Determine depression level
    if high_risk_count > 0:
        depression_level = "DANGEROUS LEVEL"
        depression_score = 90
        depression_explanation = "⚠️ IMMEDIATE ATTENTION NEEDED: Your text shows signs of severe depression with potentially dangerous thoughts."
    elif medium_risk_count >= 2:
        depression_level = "HIGH RISK"
        depression_score = 70
        depression_explanation = "🔴 High depression risk detected. Professional help is strongly recommended."
    elif low_risk_count >= 3 or medium_risk_count >= 1:
        depression_level = "MODERATE RISK"
        depression_score = 50
        depression_explanation = "🟡 Moderate depression signs detected. Monitor your mood and consider talking to someone."
    else:
        depression_level = "LOW RISK"
        depression_score = 20
        depression_explanation = "🟢 Low depression risk. Your mood appears relatively stable."
    
    return {
        'level': depression_level,
        'score': depression_score,
        'explanation': depression_explanation,
        'keyword_matches': {
            'high_risk': high_risk_count,
            'medium_risk': medium_risk_count,
            'low_risk': low_risk_count
        }
    }

def analyze_stress_level(text):
    """Analyze text for stress indicators"""
    text_lower = text.lower()
    
    # Count stress keyword matches
    high_count = sum(1 for keyword in STRESS_KEYWORDS['high'] if keyword in text_lower)
    medium_count = sum(1 for keyword in STRESS_KEYWORDS['medium'] if keyword in text_lower)
    low_count = sum(1 for keyword in STRESS_KEYWORDS['low'] if keyword in text_lower)
    
    # Basic sentiment analysis for stress
    analysis = TextBlob(text)
    polarity = analysis.sentiment.polarity
    
    # Calculate stress score (0-100)
    base_stress = abs(polarity) * 30  # Negative or highly positive sentiment can indicate stress
    keyword_stress = (high_count * 40) + (medium_count * 25) + (low_count * 10)
    stress_score = min(100, base_stress + keyword_stress)
    
    # Determine stress level
    if stress_score >= 70:
        stress_level = "HIGH STRESS"
        stress_explanation = "🔴 High stress detected. Your body and mind are under significant pressure."
    elif stress_score >= 40:
        stress_level = "MODERATE STRESS"
        stress_explanation = "🟡 Moderate stress levels. Good time to practice stress management."
    else:
        stress_level = "LOW STRESS"
        stress_explanation = "🟢 Low stress levels. You're handling things well."
    
    return {
        'level': stress_level,
        'score': int(stress_score),
        'explanation': stress_explanation
    }

def analyze_emotions(text):
    """Get detailed emotion analysis"""
    results = emotion_classifier(text)[0]
    emotions = {}
    
    for emotion in results:
        emotions[emotion['label']] = round(emotion['score'] * 100, 1)
    
    # Find dominant emotion
    dominant_emotion = max(emotions, key=emotions.get)
    
    return {
        'dominant': dominant_emotion,
        'all_emotions': emotions
    }

def get_recommendations(depression_level, stress_level, depression_score, stress_score):
    """Generate personalized recommendations based on analysis"""
    recommendations = []
    
    # Depression recommendations
    if depression_score >= 70:
        recommendations.extend([
            "🚨 IMMEDIATE ACTION: Contact a mental health professional or crisis helpline",
            "National Suicide Prevention Lifeline: 988",
            "Crisis Text Line: Text HOME to 741741",
            "Stay with someone you trust - don't be alone",
            "Remove any means of self-harm from your environment"
        ])
    elif depression_score >= 50:
        recommendations.extend([
            "📞 Schedule an appointment with a therapist or counselor",
            "Reach out to close friends or family members",
            "Practice daily mindfulness and grounding exercises",
            "Maintain a simple daily routine",
            "Consider talking to your doctor about how you're feeling"
        ])
    else:
        recommendations.extend([
            "💚 Continue with healthy habits and self-care",
            "Stay connected with supportive people",
            "Practice gratitude journaling",
            "Engage in activities you enjoy",
            "Get regular exercise and sunlight"
        ])
    
    # Stress recommendations
    if stress_score >= 70:
        recommendations.extend([
            "🧘‍♂️ Practice deep breathing exercises (4-7-8 technique)",
            "Take short breaks every hour",
            "Delegate tasks when possible",
            "Reduce caffeine intake",
            "Try progressive muscle relaxation"
        ])
    elif stress_score >= 40:
        recommendations.extend([
            "📅 Practice time management and prioritize tasks",
            "Take regular walks in nature",
            "Listen to calming music",
            "Limit screen time before bed",
            "Try guided meditation apps"
        ])
    
    return recommendations

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze_text():
    data = request.get_json()
    user_text = data.get('text', '')
    
    if not user_text:
        return jsonify({'error': 'Please enter some text to analyze'})
    
    if len(user_text.strip()) < 10:
        return jsonify({'error': 'Please write a bit more (at least 10 characters) for better analysis'})
    
    # Perform all analyses
    depression_analysis = analyze_depression_level(user_text)
    stress_analysis = analyze_stress_level(user_text)
    emotion_analysis = analyze_emotions(user_text)
    
    # Get personalized recommendations
    recommendations = get_recommendations(
        depression_analysis['level'],
        stress_analysis['level'],
        depression_analysis['score'],
        stress_analysis['score']
    )
    
    # Prepare final result
    result = {
        'depression': depression_analysis,
        'stress': stress_analysis,
        'emotions': emotion_analysis,
        'recommendations': recommendations,
        'text_preview': user_text[:100] + "..." if len(user_text) > 100 else user_text
    }
    
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True)