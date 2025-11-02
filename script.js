// --- [Global Variables] ---

// A global variable to hold the data from the last analysis
// This is so 'saveToDashboard' can access it.
let currentAnalysisResult = null;
let currentInputMethod = 'text'; // Track the active input
let mediaRecorder; // For voice recording
let audioChunks = []; // To store recorded audio
let audioBlob = null; // To hold the final blob

// --- [Event Listeners] ---
document.addEventListener('DOMContentLoaded', () => {
    // Main navigation
    document.querySelector('.nav-btn[onclick="showSection(\'checkin\')"]').addEventListener('click', () => showSection('checkin'));
    document.querySelector('.nav-btn[onclick="showSection(\'dashboard\')"]').addEventListener('click', () => showSection('dashboard'));

    // Input toggles
    document.querySelector('.toggle-btn[onclick="toggleInputMethod(\'text\')"]').addEventListener('click', () => toggleInputMethod('text'));
    document.querySelector('.toggle-btn[onclick="toggleInputMethod(\'voice\')"]').addEventListener('click', () => toggleInputMethod('voice'));

    // Main "Analyze" button
    // Make sure your HTML button's onclick is "analyzeInput()"
    document.getElementById('analyzeBtn').addEventListener('click', analyzeInput); 

    // Voice recording buttons
    document.getElementById('recordBtn').addEventListener('click', toggleRecording); // Changed from mock
    document.querySelector('.retry-btn[onclick="retryRecording()"]').addEventListener('click', retryRecording);

    // Results button
    document.querySelector('.save-btn[onclick="saveToDashboard()"]').addEventListener('click', saveToDashboard);

    // Load check-in section by default
    showSection('checkin');
});


// --- [1. Main Navigation] ---

