// ================================================
// ADMIN FUNCTIONS - DIGIMOD VEKTARS (SIMPLIFIED)
// Sistem manajemen admin untuk e-learning - Fokus pada daftar siswa
// ================================================

// Konfigurasi Supabase
const SUPABASE_CONFIG = {
    url: 'https://jkkdlbamzokbwwygtmel.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impra2RsYmFtem9rYnd3eWd0bWVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MjEzOTEsImV4cCI6MjA2ODI5NzM5MX0.HNGpazUiCiykLcBdW_ITKmbXFDhSlIZVLKPjUR2mgP0'
};

// Initialize Supabase Client
let supabaseClient;

// ================================================
// SUPABASE INITIALIZATION
// ================================================
function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log('Supabase initialized for admin');
        return true;
    } else {
        console.error('Supabase library not loaded');
        return false;
    }
}

// ================================================
// ADMIN AUTHENTICATION SERVICE
// ================================================
const AdminAuth = {
    // Initialize admin authentication
    init: function () {
        initSupabase();
    },

    // Hash password function
    hashPassword: async function (password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    },

    // Login admin
    login: async function (username, password) {
        try {
            const hashedPassword = await this.hashPassword(password);

            const { data, error } = await supabaseClient
                .from('admin_users')
                .select('*')
                .eq('username', username)
                .eq('password_hash', hashedPassword)
                .eq('is_active', true);

            if (error) {
                console.error('Admin login error:', error);
                return false;
            }

            if (!data || data.length === 0) {
                return false;
            }

            const admin = data[0];

            // Simpan data admin ke session storage
            sessionStorage.setItem('adminUser', JSON.stringify({
                id: admin.id,
                username: admin.username,
                email: admin.email,
                role: admin.role
            }));

            return true;
        } catch (error) {
            console.error('Admin login error:', error);
            return false;
        }
    },

    // Check if admin is logged in
    isLoggedIn: function () {
        const admin = sessionStorage.getItem('adminUser');
        return admin !== null;
    },

    // Get current admin data
    getCurrentAdmin: function () {
        const adminData = sessionStorage.getItem('adminUser');
        return adminData ? JSON.parse(adminData) : null;
    },

    // Logout admin
    logout: function () {
        sessionStorage.removeItem('adminUser');
        window.location.href = 'admin-login.html';
    },

    // Require authentication (redirect if not logged in)
    requireAuth: function () {
        if (!this.isLoggedIn()) {
            window.location.href = 'admin-login.html';
            return false;
        }
        return true;
    }
};

