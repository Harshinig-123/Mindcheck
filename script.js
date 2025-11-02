// script.js
function analyzeText() {
    const text = document.getElementById('textInput').value.trim();
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingSection = document.getElementById('loadingSection');
    const resultSection = document.getElementById('resultSection');
    const errorSection = document.getElementById('errorSection');
    
    // Hide previous results and errors
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    
    // Basic validation
    if (text.length < 10) {
        showError('Please write at least 10 characters for meaningful analysis.');
        return;
    }
    
    // Show loading state
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing...';
    loadingSection.style.display = 'block';
    
    // Send request to backend
    fetch('/analyze', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text })
    })
    .then(response => response.json())
    .then(data => {
        // Hide loading
        loadingSection.style.display = 'none';
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze My Mental State';
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        // Display results
        displayResults(data);
    })
    .catch(error => {
        // Hide loading
        loadingSection.style.display = 'none';
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze My Mental State';
        
        showError('Sorry, there was an error processing your request. Please try again.');
        console.error('Error:', error);
    });
}

function displayResults(data) {
    const resultSection = document.getElementById('resultSection');
    const textPreview = document.getElementById('textPreview');
    
    // Show text preview
    textPreview.textContent = data.text_preview;
    
    // Display depression analysis
    displayDepressionAnalysis(data.depression);
    
    // Display stress analysis
    displayStressAnalysis(data.stress);
    
    // Display emotions
    displayEmotions(data.emotions);
    
    // Display recommendations
    displayRecommendations(data.recommendations);
    
    // Show result section
    resultSection.style.display = 'block';
    
    // Scroll to results
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function displayDepressionAnalysis(depression) {
    const card = document.getElementById('depressionCard');
    const levelElement = document.getElementById('depressionLevel');
    const explanationElement = document.getElementById('depressionExplanation');
    const scoreFill = document.getElementById('depressionScoreFill');
    const scoreValue = document.getElementById('depressionScoreValue');
    
    // Set content
    levelElement.textContent = depression.level;
    explanationElement.textContent = depression.explanation;
    scoreValue.textContent = `${depression.score}/100`;
    
 
    scoreFill.style.width = `${depression.score}%`;
    
    
    card.className = 'risk-card';
    if (depression.level === 'DANGEROUS LEVEL') {
        card.classList.add('dangerous');
    } else if (depression.level === 'HIGH RISK') {
        card.classList.add('high-risk');
    } else if (depression.level === 'MODERATE RISK') {
        card.classList.add('moderate-risk');
    } else {
        card.classList.add('low-risk');
    }
}

function displayStressAnalysis(stress) {
    const card = document.getElementById('stressCard');
    const levelElement = document.getElementById('stressLevel');
    const explanationElement = document.getElementById('stressExplanation');
    const scoreFill = document.getElementById('stressScoreFill');
    const scoreValue = document.getElementById('stressScoreValue');
    
   
    levelElement.textContent = stress.level;
    explanationElement.textContent = stress.explanation;
    scoreValue.textContent = `${stress.score}/100`;
    
   
    scoreFill.style.width = `${stress.score}%`;
    
    
    card.className = 'risk-card'; 
    if (stress.level === 'HIGH STRESS') {
        card.classList.add('high-risk');
    } else if (stress.level === 'MODERATE STRESS') {
        card.classList.add('moderate-risk');
    } else {
        card.classList.add('low-risk');
    }
}

function displayEmotions(emotions) {
    const dominantEmotion = document.getElementById('dominantEmotion');
    const emotionPills = document.getElementById('emotionPills');
    
    dominantEmotion.textContent = emotions.dominant.toUpperCase();
    
    emotionPills.innerHTML = '';
    Object.entries(emotions.all_emotions).forEach(([emotion, score]) => {
        const pill = document.createElement('div');
        pill.className = 'emotion-pill';
        if (emotion === emotions.dominant) {
            pill.classList.add('highlight');
        }
        pill.textContent = `${emotion}: ${score}%`;
        emotionPills.appendChild(pill);
    });
}

function displayRecommendations(recommendations) {
    const recommendationsList = document.getElementById('recommendationsList');
    
    recommendationsList.innerHTML = '';
    recommendations.forEach(rec => {
        const li = document.createElement('li');
        li.textContent = rec;
        recommendationsList.appendChild(li);
    });
}

function showError(message) {
    const errorSection = document.getElementById('errorSection');
    const errorMessage = document.getElementById('errorMessage');
    
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
    errorSection.scrollIntoView({ behavior: 'smooth' });
}


document.getElementById('textInput').addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        analyzeText();
    }
});