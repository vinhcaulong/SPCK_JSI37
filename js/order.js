      const orderForm = document.getElementById("orderForm");
      const orderStore = document.getElementById("orderStore");
      const orderItems = document.getElementById("orderItems");
      const orderCatalog = document.getElementById("orderCatalog");
      const orderItemTemplate = document.getElementById("orderItemTemplate");
      const orderCheckout = document.getElementById("orderCheckout");
      const orderCodeInput = document.getElementById("orderCode");
      const orderMessage = document.getElementById("orderMessage");
      const submitOrder = document.getElementById("submitOrder");
      const topbarBalance = document.getElementById("topbarBalance");
      const itemCurrency = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
      let currentUser = null;
      let ownedStores = [];
      let unsubscribeStores = null;
      let unsubscribeProducts = null;
      let unsubscribeBalance = null;
      let subscribedStoreId = "";
      let availableProducts = [];
      let isSubmitting = false;

      updateTotals();

      firebase.auth().onAuthStateChanged(function (user) {
        if (!user) {
          window.location.replace("login.html");
          return;
        }

        currentUser = user;
        const displayName = user.displayName || "Vinh";
        const initial = displayName.trim().charAt(0).toUpperCase() || "V";
        document.getElementById("greetingName").textContent = displayName;
        document.getElementById("topName").textContent = displayName;
        document.getElementById("sidebarName").textContent = displayName;
        document.getElementById("topAvatar").textContent = initial;
        document.getElementById("sidebarAvatar").textContent = initial;
        document.getElementById("userEmail").textContent = user.email || "";

        if (unsubscribeStores) unsubscribeStores();
        if (unsubscribeProducts) unsubscribeProducts();
        if (unsubscribeBalance) unsubscribeBalance();
        subscribedStoreId = "";
        availableProducts = [];

        unsubscribeStores = firebase.firestore().collection("stores")
          .where("ownerId", "==", user.uid)
          .onSnapshot(function (snapshot) {
            ownedStores = [];
            snapshot.forEach(function (storeSnapshot) {
              ownedStores.push({ id: storeSnapshot.id, data: storeSnapshot.data() });
            });
            updateStoreOptions();
            if (orderStore.value !== subscribedStoreId) listenStoreProducts();
            submitOrder.disabled = ownedStores.length === 0 || isSubmitting;
            if (ownedStores.length === 0) {
              orderMessage.textContent = "Tài khoản chưa có cửa hàng. Hãy tạo cửa hàng ở mục Sản phẩm trước.";
            } else {
              orderMessage.textContent = "";
            }
          }, function (error) {
            console.error("Không tải được cửa hàng:", error);
            submitOrder.disabled = true;
            orderMessage.textContent = "Không tải được cửa hàng. Hãy kiểm tra quyền truy cập Firestore.";
          });

        unsubscribeBalance = firebase.firestore().collection("users").doc(user.uid)
          .onSnapshot(function (snapshot) {
            const balance = snapshot.exists ? Number(snapshot.data().balance) : 0;
            topbarBalance.textContent = (Number.isFinite(balance) ? itemCurrency.format(balance) : "0") + " đ";
          }, function (error) {
            console.error("Không tải được số dư:", error);
            orderMessage.textContent = "Không tải được số dư tài khoản.";
            topbarBalance.textContent = "Không tải được";
          });
      });

      orderStore.addEventListener("change", listenStoreProducts);
      document.getElementById("discount").addEventListener("input", updateTotals);
      orderCodeInput.addEventListener("input", function () {
        orderCodeInput.value = orderCodeInput.value.toUpperCase();
      });
      orderForm.addEventListener("invalid", function () {
        orderMessage.textContent = "Vui lòng kiểm tra các trường bắt buộc và giá trị số được đánh dấu.";
      }, true);

      orderForm.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!currentUser) {
          orderMessage.textContent = "Vui lòng đăng nhập để tạo đơn hàng.";
          return;
        }

        const storeId = orderStore.value;
        if (!ownedStores.some(function (store) { return store.id === storeId; })) {
          orderMessage.textContent = "Vui lòng chọn cửa hàng hợp lệ.";
          return;
        }

        const orderCode = orderCodeInput.value.trim().toUpperCase();
        const customerId = document.getElementById("customerId").value.trim();
        if (!/^[A-Z0-9_-]{1,64}$/.test(orderCode)) {
          orderMessage.textContent = "Mã đơn chỉ được chứa chữ, số, dấu gạch ngang hoặc gạch dưới.";
          orderCodeInput.focus();
          return;
        }
        if (!customerId) {
          orderMessage.textContent = "Vui lòng nhập mã khách hàng.";
          return;
        }

        const items = [];
        let itemError = "";
        orderItems.querySelectorAll(".order-item").forEach(function (row) {
          if (itemError) return;
          const productId = row.querySelector(".item-product-id").value.trim();
          const productName = row.querySelector(".item-product-name").value.trim();
          const quantity = Number(row.querySelector(".item-quantity").value);
          const unitPrice = parseMoneyAmount(row.querySelector(".item-unit-price").value);
          const lineSubtotal = quantity * unitPrice;

          if (!productId || !productName) {
            itemError = "Thông tin sản phẩm không đầy đủ. Hãy xóa sản phẩm này và thêm lại từ danh sách.";
            return;
          }
          if (!Number.isSafeInteger(quantity) || quantity < 1) {
            itemError = "Số lượng của sản phẩm \"" + productName + "\" phải là số nguyên lớn hơn 0.";
            row.querySelector(".item-quantity").focus();
            return;
          }
          if (!isValidMoneyAmount(unitPrice)) {
            itemError = "Giá bán của sản phẩm \"" + productName + "\" không hợp lệ. Hãy kiểm tra lại sản phẩm.";
            return;
          }
          if (!isValidMoneyAmount(lineSubtotal)) {
            itemError = "Thành tiền của sản phẩm \"" + productName + "\" vượt giới hạn cho phép.";
            return;
          }

          items.push({
            productId: productId,
            productName: productName,
            quantity: quantity,
            subtotal: lineSubtotal,
            unitPrice: unitPrice
          });
        });

        const subtotal = items.reduce(function (sum, item) { return sum + item.subtotal; }, 0);
        const discount = Number(document.getElementById("discount").value);
        const total = subtotal - discount;
        if (itemError) {
          orderMessage.textContent = itemError;
          return;
        }
        if (items.length === 0) {
          orderMessage.textContent = "Vui lòng thêm ít nhất một sản phẩm vào đơn hàng.";
          return;
        }
        if (!isValidMoneyAmount(subtotal)) {
          orderMessage.textContent = "Tạm tính vượt giới hạn cho phép. Hãy giảm số lượng hoặc kiểm tra lại giá sản phẩm.";
          return;
        }
        if (!isValidMoneyAmount(discount)) {
          orderMessage.textContent = "Giảm giá phải là số không âm.";
          document.getElementById("discount").focus();
          return;
        }
        if (discount > subtotal) {
          orderMessage.textContent = "Giảm giá không được lớn hơn tạm tính.";
          document.getElementById("discount").focus();
          return;
        }
        if (!isValidMoneyAmount(total)) {
          orderMessage.textContent = "Tổng thanh toán vượt giới hạn cho phép.";
          return;
        }

        const orderData = {
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          customerId: customerId,
          discount: discount,
          items: items,
          orderCode: orderCode,
          paymentMethod: document.getElementById("paymentMethod").value,
          paymentStatus: "paid",
          status: "completed",
          subtotal: subtotal,
          total: total
        };
        const orderRef = firebase.firestore().collection("stores").doc(storeId)
          .collection("orders").doc(orderCode);
        const userRef = firebase.firestore().collection("users").doc(currentUser.uid);

        isSubmitting = true;
        submitOrder.disabled = true;
        orderMessage.textContent = "Đang hoàn tất thanh toán...";
        firebase.firestore().runTransaction(function (transaction) {
          return transaction.get(orderRef).then(function (orderSnapshot) {
            if (orderSnapshot.exists) throw new Error("duplicate-order-code");

            return transaction.get(userRef).then(function (userSnapshot) {
              const balanceData = userSnapshot.exists ? userSnapshot.data() : {};
              const currentBalance = balanceData.balance == null ? 0 : Number(balanceData.balance);
              const updatedBalance = currentBalance + total;
              if (!isValidMoneyAmount(currentBalance) || !isValidMoneyAmount(updatedBalance)) {
                throw new Error("invalid-user-balance");
              }

              transaction.set(orderRef, orderData);
              transaction.set(userRef, {
                email: currentUser.email || "",
                balance: updatedBalance
              }, { merge: true });
            });
          });
        }).then(function () {
          resetOrderForm();
          orderMessage.textContent = "Thanh toán mô phỏng hoàn tất. Đơn hàng đã hoàn thành và cộng " +
            itemCurrency.format(total) + " đ vào số dư.";
        }).catch(function (error) {
          console.error("Không thể lưu đơn hàng:", error);
          if (error.message === "duplicate-order-code") {
            orderMessage.textContent = "Mã đơn hàng đã tồn tại trong cửa hàng này.";
          } else if (error.message === "invalid-user-balance") {
            orderMessage.textContent = "Số dư hiện tại không hợp lệ nên chưa thể ghi nhận thanh toán.";
          } else {
            const errorDetail = error.code || error.message || "lỗi không xác định";
            orderMessage.textContent = "Không thể lưu đơn hàng (" + errorDetail +
              "). Hãy kiểm tra quyền truy cập Firestore.";
          }
        }).then(function () {
          isSubmitting = false;
          submitOrder.disabled = ownedStores.length === 0;
        });
      });

      document.getElementById("signOutButton").addEventListener("click", function () {
        firebase.auth().signOut().then(function () {
          window.location.replace("login.html");
        }).catch(function (error) {
          console.error("Không thể đăng xuất:", error);
          orderMessage.textContent = "Không thể đăng xuất. Vui lòng thử lại.";
        });
      });

      function addOrderItem(product) {
        const unitPrice = parseMoneyAmount(product.data.sellingPrice);
        if (!isValidMoneyAmount(unitPrice)) {
          orderMessage.textContent = "Giá bán của sản phẩm \"" +
            (product.data.name || "chưa có tên") + "\" không hợp lệ. Hãy kiểm tra lại sản phẩm.";
          return;
        }

        const isFirstItem = orderItems.children.length === 0;
        const row = orderItemTemplate.content.firstElementChild.cloneNode(true);
        row.querySelector(".item-product-id").value = product.id;
        row.querySelector(".item-product-name").value = product.data.name || "";
        row.querySelector(".item-unit-price").value = String(unitPrice);
        row.querySelector(".item-quantity").addEventListener("input", updateTotals);
        row.querySelector(".item-unit-price").addEventListener("input", updateTotals);
        row.querySelector(".order-remove-item").addEventListener("click", function () {
          row.remove();
          updateItemRows();
          updateTotals();
        });
        orderItems.append(row);
        updateItemRows();
        updateTotals();
        if (isFirstItem) orderCodeInput.focus();
      }

      function updateItemRows() {
        const rows = orderItems.querySelectorAll(".order-item");
        rows.forEach(function (row, index) {
          row.querySelector("legend").textContent = "Sản phẩm " + (index + 1);
        });
      }

      function updateStoreOptions() {
        const selectedStoreId = orderStore.value;
        orderStore.replaceChildren();
        ownedStores.forEach(function (store) {
          const option = document.createElement("option");
          option.value = store.id;
          option.textContent = store.data.name || store.data.storeName || "Cửa hàng " + store.id;
          orderStore.append(option);
        });
        if (ownedStores.some(function (store) { return store.id === selectedStoreId; })) {
          orderStore.value = selectedStoreId;
        }
        orderStore.disabled = ownedStores.length === 0;
      }

      function listenStoreProducts() {
        const nextStoreId = orderStore.value;
        if (subscribedStoreId && subscribedStoreId !== nextStoreId && orderItems.children.length > 0) {
          orderItems.replaceChildren();
          updateTotals();
          orderMessage.textContent = "Đã xóa sản phẩm trong đơn vì bạn đổi cửa hàng.";
        }
        if (unsubscribeProducts) unsubscribeProducts();
        subscribedStoreId = nextStoreId;
        availableProducts = [];
        renderProductCatalog("Đang tải sản phẩm...");
        if (!subscribedStoreId) {
          renderProductCatalog("Chọn cửa hàng để tải sản phẩm.");
          return;
        }

        const listeningStoreId = subscribedStoreId;
        unsubscribeProducts = firebase.firestore().collection("stores").doc(listeningStoreId)
          .collection("products").onSnapshot(function (snapshot) {
            if (subscribedStoreId !== listeningStoreId) return;
            availableProducts = [];
            snapshot.forEach(function (productSnapshot) {
              availableProducts.push({ id: productSnapshot.id, data: productSnapshot.data() });
            });
            renderProductCatalog();
          }, function (error) {
            if (subscribedStoreId !== listeningStoreId) return;
            console.error("Không tải được sản phẩm của cửa hàng:", error);
            renderProductCatalog("Không tải được sản phẩm. Hãy kiểm tra quyền truy cập Firestore.");
            orderMessage.textContent = "Không tải được sản phẩm của cửa hàng.";
          });
      }

      function renderProductCatalog(emptyMessage) {
        orderCatalog.replaceChildren();
        if (availableProducts.length === 0) {
          const message = document.createElement("p");
          message.className = "order-catalog-empty";
          message.textContent = emptyMessage || "Cửa hàng này chưa có sản phẩm.";
          orderCatalog.append(message);
          return;
        }

        availableProducts.forEach(function (product) {
          const card = document.createElement("article");
          card.className = "catalog-product";

          const heading = document.createElement("div");
          heading.className = "catalog-product-heading";
          const name = document.createElement("h4");
          name.textContent = product.data.name || "Sản phẩm chưa có tên";
          const sku = document.createElement("span");
          sku.textContent = "SKU: " + (product.data.sku || "—");
          heading.append(name, sku);

          const details = document.createElement("div");
          details.className = "catalog-product-details";
          [
            ["Mã sản phẩm", product.id],
            ["Giá bán", formatProductPrice(product.data.sellingPrice)],
            ["Giá vốn", formatProductPrice(product.data.costPrice)],
            ["Tồn kho", Number(product.data.quantity || 0).toLocaleString("vi-VN")]
          ].forEach(function (detail) {
            const line = document.createElement("p");
            line.textContent = detail[0] + ": " + detail[1];
            details.append(line);
          });

          if (product.data.createdAt && typeof product.data.createdAt.toDate === "function") {
            const createdAt = document.createElement("p");
            createdAt.textContent = "Ngày tạo: " + new Intl.DateTimeFormat("vi-VN", {
              dateStyle: "medium",
              timeStyle: "short"
            }).format(product.data.createdAt.toDate());
            details.append(createdAt);
          }

          const unitPrice = parseMoneyAmount(product.data.sellingPrice);
          const canAddProduct = isValidMoneyAmount(unitPrice);
          const addButton = document.createElement("button");
          addButton.className = "catalog-add-button";
          addButton.type = "button";
          addButton.textContent = canAddProduct ? "Thêm vào đơn" : "Giá bán không hợp lệ";
          addButton.disabled = !canAddProduct;
          addButton.addEventListener("click", function () {
            addOrderItem(product);
          });

          card.append(heading, details, addButton);
          orderCatalog.append(card);
        });
      }

      function formatProductPrice(value) {
        const price = parseMoneyAmount(value);
        return isValidMoneyAmount(price) ? itemCurrency.format(price) + " đ" : "Không hợp lệ";
      }

      function parseMoneyAmount(value) {
        if (value === null || value === undefined ||
            (typeof value === "string" && value.trim() === "")) return NaN;
        return Number(value);
      }

      function isValidMoneyAmount(value) {
        return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
      }

      function updateTotals() {
        orderCheckout.hidden = orderItems.children.length === 0;
        let subtotal = 0;
        orderItems.querySelectorAll(".order-item").forEach(function (row) {
          const quantity = Number(row.querySelector(".item-quantity").value);
          const unitPrice = Number(row.querySelector(".item-unit-price").value);
          const lineSubtotal = Number.isFinite(quantity) && Number.isFinite(unitPrice)
            ? quantity * unitPrice
            : 0;
          subtotal += lineSubtotal;
          row.querySelector(".item-subtotal strong").textContent = itemCurrency.format(lineSubtotal) + " đ";
        });

        const discount = Number(document.getElementById("discount").value) || 0;
        document.getElementById("subtotalDisplay").textContent = itemCurrency.format(subtotal) + " đ";
        document.getElementById("discountDisplay").textContent = itemCurrency.format(discount) + " đ";
        document.getElementById("totalDisplay").textContent = itemCurrency.format(Math.max(0, subtotal - discount)) + " đ";
      }

      function resetOrderForm() {
        const selectedStoreId = orderStore.value;
        orderForm.reset();
        orderItems.replaceChildren();
        updateStoreOptions();
        if (ownedStores.some(function (store) { return store.id === selectedStoreId; })) {
          orderStore.value = selectedStoreId;
        }
        updateTotals();
      }