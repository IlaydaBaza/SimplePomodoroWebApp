/**
 * SimplePomodoro Single-Page Application Client JS
 */

const API_BASE = window.location.origin;

class SimplePomodoroApp {
    constructor() {
        // App State
        this.token = localStorage.getItem('coral_token') || null;
        this.username = localStorage.getItem('coral_username') || null;
        this.activeView = 'auth'; // 'auth', 'timer', 'analytics'
        this.authTab = 'login'; // 'login', 'register'
        
        // Topic & Session State
        this.topics = [];
        this.sessions = [];
        this.selectedTopicId = null;

        // Timer Module State
        this.timerInterval = null;
        this.timerMode = 'work'; // 'work', 'break'
        this.timerDurationMinutes = 25;
        this.timerSecondsRemaining = 25 * 60;
        this.isTimerRunning = false;

        // Analytics State
        this.activeAnalyticsFilter = 'day';
        this.selectedDate = new Date();
        this.barChartInstance = null;
        this.pieChartInstance = null;

        // Audio Context for sound synthesis (Bell sound at completion)
        this.audioCtx = null;
    }

    // Initialize application
    init() {
        this.setupEventListeners();
        
        if (this.token) {
            this.setLoggedInState();
            this.switchView('timer');
            this.fetchTopics();
        } else {
            this.switchView('auth');
        }

        // Initialize display duration
        this.updateTimerDisplay();
    }

    // Set Up Event Listeners
    setupEventListeners() {
        // Dropdown select change handler
        const topicSelect = document.getElementById('timer-topic-select');
        topicSelect.addEventListener('change', (e) => {
            this.selectedTopicId = e.target.value;
            this.saveLastSelectedTopic(this.selectedTopicId);
        });

        // Set up the color sync on the add topic picker
        const colorPicker = document.getElementById('new-topic-color');
        const colorInput = document.getElementById('new-topic-color-hex');
        if (colorPicker && colorInput) {
            colorPicker.addEventListener('input', (e) => {
                colorInput.value = e.target.value.toUpperCase();
            });
            colorInput.addEventListener('input', (e) => {
                let val = e.target.value;
                if (!val.startsWith('#')) {
                    val = '#' + val;
                }
                if (val.length === 7) {
                    colorPicker.value = val;
                }
            });
        }
    }

    // Dynamic UI View Switching
    switchView(viewName) {
        this.activeView = viewName;
        
        // Views definitions
        const authView = document.getElementById('view-auth');
        const timerView = document.getElementById('view-timer');
        const analyticsView = document.getElementById('view-analytics');
        const appNav = document.getElementById('app-nav');

        // Buttons
        const navBtnTimer = document.getElementById('nav-btn-timer');
        const navBtnAnalytics = document.getElementById('nav-btn-analytics');

        // Reset styling classes for views
        authView.classList.add('hidden');
        timerView.classList.add('hidden');
        analyticsView.classList.add('hidden');

        // Reset nav states
        navBtnTimer.className = "px-4 py-2 rounded-lg font-medium text-sm text-slate-600 hover:text-coral hover:bg-coral/5 transition duration-150";
        navBtnAnalytics.className = "px-4 py-2 rounded-lg font-medium text-sm text-slate-600 hover:text-coral hover:bg-coral/5 transition duration-150";

        if (!this.token) {
            appNav.classList.add('hidden');
            authView.classList.remove('hidden');
            return;
        }

        appNav.classList.remove('hidden');

        if (viewName === 'timer') {
            timerView.classList.remove('hidden');
            navBtnTimer.className = "px-4 py-2 rounded-lg font-medium text-sm text-coral bg-coral/10 transition duration-150";
            // Refresh topic lists when visiting timer
            this.fetchTopics();
        } else if (viewName === 'analytics') {
            analyticsView.classList.remove('hidden');
            navBtnAnalytics.className = "px-4 py-2 rounded-lg font-medium text-sm text-coral bg-coral/10 transition duration-150";
            // Load analytical data
            this.fetchAnalytics(this.activeAnalyticsFilter);
        }
    }