function showSection(sectionId) {
    // Hide all main sections
    document.querySelectorAll('.main-section').forEach(section => {
        section.style.display = 'none';
    });
    
    // Show the target section
    document.getElementById(sectionId + 'Section').style.display = 'block';
    
    // Update nav button active state
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.nav-btn[onclick="showSection('${sectionId}')"]`).classList.add('active');
    
    // If we are showing the dashboard, load its data
    if (sectionId === 'dashboard') {
        loadDashboard();
    }
}


// --- [2. Check-in Page Logic] ---

function toggleInputMethod(method) {
    const textMethod = document.getElementById('textInputMethod');
    const voiceMethod = document.getElementById('voiceInputMethod');
    const textBtn = document.querySelector('.toggle-btn[onclick="toggleInputMethod(\'text\')"]');
    const voiceBtn = document.querySelector('.toggle-btn[onclick="toggleInputMethod(\'voice\')"]');
    
    currentInputMethod = method; // Set the global state

    if (method === 'text') {
        textMethod.style.display = 'block';
        voiceMethod.style.display = 'none';
        textBtn.classList.add('active');
        voiceBtn.classList.remove('active');
    } else {
        textMethod.style.display = 'none';
        voiceMethod.style.display = 'block';
        textBtn.classList.remove('active');
        voiceBtn.classList.add('active');
    }
}

// --- [3. Real Voice Recording] ---

async function toggleRecording() {
    const recordBtn = document.getElementById('recordBtn');
    const recordingStatus = document.getElementById('recordingStatus');

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        // --- STOP RECORDING ---
        mediaRecorder.stop();
        recordBtn.querySelector('span').innerText = 'Click to start recording';
        recordBtn.querySelector('i').className = 'fas fa-microphone';
        recordingStatus.style.display = 'none';
        
    } else {
        // --- START RECORDING ---
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            // Reset chunks and blob
            audioChunks = [];
            audioBlob = null;
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                // *** CRITICAL FIX: Create a webm blob ***
                audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                
                // Show "Retry" button
                document.getElementById('recordingResult').style.display = 'block';
                document.getElementById('transcribedText').innerText = `[Recording captured (${(audioBlob.size / 1024).toFixed(1)} KB)]`;
                recordBtn.style.display = 'none'; // Hide the main record button

                // Stop all tracks to turn off the mic icon in the browser tab
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            
            // Update UI
            recordBtn.querySelector('span').innerText = 'Click to STOP recording';
            recordBtn.querySelector('i').className = 'fas fa-stop-circle';
            recordingStatus.style.display = 'block';
            document.getElementById('recordingResult').style.display = 'none';
            
        } catch (err) {
            console.error("Error accessing microphone:", err);
            showError('Could not access microphone. Please grant permission and try again.');
        }
    }
}

function retryRecording() {
    audioBlob = null;
    audioChunks = [];
    mediaRecorder = null;
    
    document.getElementById('recordBtn').style.display = 'block';
    document.getElementById('recordBtn').querySelector('span').innerText = 'Click to start recording';
    document.getElementById('recordBtn').querySelector('i').className = 'fas fa-microphone';
    
    document.getElementById('recordingStatus').style.display = 'none';
    document.getElementById('recordingResult').style.display = 'none';
    document.getElementById('textInput').value = ''; // Clear any old text
}

function showError(message) {
    const errorSection = document.getElementById('errorSection');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    document.getElementById('errorMessage').innerText = message;
    errorSection.style.display = 'block';
    
    // Hide other sections
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'none';
    
    // Reset button
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = '<i class="fas fa-heartbeat"></i> Understand my feelings';
}


// --- [4. Real Analysis Logic (Fetch API)] ---

function analyzeInput() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingSection = document.getElementById('loadingSection');
    const resultSection = document.getElementById('resultSection');
    const errorSection = document.getElementById('errorSection');

    // Reset UI
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    loadingSection.style.display = 'block';
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fas fa-heartbeat"></i> Listening to your words...';

    const formData = new FormData();

    // --- Prepare Form Data ---
    if (currentInputMethod === 'text') {
        const text = document.getElementById('textInput').value.trim();
        if (text.length < 10) {
            showError('Could you share a bit more? Just a few more words help us understand better.');
            return;
        }
        formData.append('text', text);

    } else if (currentInputMethod === 'voice') {
        if (!audioBlob) {
            showError('Please record your voice first, or switch to text input.');
            return;
        }
        // *** CRITICAL FIX: Send as a .webm file ***
        formData.append('audio', audioBlob, 'recording.webm');
    }

    // --- Call the Flask API ---
    fetch('http://127.0.0.1:5000/analyze', {
        method: 'POST',
        body: formData 
    })
    .then(response => {
        if (!response.ok) {
            // Server returned an error, get the text
            return response.text().then(text => { 
                throw new Error(`Server error: ${response.status} ${response.statusText} - ${text}`) 
            });
        }
        return response.json();
    })
    .then(data => {
        loadingSection.style.display = 'none';
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '<i class="fas fa-heartbeat"></i> Understand my feelings';

        if (data.error) {
            showError(data.error);
        } else {
            // --- Success: Format data and display ---
            
            if (currentInputMethod === 'voice' && data.text) {
                document.getElementById('textInput').value = data.text;
                document.getElementById('transcribedText').innerText = `We heard: "${data.text}"`;
            }

            const formattedData = {
                text_preview: data.text.length > 100 ? data.text.substring(0, 100) + '...' : data.text,
                full_text: data.text,
                timestamp: new Date().toISOString(),
                depression: data.depression,
                stress: data.stress,
                emotions: data.emotion,
                recommendations: data.recommendations.map(rec => ({ 
                    title: 'Suggestion', // Give a default title
                    text: rec 
                }))
            };
            
            currentAnalysisResult = formattedData; 
            displayResults(formattedData);
        }
    })
    .catch(err => {
        console.error('Fetch Error:', err);
        showError('An analysis error occurred. This could be a connection issue or the AI model is loading. Please wait a moment and try again.');
    });
}


// --- [5. Results Display Logic] ---

function displayResults(data) {
    document.getElementById('resultSection').style.display = 'block';
    document.getElementById('errorSection').style.display = 'none';
    document.getElementById('loadingSection').style.display = 'none';
    
    const saveBtn = document.querySelector('.save-btn[onclick="saveToDashboard()"]');
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-chart-line"></i> Add to my trends';

    document.getElementById('textPreview').innerText = data.text_preview;

    // --- *** MODIFIED MOOD CARD LOGIC *** ---
    const depCard = document.getElementById('depressionCard');
    const depLevel = data.depression.level;
    depCard.className = 'insight-card'; // Reset classes
    
    // Map new levels to CSS classes
    if (depLevel === 'Positive Mood') {
        depCard.classList.add('positive-mood');
    } else if (depLevel === 'Neutral / Balanced') {
        depCard.classList.add('neutral-mood');
    } else if (depLevel === 'Slightly Low Mood') {
        depCard.classList.add('slightly-low-mood');
    } else if (depLevel === 'Low Mood') {
        depCard.classList.add('low-mood');
    } else if (depLevel === 'Very Low Mood') {
        depCard.classList.add('very-low-mood');
    }
    
    document.getElementById('depressionLevel').innerText = depLevel;
    document.getElementById('depressionExplanation').innerText = data.depression.explanation;
    document.getElementById('depressionScoreFill').style.width = data.depression.score + '%';
    document.getElementById('depressionScoreValue').innerText = data.depression.score + '%';
    // --- *** END OF MODIFIED MOOD LOGIC *** ---


    // --- Stress Card Logic (Unchanged) ---
    const strCard = document.getElementById('stressCard');
    const strLevel = data.stress.level;
    strCard.className = 'insight-card'; // Reset classes
    if (strLevel === 'HIGH STRESS') strCard.classList.add('dangerous');
    else if (strLevel === 'MODERATE STRESS') strCard.classList.add('moderate-risk');
    else strCard.classList.add('safe'); // 'safe' is the low-stress style

    document.getElementById('stressLevel').innerText = strLevel;
    document.getElementById('stressExplanation').innerText = data.stress.explanation;
    document.getElementById('stressScoreFill').style.width = data.stress.score + '%';
    document.getElementById('stressScoreValue').innerText = data.stress.score + '%';

    // --- Weather Card Logic (Unchanged) ---
    const dominant = data.emotions.dominant;
    const weatherIcon = document.getElementById('weatherEmoji');
    const weatherMain = document.getElementById('weatherMain');
    const weatherDesc = document.getElementById('weatherDesc');
    
    weatherIcon.className = 'fas';
    if (dominant === 'disgust' || dominant === 'anger' || data.depression.score > 70) {
        weatherIcon.classList.add('fa-cloud-rain');
        weatherMain.innerText = 'Heavy Rain';
        weatherDesc.innerText = `Strong feelings of ${dominant} and heaviness present.`;
    } else if (dominant === 'fear' || dominant === 'surprise' || data.stress.score > 70) {
        weatherIcon.classList.add('fa-wind');
        weatherMain.innerText = 'Stormy Weather';
        weatherDesc.innerText = `A lot of ${dominant} or surprising energy.`;
    } else if (dominant === 'joy') {
        weatherIcon.classList.add('fa-sun');
        weatherMain.innerText = 'Bright Sunshine';
        weatherDesc.innerText = 'Clear skies with feelings of joy and positivity.';
    } else if (dominant === 'sadness') {
        weatherIcon.classList.add('fa-cloud-sun');
        weatherMain.innerText = 'Partly Cloudy';
        weatherDesc.innerText = 'A mix of clouds and sun; some sadness present.';
    } else {
        weatherIcon.classList.add('fa-smog');
        weatherMain.innerText = 'Foggy';
        weatherDesc.innerText = `Feelings of ${dominant} are present.`;
    }

    // --- Emotion Cloud (Unchanged) ---
    const cloud = document.getElementById('emotionCloud');
    cloud.innerHTML = '';
    document.getElementById('dominantEmotion').innerText = dominant;
    
    const sortedEmotions = Object.entries(data.emotions.all_emotions).sort(([,a],[,b]) => b-a);
    
    for (const [emotion, score] of sortedEmotions) {
        const tag = document.createElement('span');
        tag.className = 'emotion-tag';
        tag.innerText = `${emotion} (${score.toFixed(1)}%)`;
        if (emotion === dominant) {
            tag.classList.add('highlight');
        }
        cloud.appendChild(tag);
    }

    // --- Suggestions (Unchanged) ---
    const grid = document.getElementById('suggestionsGrid');
    grid.innerHTML = '';
    
    data.recommendations.forEach(rec => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            <h4>${rec.title}</h4> 
            <p>${rec.text}</p>
        `;
        grid.appendChild(item);
    });
}


