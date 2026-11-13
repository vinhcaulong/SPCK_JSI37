document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const pageMode = document.body.dataset.authPage;
  const isRegisterPage = pageMode === "register";
  const status = document.getElementById("authStatus");
  const nameField = document.getElementById("authNameField");
  const nameInput = document.getElementById("authName");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const submitButton = document.getElementById("authSubmit");
  let redirectingToHome = false;

  function showStatus(message) {
    if (status) status.textContent = message;
  }

  function getErrorMessage(error) {
    const errorMessages = {
      "auth/email-already-in-use": "Email này đã được đăng ký.",
      "auth/invalid-email": "Địa chỉ email chưa hợp lệ.",
      "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
      "auth/user-not-found": "Không tìm thấy tài khoản với email này.",
      "auth/wrong-password": "Mật khẩu không đúng.",
      "auth/weak-password": "Mật khẩu cần có ít nhất 6 ký tự.",
      "auth/popup-closed-by-user": "Bạn đã đóng cửa sổ đăng nhập.",
      "auth/account-exists-with-different-credential": "Email này đã được dùng với phương thức đăng nhập khác.",
      "auth/network-request-failed": "Không thể kết nối. Hãy kiểm tra mạng rồi thử lại."
    };
    return errorMessages[error.code] || "Đã xảy ra lỗi. Vui lòng thử lại.";
  }

  function saveUser(user) {
    const userRef = firebase.firestore().collection("users").doc(user.uid);
    return userRef.get().then(function (snapshot) {
      const userData = { email: user.email || "" };
      if (user.displayName) userData.name = user.displayName;
      if (!snapshot.exists) userData.balance = 0;
      return userRef.set(userData, { merge: true });
    });
  }

  function completeAuthentication(user) {
    if (redirectingToHome) return Promise.resolve();
    redirectingToHome = true;
    saveUser(user).catch(function (error) {
      console.error("Không lưu được hồ sơ Firestore:", error);
    });
    showStatus("Thành công. Đang chuyển đến MiniBiz...");
    window.location.replace(new URL("index.html", window.location.href).href);
    return Promise.resolve();
  }

  function handleError(error) {
    showStatus(getErrorMessage(error));
    if (submitButton) submitButton.disabled = false;
  }

  if (nameField && nameInput) {
    nameField.hidden = !isRegisterPage;
    nameInput.required = isRegisterPage;
  }

  if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) {
    showStatus("Chưa kết nối được Firebase. Vui lòng tải lại trang.");
    return;
  }

  // Firebase auth state is the fallback for both email/password and OAuth redirects.
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) completeAuthentication(user).catch(handleError);
  });

  // Complete Google/Facebook sign-in after Firebase returns to this page.
  firebase.auth().getRedirectResult()
    .then(function (result) {
      if (result && result.user) return completeAuthentication(result.user);
    })
    .catch(function (error) {
      showStatus(getErrorMessage(error));
    });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (submitButton) submitButton.disabled = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    showStatus(isRegisterPage ? "Đang tạo tài khoản..." : "Đang đăng nhập...");

    let request;
    if (isRegisterPage) {
      const displayName = nameInput.value.trim();
      request = firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(function (result) {
          return result.user.updateProfile({ displayName: displayName }).then(function () {
            return result.user;
          });
        });
    } else {
      request = firebase.auth().signInWithEmailAndPassword(email, password)
        .then(function (result) { return result.user; });
    }

    request.then(completeAuthentication).catch(handleError);
  });

  [
    { id: "googleLogin", provider: function () { return new firebase.auth.GoogleAuthProvider(); } },
    { id: "facebookLogin", provider: function () { return new firebase.auth.FacebookAuthProvider(); } }
  ].forEach(function (item) {
    const button = document.getElementById(item.id);
    if (!button) return;

    button.addEventListener("click", function () {
      button.disabled = true;
      showStatus("Đang mở đăng nhập...");
      firebase.auth().signInWithRedirect(item.provider())
        .catch(function (error) {
          showStatus(getErrorMessage(error));
          button.disabled = false;
        });
    });
  });
});