    // --- Toast / Notification Manager ---
    showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        
        toastMessage.textContent = message;
        
        if (isError) {
            toast.className = "fixed top-5 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 ease-out bg-red-600 text-white px-6 py-3 rounded-xl shadow-xl flex items-center space-x-2";
        } else {
            toast.className = "fixed top-5 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 ease-out bg-slate-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center space-x-2";
        }

        setTimeout(() => {
            toast.className = "fixed top-5 right-5 z-50 transform translate-y-[-100px] opacity-0 transition-all duration-300 ease-out bg-slate-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center space-x-2";
        }, 3000);
    }

    // --- Authentication Actions ---
    toggleAuthTab(tab) {
        this.authTab = tab;
        const loginTab = document.getElementById('auth-tab-login');
        const registerTab = document.getElementById('auth-tab-register');
        const submitBtn = document.getElementById('auth-submit-btn');

        if (tab === 'login') {
            loginTab.className = "w-1/2 pb-3 font-outfit font-bold text-lg text-coral border-b-2 border-coral transition duration-150";
            registerTab.className = "w-1/2 pb-3 font-outfit font-medium text-lg text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition duration-150";
            submitBtn.textContent = "Login";
        } else {
            registerTab.className = "w-1/2 pb-3 font-outfit font-bold text-lg text-coral border-b-2 border-coral transition duration-150";
            loginTab.className = "w-1/2 pb-3 font-outfit font-medium text-lg text-slate-400 border-b-2 border-transparent hover:text-slate-600 transition duration-150";
            submitBtn.textContent = "Register Account";
        }
    }

    async handleAuthSubmit(event) {
        event.preventDefault();
        const usernameInput = document.getElementById('auth-username');
        const passwordInput = document.getElementById('auth-password');
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            this.showToast("Username and Password are required", true);
            return;
        }

        const endpoint = this.authTab === 'login' ? '/api/auth/login' : '/api/auth/register';

        try {
            const response = await fetch(API_BASE + endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Authentication failed");
            }

            if (this.authTab === 'register') {
                this.showToast("Registration successful! Logging you in...");
                // Automatically log in after registration
                this.authTab = 'login';
                this.handleAuthSubmit(event);
                return;
            }

            // Save credentials
            this.token = data.access_token;
            this.username = data.username;
            localStorage.setItem('coral_token', this.token);
            localStorage.setItem('coral_username', this.username);

            this.setLoggedInState();
            this.showToast(`Welcome back, ${this.username}!`);
            
            // Redirect to App views
            this.switchView('timer');
            this.fetchTopics();

            // Clear credentials from forms safely
            passwordInput.value = '';

        } catch (error) {
            this.showToast(error.message, true);
        }
    }

    setLoggedInState() {
        document.getElementById('nav-username').textContent = this.username;
    }

    logout() {
        this.token = null;
        this.username = null;
        localStorage.removeItem('coral_token');
        localStorage.removeItem('coral_username');
        localStorage.removeItem('last_topic_id');
        this.selectedTopicId = null;

        // Reset timer state
        this.pauseTimer();
        this.timerSecondsRemaining = 25 * 60;
        this.updateTimerDisplay();

        this.showToast("Logged out successfully");
        this.switchView('auth');
    }

    // API Helper with headers
    async apiCall(url, method = 'GET', body = null) {
        const headers = {
            'Authorization': `Bearer ${this.token}`
        };
        if (body) {
            headers['Content-Type'] = 'application/json';
        }

        const options = {
            method,
            headers
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(API_BASE + url, options);
            if (response.status === 401) {
                // Token expired/invalid
                this.logout();
                throw new Error("Session expired. Please log in again.");
            }
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || "API Request failed");
            }
            return data;
        } catch (error) {
            this.showToast(error.message, true);
            throw error;
        }
    }

    // --- Topic Manager ---
    async fetchTopics() {
        try {
            const topics = await this.apiCall('/api/topics');
            this.topics = topics;
            this.populateTopicsDropdown();
        } catch (err) {
            console.error("Failed to load topics", err);
        }
    }

    populateTopicsDropdown() {
        const dropdown = document.getElementById('timer-topic-select');
        
        // Keep the placeholder
        dropdown.innerHTML = '<option value="" disabled selected>-- Select a study topic --</option>';

        this.topics.forEach(topic => {
            const option = document.createElement('option');
            option.value = topic.id;
            option.textContent = topic.topic_name;
            // Display visual dot in text representing Hex color
            option.innerHTML = `${topic.topic_name}`;
            
            // Set style inline just in case browser supports color drop
            option.style.borderLeft = `6px solid ${topic.color_hex}`;
            
            dropdown.appendChild(option);
        });

        // Restore last selected topic if it exists
        const lastSelected = localStorage.getItem('last_topic_id');
        if (lastSelected && this.topics.some(t => t.id == lastSelected)) {
            this.selectedTopicId = lastSelected;
            dropdown.value = lastSelected;
        }
    }

    saveLastSelectedTopic(id) {
        localStorage.setItem('last_topic_id', id);
    }

    // Add Topic Modal Interactions
    showAddTopicModal() {
        const modal = document.getElementById('add-topic-modal');
        modal.classList.remove('opacity-0', 'pointer-events-none');
        // trigger scale effect
        modal.querySelector('.bg-cream').classList.remove('scale-90');
    }

    hideAddTopicModal() {
        const modal = document.getElementById('add-topic-modal');
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.querySelector('.bg-cream').classList.add('scale-90');
    }

    setNewTopicColorPreset(hex) {
        document.getElementById('new-topic-color').value = hex;
        document.getElementById('new-topic-color-hex').value = hex.toUpperCase();
    }

    async handleAddTopicSubmit(e) {
        e.preventDefault();
        const nameInput = document.getElementById('new-topic-name');
        const colorInput = document.getElementById('new-topic-color-hex');

        const topic_name = nameInput.value.trim();
        const color_hex = colorInput.value.trim();

        if (!topic_name || !color_hex) {
            this.showToast("Topic details are incomplete", true);
            return;
        }

        try {
            const newTopic = await this.apiCall('/api/topics', 'POST', {
                topic_name,
                color_hex
            });

            this.showToast(`Topic "${newTopic.topic_name}" created!`);
            this.hideAddTopicModal();
            
            // Refresh
            await this.fetchTopics();
            
            // Automatically select the newly created topic
            this.selectedTopicId = newTopic.id;
            document.getElementById('timer-topic-select').value = newTopic.id;
            this.saveLastSelectedTopic(newTopic.id);

            // Clear form
            nameInput.value = '';

        } catch (error) {
            // Error already toasted by helper
        }
    }


    // --- POMODORO TIMER CORE ---
    setTimerMode(mode) {
        if (this.isTimerRunning) {
            this.showToast("Cannot change mode while timer is running!", true);
            return;
        }
        
        this.timerMode = mode;
        const workBtn = document.getElementById('timer-mode-work');
        const breakBtn = document.getElementById('timer-mode-break');
        const skipBtn = document.getElementById('timer-skip-btn');
        const sliderContainer = document.getElementById('timer-slider-container');
        
        // Mode toggle styling
        if (mode === 'work') {
            workBtn.className = "px-4 py-2 text-xs font-bold uppercase rounded-lg bg-white text-coral shadow-sm transition";
            breakBtn.className = "px-4 py-2 text-xs font-bold uppercase rounded-lg text-slate-500 hover:text-slate-700 transition";
            
            // Re-read slider configuration
            this.timerDurationMinutes = parseInt(document.getElementById('timer-duration-slider').value);
            this.timerSecondsRemaining = this.timerDurationMinutes * 60;
            
            sliderContainer.classList.remove('hidden');
            skipBtn.disabled = true;
            skipBtn.classList.add('opacity-50', 'cursor-not-allowed');
            document.getElementById('timer-status-text').textContent = "Ready to Focus";
        } else {
            breakBtn.className = "px-4 py-2 text-xs font-bold uppercase rounded-lg bg-white text-coral shadow-sm transition";
            workBtn.className = "px-4 py-2 text-xs font-bold uppercase rounded-lg text-slate-500 hover:text-slate-700 transition";
            
            // Fixed break duration (e.g. 5 minutes)
            this.timerDurationMinutes = 5;
            this.timerSecondsRemaining = 5 * 60;
            
            sliderContainer.classList.add('hidden');
            skipBtn.disabled = false;
            skipBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            document.getElementById('timer-status-text').textContent = "Take a break!";
        }

        this.updateTimerDisplay();
    }

    updateDurationFromSlider(val) {
        document.getElementById('slider-val').textContent = `${val} min`;
        if (this.timerMode === 'work' && !this.isTimerRunning) {
            this.timerDurationMinutes = parseInt(val);
            this.timerSecondsRemaining = this.timerDurationMinutes * 60;
            this.updateTimerDisplay();
        }
    }

    updateTimerDisplay() {
        const mins = Math.floor(this.timerSecondsRemaining / 60);
        const secs = this.timerSecondsRemaining % 60;
        
        // Format standard numeric MM:SS readout
        const readout = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        document.getElementById('timer-time').textContent = readout;
        document.title = `${readout} | SimplePomodoro 🐥`;

        // Dynamic Yellow Chick character state updater
        const chickChar = document.getElementById('chick-char');
        if (chickChar) {
            if (!this.isTimerRunning) {
                chickChar.textContent = '🐤'; // Idle / Paused
                chickChar.style.animationPlayState = 'paused';
            } else {
                chickChar.style.animationPlayState = 'running';
                if (this.timerMode === 'work') {
                    chickChar.textContent = '🐥'; // Focus working chick
                } else {
                    chickChar.textContent = '🐣'; // Break hatching chick
                }
            }
        }

        // Update Circular Progress Bar Dashoffset
        const progressCircle = document.getElementById('timer-progress-bar');
        const totalSeconds = this.timerDurationMinutes * 60;
        const progressFraction = this.timerSecondsRemaining / totalSeconds;
        
        // The circle radius is 46% of container, stroke-dasharray is roughly 2 * pi * r.
        // Let's grab dasharray value from CSS or compute dynamically.
        // Dasharray total matches diameter math. Let's hardcode 900 as standard base width.
        const circumference = 2 * Math.PI * 145; // radius roughly 145px
        progressCircle.style.strokeDasharray = circumference;
        const offset = circumference * (1 - progressFraction);
        progressCircle.style.strokeDashoffset = offset;
    }

    toggleTimer() {
        if (this.isTimerRunning) {
            this.pauseTimer();
        } else {
            // Before starting, the user MUST select a topic from a dropdown menu.
            if (this.timerMode === 'work' && !this.selectedTopicId) {
                this.showToast("Please select a study topic before starting!", true);
                
                // Highlight select dropdown visually
                const topicSelect = document.getElementById('timer-topic-select');
                topicSelect.classList.add('ring-2', 'ring-red-500', 'border-transparent');
                setTimeout(() => {
                    topicSelect.classList.remove('ring-2', 'ring-red-500', 'border-transparent');
                }, 1500);
                return;
            }
            this.startTimer();
        }
    }

    startTimer() {
        this.isTimerRunning = true;
        
        // Toggle play icon to pause icon
        document.getElementById('play-icon').classList.add('hidden');
        document.getElementById('pause-icon').classList.remove('hidden');

        document.getElementById('timer-status-text').textContent = this.timerMode === 'work' ? "Focusing..." : "Resting...";

        this.timerInterval = setInterval(() => {
            this.timerSecondsRemaining--;
            
            if (this.timerSecondsRemaining <= 0) {
                this.handleTimerCompletion();
            } else {
                this.updateTimerDisplay();
            }
        }, 1000);
    }

    pauseTimer() {
        this.isTimerRunning = false;
        clearInterval(this.timerInterval);
        
        // Toggle pause icon to play icon
        document.getElementById('pause-icon').classList.add('hidden');
        document.getElementById('play-icon').classList.remove('hidden');

        document.getElementById('timer-status-text').textContent = "Paused";
    }

    resetTimer() {
        this.pauseTimer();
        
        if (this.timerMode === 'work') {
            this.timerSecondsRemaining = this.timerDurationMinutes * 60;
        } else {
            this.timerSecondsRemaining = 5 * 60;
        }
        
        this.updateTimerDisplay();
        document.getElementById('timer-status-text').textContent = "Ready to Focus";
    }

    skipBreak() {
        if (this.timerMode === 'break') {
            this.pauseTimer();
            this.showToast("Break skipped! Back to focusing!");
            this.setTimerMode('work');
        }
    }

    // Timer Finished Hook
    async handleTimerCompletion() {
        this.pauseTimer();
        this.playAlarmSound();

        if (this.timerMode === 'work') {
            this.showToast("🎉 Outstanding! Study session successfully completed!");
            
            // Automatically send an API request to log session
            await this.logStudySession();
            
            // Auto switch to break mode
            this.setTimerMode('break');
        } else {
            this.showToast("Break is over! Time to get focused!");
            this.setTimerMode('work');
        }
    }

    async logStudySession() {
        if (!this.selectedTopicId) return;

        try {
            // Data hook: user_id (handled by backend auth token), topic_id, duration_minutes
            const session = await this.apiCall('/api/sessions', 'POST', {
                topic_id: parseInt(this.selectedTopicId),
                duration_minutes: parseFloat(this.timerDurationMinutes)
            });

            this.showToast(`Logged: focused on "${session.topic_name}" for ${session.duration_minutes} min.`);
            
        } catch (error) {
            console.error("Failed to automatically record session", error);
        }
    }

    // Synthesize elegant chiptune chimes (zero dependencies!)
    playAlarmSound() {
        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }

            const now = this.audioCtx.currentTime;
            
            // Make a cute double chime sound
            const playChime = (time, pitch) => {
                const osc = this.audioCtx.createOscillator();
                const gainNode = this.audioCtx.createGain();
                
                osc.type = "sine";
                osc.frequency.setValueAtTime(pitch, time);
                
                // Decay envelope
                gainNode.gain.setValueAtTime(0.3, time);
                gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
                
                osc.connect(gainNode);
                gainNode.connect(this.audioCtx.destination);
                
                osc.start(time);
                osc.stop(time + 0.8);
            };

            playChime(now, 523.25); // C5
            playChime(now + 0.15, 659.25); // E5
            playChime(now + 0.30, 783.99); // G5
            playChime(now + 0.45, 1046.50); // C6

        } catch (error) {
            console.warn("Audio Context failed to synthesize alarm sound due to browser permissions.", error);
        }
    }


    // --- ANALYTICS DASHBOARD MODULE ---
    async fetchAnalytics(filterType) {
        this.activeAnalyticsFilter = filterType;
        
        // Highlight active filter button style
        const filters = ['day', 'week', 'month', 'year', 'summary'];
        filters.forEach(f => {
            const btn = document.getElementById(`filter-btn-${f}`);
            if (f === filterType) {
                btn.className = "px-4 py-2 text-xs font-bold uppercase rounded-lg bg-white text-coral shadow-sm transition whitespace-nowrap";
            } else {
                btn.className = "px-4 py-2 text-xs font-bold uppercase rounded-lg text-slate-500 hover:text-slate-700 transition whitespace-nowrap";
            }
        });

        // Update the visual display representation of the current active period
        this.updatePeriodDisplay();

        // Timezone offset for local grouping inside backend database aggregates
        const offsetMinutes = new Date().getTimezoneOffset();

        // Formulate date formatted as YYYY-MM-DD local timezone
        const year = this.selectedDate.getFullYear();
        const month = String(this.selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(this.selectedDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        try {
            const response = await this.apiCall(`/api/analytics?filter=${filterType}&date=${dateStr}&timezone_offset_minutes=${offsetMinutes}`);
            this.renderAnalyticsCharts(response);
            
            // Sync history sessions list with the returned active sessions list for that period
            this.sessions = response.sessions || [];
            this.renderRecentSessionsTable();
        } catch (error) {
            console.error("Failed to load analytics charts", error);
        }
    }

    updatePeriodDisplay() {
        const displayText = document.getElementById('period-display-text');
        const datePickerInput = document.getElementById('period-date-picker');
        const nextBtn = document.getElementById('period-next-btn');

        if (!displayText || !datePickerInput) return;

        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const today = new Date();
        let isCurrentPeriod = false;

        // Synchronize input picker value
        const year = this.selectedDate.getFullYear();
        const month = String(this.selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(this.selectedDate.getDate()).padStart(2, '0');
        datePickerInput.value = `${year}-${month}-${day}`;

        if (this.activeAnalyticsFilter === 'day') {
            if (this.selectedDate.toDateString() === today.toDateString()) {
                displayText.textContent = "Today";
                isCurrentPeriod = true;
            } else {
                displayText.textContent = this.selectedDate.toLocaleDateString('en-US', options);
            }
        } else if (this.activeAnalyticsFilter === 'week') {
            // Monday-Sunday of the week of selectedDate
            const currentDay = this.selectedDate.getDay();
            const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
            const monday = new Date(this.selectedDate);
            monday.setDate(this.selectedDate.getDate() + distanceToMonday);

            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);

            const optShort = { month: 'short', day: 'numeric', year: 'numeric' };
            displayText.textContent = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', optShort)}`;

            // Check if today falls in or before this week
            const startOfWeek = new Date(monday);
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(sunday);
            endOfWeek.setHours(23, 59, 59, 999);
            if (today >= startOfWeek && today <= endOfWeek) {
                isCurrentPeriod = true;
            } else if (today < startOfWeek) {
                isCurrentPeriod = true; 
            }
        } else if (this.activeAnalyticsFilter === 'month') {
            displayText.textContent = this.selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            
            if (this.selectedDate.getMonth() === today.getMonth() && this.selectedDate.getFullYear() === today.getFullYear()) {
                isCurrentPeriod = true;
            }
        } else if (this.activeAnalyticsFilter === 'year') {
            displayText.textContent = this.selectedDate.getFullYear().toString();
            
            if (this.selectedDate.getFullYear() === today.getFullYear()) {
                isCurrentPeriod = true;
            }
        } else { // 'summary'
            const currentYear = this.selectedDate.getFullYear();
            const startYear = currentYear - 4;
            displayText.textContent = `${startYear} – ${currentYear}`;
            
            if (today.getFullYear() >= startYear && today.getFullYear() <= currentYear) {
                isCurrentPeriod = true;
            }
        }

        // Disable "Next" arrow button if we are looking at the current or a future period
        if (nextBtn) {
            if (isCurrentPeriod || this.selectedDate > today) {
                nextBtn.disabled = true;
                nextBtn.classList.add('opacity-30', 'cursor-not-allowed');
            } else {
                nextBtn.disabled = false;
                nextBtn.classList.remove('opacity-30', 'cursor-not-allowed');
            }
        }
    }

    navigatePeriod(direction) {
        const today = new Date();
        
        if (this.activeAnalyticsFilter === 'day') {
            this.selectedDate.setDate(this.selectedDate.getDate() + direction);
        } else if (this.activeAnalyticsFilter === 'week') {
            this.selectedDate.setDate(this.selectedDate.getDate() + (direction * 7));
        } else if (this.activeAnalyticsFilter === 'month') {
            this.selectedDate.setMonth(this.selectedDate.getMonth() + direction);
        } else if (this.activeAnalyticsFilter === 'year') {
            this.selectedDate.setFullYear(this.selectedDate.getFullYear() + direction);
        } else { // summary
            this.selectedDate.setFullYear(this.selectedDate.getFullYear() + (direction * 5));
        }

        // Cap to today if navigated to the future
        if (this.selectedDate > today) {
            this.selectedDate = new Date();
        }

        this.fetchAnalytics(this.activeAnalyticsFilter);
    }

    handleDatePickerChange(val) {
        if (!val) return;
        
        const parts = val.split('-');
        this.selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        
        const today = new Date();
        if (this.selectedDate > today) {
            this.selectedDate = today;
            this.showToast("Cannot navigate to future dates!");
        }

        this.fetchAnalytics(this.activeAnalyticsFilter);
    }

    async fetchRecentSessions() {
        try {
            const sessions = await this.apiCall('/api/sessions');
            this.sessions = sessions;
            this.renderRecentSessionsTable();
        } catch (err) {
            console.error("Failed to fetch session history log", err);
        }
    }

    renderRecentSessionsTable() {
        const tbody = document.getElementById('session-history-tbody');
        tbody.innerHTML = '';

        if (this.sessions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="py-6 text-center text-slate-400">No session logs found. Go back and focus!</td>
                </tr>
            `;
            return;
        }

        this.sessions.forEach(sess => {
            const tr = document.createElement('tr');
            tr.className = "border-b border-slate-50 text-slate-600 hover:bg-slate-50/50 transition";
            
            // Format Timestamp
            const d = new Date(sess.timestamp);
            const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            tr.innerHTML = `
                <td class="py-3 flex items-center space-x-2">
                    <span class="w-3 h-3 rounded-full inline-block border border-black/10" style="background-color: ${sess.color_hex || '#CCC'}"></span>
                    <span class="font-medium text-slate-800">${sess.topic_name || 'Generic Topic'}</span>
                </td>
                <td class="py-3 font-semibold text-slate-700">${sess.duration_minutes} min</td>
                <td class="py-3 text-slate-400 text-xs">${dateStr}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderAnalyticsCharts(data) {
        // Update stats counters
        document.getElementById('stats-total-sessions').textContent = `${data.stats.total_sessions} times`;
        
        const totalDuration = data.stats.total_duration_minutes;
        if (totalDuration >= 60) {
            const hrs = Math.floor(totalDuration / 60);
            const mins = Math.round(totalDuration % 60);
            document.getElementById('stats-total-duration').textContent = `${hrs} hr ${mins} min`;
        } else {
            document.getElementById('stats-total-duration').textContent = `${totalDuration} Min`;
        }

        // --- Render Vertical Bar Chart ---
        const barCtx = document.getElementById('barChart').getContext('2d');
        
        // Destroy existing instance to prevent visual rendering glitch in Chart.js
        if (this.barChartInstance) {
            this.barChartInstance.destroy();
        }

        this.barChartInstance = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: data.bar_chart.labels,
                datasets: [{
                    label: 'Study Duration (Hours)',
                    data: data.bar_chart.values,
                    backgroundColor: '#FF8559', // Coral Theme
                    hoverBackgroundColor: '#E06D44',
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Focused: ${context.parsed.y} hours`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { 
                        beginAtZero: true,
                        ticks: { stepSize: 0.5 },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    }
                }
            }
        });

        // --- Render Topic breakdown Pie Chart ---
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        const fallbackMsg = document.getElementById('no-pie-data-msg');

        if (this.pieChartInstance) {
            this.pieChartInstance.destroy();
        }

        // If no pie chart data, show beautiful fallback message card overlay
        if (data.pie_chart.labels.length === 0) {
            fallbackMsg.classList.remove('hidden');
        } else {
            fallbackMsg.classList.add('hidden');
            
            this.pieChartInstance = new Chart(pieCtx, {
                type: 'pie',
                data: {
                    labels: data.pie_chart.labels,
                    datasets: [{
                        data: data.pie_chart.values,
                        // Slices of the pie chart MUST use the specific color_hex assigned to each topic
                        backgroundColor: data.pie_chart.colors,
                        borderWidth: 2,
                        borderColor: '#FFFDF9' // Cream separator line
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 12,
                                padding: 15,
                                font: { family: 'Inter', size: 11 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => ` ${context.label}: ${context.parsed} hours`
                            }
                        }
                    }
                }
            });
        }
    }
}

// Instantiate and bind to window to make trigger callbacks fully available in DOM
const app = new SimplePomodoroApp();
window.app = app;

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
