/* auth.js - Manages user login state and session */
const Auth = {
    // Get the currently saved username
    getUser() {
        return sessionStorage.getItem("auth_user");
    },

    // Get the currently saved password (kept for dashboard compatibility)
    getPass() {
        return sessionStorage.getItem("auth_pass");
    },

    // Save username and password to the session
    login(username, password) {
        sessionStorage.setItem("auth_user", username);
        sessionStorage.setItem("auth_pass", password);
    },

    // Clear session and return to the login page
    logout() {
        sessionStorage.clear();
        window.location.href = "index.html";
    },

    // Check if the user is logged in, otherwise kick them back to login
    requireAuth() {
        if (!this.getUser() || !this.getPass()) {
            window.location.href = "index.html";
        }
    },

    // Display the logged-in username in the top navbar if it exists
    initNavbarUser() {
        const userElement = document.getElementById("userDisplay");
        if (userElement) {
            userElement.innerText = this.getUser() || "User";
        }
    }
};