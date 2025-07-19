// Supabase Configuration for Articulate Storyline Integration
// File: html5/data/js/supabase-config.js

// Import Supabase (pastikan sudah di-include di HTML)
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

    // Logout user
    logout: function() {
        const user = this.getCurrentUser();
        if (user) {
            // Log activity
            this.logActivity(user.id, 'logout', 'User logged out from system');
        }
        
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('sessionId');
        
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

    // Log user activity
    logActivity: async function(userId, activityType, description, pageUrl = window.location.href) {
        if (!supabaseClient) return;

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

    // Update user progress/activity
    updateProgress: async function(moduleId, slideId, progress = 0) {
        const user = this.getCurrentUser();
        if (!user || !supabaseClient) return;

        try {
            await this.logActivity(
                user.id, 
                'page_view', 
                `Viewed slide: ${slideId} in module: ${moduleId}`,
                `${window.location.href}#${slideId}`
            );

            // You can add more progress tracking logic here
            console.log(`Progress updated: ${progress}% for slide ${slideId}`);
        } catch (error) {
            console.error('Error updating progress:', error);
        }
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
        
        // Track page views
        this.trackPageViews();
        
        console.log('Storyline integration initialized');
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

    // Track page/slide views
    trackPageViews: function() {
        // Monitor hash changes for slide navigation
        window.addEventListener('hashchange', () => {
            this.logSlideView();
        });

        // Initial page load
        this.logSlideView();
    },

    // Log slide view
    logSlideView: function() {
        const user = AuthService.getCurrentUser();
        if (!user) return;

        const currentSlide = this.getCurrentSlide();
        if (currentSlide) {
            AuthService.logActivity(
                user.id,
                'slide_view',
                `Viewed slide: ${currentSlide}`,
                window.location.href
            );
        }
    },

    // Get current slide ID from URL or Storyline
    getCurrentSlide: function() {
        try {
            // Try to get from URL hash
            const hash = window.location.hash;
            if (hash) {
                return hash.replace('#', '');
            }

            // Try to get from Storyline player
            const player = window.GetPlayer();
            if (player) {
                const slideId = player.GetVar("$SlideId");
                if (slideId) {
                    return slideId;
                }
            }

            return 'unknown_slide';
        } catch (error) {
            console.error('Error getting current slide:', error);
            return 'unknown_slide';
        }
    },

    // Mark module as completed
    markModuleComplete: function(moduleId) {
        const user = AuthService.getCurrentUser();
        if (!user) return;

        AuthService.logActivity(
            user.id,
            'module_complete',
            `Completed module: ${moduleId}`,
            window.location.href
        );
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