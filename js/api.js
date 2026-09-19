/* api.js - Handles server requests and date helpers */
const API_BASE = "https://vehicle-api.dhiwakardiva111.workers.dev/api";

const Api = {
    // Build request headers using saved login credentials
    getHeaders() {
        return {
            "Content-Type": "application/json",
            "X-Auth-User": Auth.getUser() || "",
            "X-Auth-Pass": Auth.getPass() || ""
        };
    },

    // Send data requests to the backend server
    async request(endpoint, method = "GET", body = null) {
        const options = {
            method,
            headers: this.getHeaders()
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${API_BASE}${endpoint}`, options);

        // If login details are rejected, log the user out
        if (response.status === 401) {
            Auth.logout();
            throw new Error("Unauthorized access. Please log in again.");
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        return response.json();
    },

    // Date styling helper (kept here so dashboard tables do not break)
    formatDateBadge(dateString) {
        if (!dateString) return '<span class="text-muted">-</span>';
        
        const target = new Date(dateString);
        const now = new Date();
        const days = Math.ceil((target - now) / (1000 * 60 * 60 * 24));

        if (days < 0) {
            return `<span class="badge badge-expired">${dateString}</span>`;
        } else if (days <= 30) {
            return `<span class="badge badge-urgent">${dateString} (${days}d)</span>`;
        }
        return `<span class="text-dark">${dateString}</span>`;
    }
};