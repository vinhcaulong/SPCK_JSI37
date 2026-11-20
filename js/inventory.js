(function () {
  const inventoryStore = document.getElementById("inventoryStore");
  const inventoryStatus = document.getElementById("inventoryStatus");
  const inventoryProductsBody = document.getElementById("inventoryProductsBody");
  const inventoryLogsBody = document.getElementById("inventoryLogsBody");
  const topbarBalance = document.getElementById("topbarBalance");
  const inventoryCurrency = new Intl.NumberFormat("vi-VN");
  let ownedStores = [];
  let products = [];
  let logs = [];
  let subscribedStoreId = null;
  let unsubscribeStores = null;
  let unsubscribeProducts = null;
  let unsubscribeLogs = null;
  let unsubscribeBalance = null;

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
    document.getElementById("userEmail").textContent = user.email || "";

    if (unsubscribeStores) unsubscribeStores();
    if (unsubscribeProducts) unsubscribeProducts();
    if (unsubscribeLogs) unsubscribeLogs();
    if (unsubscribeBalance) unsubscribeBalance();

    unsubscribeBalance = firebase.firestore().collection("users").doc(user.uid)
      .onSnapshot(function (snapshot) {
        const balance = snapshot.exists ? Number(snapshot.data().balance || 0) : 0;
        topbarBalance.textContent = Number.isFinite(balance)
          ? inventoryCurrency.format(balance) + " đ"
          : "Không hợp lệ";
      }, function (error) {
        console.error("Không tải được số dư:", error);
        topbarBalance.textContent = "Không tải được";
      });

    unsubscribeStores = firebase.firestore().collection("stores")
      .where("ownerId", "==", user.uid)
      .onSnapshot(function (snapshot) {
        ownedStores = [];
        snapshot.forEach(function (storeSnapshot) {
          ownedStores.push({ id: storeSnapshot.id, data: storeSnapshot.data() });
        });
        updateStoreOptions();
        if (inventoryStore.value !== subscribedStoreId) listenStoreInventory();
        if (ownedStores.length === 0) {
          inventoryStatus.textContent = "Bạn chưa có cửa hàng. Hãy tạo cửa hàng ở mục Sản phẩm.";
        }
      }, function (error) {
        console.error("Không tải được cửa hàng:", error);
        inventoryStatus.textContent = "Không tải được cửa hàng. Hãy kiểm tra quyền truy cập Firestore.";
        inventoryStore.disabled = true;
      });
  });

  inventoryStore.addEventListener("change", listenStoreInventory);
  document.getElementById("signOutButton").addEventListener("click", function () {
    firebase.auth().signOut().then(function () {
      window.location.replace("login.html");
    }).catch(function (error) {
      console.error("Không thể đăng xuất:", error);
      inventoryStatus.textContent = "Không thể đăng xuất. Vui lòng thử lại.";
    });
  });

  function updateStoreOptions() {
    const selectedStoreId = inventoryStore.value;
    inventoryStore.replaceChildren();
    ownedStores.forEach(function (store) {
      const option = document.createElement("option");
      option.value = store.id;
      option.textContent = store.data.name || store.data.storeName || "Cửa hàng " + store.id;
      inventoryStore.append(option);
    });
    if (ownedStores.some(function (store) { return store.id === selectedStoreId; })) {
      inventoryStore.value = selectedStoreId;
    }
    inventoryStore.disabled = ownedStores.length === 0;
  }

  function listenStoreInventory() {
    if (unsubscribeProducts) unsubscribeProducts();
    if (unsubscribeLogs) unsubscribeLogs();
    subscribedStoreId = inventoryStore.value;
    products = [];
    logs = [];
    renderInventory();

    if (!subscribedStoreId) {
      inventoryStatus.textContent = "Chọn cửa hàng để xem kho.";
      return;
    }

    inventoryStatus.textContent = "Đang tải dữ liệu kho...";
    const storeRef = firebase.firestore().collection("stores").doc(subscribedStoreId);
    const listeningStoreId = subscribedStoreId;
    unsubscribeProducts = storeRef.collection("products").onSnapshot(function (snapshot) {
      if (subscribedStoreId !== listeningStoreId) return;
      products = [];
      snapshot.forEach(function (productSnapshot) {
        products.push({ id: productSnapshot.id, data: productSnapshot.data() });
      });
      inventoryStatus.textContent = "";
      renderInventory();
    }, function (error) {
      if (subscribedStoreId !== listeningStoreId) return;
      console.error("Không tải được sản phẩm trong kho:", error);
      inventoryStatus.textContent = "Không tải được sản phẩm. Hãy kiểm tra quyền truy cập Firestore.";
      renderProductError();
    });

    unsubscribeLogs = storeRef.collection("inventory_logs").onSnapshot(function (snapshot) {
      if (subscribedStoreId !== listeningStoreId) return;
      logs = [];
      snapshot.forEach(function (logSnapshot) {
        logs.push({ id: logSnapshot.id, data: logSnapshot.data() });
      });
      renderInventory();
    }, function (error) {
      if (subscribedStoreId !== listeningStoreId) return;
      console.error("Không tải được lịch sử kho:", error);
      inventoryStatus.textContent = "Không tải được lịch sử xuất kho. Hãy kiểm tra quyền truy cập Firestore.";
      renderInventory();
    });
  }

  function renderInventory() {
    const exportedByProduct = new Map();
    let totalExported = 0;
    logs.forEach(function (log) {
      const data = log.data;
      const quantity = Number(data.quantity);
      if (data.type !== "export" || !Number.isSafeInteger(quantity) || quantity < 0) return;
      totalExported += quantity;
      exportedByProduct.set(data.productId, (exportedByProduct.get(data.productId) || 0) + quantity);
    });

    const totalStock = products.reduce(function (sum, product) {
      const quantity = Number(product.data.quantity);
      return sum + (Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0);
    }, 0);
    document.getElementById("inventoryProductCount").textContent = products.length.toLocaleString("vi-VN");
    document.getElementById("inventoryStockCount").textContent = totalStock.toLocaleString("vi-VN");
    document.getElementById("inventoryExportCount").textContent = totalExported.toLocaleString("vi-VN");
    document.getElementById("inventoryImportCount").textContent = (totalStock + totalExported).toLocaleString("vi-VN");

    renderProductRows(exportedByProduct);
    renderLogRows();
  }

  function renderProductRows(exportedByProduct) {
    inventoryProductsBody.replaceChildren();
    if (!subscribedStoreId || products.length === 0) {
      appendEmptyRow(inventoryProductsBody, 6, subscribedStoreId
        ? "Cửa hàng chưa có sản phẩm."
        : "Chọn cửa hàng để xem tồn kho.");
      return;
    }

    products.forEach(function (product) {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.textContent = product.data.name || "Sản phẩm chưa có tên";
      const sku = document.createElement("small");
      sku.textContent = product.data.sku || "Chưa có SKU";
      nameCell.append(sku);

      const quantity = Number(product.data.quantity);
      const hasValidQuantity = Number.isSafeInteger(quantity) && quantity >= 0;
      const quantityCell = document.createElement("td");
      quantityCell.textContent = hasValidQuantity
        ? quantity.toLocaleString("vi-VN")
        : "Không hợp lệ";
      const exportedQuantity = exportedByProduct.get(product.id) || 0;
      const importedQuantityCell = createCell(hasValidQuantity
        ? (quantity + exportedQuantity).toLocaleString("vi-VN")
        : "—");
      const stateCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "stock-badge" + (!hasValidQuantity || quantity === 0 ? " is-empty" : "");
      badge.textContent = !hasValidQuantity ? "Dữ liệu lỗi" : quantity === 0 ? "Hết hàng" : "Còn hàng";
      stateCell.append(badge);

      row.append(
        nameCell,
        createCell(product.data.sku || "—"),
        importedQuantityCell,
        createCell(exportedQuantity.toLocaleString("vi-VN")),
        quantityCell,
        stateCell
      );
      inventoryProductsBody.append(row);
    });
  }

  function renderLogRows() {
    inventoryLogsBody.replaceChildren();
    if (!subscribedStoreId || logs.length === 0) {
      appendEmptyRow(inventoryLogsBody, 6, subscribedStoreId
        ? "Chưa có đơn hàng hoàn tất làm phát sinh xuất kho."
        : "Chọn cửa hàng để xem lịch sử xuất kho.");
      return;
    }

    const productNames = new Map();
    products.forEach(function (product) {
      productNames.set(product.id, product.data.name || product.id);
    });
    logs.slice().sort(function (left, right) {
      return timestampValue(right.data.createdAt) - timestampValue(left.data.createdAt);
    }).slice(0, 50).forEach(function (log) {
      const data = log.data;
      const row = document.createElement("tr");
      row.append(
        createCell(formatTimestamp(data.createdAt)),
        createCell(productNames.get(data.productId) || data.productId || "Sản phẩm đã xóa"),
        createCell(data.note || (data.type === "export" ? "Xuất kho" : data.type || "Cập nhật kho")),
        createCell(formatQuantity(data.quantity)),
        createCell(formatQuantity(data.previousQuantity)),
        createCell(formatQuantity(data.newQuantity))
      );
      inventoryLogsBody.append(row);
    });
  }

  function renderProductError() {
    inventoryProductsBody.replaceChildren();
    appendEmptyRow(inventoryProductsBody, 6, "Không thể tải tồn kho.");
  }

  function appendEmptyRow(body, columnCount, message) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = columnCount;
    cell.className = "inventory-empty";
    cell.textContent = message;
    row.append(cell);
    body.append(row);
  }

  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    return cell;
  }

  function formatQuantity(value) {
    const quantity = Number(value);
    return Number.isSafeInteger(quantity) && quantity >= 0
      ? quantity.toLocaleString("vi-VN")
      : "—";
  }

  function formatTimestamp(value) {
    const date = value && typeof value.toDate === "function" ? value.toDate() : null;
    return date
      ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date)
      : "—";
  }

  function timestampValue(value) {
    return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
  }
})();
