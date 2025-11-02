// --- [Global Variables] ---

let currentAnalysisResult = null;
let currentInputMethod = 'text'; 
let mediaRecorder; 
let audioChunks = []; 
let audioBlob = null; 

// Chart instances for the dashboard
let weekChartInstance = null;
let moodTrendChartInstance = null;
let stressTrendChartInstance = null;


// --- [Helper Function for Data Safety] ---
// This function safely retrieves the mood and stress scores, 
// checking for the new 'mood' property and falling back to the old 'depression' if needed.
function getEntryScores(entry) {
    // Check if entry has the new 'mood' structure, otherwise use 'depression'
    const moodData = entry.mood || entry.depression || { score: 50 }; // Default to 50 if structure is missing
    const stressData = entry.stress || { score: 50 };
    
    return {
        moodScore: moodData.score,
        stressScore: stressData.score,
    };
}


// --- [Event Listeners] ---
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.nav-btn[onclick="showSection(\'checkin\')"]').addEventListener('click', () => showSection('checkin'));
    document.querySelector('.nav-btn[onclick="showSection(\'dashboard\')"]')?.addEventListener('click', () => showSection('dashboard'));

    document.querySelector('.toggle-btn[onclick="toggleInputMethod(\'text\')"]').addEventListener('click', () => toggleInputMethod('text'));
    document.querySelector('.toggle-btn[onclick="toggleInputMethod(\'voice\')"]').addEventListener('click', () => toggleInputMethod('voice'));

    document.getElementById('analyzeBtn').addEventListener('click', analyzeInput); 

    document.getElementById('recordBtn').addEventListener('click', toggleRecording);
    document.querySelector('.retry-btn[onclick="retryRecording()"]').addEventListener('click', retryRecording);

    document.querySelector('.save-btn[onclick="saveToDashboard()"]').addEventListener('click', saveToDashboard);

    showSection('checkin');
});


// --- [1. Main Navigation] ---