// --- [6. Dashboard Logic (Persistence)] ---

function saveToDashboard() {
    if (!currentAnalysisResult) return;

    const log = JSON.parse(localStorage.getItem('mindCheckLog') || '[]');
    
    currentAnalysisResult.text_preview = currentAnalysisResult.full_text.length > 100 ? currentAnalysisResult.full_text.substring(0, 100) + '...' : currentAnalysisResult.full_text;
    
    // Ensure recommendations are in the object format, not just strings
    if (currentAnalysisResult.recommendations && typeof currentAnalysisResult.recommendations[0] === 'string') {
         currentAnalysisResult.recommendations = currentAnalysisResult.recommendations.map(rec => ({ 
            title: 'Suggestion',
            text: rec 
        }));
    }

    log.unshift(currentAnalysisResult);
    
    localStorage.setItem('mindCheckLog', JSON.stringify(log));
    
    const saveBtn = document.querySelector('.save-btn[onclick="saveToDashboard()"]');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved to dashboard!';
    
    setTimeout(() => {
        showSection('dashboard');
    }, 1000);
}

function loadDashboard() {
    const log = JSON.parse(localStorage.getItem('mindCheckLog') || '[]');
    
    const weekChart = document.getElementById('weekChart');
    const moodTrendChart = document.getElementById('moodTrendChart');
    const stressTrendChart = document.getElementById('stressTrendChart');
    const emotionSummary = document.getElementById('emotionSummary');
    const reflectionsList = document.getElementById('reflectionsList');
    const weeklyInsights = document.getElementById('weeklyInsights');

    if (log.length === 0) {
        weekChart.innerHTML = '<p style="padding: 20px; color: #6c757d;">No data yet for your weekly chart. Add a check-in to get started!</p>';
        moodTrendChart.innerHTML = '<p style="padding: 20px; color: #6c757d;">Your mood trend will appear here.</p>';
        stressTrendChart.innerHTML = '<p style="padding: 20px; color: #6c757d;">Your stress trend will appear here.</p>';
        emotionSummary.innerHTML = '<p style="padding: 20px; color: #6c757d;">Your common feelings will be summarized here.</p>';
        reflectionsList.innerHTML = '<p style="padding: 20px; color: #6c757d;">Your recent reflections will be listed here.</p>';
        weeklyInsights.innerHTML = '<p style="padding: 20px; color: #6c757d;">Weekly insights will be generated once you have more entries.</p>';
        return;
    }

    // --- *** MODIFIED: Populate Reflections List with Suggestions *** ---
    reflectionsList.innerHTML = ''; // Clear
    log.slice(0, 10).forEach(entry => { // Show last 10
        const item = document.createElement('div');
        item.className = 'reflection-item';
        
        // Build the suggestions list HTML
        let suggestionsHTML = '';
        if (entry.recommendations && entry.recommendations.length > 0) {
             suggestionsHTML = `
                <ul class="reflection-suggestions">
                    ${entry.recommendations.map(rec => `<li><strong>${rec.title || 'Suggestion'}:</strong> ${rec.text}</li>`).join('')}
                </ul>
            `;
        }

        // Build the final HTML for the reflection item
        item.innerHTML = `
            <div class="reflection-header">
                <strong>${new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>
                <!-- *** MODIFIED: Show new mood level *** -->
                <span>(Mood: ${entry.depression.level} | Stress: ${entry.stress.level})</span>
            </div>
            <p class="reflection-text">"${entry.text_preview}"</p>
            ${suggestionsHTML}
        `;
        reflectionsList.appendChild(item);
    });

    weekChart.innerHTML = '';
    const recentEntries = log.slice(0, 7).reverse();
    recentEntries.forEach(entry => {
        const totalScore = (entry.depression.score + entry.stress.score) / 2;
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = `${totalScore}%`;
        bar.title = `Mood: ${entry.depression.score}%, Stress: ${entry.stress.score}%`;
        
        const label = document.createElement('span');
        label.className = 'bar-label';
        label.innerText = new Date(entry.timestamp).toLocaleDateString('en-US', { weekday: 'short' });
        
        bar.appendChild(label);
        weekChart.appendChild(bar);
    });

    emotionSummary.innerHTML = '';
    const allEmotions = {};
    log.forEach(entry => {
        // Ensure entry.emotions.dominant exists (for older log data)
        const dominant = entry.emotions ? entry.emotions.dominant : 'neutral';
        allEmotions[dominant] = (allEmotions[dominant] || 0) + 1;
    });
    
    const sortedEmotions = Object.entries(allEmotions).sort(([,a],[,b]) => b-a);
    sortedEmotions.forEach(([emotion, count]) => {
        const tag = document.createElement('span');
        tag.className = 'emotion-tag';
        tag.innerText = `${emotion} (x${count})`;
        emotionSummary.appendChild(tag);
    });

    moodTrendChart.innerHTML = '<p style="padding: 20px; color: #6c757d;">A beautiful line chart (using Chart.js) would show your mood trend here.</p>';
    stressTrendChart.innerHTML = '<p style="padding: 20px; color: #6c757d;">A beautiful line chart (using Chart.js) would show your stress trend here.</p>';
    
    const insightGrid = document.getElementById('weeklyInsights');
    insightGrid.innerHTML = '';
    
    insightGrid.innerHTML = `
        <div class="insight-item">
            <h4>Your most common feeling</h4>
            <p>This past week, your most logged feeling was <strong>${sortedEmotions.length > 0 ? sortedEmotions[0][0] : 'N/A'}</strong>.</p>
        </div>
        <div class="insight-item">
            <h4>Your average mood</h4>
            <p>Your average low-mood indicator was <strong>${(log.reduce((acc, e) => acc + e.depression.score, 0) / log.length).toFixed(0)}%</strong>.</p>
        </div>
        <div class="insight-item">
            <h4>Your average stress</h4>
            <p>Your average stress indicator was <strong>${(log.reduce((acc, e) => acc + e.stress.score, 0) / log.length).toFixed(0)}%</strong>.</p>
        </div>
    `;
}

/* ==========================
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
*/
