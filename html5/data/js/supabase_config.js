// Import Supabase
const SUPABASE_CONFIG = {
    url: 'https://jkkdlbamzokbwwygtmel.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impra2RsYmFtem9rYnd3eWd0bWVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MjEzOTEsImV4cCI6MjA2ODI5NzM5MX0.HNGpazUiCiykLcBdW_ITKmbXFDhSlIZVLKPjUR2mgP0' // Ganti dengan anon key Anda
};

// Initialize Supabase client
let supabaseClient;

// Initialize Supabase
function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log('Supabase initialized successfully');
        return true;
    } else {
        console.error('Supabase library not loaded');
        return false;
    }
}

// User Authentication Functions
const AuthService = {
    // Session timeout configuration (30 minutes = 1800000ms)
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 menit dalam milliseconds
    idleTimer: null,
    lastActivityTime: null,

    // Check if user is logged in
    isLoggedIn: function() {
        const user = sessionStorage.getItem('currentUser');
        return user !== null;
    },

    // Get current user data
    getCurrentUser: function() {
        const userData = sessionStorage.getItem('currentUser');
        return userData ? JSON.parse(userData) : null;
    },

    // Initialize activity tracking
    initActivityTracking: function() {
        if (!this.isLoggedIn()) return;

        this.lastActivityTime = Date.now();
        
        // Track user activities (mouse, keyboard, scroll, etc.)
        const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        
        const resetIdleTimer = () => {
            this.lastActivityTime = Date.now();
            this.resetIdleTimer();
        };

        // Add event listeners for activity detection
        activityEvents.forEach(event => {
            document.addEventListener(event, resetIdleTimer, true);
        });

        // Start idle timer
        this.resetIdleTimer();

        console.log('Activity tracking initialized - Auto logout setelah 30 menit idle');
    },

    // Reset idle timer
    resetIdleTimer: function() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        this.idleTimer = setTimeout(() => {
            this.handleIdleLogout();
        }, this.SESSION_TIMEOUT);
    },

    // Handle idle logout
    handleIdleLogout: function() {
        const user = this.getCurrentUser();
        if (!user) return;

        console.log('User idle timeout - melakukan auto logout');
        
        // Calculate session duration
        const loginTime = sessionStorage.getItem('loginTime');
        let durationText = '';
        
        if (loginTime) {
            const currentTime = Date.now();
            const sessionDuration = currentTime - parseInt(loginTime);
            durationText = this.formatDuration(sessionDuration);
        }

        // Log auto logout activity
        this.logActivity(
            user.id, 
            'logout', 
            `Auto logout karena tidak ada aktivitas. Durasi akses: ${durationText || 'tidak diketahui'}`
        );

        // Clear session
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('sessionId');
        sessionStorage.removeItem('loginTime');

        // Show alert and redirect
        alert('Sesi Anda telah berakhir karena tidak ada aktivitas selama 30 menit. Silakan login kembali.');
        window.location.href = 'auth.html';
    },

    // Stop activity tracking
    stopActivityTracking: function() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    },

    // Format duration in human readable format
    formatDuration: function(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return `${hours} jam ${remainingMinutes} menit`;
        } else if (minutes > 0) {
            const remainingSeconds = seconds % 60;
            return `${minutes} menit ${remainingSeconds} detik`;
        } else {
            return `${seconds} detik`;
        }
    },

    // Logout user
    logout: function() {
        const user = this.getCurrentUser();
        if (user) {
            // Calculate session duration
            const loginTime = sessionStorage.getItem('loginTime');
            let durationText = '';
            
            if (loginTime) {
                const currentTime = new Date().getTime();
                const sessionDuration = currentTime - parseInt(loginTime);
                durationText = this.formatDuration(sessionDuration);
            }

            // Log activity with duration - LOGOUT MANUAL
            this.logActivity(
                user.id, 
                'logout', 
                `User logged out manually. Durasi akses: ${durationText || 'tidak diketahui'}`
            );
            
            console.log('Manual logout logged with description:', `User logged out manually. Durasi akses: ${durationText || 'tidak diketahui'}`);
        }
        
        // Stop activity tracking
        this.stopActivityTracking();
        
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('sessionId');
        sessionStorage.removeItem('loginTime'); // Remove login time tracking
        
        // Redirect to homepage (intro slide)
        window.location.href = 'story.html';
    },

    // Enhanced logout with confirmation
    logoutWithConfirm: function() {
        const confirmLogout = confirm('Yakin ingin keluar dari sistem?');
        if (confirmLogout) {
            this.logout();
        }
    },

    // Redirect to auth if not logged in
    requireAuth: function() {
        if (!this.isLoggedIn()) {
            window.location.href = 'auth.html';
            return false;
        }
        return true;
    },

    // Hash password function
    hashPassword: async function(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    },

    // Log user activity - HANYA UNTUK LOGIN, LOGOUT, REGISTER
    logActivity: async function(userId, activityType, description, pageUrl = window.location.href) {
        if (!supabaseClient) return;

        // HANYA IZINKAN AKTIVITAS TERTENTU
        const allowedActivities = ['login', 'logout', 'register'];
        if (!allowedActivities.includes(activityType)) {
            console.log(`Activity type '${activityType}' is not tracked`);
            return;
        }

        try {
            await supabaseClient
                .from('user_activities')
                .insert([{
                    user_id: userId,
                    activity_type: activityType,
                    activity_description: description,
                    page_url: pageUrl,
                    session_id: this.getSessionId(),
                    user_agent: navigator.userAgent
                }]);
            
            console.log(`Activity logged: ${activityType} - ${description}`);
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    },

    // Generate or get session ID
    getSessionId: function() {
        let sessionId = sessionStorage.getItem('sessionId');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('sessionId', sessionId);
        }
        return sessionId;
    },

    // Track login time (call this after successful login)
    trackLoginTime: function() {
        const loginTime = new Date().getTime();
        sessionStorage.setItem('loginTime', loginTime.toString());
    }
};

// Integration with Articulate Storyline
const StorylineIntegration = {
    // Initialize integration
    init: function() {
        // Check if user is authenticated when Storyline loads
        if (!AuthService.requireAuth()) {
            return;
        }

        // Set user data in Storyline variables
        this.setUserVariables();
        
        // Start activity tracking for auto logout
        AuthService.initActivityTracking();
        
        console.log('Storyline integration initialized (with auto logout tracking)');
    },

    // Set user data in Storyline variables
    setUserVariables: function() {
        const user = AuthService.getCurrentUser();
        if (!user) return;

        try {
            // Get player reference
            const player = window.GetPlayer();
            if (player) {
                player.SetVar("Namalengkap", user.nama_lengkap);
                player.SetVar("Username", user.username);
                player.SetVar("AsalSekolah", user.asal_sekolah);
                player.SetVar("Kelas", user.kelas);
                player.SetVar("Email", user.email);
                player.SetVar("UserID", user.id);
                
                console.log('User variables set in Storyline');
            }
        } catch (error) {
            console.error('Error setting Storyline variables:', error);
        }
    },

    // Show user info in Storyline
    showUserInfo: function() {
        const user = AuthService.getCurrentUser();
        if (!user) return '';

        return `Selamat datang, ${user.nama_lengkap}!`;
    }
};

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Supabase
    if (initSupabase()) {
        // Initialize Storyline integration
        StorylineIntegration.init();
    }
});

// Export functions for global access
window.AuthService = AuthService;
window.StorylineIntegration = StorylineIntegration;
window.initSupabase = initSupabase;