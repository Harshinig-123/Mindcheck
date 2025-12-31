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


// --- [Event Listeners and Initial Load] ---
// --- [Event Listeners and Initial Load] ---
document.addEventListener('DOMContentLoaded', () => {
    // This script only runs on index.html, which is only loaded AFTER login.
    
    // Setup listeners for the main app
    setupEventListeners();

    // --- NEW: Check if the user is an admin and add the admin button ---
    const userRole = document.body.dataset.userRole;
    if (userRole === 'admin') {
        addAdminButtonToNav();
    }
    // --- END NEW ---
    
    // Check for URL parameters (e.g., ?section=dashboard)
    const urlParams = new URLSearchParams(window.location.search);
    const section = urlParams.get('section');

    if (section === 'dashboard') {
        showSection('dashboard');
    } else {
        showSection('checkin');
    }
});

function setupEventListeners() {
    // 1. Navigation Buttons
    document.querySelector('.nav-btn[onclick="showSection(\'checkin\')"]').addEventListener('click', () => showSection('checkin'));
    document.querySelector('.nav-btn[onclick="showSection(\'dashboard\')"]')?.addEventListener('click', () => showSection('dashboard'));

    // 2. Input Toggles
    document.querySelector('.toggle-btn[onclick="toggleInputMethod(\'text\')"]').addEventListener('click', () => toggleInputMethod('text'));
    document.querySelector('.toggle-btn[onclick="toggleInputMethod(\'voice\')"]').addEventListener('click', () => toggleInputMethod('voice'));

    // 3. Action Buttons
    document.getElementById('analyzeBtn').addEventListener('click', analyzeInput); 
    document.getElementById('recordBtn').addEventListener('click', toggleRecording);
    document.querySelector('.retry-btn').addEventListener('click', retryRecording); 
    
    // 4. Save Button
    document.querySelector('.save-btn').addEventListener('click', () => showSection('dashboard'));
}

// ----------------------------------------------------
// --- 2. CORE APP LOGIC ---
// ----------------------------------------------------