// ================================================
// DATA MANAGEMENT SERVICE
// ================================================
const DataService = {
    // Get all schools with student count
    getSchools: async function () {
        try {
            const { data, error } = await supabaseClient
                .from('users')
                .select('asal_sekolah')
                .eq('is_active', true);

            if (error) throw error;

            // Group by school and count students
            const schoolCounts = {};
            data.forEach(user => {
                const school = user.asal_sekolah;
                schoolCounts[school] = (schoolCounts[school] || 0) + 1;
            });

            return Object.entries(schoolCounts).map(([school, count]) => ({
                name: school,
                studentCount: count
            })).sort((a, b) => b.studentCount - a.studentCount);
        } catch (error) {
            console.error('Error getting schools:', error);
            return [];
        }
    },

    // Get all students
    getAllStudents: async function () {
        try {
            const { data, error } = await supabaseClient
                .from('users')
                .select('*')
                .eq('is_active', true)
                .order('nama_lengkap');

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting all students:', error);
            return [];
        }
    },

    // Get student activities with duration calculation
    getStudentActivitiesWithDuration: async function (studentId) {
        try {
            console.log('🔍 Loading activities for student:', studentId);

            const { data, error } = await supabaseClient
                .from('user_activities')
                .select(`
                id,
                user_id,
                activity_type,
                activity_description,
                created_at,
                users!inner(nama_lengkap, username)
            `)
                .eq('user_id', studentId)
                .in('activity_type', ['login', 'logout', 'register'])
                .order('created_at', { ascending: false });

            if (error) throw error;

            console.log('📊 Raw activities data:', data);

            // Calculate durations between login-logout pairs
            const activitiesWithDuration = [];
            let currentLogin = null;

            // Process activities from newest to oldest, but we'll reverse to process chronologically
            const sortedActivities = [...data].reverse();

            for (const activity of sortedActivities) {
                console.log('🔄 Processing activity:', {
                    type: activity.activity_type,
                    description: activity.activity_description,
                    time: activity.created_at
                });

                if (activity.activity_type === 'login') {
                    currentLogin = activity;
                    // ✅ UBAH: Login TIDAK ada durasi
                    activitiesWithDuration.push({
                        ...activity,
                        duration: null // Login tidak tampilkan durasi
                    });
                    console.log('✅ Login found, waiting for logout...');
                } else if (activity.activity_type === 'logout' && currentLogin) {
                    // Calculate duration
                    const loginTime = new Date(currentLogin.created_at);
                    const logoutTime = new Date(activity.created_at);
                    const durationMs = logoutTime - loginTime;
                    const duration = this.formatDuration(durationMs);

                    console.log('⏱️ Duration calculated:', {
                        loginTime: loginTime.toISOString(),
                        logoutTime: logoutTime.toISOString(),
                        durationMs,
                        duration
                    });

                    // ✅ UBAH: Durasi HANYA di logout
                    activitiesWithDuration.push({
                        ...activity,
                        duration: duration // Logout tampilkan durasi sesi
                    });

                    currentLogin = null; // Reset current login
                } else if (activity.activity_type === 'logout') {
                    // Logout without matching login
                    console.log('⚠️ Logout without matching login');
                    activitiesWithDuration.push({
                        ...activity,
                        duration: null // Logout tanpa login pair tidak ada durasi
                    });
                } else {
                    // Register or other activities
                    activitiesWithDuration.push({
                        ...activity,
                        duration: null // Activity lain tidak ada durasi
                    });
                }
            }

            // Return in reverse order (newest first)
            const result = activitiesWithDuration.reverse();
            console.log('📈 Final activities with duration:', result);
            return result;
        } catch (error) {
            console.error('❌ Error getting student activities:', error);
            return [];
        }
    },

    // Get average login duration for all students
    getGlobalAverageLoginDuration: async function () {
        try {
            console.log('📊 Calculating global average login duration...');

            // Get all login-logout pairs
            const { data: activities, error } = await supabaseClient
                .from('user_activities')
                .select('user_id, activity_type, created_at')
                .in('activity_type', ['login', 'logout'])
                .order('user_id, created_at');

            if (error) throw error;

            // Group by user and calculate durations
            const userSessions = {};
            let totalDurations = [];

            activities.forEach(activity => {
                const userId = activity.user_id;
                if (!userSessions[userId]) {
                    userSessions[userId] = [];
                }
                userSessions[userId].push(activity);
            });

            // Calculate durations for each user
            Object.keys(userSessions).forEach(userId => {
                const userActivities = userSessions[userId];
                let currentLogin = null;

                userActivities.forEach(activity => {
                    if (activity.activity_type === 'login') {
                        currentLogin = activity;
                    } else if (activity.activity_type === 'logout' && currentLogin) {
                        const loginTime = new Date(currentLogin.created_at);
                        const logoutTime = new Date(activity.created_at);
                        const durationMs = logoutTime - loginTime;

                        if (durationMs > 0 && durationMs < 24 * 60 * 60 * 1000) { // Max 24 hours
                            totalDurations.push(durationMs);
                        }
                        currentLogin = null;
                    }
                });
            });

            if (totalDurations.length === 0) {
                return { averageDuration: 0, sessionCount: 0, formattedDuration: 'Belum ada data' };
            }

            const averageDurationMs = totalDurations.reduce((sum, duration) => sum + duration, 0) / totalDurations.length;

            console.log(`📈 Global average: ${this.formatDuration(averageDurationMs)} dari ${totalDurations.length} sesi`);

            return {
                averageDuration: averageDurationMs,
                sessionCount: totalDurations.length,
                formattedDuration: this.formatDuration(averageDurationMs)
            };
        } catch (error) {
            console.error('❌ Error calculating global average:', error);
            return { averageDuration: 0, sessionCount: 0, formattedDuration: 'Error' };
        }
    },

    getStudentAverageLoginDuration: async function (studentId) {
        try {
            const { data: activities, error } = await supabaseClient
                .from('user_activities')
                .select('activity_type, created_at')
                .eq('user_id', studentId)
                .in('activity_type', ['login', 'logout'])
                .order('created_at');

            if (error) throw error;

            let durations = [];
            let currentLogin = null;

            activities.forEach(activity => {
                if (activity.activity_type === 'login') {
                    currentLogin = activity;
                } else if (activity.activity_type === 'logout' && currentLogin) {
                    const loginTime = new Date(currentLogin.created_at);
                    const logoutTime = new Date(activity.created_at);
                    const durationMs = logoutTime - loginTime;

                    if (durationMs > 0 && durationMs < 24 * 60 * 60 * 1000) { // Max 24 hours
                        durations.push(durationMs);
                    }
                    currentLogin = null;
                }
            });

            if (durations.length === 0) {
                return { averageDuration: 0, sessionCount: 0, formattedDuration: '-' };
            }

            const averageDurationMs = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;

            return {
                averageDuration: averageDurationMs,
                sessionCount: durations.length,
                formattedDuration: this.formatDuration(averageDurationMs)
            };
        } catch (error) {
            console.error('❌ Error calculating student average:', error);
            return { averageDuration: 0, sessionCount: 0, formattedDuration: '-' };
        }
    },

    getAllStudentsWithAverages: async function () {
        try {
            console.log('📊 Loading students with average durations...');

            // Get all students
            const { data: students, error: studentsError } = await supabaseClient
                .from('users')
                .select('*')
                .eq('is_active', true)
                .order('nama_lengkap');

            if (studentsError) throw studentsError;

            // Get all activities in one query
            const { data: allActivities, error: activitiesError } = await supabaseClient
                .from('user_activities')
                .select('user_id, activity_type, created_at')
                .in('activity_type', ['login', 'logout'])
                .order('user_id, created_at');

            if (activitiesError) throw activitiesError;

            // Group activities by user
            const userActivities = {};
            allActivities.forEach(activity => {
                const userId = activity.user_id;
                if (!userActivities[userId]) {
                    userActivities[userId] = [];
                }
                userActivities[userId].push(activity);
            });

            // Calculate averages for each student
            const studentsWithAverages = students.map(student => {
                const activities = userActivities[student.id] || [];
                let durations = [];
                let currentLogin = null;

                activities.forEach(activity => {
                    if (activity.activity_type === 'login') {
                        currentLogin = activity;
                    } else if (activity.activity_type === 'logout' && currentLogin) {
                        const loginTime = new Date(currentLogin.created_at);
                        const logoutTime = new Date(activity.created_at);
                        const durationMs = logoutTime - loginTime;

                        if (durationMs > 0 && durationMs < 24 * 60 * 60 * 1000) {
                            durations.push(durationMs);
                        }
                        currentLogin = null;
                    }
                });

                let averageStats;
                if (durations.length === 0) {
                    averageStats = { averageDuration: 0, sessionCount: 0, formattedDuration: '-' };
                } else {
                    const averageDurationMs = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
                    averageStats = {
                        averageDuration: averageDurationMs,
                        sessionCount: durations.length,
                        formattedDuration: this.formatDuration(averageDurationMs)
                    };
                }

                return {
                    ...student,
                    averageLoginDuration: averageStats
                };
            });

            return studentsWithAverages;
        } catch (error) {
            console.error('❌ Error loading students with averages:', error);
            return [];
        }
    },

    // Get students who logged in on specific date
    getStudentsByLoginDate: async function (targetDate) {
        try {
            console.log('📅 Getting students who logged in on:', targetDate);

            // Convert target date to start and end of day
            const startOfDay = new Date(targetDate);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(targetDate);
            endOfDay.setHours(23, 59, 59, 999);

            console.log('🕐 Date range:', {
                start: startOfDay.toISOString(),
                end: endOfDay.toISOString()
            });

            // Get login activities on target date
            const { data: loginActivities, error: loginError } = await supabaseClient
                .from('user_activities')
                .select(`
                user_id,
                created_at,
                users!inner(
                    id,
                    nama_lengkap,
                    username,
                    asal_sekolah,
                    kelas,
                    email,
                    last_login,
                    is_active
                )
            `)
                .eq('activity_type', 'login')
                .gte('created_at', startOfDay.toISOString())
                .lte('created_at', endOfDay.toISOString())
                .eq('users.is_active', true)
                .order('created_at', { ascending: false });

            if (loginError) throw loginError;

            console.log('📊 Login activities found:', loginActivities.length);

            // Group by user (remove duplicates if user logged in multiple times)
            const uniqueUsers = {};
            const studentsWithLoginTime = [];

            loginActivities.forEach(activity => {
                const userId = activity.user_id;
                if (!uniqueUsers[userId]) {
                    uniqueUsers[userId] = true;
                    studentsWithLoginTime.push({
                        ...activity.users,
                        loginTimeOnDate: activity.created_at
                    });
                }
            });

            console.log('👥 Unique students found:', studentsWithLoginTime.length);
            return studentsWithLoginTime;

        } catch (error) {
            console.error('❌ Error getting students by login date:', error);
            return [];
        }
    },

    // Get students with averages filtered by date
    getStudentsWithAveragesFilteredByDate: async function (targetDate = null) {
        try {
            if (!targetDate) {
                // No date filter, return all students with averages
                return await this.getAllStudentsWithAverages();
            }

            console.log('📅 Getting students with averages filtered by date:', targetDate);

            // Get students who logged in on target date
            const studentsOnDate = await this.getStudentsByLoginDate(targetDate);

            if (studentsOnDate.length === 0) {
                return [];
            }

            // Get user IDs
            const userIds = studentsOnDate.map(student => student.id);

            // Get all activities for these users to calculate averages
            const { data: allActivities, error: activitiesError } = await supabaseClient
                .from('user_activities')
                .select('user_id, activity_type, created_at')
                .in('user_id', userIds)
                .in('activity_type', ['login', 'logout'])
                .order('user_id, created_at');

            if (activitiesError) throw activitiesError;

            // Group activities by user
            const userActivities = {};
            allActivities.forEach(activity => {
                const userId = activity.user_id;
                if (!userActivities[userId]) {
                    userActivities[userId] = [];
                }
                userActivities[userId].push(activity);
            });

            // Calculate averages for each student
            const studentsWithAverages = studentsOnDate.map(student => {
                const activities = userActivities[student.id] || [];
                let durations = [];
                let currentLogin = null;

                activities.forEach(activity => {
                    if (activity.activity_type === 'login') {
                        currentLogin = activity;
                    } else if (activity.activity_type === 'logout' && currentLogin) {
                        const loginTime = new Date(currentLogin.created_at);
                        const logoutTime = new Date(activity.created_at);
                        const durationMs = logoutTime - loginTime;

                        if (durationMs > 0 && durationMs < 24 * 60 * 60 * 1000) {
                            durations.push(durationMs);
                        }
                        currentLogin = null;
                    }
                });

                let averageStats;
                if (durations.length === 0) {
                    averageStats = { averageDuration: 0, sessionCount: 0, formattedDuration: '-' };
                } else {
                    const averageDurationMs = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
                    averageStats = {
                        averageDuration: averageDurationMs,
                        sessionCount: durations.length,
                        formattedDuration: this.formatDuration(averageDurationMs)
                    };
                }

                return {
                    ...student,
                    averageLoginDuration: averageStats
                };
            });

            return studentsWithAverages;

        } catch (error) {
            console.error('❌ Error getting students with averages filtered by date:', error);
            return [];
        }
    },

    // Format duration in human readable format
    formatDuration: function (milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return `${hours}j ${remainingMinutes}m`;
        } else if (minutes > 0) {
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds}d`;
        } else {
            return `${seconds}d`;
        }
    },

    // Get recent logins (today) - OPTIMIZED VERSION
    getRecentLogins: async function (limit = 5) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Single optimized query
            const { data, error } = await supabaseClient
                .from('user_activities')
                .select(`
                    created_at,
                    users!inner(nama_lengkap, asal_sekolah)
                `)
                .eq('activity_type', 'login')
                .gte('created_at', today.toISOString())
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting recent logins:', error);
            return [];
        }
    },

    // Get dashboard statistics - OPTIMIZED VERSION
    getDashboardStats: async function () {
        try {
            // Single query untuk semua data user
            const { data: allUsers, error: usersError } = await supabaseClient
                .from('users')
                .select('asal_sekolah, last_login')
                .eq('is_active', true);

            if (usersError) throw usersError;

            // Process data in memory (lebih cepat dari multiple queries)
            const schools = [...new Set(allUsers.map(u => u.asal_sekolah))];
            const totalStudents = allUsers.length;

            // Get active students (logged in last 7 days)
            const activeDate = new Date();
            activeDate.setDate(activeDate.getDate() - 7);
            const activeStudents = allUsers.filter(u =>
                u.last_login && new Date(u.last_login) >= activeDate
            ).length;

            return {
                totalSchools: schools.length,
                totalStudents: totalStudents,
                activeStudents: activeStudents
            };
        } catch (error) {
            console.error('Error getting dashboard stats:', error);
            return {
                totalSchools: 0,
                totalStudents: 0,
                activeStudents: 0
            };
        }
    },

    // Add new student
    addStudent: async function (studentData) {
        try {
            // Check if username or email already exists
            const { data: existingUser, error: checkError } = await supabaseClient
                .from('users')
                .select('username, email')
                .or(`username.eq.${studentData.username},email.eq.${studentData.email}`);

            if (checkError) throw checkError;

            if (existingUser && existingUser.length > 0) {
                const existingUsername = existingUser.some(u => u.username === studentData.username);
                const existingEmail = existingUser.some(u => u.email === studentData.email);

                if (existingUsername) {
                    return { success: false, error: 'Username sudah digunakan' };
                }
                if (existingEmail) {
                    return { success: false, error: 'Email sudah digunakan' };
                }
            }

            const hashedPassword = await AdminAuth.hashPassword(studentData.password);

            const { data, error } = await supabaseClient
                .from('users')
                .insert([{
                    nama_lengkap: studentData.nama_lengkap,
                    username: studentData.username,
                    asal_sekolah: studentData.asal_sekolah,
                    kelas: studentData.kelas,
                    email: studentData.email,
                    password_hash: hashedPassword
                }])
                .select();

            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (error) {
            console.error('Error adding student:', error);
            return { success: false, error: error.message };
        }
    },

    // Update student
    updateStudent: async function (studentId, studentData) {
        try {
            // Check if username or email already exists (excluding current student)
            const { data: existingUser, error: checkError } = await supabaseClient
                .from('users')
                .select('id, username, email')
                .or(`username.eq.${studentData.username},email.eq.${studentData.email}`)
                .neq('id', studentId);

            if (checkError) throw checkError;

            if (existingUser && existingUser.length > 0) {
                const existingUsername = existingUser.some(u => u.username === studentData.username);
                const existingEmail = existingUser.some(u => u.email === studentData.email);

                if (existingUsername) {
                    return { success: false, error: 'Username sudah digunakan oleh siswa lain' };
                }
                if (existingEmail) {
                    return { success: false, error: 'Email sudah digunakan oleh siswa lain' };
                }
            }

            const updateData = {
                nama_lengkap: studentData.nama_lengkap,
                username: studentData.username,
                asal_sekolah: studentData.asal_sekolah,
                kelas: studentData.kelas,
                email: studentData.email
            };

            // Only update password if provided
            if (studentData.password) {
                updateData.password_hash = await AdminAuth.hashPassword(studentData.password);
            }

            const { data, error } = await supabaseClient
                .from('users')
                .update(updateData)
                .eq('id', studentId)
                .select();

            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (error) {
            console.error('Error updating student:', error);
            return { success: false, error: error.message };
        }
    },

    // Delete student and their activities
    deleteStudent: async function (studentId) {
        try {
            // Delete activities first (due to foreign key constraint)
            await supabaseClient
                .from('user_activities')
                .delete()
                .eq('user_id', studentId);

            // Delete student
            const { error } = await supabaseClient
                .from('users')
                .delete()
                .eq('id', studentId);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error deleting student:', error);
            return { success: false, error: error.message };
        }
    }
};

// ================================================
// UI UTILITIES
// ================================================
const AdminUI = {
    // Show alert message
    showAlert: function (message, type = 'info', containerId = 'alertContainer') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const alertHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                <i class="bi bi-${this.getAlertIcon(type)} me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;

        container.innerHTML = alertHTML;

        // Auto dismiss after 5 seconds
        setTimeout(() => {
            const alert = container.querySelector('.alert');
            if (alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 5000);
    },

    // Get alert icon based on type
    getAlertIcon: function (type) {
        const icons = {
            success: 'check-circle',
            danger: 'exclamation-triangle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    },

    // Clear all alerts
    clearAlerts: function (containerId = 'alertContainer') {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
        }
    },

    // Set button loading state
    setButtonLoading: function (button, loading) {
        if (loading) {
            button.disabled = true;
            button.dataset.originalText = button.innerHTML;
            button.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Loading...';
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText;
        }
    },

    // Show loading overlay
    showLoading: function () {
        // Remove existing overlay first
        this.hideLoading();

        const loadingHTML = `
            <div class="loading-overlay" id="loadingOverlay">
                <div class="loading-spinner"></div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', loadingHTML);
    },

    // Hide loading overlay
    hideLoading: function () {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.remove();
        }
    },

    // Format date for display
    formatDate: function (dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Format login time (just hour:minute for recent logins)
    formatLoginTime: function (dateString) {
        const date = new Date(dateString);
        return date.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Format time ago (e.g., "2 jam lalu")
    formatTimeAgo: function (dateString) {
        const now = new Date();
        const date = new Date(dateString);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) {
            return 'Baru saja';
        } else if (diffMins < 60) {
            return `${diffMins} menit lalu`;
        } else if (diffHours < 24) {
            return `${diffHours} jam lalu`;
        } else if (diffDays < 7) {
            return `${diffDays} hari lalu`;
        } else {
            return this.formatDate(dateString);
        }
    },

    // Format activity type for display with enhanced logout types
    formatActivityType: function (type, description = '') {
        if (type === 'logout') {
            // Debug log untuk troubleshooting
            console.log('🔍 Logout Detection:', {
                type,
                description,
                hasDescription: !!description,
                descriptionLength: description.length
            });

            // Cek pattern Auto logout dulu (lebih spesifik)
            if (description.includes('Auto logout karena tidak ada aktivitas') ||
                description.toLowerCase().includes('auto logout') && description.includes('tidak ada aktivitas')) {
                return { text: 'Auto Logout (Idle)', class: 'warning' };
            }

            if (description.includes('Auto logout karena login baru') ||
                description.toLowerCase().includes('auto logout') && description.includes('login baru')) {
                return { text: 'Logout Otomatis', class: 'info' };
            }

            // ✅ UBAH: Manual logout patterns - GANTI "Logout Manual" jadi "Logout"
            if (description.includes('User logged out manually') ||
                description.includes('logged out manually') ||
                description.includes('berhasil logout') ||
                description.includes('User logout') ||
                description.toLowerCase().includes('manual') ||
                // Jika ada description tapi tidak mengandung 'Auto'
                (description && description.length > 0 && !description.toLowerCase().includes('auto'))) {
                return { text: 'Logout', class: 'danger' }; // ← UBAH INI
            }

            // Fallback untuk description kosong atau tidak dikenal
            console.warn('⚠️ Unknown logout type, defaulting to Logout:', description);
            return { text: 'Logout', class: 'danger' }; // ← UBAH INI
        }

        const types = {
            login: { text: 'Login', class: 'success' },
            register: { text: 'Registrasi', class: 'info' }
        };
        return types[type] || { text: type, class: 'secondary' };
    }
};

// ================================================
// EXPORT SERVICES
// ================================================
window.AdminAuth = AdminAuth;
window.DataService = DataService;
window.AdminUI = AdminUI;

// ================================================
// AUTO INITIALIZATION
// ================================================
document.addEventListener('DOMContentLoaded', function () {
    // Initialize admin system if not already initialized
    if (typeof AdminAuth !== 'undefined') {
        AdminAuth.init();
    }

    const sidebarToggle = document.getElementById('sidebarToggle');
    const adminSidebar = document.getElementById('adminSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (sidebarToggle) {
        // Saat tombol hamburger di-klik
        sidebarToggle.addEventListener('click', function () {
            adminSidebar.classList.toggle('show');
            sidebarOverlay.classList.toggle('show');
        });
    }

    if (sidebarOverlay) {
        // Saat overlay gelap di-klik (untuk menutup sidebar)
        sidebarOverlay.addEventListener('click', function () {
            adminSidebar.classList.remove('show');
            sidebarOverlay.classList.remove('show');
        });
    }
});