/* Authentication guard & credential management */
const Auth = {
  getUser() {
    return sessionStorage.getItem("auth_user");
  },
  getPass() {
    return sessionStorage.getItem("auth_pass");
  },
  login(username, password) {
    sessionStorage.setItem("auth_user", username);
    sessionStorage.setItem("auth_pass", password);
  },
  logout() {
    sessionStorage.clear();
    window.location.href = "index.html";
  },
  requireAuth() {
    if (!this.getUser() || !this.getPass()) {
      window.location.href = "index.html";
    }
  },
  initNavbarUser() {
    const el = document.getElementById("userDisplay");
    if (el) el.innerText = this.getUser() || "User";
  }
};