/* Login form controller */
document.addEventListener("DOMContentLoaded", () => {
  if (Auth.getUser() && Auth.getPass()) {
    window.location.href = "dashboard.html";
    return;
  }

  const form = document.getElementById("loginForm");
  const alertBox = document.getElementById("loginError");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = document.getElementById("username").value.trim();
    const pass = document.getElementById("password").value.trim();

    Auth.login(user, pass);

    try {
      await Api.request("/stats");
      window.location.href = "dashboard.html";
    } catch (err) {
      sessionStorage.clear();
      alertBox.classList.remove("d-none");
    }
  });
});