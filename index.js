      const homeStatus = document.getElementById("homeStatus");
      const userEmail = document.getElementById("userEmail");
      const userBalance = document.getElementById("userBalance");
      const currentDate = document.getElementById("currentDate");

      currentDate.textContent = new Intl.DateTimeFormat("vi-VN", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
      }).format(new Date());

      firebase.auth().onAuthStateChanged(function (user) {
        if (!user) {
          window.location.replace("login.html");
          return;
        }

        const displayName = user.displayName || "Vinh";
        const initial = displayName.trim().charAt(0).toUpperCase() || "V";
        document.getElementById("greetingName").textContent = displayName;
        document.getElementById("topName").textContent = displayName;
        document.getElementById("sidebarName").textContent = displayName;
        document.getElementById("topAvatar").textContent = initial;
        document.getElementById("sidebarAvatar").textContent = initial;
        userEmail.textContent = user.email || "";

        const userRef = firebase.firestore().collection("users").doc(user.uid);
        userRef.get().then(function (snapshot) {
          const userData = snapshot.exists ? snapshot.data() : { balance: 0 };
          if (!snapshot.exists) return userRef.set({ email: user.email || "", balance: 0 }, { merge: true });
          if (userData.balance != null) userBalance.textContent = Number(userData.balance).toLocaleString("vi-VN");
        }).catch(function () {
          homeStatus.textContent = "Không tải được số dư tài khoản.";
        });
      });

      document.getElementById("signOutButton").addEventListener("click", function () {
        firebase.auth().signOut().then(function () {
          window.location.replace("login.html");
        }).catch(function () {
          homeStatus.textContent = "Không thể đăng xuất. Vui lòng thử lại.";
        });
      });

      document.getElementById("notificationButton").addEventListener("click", function () {
        homeStatus.textContent = "Bạn chưa có thông báo mới.";
      });

      document.querySelectorAll('.sidebar-nav .nav-link[href^="#"]').forEach(function (link) {
        link.addEventListener("click", function (event) {
          if (link.getAttribute("href") !== "#overview") {
            event.preventDefault();
            homeStatus.textContent = "Mục này sẽ sớm có mặt trong MiniBiz.";
          }
          document.querySelectorAll(".sidebar-nav .nav-link").forEach(function (item) { item.classList.remove("is-active"); });
          link.classList.add("is-active");
        });
      });