function showSection(sectionId) {
    document.querySelectorAll('.main-section').forEach(section => {
        section.style.display = 'none';
    });
    
    document.getElementById(sectionId + 'Section').style.display = 'block';
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.nav-btn[onclick="showSection('${sectionId}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
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
    
    currentInputMethod = method; 

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

// --- [3. Voice Recording] ---

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
            
            audioChunks = [];
            audioBlob = null;
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                
                document.getElementById('recordingResult').style.display = 'block';
                document.getElementById('transcribedText').innerText = `[Recording captured (${(audioBlob.size / 1024).toFixed(1)} KB)]`;
                recordBtn.style.display = 'none'; 

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            
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
    document.getElementById('textInput').value = ''; 
}

function showError(message) {
    const errorSection = document.getElementById('errorSection');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    document.getElementById('errorMessage').innerText = message;
    errorSection.style.display = 'block';
    
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'none';
    
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = '<i class="fas fa-heartbeat"></i> Understand my feelings';
}


// --- [4. Real Analysis Logic (Fetch API)] ---

function analyzeInput() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingSection = document.getElementById('loadingSection');
    const resultSection = document.getElementById('resultSection');
    const errorSection = document.getElementById('errorSection');

    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    loadingSection.style.display = 'block';
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fas fa-heartbeat"></i> Listening to your words...';

    const formData = new FormData();

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
        formData.append('audio', audioBlob, 'recording.webm');
    }

    fetch('http://127.0.0.1:5000/analyze', {
        method: 'POST',
        body: formData 
    })
    .then(response => {
        if (!response.ok) {
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
            if (currentInputMethod === 'voice' && data.text) {
                document.getElementById('textInput').value = data.text;
                document.getElementById('transcribedText').innerHTML = `<strong>We heard:</strong> "${data.text}"`;
            }
            
            const formattedData = {
                text_preview: data.text.length > 100 ? data.text.substring(0, 100) + '...' : data.text,
                full_text: data.text,
                timestamp: new Date().toISOString(),
                mood: data.mood, 
                stress: data.stress,
                emotions: data.emotion,
                recommendations: data.recommendations.map(rec => ({ 
                    title: 'Gentle Suggestion',
                    text: rec 
                }))
            };
            
            currentAnalysisResult = formattedData; 
            displayResults(formattedData);
        }
    })
    .catch(err => {
        console.error('Fetch Error:', err);
        showError('An analysis error occurred. This could be a connection issue or the AI model is loading. Please wait a moment and try again. Ensure the Flask server is running.');
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

    // --- Mood Card Logic ---
    const moodCard = document.getElementById('moodCard');
    const moodLevel = data.mood.level;
    moodCard.className = 'insight-card';
    moodCard.classList.add(data.mood.label_class); 
    
    document.getElementById('moodLevel').innerText = moodLevel;
    document.getElementById('moodExplanation').innerText = data.mood.explanation;
    
    // Target the clip layer for width adjustment
    const moodFill = document.getElementById('moodScoreFill'); 
    moodFill.style.width = data.mood.score + '%'; 
    document.getElementById('moodScoreValue').innerText = data.mood.score + '%';

    // --- Stress Card Logic ---
    const strCard = document.getElementById('stressCard');
    const strLevel = data.stress.level;
    strCard.className = 'insight-card';
    if (strLevel === 'HIGH STRESS') strCard.classList.add('dangerous');
    else if (strLevel === 'MODERATE STRESS') strCard.classList.add('moderate-risk');
    else strCard.classList.add('safe'); 

    document.getElementById('stressLevel').innerText = strLevel;
    document.getElementById('stressExplanation').innerText = data.stress.explanation;
    
    // Target the clip layer for width adjustment
    const stressFill = document.getElementById('stressScoreFill'); 
    stressFill.style.width = data.stress.score + '%'; 
    document.getElementById('stressScoreValue').innerText = data.stress.score + '%';

    // --- Weather Report Logic ---
    const dominant = data.emotions.dominant;
    const weatherIcon = document.getElementById('weatherEmoji');
    const weatherMain = document.getElementById('weatherMain');
    const weatherDesc = document.getElementById('weatherDesc');
    
    weatherIcon.className = 'fas';
    
    if (dominant === 'disgust' || dominant === 'anger' || data.mood.score < 30) {
        weatherIcon.classList.add('fa-cloud-rain');
        weatherMain.innerText = 'Heavy Rain';
        weatherDesc.innerText = `Strong feelings of ${dominant} and heaviness present.`;
    } else if (dominant === 'fear' || dominant === 'surprise' || data.stress.score > 70) {
        weatherIcon.classList.add('fa-wind');
        weatherMain.innerText = 'Stormy Weather';
        weatherDesc.innerText = `A lot of ${dominant} or surprising energy.`;
    } else if (dominant === 'joy' || data.mood.score > 80) {
        weatherIcon.classList.add('fa-sun');
        weatherMain.innerText = 'Bright Sunshine';
        weatherDesc.innerText = 'Clear skies with feelings of joy and positivity.';
    } else if (dominant === 'sadness' || data.mood.score < 60) {
        weatherIcon.classList.add('fa-cloud-sun');
        weatherMain.innerText = 'Partly Cloudy';
        weatherDesc.innerText = 'A mix of clouds and sun; some sadness present.';
    } else {
        weatherIcon.classList.add('fa-smog');
        weatherMain.innerText = 'Foggy';
        weatherDesc.innerText = `Feelings of ${dominant} are present.`;
    }

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


// --- [6. Dashboard Logic (Persistence & Chart.js)] ---

function saveToDashboard() {
    if (!currentAnalysisResult) return;

    const log = JSON.parse(localStorage.getItem('mindCheckLog') || '[]');
    
    currentAnalysisResult.text_preview = currentAnalysisResult.full_text.length > 100 ? currentAnalysisResult.full_text.substring(0, 100) + '...' : currentAnalysisResult.full_text;
    
    // IMPORTANT: Ensure old entries that only had 'depression' are updated to use 'mood' 
    // This is handled in getEntryScores() but we need to ensure new logs save correctly
    if (currentAnalysisResult.depression) {
        currentAnalysisResult.mood = currentAnalysisResult.mood || currentAnalysisResult.depression;
        delete currentAnalysisResult.depression;
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
    // Force a reload of data structure to ensure compatibility
    let log = JSON.parse(localStorage.getItem('mindCheckLog') || '[]');
    
    // --- Dashboard Element Setup ---
    const emotionSummary = document.getElementById('emotionSummary');
    const reflectionsList = document.getElementById('reflectionsList');
    const weeklyInsights = document.getElementById('weeklyInsights');

    if (log.length === 0) {
        document.getElementById('weekChartCanvas').style.display = 'none';
        document.getElementById('moodTrendChartCanvas').style.display = 'none';
        document.getElementById('stressTrendChartCanvas').style.display = 'none';
        
        document.querySelector('.dashboard-card.full-width .week-chart').innerHTML = '<p style="padding: 20px; color: #6c757d;">No data yet for your weekly chart. Add a check-in to get started!</p>';
        document.querySelector('.dashboard-card:nth-child(2) .trend-chart').innerHTML = '<p style="padding: 20px; color: #6c757d;">Your mood trend will appear here.</p>';
        document.querySelector('.dashboard-card:nth-child(3) .trend-chart').innerHTML = '<p style="padding: 20px; color: #6c757d;">Your stress trend will appear here.</p>';

        emotionSummary.innerHTML = '<p style="padding: 20px; color: #6c757d;">Your common feelings will be summarized here.</p>';
        reflectionsList.innerHTML = '<p style="padding: 20px; color: #6c757d;">Your recent reflections will be listed here.</p>';
        weeklyInsights.innerHTML = '<p style="padding: 20px; color: #6c757d;">Weekly insights will be generated once you have more entries.</p>';
        return;
    }

    // --- Prepare Data for Charts ---
    const chartData = log.slice(0, 7).reverse(); 
    
    // CRITICAL FIX: Use the helper function to get compatible scores
    const labels = chartData.map(entry => 
        new Date(entry.timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
    );
    const moodScores = chartData.map(entry => getEntryScores(entry).moodScore);
    const stressScores = chartData.map(entry => getEntryScores(entry).stressScore);
    const combinedScores = chartData.map(entry => {
        const scores = getEntryScores(entry);
        return (scores.moodScore + (100 - scores.stressScore)) / 2;
    });

    // --- Destroy existing charts to prevent duplication ---
    if (weekChartInstance) weekChartInstance.destroy();
    if (moodTrendChartInstance) moodTrendChartInstance.destroy();
    if (stressTrendChartInstance) stressTrendChartInstance.destroy();

    // --- 7.1. Weekly Overview Chart (Combined Wellbeing) ---
    const ctxWeek = document.getElementById('weekChartCanvas').getContext('2d');
    weekChartInstance = new Chart(ctxWeek, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Combined Wellbeing Score',
                data: combinedScores,
                backgroundColor: 'rgba(59, 151, 151, 0.8)',
                borderColor: 'rgb(22, 71, 106)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100 }
            },
            plugins: { legend: { display: false } }
        }
    });

    // --- 7.2. Mood Trend Chart ---
    const ctxMood = document.getElementById('moodTrendChartCanvas').getContext('2d');
    moodTrendChartInstance = new Chart(ctxMood, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Mood Rating',
                data: moodScores,
                borderColor: '#28a745', 
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100 }
            },
            plugins: { legend: { display: false } }
        }
    });

    // --- 7.3. Stress Trend Chart ---
    const ctxStress = document.getElementById('stressTrendChartCanvas').getContext('2d');
    stressTrendChartInstance = new Chart(ctxStress, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Stress Score',
                data: stressScores,
                borderColor: 'rgb(191, 9, 47)', 
                tension: 0.3,
                backgroundColor: 'rgba(191, 9, 47, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, reverse: false } 
            },
            plugins: { legend: { display: false } }
        }
    });

    // --- Reflections List ---
    reflectionsList.innerHTML = '';
    log.slice(0, 10).forEach(entry => {
        const item = document.createElement('div');
        item.className = 'reflection-item';
        const scores = getEntryScores(entry);
        
        let suggestionsHTML = '';
        if (entry.recommendations && entry.recommendations.length > 0) {
            suggestionsHTML = '<ul class="reflection-suggestions">';
            entry.recommendations.forEach(rec => {
                suggestionsHTML += `<li>- ${rec.text}</li>`; 
            });
            suggestionsHTML += '</ul>';
        }

        item.innerHTML = `
            <div class="reflection-header">
                <strong>${new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>
                <span>Mood: ${scores.moodScore}% | Stress: ${scores.stressScore}%</span>
            </div>
            <p class="reflection-text">"${entry.text_preview}"</p>
            ${suggestionsHTML}
        `;
        reflectionsList.appendChild(item);
    });

    // --- Emotion Summary ---
    emotionSummary.innerHTML = '';
    const allEmotions = {};
    log.forEach(entry => {
        const dominant = entry.emotions.dominant;
        allEmotions[dominant] = (allEmotions[dominant] || 0) + 1;
    });
    
    const sortedEmotions = Object.entries(allEmotions).sort(([,a],[,b]) => b-a);
    sortedEmotions.forEach(([emotion, count]) => {
        const tag = document.createElement('span');
        tag.className = 'emotion-tag';
        tag.innerText = `${emotion} (x${count})`;
        emotionSummary.appendChild(tag);
    });

    // --- Weekly Insights ---
    const totalMood = log.reduce((acc, e) => acc + getEntryScores(e).moodScore, 0);
    const totalStress = log.reduce((acc, e) => acc + getEntryScores(e).stressScore, 0);
    const avgMood = (totalMood / log.length).toFixed(0);
    const avgStress = (totalStress / log.length).toFixed(0);

    weeklyInsights.innerHTML = `
        <div class="insight-item">
            <h4>Your most common feeling</h4>
            <p>This past week, your most logged feeling was <strong>${sortedEmotions.length > 0 ? sortedEmotions[0][0] : 'N/A'}</strong>.</p>
        </div>
        <div class="insight-item">
            <h4>Your average mood rating</h4>
            <p>Your average mood rating was <strong>${avgMood}%</strong>. (Higher is better)</p>
        </div>
        <div class="insight-item">
            <h4>Your average stress</h4>
            <p>Your average stress indicator was <strong>${avgStress}%</strong>. (Lower is better)</p>
        </div>
    `;
}
