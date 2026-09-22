const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginButton = document.getElementById("loginButton");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  loginButton.disabled = true;

  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        username: usernameInput.value,
        password: passwordInput.value,
      }),
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || "Unable to sign in.");
    }
    const next = new URLSearchParams(location.search).get("next") || "/";
    const destination = new URL(next, location.origin);
    location.assign(destination.origin === location.origin ? destination.href : "/");
  } catch (error) {
    loginError.textContent = error.message;
    passwordInput.value = "";
    loginButton.disabled = false;
  }
});
