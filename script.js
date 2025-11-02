// ==========================
// Voice-based Mental Health Analyzer
// ==========================

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

async function startRecording() {
    const recordBtn = document.getElementById('recordBtn');
    const loadingSection = document.getElementById('loadingSection');
    const errorSection = document.getElementById('errorSection');
    const resultSection = document.getElementById('resultSection');
    
    // Reset previous states
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    
    if (isRecording) {
        // Stop recording
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.textContent = '🎙 Start Recording';
        recordBtn.classList.remove('recording');
    } else {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                // Create audio blob
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(audioBlob);

                // Play preview (optional)
                const audioPreview = document.getElementById('audioPreview');
                audioPreview.src = audioUrl;
                audioPreview.style.display = 'block';

                // Send audio for analysis
                await analyzeAudio(audioBlob);
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.textContent = '⏹ Stop Recording';
            recordBtn.classList.add('recording');

        } catch (error) {
            showError('Microphone access denied or not available.');
            console.error('Recording error:', error);
        }
    }
}

async function analyzeAudio(audioBlob) {
    const recordBtn = document.getElementById('recordBtn');
    const loadingSection = document.getElementById('loadingSection');
    const resultSection = document.getElementById('resultSection');
    
    loadingSection.style.display = 'block';
    recordBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');

        const response = await fetch('/analyze_audio', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        loadingSection.style.display = 'none';
        recordBtn.disabled = false;

        if (data.error) {
            showError(data.error);
            return;
        }

        displayResults(data);
    } catch (error) {
        loadingSection.style.display = 'none';
        recordBtn.disabled = false;
        showError('Error analyzing audio. Please try again.');
        console.error('Error:', error);
    }
}

// ==========================
// Result Display Functions
// ==========================

function displayResults(data) {
    const resultSection = document.getElementById('resultSection');
    const dominantEmotion = document.getElementById('dominantEmotion');
    const emotionPills = document.getElementById('emotionPills');
    const recommendationsList = document.getElementById('recommendationsList');

    // Depression
    displayMetric('depression', data.depression);

    // Stress
    displayMetric('stress', data.stress);

    // Emotions
    dominantEmotion.textContent = data.emotions.dominant.toUpperCase();
    emotionPills.innerHTML = '';
    Object.entries(data.emotions.all_emotions).forEach(([emotion, score]) => {
        const pill = document.createElement('div');
        pill.className = 'emotion-pill';
        if (emotion === data.emotions.dominant) pill.classList.add('highlight');
        pill.textContent = `${emotion}: ${score}%`;
        emotionPills.appendChild(pill);
    });

    // Recommendations
    recommendationsList.innerHTML = '';
    data.recommendations.forEach(rec => {
        const li = document.createElement('li');
        li.textContent = rec;
        recommendationsList.appendChild(li);
    });

    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function displayMetric(type, metric) {
    const card = document.getElementById(`${type}Card`);
    const levelElement = document.getElementById(`${type}Level`);
    const explanationElement = document.getElementById(`${type}Explanation`);
    const scoreFill = document.getElementById(`${type}ScoreFill`);
    const scoreValue = document.getElementById(`${type}ScoreValue`);

    levelElement.textContent = metric.level;
    explanationElement.textContent = metric.explanation;
    scoreValue.textContent = `${metric.score}/100`;
    scoreFill.style.width = `${metric.score}%`;

    card.className = 'risk-card';
    if (metric.level.includes('HIGH') || metric.level.includes('DANGEROUS')) {
        card.classList.add('high-risk');
    } else if (metric.level.includes('MODERATE')) {
        card.classList.add('moderate-risk');
    } else {
        card.classList.add('low-risk');
    }
}

function showError(message) {
    const errorSection = document.getElementById('errorSection');
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
    errorSection.scrollIntoView({ behavior: 'smooth' });
}
