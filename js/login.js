/* login.js - Controls login actions and user messages */
document.addEventListener("DOMContentLoaded", () => {
    // If user is already logged in, skip login page and go to dashboard
    if (Auth.getUser() && Auth.getPass()) {
        window.location.href = "dashboard.html";
        return;
    }

    const form = document.getElementById("loginForm");
    const alertBox = document.getElementById("loginError");
    const submitBtn = document.getElementById("submitBtn");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Get typed username and password
        const usernameInput = document.getElementById("username").value.trim();
        const passwordInput = document.getElementById("password").value.trim();

        // Hide previous errors and show loading animation on button
        alertBox.classList.add("d-none");
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            Signing in...
        `;

        // Temporarily save login data
        Auth.login(usernameInput, passwordInput);

        try {
            // Test login with a quick server request
            await Api.request("/stats");
            
            // If successful, open dashboard
            window.location.href = "dashboard.html";
        } catch (err) {
            // Clear incorrect login data
            sessionStorage.clear();

            // Show simple, clear error message
            if (err.message.includes("Unauthorized")) {
                alertBox.textContent = "Incorrect username or password.";
            } else {
                alertBox.textContent = "Connection failed. Please check your internet.";
            }
            
            alertBox.classList.remove("d-none");

            // Reset button back to normal
            submitBtn.disabled = false;
            submitBtn.innerHTML = "Sign In";
        }
    });
});