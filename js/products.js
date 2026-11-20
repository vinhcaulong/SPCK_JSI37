      const userEmail = document.getElementById("userEmail");
      const productForm = document.getElementById("productForm");
      const productList = document.getElementById("productList");
      const productStatus = document.getElementById("productStatus");
      const productSubmit = document.getElementById("productSubmit");
      const productStore = document.getElementById("productStore");
      const storeForm = document.getElementById("storeForm");
      const storeSubmit = document.getElementById("storeSubmit");
      const storeStatus = document.getElementById("storeStatus");
      const topbarBalance = document.getElementById("topbarBalance");
      let unsubscribeStores = null;
      let unsubscribeBalance = null;
      let productUnsubscribers = {};
      let productsByStore = {};
      let ownedStores = [];

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

        if (unsubscribeBalance) unsubscribeBalance();
        unsubscribeBalance = firebase.firestore().collection("users").doc(user.uid)
          .onSnapshot(function (snapshot) {
            const balance = snapshot.exists ? Number(snapshot.data().balance || 0) : 0;
            if (!Number.isFinite(balance)) {
              topbarBalance.textContent = "Không hợp lệ";
              return;
            }
            topbarBalance.textContent = new Intl.NumberFormat("vi-VN", {
              maximumFractionDigits: 2
            }).format(balance) + " đ";
          }, function (error) {
            console.error("Không tải được số dư tài khoản:", error);
            topbarBalance.textContent = "Không tải được";
          });

        if (unsubscribeStores) unsubscribeStores();
        Object.keys(productUnsubscribers).forEach(function (storeId) {
          productUnsubscribers[storeId]();
        });
        productUnsubscribers = {};
        productsByStore = {};
        ownedStores = [];
        unsubscribeStores = firebase.firestore().collection("stores")
          .where("ownerId", "==", user.uid)
          .onSnapshot(function (snapshot) {
            ownedStores = [];
            snapshot.forEach(function (storeSnapshot) {
              ownedStores.push({ id: storeSnapshot.id, data: storeSnapshot.data() });
            });

            const ownedStoreIds = ownedStores.map(function (store) { return store.id; });
            Object.keys(productUnsubscribers).forEach(function (storeId) {
              if (ownedStoreIds.indexOf(storeId) === -1) {
                productUnsubscribers[storeId]();
                delete productUnsubscribers[storeId];
                delete productsByStore[storeId];
              }
            });

            updateProductStores();
            if (ownedStores.length === 0) {
              productSubmit.disabled = true;
              productStatus.textContent = "Tài khoản chưa có cửa hàng để quản lý sản phẩm.";
              renderProducts();
              return;
            }

            productStatus.textContent = "";
            productSubmit.disabled = false;
            ownedStores.forEach(function (store) {
              if (productUnsubscribers[store.id]) return;
              productUnsubscribers[store.id] = firebase.firestore()
                .collection("stores").doc(store.id).collection("products")
                .onSnapshot(function (productSnapshot) {
                  productsByStore[store.id] = [];
                  productSnapshot.forEach(function (documentSnapshot) {
                    productsByStore[store.id].push({
                      storeId: store.id,
                      documentId: documentSnapshot.id,
                      data: documentSnapshot.data()
                    });
                  });
                  renderProducts();
                }, function (error) {
                  console.error("Không tải được sản phẩm của cửa hàng:", error);
                  productStatus.textContent = "Không tải được sản phẩm. Hãy kiểm tra quyền truy cập Firestore.";
                  productList.replaceChildren(createProductMessage("Không thể tải danh sách sản phẩm."));
                });
            });
            renderProducts();
          }, function (error) {
            console.error("Không tải được danh sách cửa hàng:", error);
            productStatus.textContent = "Không tải được cửa hàng. Hãy kiểm tra quyền truy cập Firestore.";
            productSubmit.disabled = true;
            productList.replaceChildren(createProductMessage("Không thể tải cửa hàng."));
          });
      });

      storeForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const user = firebase.auth().currentUser;
        const name = document.getElementById("storeName").value.trim();
        if (!user || !name) {
          storeStatus.textContent = user ? "Vui lòng nhập tên cửa hàng." : "Vui lòng đăng nhập để tạo cửa hàng.";
          return;
        }

        storeSubmit.disabled = true;
        storeStatus.textContent = "Đang tạo cửa hàng...";
        firebase.firestore().collection("stores").add({
          name: name,
          ownerId: user.uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          storeForm.reset();
          storeStatus.textContent = "Đã tạo cửa hàng.";
        }).catch(function (error) {
          console.error("Không thể tạo cửa hàng:", error);
          storeStatus.textContent = "Không thể tạo cửa hàng. Hãy kiểm tra quyền truy cập Firestore.";
        }).then(function () {
          storeSubmit.disabled = false;
        });
      });

      productForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const user = firebase.auth().currentUser;
        if (!user) {
          productStatus.textContent = "Vui lòng đăng nhập để thêm sản phẩm.";
          return;
        }

        const storeId = productStore.value;
        const store = ownedStores.find(function (item) { return item.id === storeId; });
        const sku = document.getElementById("productSku").value.trim();
        const name = document.getElementById("productName").value.trim();
        const sellingPrice = Number(document.getElementById("productSellingPrice").value);
        const costPrice = Number(document.getElementById("productCostPrice").value);
        const quantity = Number(document.getElementById("productQuantity").value);

        if (!store || !sku || !name || !Number.isFinite(sellingPrice) || sellingPrice < 0 ||
            !Number.isFinite(costPrice) || costPrice < 0 || !Number.isInteger(quantity) || quantity < 0) {
          productStatus.textContent = "Vui lòng nhập cửa hàng, SKU, tên, giá và số lượng hợp lệ.";
          return;
        }

        productSubmit.disabled = true;
        productStatus.textContent = "Đang lưu sản phẩm...";
        firebase.firestore().collection("stores").doc(storeId).collection("products").add({
          sku: sku,
          name: name,
          sellingPrice: sellingPrice,
          costPrice: costPrice,
          quantity: quantity,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          productForm.reset();
          updateProductStores();
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

      function renderProducts() {
        const products = [];
        ownedStores.forEach(function (store) {
          products.push.apply(products, productsByStore[store.id] || []);
        });
        productList.replaceChildren();

        if (ownedStores.length === 0) {
          productList.append(createProductMessage("Tài khoản chưa có cửa hàng."));
          return;
        }
        if (products.length === 0) {
          productList.append(createProductMessage("Bạn chưa có sản phẩm nào."));
          return;
        }

        products.forEach(function (productSnapshot) {
          const product = productSnapshot.data;
          const item = document.createElement("article");
          item.className = "product-item";

          const details = document.createElement("div");
          details.className = "product-details";
          const name = document.createElement("h4");
          name.textContent = (product.name || "Sản phẩm chưa có tên") + " · " + (product.sku || "Chưa có SKU");
          const summary = document.createElement("p");
          const sellingPrice = Number(product.sellingPrice);
          const costPrice = Number(product.costPrice);
          const quantity = Number(product.quantity);
          const store = ownedStores.find(function (item) { return item.id === productSnapshot.storeId; });
          const storeName = store && (store.data.name || store.data.storeName) || "Cửa hàng " + productSnapshot.storeId;
          summary.textContent = "Giá bán: " + (Number.isFinite(sellingPrice) ? sellingPrice.toLocaleString("vi-VN") : "0") +
            " đ · Giá vốn: " + (Number.isFinite(costPrice) ? costPrice.toLocaleString("vi-VN") : "0") +
            " đ · Số lượng: " + (Number.isFinite(quantity) ? quantity.toLocaleString("vi-VN") : "0") +
            " · " + storeName;
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
            firebase.firestore().collection("stores").doc(productSnapshot.storeId)
              .collection("products").doc(productSnapshot.documentId).delete()
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

      function updateProductStores() {
        const selectedStoreId = productStore.value;
        productStore.replaceChildren();
        ownedStores.forEach(function (store) {
          const option = document.createElement("option");
          option.value = store.id;
          option.textContent = store.data.name || store.data.storeName || "Cửa hàng " + store.id;
          productStore.append(option);
        });
        if (ownedStores.some(function (store) { return store.id === selectedStoreId; })) {
          productStore.value = selectedStoreId;
        }
        productStore.disabled = ownedStores.length === 0;
      }

      document.getElementById("signOutButton").addEventListener("click", function () {
        firebase.auth().signOut().then(function () {
          window.location.replace("login.html");
        }).catch(function (error) {
          console.error("Không thể đăng xuất:", error);
          productStatus.textContent = "Không thể đăng xuất. Vui lòng thử lại.";
        });
      });
