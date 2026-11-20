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

      productForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const user = firebase.auth().currentUser;
        if (!user) {
          productStatus.textContent = "Vui lòng đăng nhập để thêm sản phẩm.";
          return;
        }

        const name = document.getElementById("productName").value.trim();
        const price = Number(document.getElementById("productPrice").value);
        const quantity = Number(document.getElementById("productQuantity").value);

        if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 0) {
          productStatus.textContent = "Vui lòng nhập tên, giá và số lượng hợp lệ.";
          return;
        }

        productSubmit.disabled = true;
        productStatus.textContent = "Đang lưu sản phẩm...";
        firebase.firestore().collection("products").add({
          name: name,
          price: price,
          quantity: quantity,
          userId: user.uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          productForm.reset();
          productStatus.textContent = "Đã thêm sản phẩm.";
        }).catch(function (error) {
          console.error("Không thể thêm sản phẩm:", error);
          productStatus.textContent = "Không thể thêm sản phẩm. Hãy kiểm tra quyền truy cập Firestore.";
        }).then(function () {
          productSubmit.disabled = false;
        });
      });

      function createProductMessage(message) {
        const element = document.createElement("p");
        element.className = "product-empty";
        element.textContent = message;
        return element;
      }

      function renderProducts(snapshot) {
        const count = document.getElementById("productCount");
        count.textContent = snapshot.size.toLocaleString("vi-VN");
        productList.replaceChildren();

        if (snapshot.empty) {
          productList.append(createProductMessage("Bạn chưa có sản phẩm nào."));
          return;
        }

        snapshot.forEach(function (documentSnapshot) {
          const product = documentSnapshot.data();
          const item = document.createElement("article");
          item.className = "product-item";

          const details = document.createElement("div");
          details.className = "product-details";
          const name = document.createElement("h4");
          name.textContent = product.name || "Sản phẩm chưa có tên";
          const summary = document.createElement("p");
          const price = Number(product.price);
          const quantity = Number(product.quantity);
          summary.textContent = (Number.isFinite(price) ? price.toLocaleString("vi-VN") : "0") +
            " đ · Số lượng: " + (Number.isFinite(quantity) ? quantity.toLocaleString("vi-VN") : "0");
          details.append(name, summary);

          const deleteButton = document.createElement("button");
          deleteButton.className = "product-delete";
          deleteButton.type = "button";
          deleteButton.textContent = "Xóa";
          deleteButton.setAttribute("aria-label", "Xóa " + (product.name || "sản phẩm"));
          deleteButton.addEventListener("click", function () {
            if (!window.confirm("Bạn có chắc muốn xóa sản phẩm này?")) return;
            deleteButton.disabled = true;
            productStatus.textContent = "Đang xóa sản phẩm...";
            firebase.firestore().collection("products").doc(documentSnapshot.id).delete()
              .then(function () {
                productStatus.textContent = "Đã xóa sản phẩm.";
              }).catch(function (error) {
                console.error("Không thể xóa sản phẩm:", error);
                productStatus.textContent = "Không thể xóa sản phẩm. Hãy kiểm tra quyền truy cập Firestore.";
                deleteButton.disabled = false;
              });
          });

          item.append(details, deleteButton);
          productList.append(item);
        });
      }

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