function showSection(sectionId) {
    document.querySelectorAll('.main-section').forEach(section => {
        section.style.display = 'none';
    });
    
    const targetSection = document.getElementById(sectionId + 'Section');
    if (targetSection) {
        targetSection.style.display = 'block';
    }
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.nav-btn[onclick="showSection('${sectionId}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // Load data *only* when switching to the dashboard
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
        mediaRecorder.stop();
        recordBtn.querySelector('span').textContent = 'Click to start recording';
        recordBtn.querySelector('i').className = 'fas fa-microphone';
        recordingStatus.style.display = 'none';
        
    } else {
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
                document.getElementById('transcribedText').textContent = `[Recording captured (${(audioBlob.size / 1024).toFixed(1)} KB)]`;
                recordBtn.style.display = 'none'; 

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            
            recordBtn.querySelector('span').textContent = 'Click to STOP recording';
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
    document.getElementById('recordBtn').querySelector('span').textContent = 'Click to start recording';
    document.getElementById('recordBtn').querySelector('i').className = 'fas fa-microphone';
    
    document.getElementById('recordingStatus').style.display = 'none';
    document.getElementById('recordingResult').style.display = 'none';
    document.getElementById('textInput').value = ''; 
}

function showError(message) {
    const errorSection = document.getElementById('errorSection');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    document.getElementById('errorMessage').textContent = message;
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

    // Use a relative URL. Flask serves this file, so it knows where /analyze is.
    fetch('/analyze', {
        method: 'POST',
        body: formData 
    })
    .then(response => {
        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (!response.ok) {
            return response.text().then(text => { 
                throw new Error(`Server error: ${response.status} ${response.statusText} - ${text}`) 
            });
        }
        return response.json();
    })
    .then(data => {
        if (!data) return; 

        loadingSection.style.display = 'none';
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '<i class="fas fa-heartbeat"></i> Understand my feelings';

        if (data.error) {
            showError(data.error);
        } else {
            if (currentInputMethod === 'voice' && data.text) {
                document.getElementById('textInput').value = data.text;
                document.getElementById('transcribedText').textContent = data.text;
            }
            
            const formattedData = {
                text_preview: data.text.length > 100 ? data.text.substring(0, 100) + '...' : data.text,
                full_text: data.text,
                timestamp: new Date().toISOString(),
                mood: data.mood, 
                stress: data.stress,
                emotions: data.emotion,
                recommendations: data.recommendations 
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
    
    const saveBtn = document.querySelector('.save-btn');
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-chart-line"></i> View Trends'; 

    document.getElementById('textPreview').textContent = data.text_preview;

    // --- Mood Card Logic ---
    const moodCard = document.getElementById('moodCard');
    const moodLevel = data.mood.level;
    moodCard.className = 'insight-card';
    moodCard.classList.add(data.mood.label_class); 
    
    document.getElementById('moodLevel').textContent = moodLevel;
    document.getElementById('moodExplanation').textContent = data.mood.explanation;
    
    const moodFill = document.getElementById('moodScoreFill'); 
    moodFill.style.width = data.mood.score + '%'; 
    document.getElementById('moodScoreValue').textContent = data.mood.score + '%';

    // --- Stress Card Logic ---
    const strCard = document.getElementById('stressCard');
    const strLevel = data.stress.level;
    strCard.className = 'insight-card';
    if (strLevel === 'HIGH STRESS') strCard.classList.add('dangerous');
    else if (strLevel === 'MODERATE STRESS') strCard.classList.add('moderate-risk');
    else strCard.classList.add('safe'); 

    document.getElementById('stressLevel').textContent = strLevel;
    document.getElementById('stressExplanation').textContent = data.stress.explanation;
    
    const stressFill = document.getElementById('stressScoreFill'); 
    stressFill.style.width = data.stress.score + '%'; 
    document.getElementById('stressScoreValue').textContent = data.stress.score + '%';

    // --- Weather Report Logic ---
    const dominant = data.emotions.dominant;
    const weatherIcon = document.getElementById('weatherEmoji');
    const weatherMain = document.getElementById('weatherMain');
    const weatherDesc = document.getElementById('weatherDesc');
    
    weatherIcon.className = 'fas';
    
    if (dominant === 'disgust' || dominant === 'anger' || data.mood.score < 30) {
        weatherIcon.classList.add('fa-cloud-rain');
        weatherMain.textContent = 'Heavy Rain';
        weatherDesc.textContent = `Strong feelings of ${dominant} and heaviness present.`;
    } else if (dominant === 'fear' || dominant === 'surprise' || data.stress.score > 70) {
        weatherIcon.classList.add('fa-wind');
        weatherMain.textContent = 'Stormy Weather';
        weatherDesc.textContent = `A lot of ${dominant} or surprising energy.`;
    } else if (dominant === 'joy' || data.mood.score > 80) {
        weatherIcon.classList.add('fa-sun');
        weatherMain.textContent = 'Bright Sunshine';
        weatherDesc.textContent = 'Clear skies with feelings of joy and positivity.';
    } else if (dominant === 'sadness' || data.mood.score < 60) {
        weatherIcon.classList.add('fa-cloud-sun');
        weatherMain.textContent = 'Partly Cloudy';
        weatherDesc.textContent = 'A mix of clouds and sun; some sadness present.';
    } else {
        weatherIcon.classList.add('fa-smog');
        weatherMain.textContent = 'Foggy';
        weatherDesc.textContent = `Feelings of ${dominant} are present.`;
    }

    const cloud = document.getElementById('emotionCloud');
    cloud.innerHTML = '';
    document.getElementById('dominantEmotion').textContent = dominant;
    
    const sortedEmotions = Object.entries(data.emotions.all_emotions).sort(([,a],[,b]) => b-a);
    
    for (const [emotion, score] of sortedEmotions) {
        const tag = document.createElement('span');
        tag.className = 'emotion-tag';
        tag.textContent = `${emotion} (${score.toFixed(1)}%)`;
        if (emotion === dominant || score > 40) {
            tag.classList.add('highlight');
        }
        cloud.appendChild(tag);
    }

    const grid = document.getElementById('suggestionsGrid');
    grid.innerHTML = '';
    
    data.recommendations.forEach(recText => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            <h4>Gentle Suggestion</h4> 
            <p>${recText}</p> 
        `; 
        grid.appendChild(item);
    });
}


// --- [6. Dashboard Logic (Fetching from API)] ---

function saveToDashboard() {
    showSection('dashboard');
}

// CRITICAL CHANGE: Load data from the Flask API
function loadDashboard() {
    // --- THIS IS THE FIX ---
    // First, define all the elements you're going to use.
    const emotionSummary = document.getElementById('emotionSummary');
    const reflectionsList = document.getElementById('reflectionsList');
    const weeklyInsights = document.getElementById('weeklyInsights');
    const weekChartContainer = document.querySelector('#dashboardSection .week-chart');
    const moodTrendContainer = document.querySelector('#dashboardSection .trend-chart:nth-of-type(1)');
    const stressTrendContainer = document.querySelector('#dashboardSection .trend-chart:nth-of-type(2)');

    // Set loading placeholders only if the elements exist
    if (reflectionsList) reflectionsList.innerHTML = '<p style="padding: 20px; color: #6c757d;">Loading data...</p>';
    if (weeklyInsights) weeklyInsights.innerHTML = '<p style="padding: 20px; color: #6c757d;">Calculating insights...</p>';
    if (emotionSummary) emotionSummary.innerHTML = '';

    fetch('/api/user_data') 
        .then(response => {
            if (response.status === 401) {
                window.location.href = '/login'; 
                return new Promise(() => {});
            }
            if (!response.ok) {
                throw new Error('Failed to fetch user data.');
            }
            return response.json();
        })
        .then(log => {
            if (!log) return; 
            
            if (log.length === 0) {
                if (reflectionsList) reflectionsList.innerHTML = '<p style="padding: 20px; color: #6c757d;">No data yet. Complete a check-in to see your trends.</p>';
                if (weeklyInsights) weeklyInsights.innerHTML = '<p style="padding: 20px; color: #6c757d;">No data yet.</p>';
                if (weekChartContainer) weekChartContainer.innerHTML = '<p style="padding: 20px; color: #6c757d;">No data to display.</p>';
                if (moodTrendContainer) moodTrendContainer.innerHTML = '<p style="padding: 20px; color: #6c757d;">No data to display.</p>';
                if (stressTrendContainer) stressTrendContainer.innerHTML = '<p style="padding: 20px; color: #6c757d;">No data to display.</p>';
                return;
            }

            // --- Prepare Data for Charts ---
            const chartData = log.slice(0, 7).reverse(); 
            
            const labels = chartData.map(entry => 
                new Date(entry.timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
            );
            
            const moodScores = chartData.map(entry => entry.mood_score); 
            const stressScores = chartData.map(entry => entry.stress_score);
            const combinedScores = chartData.map(entry => (entry.mood_score + (100 - entry.stress_score)) / 2);

            // --- Destroy and Re-render Charts ---
            if (weekChartInstance) weekChartInstance.destroy();
            if (moodTrendChartInstance) moodTrendChartInstance.destroy();
            if (stressTrendChartInstance) stressTrendChartInstance.destroy();
            
            if (weekChartContainer) weekChartContainer.innerHTML = '<canvas id="weekChartCanvas"></canvas>';
            if (moodTrendContainer) moodTrendContainer.innerHTML = '<canvas id="moodTrendChartCanvas"></canvas>';
            if (stressTrendContainer) stressTrendContainer.innerHTML = '<canvas id="stressTrendChartCanvas"></canvas>';

            // 7.1. Weekly Overview Chart
            const ctxWeek = document.getElementById('weekChartCanvas')?.getContext('2d');
            if (ctxWeek) {
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
                        scales: { y: { beginAtZero: true, max: 100 } },
                        plugins: { legend: { display: false } }
                    }
                });
            }

            // 7.2. Mood Trend Chart
            const ctxMood = document.getElementById('moodTrendChartCanvas')?.getContext('2d');
            if (ctxMood) {
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
                        scales: { y: { beginAtZero: true, max: 100 } },
                        plugins: { legend: { display: false } }
                    }
                });
            }

            // 7.3. Stress Trend Chart
            const ctxStress = document.getElementById('stressTrendChartCanvas')?.getContext('2d');
            if (ctxStress) {
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
                        scales: { y: { beginAtZero: true, max: 100, reverse: false } },
                        plugins: { legend: { display: false } }
                    }
                });
            }


            // --- Reflections List ---
            if (reflectionsList) reflectionsList.innerHTML = '';
            log.slice(0, 10).forEach(entry => {
                const item = document.createElement('div');
                item.className = 'reflection-item';
                
                let suggestionsHTML = '';
                if (entry.recommendations && entry.recommendations.length > 0) {
                    suggestionsHTML = '<ul class="reflection-suggestions">';
                    entry.recommendations.forEach(recText => {
                        suggestionsHTML += `<li>- ${recText}</li>`;
                    });
                    suggestionsHTML += '</ul>';
                }
                
                item.innerHTML = `
                    <div class="reflection-header">
                        <strong>${new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>
                        <span>Mood: ${entry.mood_score}% | Stress: ${entry.stress_score}%</span>
                    </div>
                    <p class="reflection-text">"${entry.full_text.substring(0, 100)}..."</p>
                    ${suggestionsHTML} 
                `;
                if (reflectionsList) reflectionsList.appendChild(item);
            });
            
            // --- Weekly Insights ---
            const totalMood = log.reduce((acc, e) => acc + e.mood_score, 0);
            const totalStress = log.reduce((acc, e) => acc + e.stress_score, 0);
            const avgMood = (totalMood / log.length).toFixed(0);
            const avgStress = (totalStress / log.length).toFixed(0);

            if (weeklyInsights) weeklyInsights.innerHTML = `
                <div class="insight-item">
                    <h4>Your average mood rating</h4>
                    <p>Your average mood rating was <strong>${avgMood}%</strong>. (Higher is better)</p>
                </div>
                <div class="insight-item">
                    <h4>Your average stress</h4>
                    <p>Your average stress indicator was <strong>${avgStress}%</strong>. (Lower is better)</p>
                </div>
            `;
            
            if (emotionSummary) emotionSummary.innerHTML = '<p style="padding: 20px; color: #6c757d;">Common feelings requires additional processing.</p>';

        })
        .catch(error => {
            console.error(error);
            const reflectionsListEl = document.getElementById('reflectionsList');
            if (reflectionsListEl) {
                reflectionsListEl.innerHTML = `<p style="padding: 20px; color: #721c24;">Error loading data: ${error.message}. Please try logging in again.</p>`;
            }
        });
}
// --- Add this to the bottom of script.js ---

document.addEventListener('DOMContentLoaded', () => {
    // This script only runs on index.html, which is only loaded AFTER login.
    
    // Setup listeners for the main app
    setupEventListeners();

    // --- NEW ---
    // Check if the user is an admin and add the admin button
    const userRole = document.body.dataset.userRole;
    if (userRole === 'admin') {
        addAdminButtonToNav();
    }
    // --- END NEW ---
    
    // Show the main check-in section by default
    showSection('checkin');
});

// --- NEW FUNCTION ---
function addAdminButtonToNav() {
    const headerNav = document.querySelector('.header-nav');
    const logoutBtn = document.querySelector('.nav-btn[onclick="window.location.href=\'/logout\'"]');
    
    if (headerNav && logoutBtn) {
        const adminBtn = document.createElement('button');
        adminBtn.className = 'nav-btn';
        adminBtn.textContent = 'Admin';
        
        // Make it navigate to the admin page
        adminBtn.onclick = () => {
            window.location.href = '/admin';
        };
        
        // Insert it before the logout button
        headerNav.insertBefore(adminBtn, logoutBtn);
    }
}
// --- NEW FUNCTION: Add this to the bottom of script.js ---
function addAdminButtonToNav() {
    const headerNav = document.querySelector('.header-nav');
    const logoutBtn = document.querySelector('.nav-btn[onclick="window.location.href=\'/logout\'"]');
    
    if (headerNav && logoutBtn) {
        // Check if button already exists to prevent duplicates on re-load
        if (document.querySelector('.nav-btn[onclick="window.location.href=\'/admin\'"]')) {
            return;
        }
        
        const adminBtn = document.createElement('button');
        adminBtn.className = 'nav-btn';
        adminBtn.textContent = 'Admin';
        
        // Make it navigate to the admin page
        adminBtn.onclick = () => {
            window.location.href = '/admin';
        };
        
        // Insert it before the logout button
        headerNav.insertBefore(adminBtn, logoutBtn);
    }
}