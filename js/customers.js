(function () {
  const customerStore = document.getElementById("customerStore");
  const customerRows = document.getElementById("customerRows");
  const customerStatus = document.getElementById("customerStatus");
  const customerForm = document.getElementById("customerForm");
  const customerFormStatus = document.getElementById("customerFormStatus");
  const customerSubmit = document.getElementById("customerSubmit");
  const customerDetailFields = document.getElementById("customerDetailFields");
  const customerSearch = document.getElementById("customerSearch");
  const customerCount = document.getElementById("customerCount");
  const topbarBalance = document.getElementById("topbarBalance");
  let ownedStores = [];
  let buyers = [];
  let ordersLoaded = false;
  let ordersLoadError = false;
  let customerProfilesLoaded = false;
  let customerProfilesLoadError = false;
  let customerProfilesById = new Map();
  let currentUser = null;
  let selectedStoreId = "";
  let selectedCustomerId = "";
  let savingCustomer = false;
  let unsubscribeStores = null;
  let unsubscribeOrders = null;
  let unsubscribeCustomerProfiles = null;
  let unsubscribeBalance = null;

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
    if (unsubscribeOrders) unsubscribeOrders();
    if (unsubscribeCustomerProfiles) unsubscribeCustomerProfiles();
    if (unsubscribeBalance) unsubscribeBalance();
    selectedStoreId = "";
    selectedCustomerId = "";
    ownedStores = [];
    buyers = [];
    customerProfilesById = new Map();
    clearCustomerForm();

    unsubscribeBalance = firebase.firestore().collection("users").doc(user.uid)
      .onSnapshot(function (snapshot) {
        const balance = snapshot.exists ? Number(snapshot.data().balance || 0) : 0;
        topbarBalance.textContent = Number.isFinite(balance)
          ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(balance) + " đ"
          : "Không hợp lệ";
      }, function (error) {
        console.error("Không tải được số dư:", error);
        topbarBalance.textContent = "Không tải được";
      });

    unsubscribeStores = firebase.firestore().collection("stores")
      .where("ownerId", "==", user.uid)
      .onSnapshot(function (snapshot) {
        const previousStoreId = customerStore.value || selectedStoreId;
        ownedStores = [];
        snapshot.forEach(function (storeSnapshot) {
          ownedStores.push({ id: storeSnapshot.id, data: storeSnapshot.data() });
        });
        updateStoreOptions(previousStoreId);
        if (customerStore.value !== selectedStoreId) listenStoreData();
        if (ownedStores.length === 0) {
          customerStatus.textContent = "Bạn chưa có cửa hàng. Hãy tạo cửa hàng ở mục Sản phẩm.";
        }
      }, function (error) {
        console.error("Không tải được cửa hàng:", error);
        customerStatus.textContent = "Không tải được cửa hàng. Hãy kiểm tra quyền truy cập Firestore.";
        customerStore.disabled = true;
        customerSubmit.disabled = true;
        renderBuyers("Không thể tải cửa hàng.");
      });
  });

  customerStore.addEventListener("change", listenStoreData);
  customerSearch.addEventListener("input", renderBuyers);
  customerForm.addEventListener("submit", saveCustomerProfile);
  document.getElementById("signOutButton").addEventListener("click", function () {
    firebase.auth().signOut().then(function () {
      window.location.replace("login.html");
    }).catch(function (error) {
      console.error("Không thể đăng xuất:", error);
      customerStatus.textContent = "Không thể đăng xuất. Vui lòng thử lại.";
    });
  });

  function updateStoreOptions(previousStoreId) {
    customerStore.replaceChildren();
    ownedStores.forEach(function (store) {
      const option = document.createElement("option");
      option.value = store.id;
      option.textContent = store.data.name || store.data.storeName || "Cửa hàng " + store.id;
      customerStore.append(option);
    });
    if (ownedStores.some(function (store) { return store.id === previousStoreId; })) {
      customerStore.value = previousStoreId;
    }
    customerStore.disabled = ownedStores.length === 0 || savingCustomer;
    if (ownedStores.length > 0) customerStatus.textContent = "";
  }

  function listenStoreData() {
    if (unsubscribeOrders) unsubscribeOrders();
    if (unsubscribeCustomerProfiles) unsubscribeCustomerProfiles();
    selectedStoreId = customerStore.value;
    selectedCustomerId = "";
    buyers = [];
    customerProfilesById = new Map();
    ordersLoaded = false;
    ordersLoadError = false;
    customerProfilesLoaded = false;
    customerProfilesLoadError = false;
    clearCustomerForm();
    renderBuyers();

    if (!selectedStoreId) {
      customerStatus.textContent = "Chọn hoặc tạo cửa hàng để xem khách đã mua.";
      return;
    }

    customerStatus.textContent = "Đang tải đơn hàng và hồ sơ khách hàng...";
    const listeningStoreId = selectedStoreId;
    const storeRef = firebase.firestore().collection("stores").doc(listeningStoreId);
    unsubscribeOrders = storeRef.collection("orders").onSnapshot(function (snapshot) {
      if (selectedStoreId !== listeningStoreId) return;
      const paidOrders = [];
      snapshot.forEach(function (orderSnapshot) {
        const data = orderSnapshot.data();
        if (data.paymentStatus !== "paid" && data.status !== "completed") return;
        paidOrders.push({ id: orderSnapshot.id, data: data });
      });
      ordersLoadError = false;
      ordersLoaded = true;
      buyers = aggregateBuyers(paidOrders);
      if (!buyers.some(function (buyer) { return buyer.id === selectedCustomerId; })) {
        selectedCustomerId = "";
      }
      updateCustomerStatus();
      renderBuyers();
      if (!selectedCustomerId) clearCustomerForm();
    }, function (error) {
      if (selectedStoreId !== listeningStoreId) return;
      console.error("Không tải được đơn hàng để lập danh sách khách:", error);
      ordersLoadError = true;
      ordersLoaded = true;
      updateCustomerStatus();
      renderBuyers("Không thể tải danh sách khách đã mua.");
    });

    unsubscribeCustomerProfiles = storeRef.collection("customers").onSnapshot(function (snapshot) {
      if (selectedStoreId !== listeningStoreId) return;
      customerProfilesById = new Map();
      snapshot.forEach(function (customerSnapshot) {
        const data = customerSnapshot.data();
        const customerId = String(data.customerId || customerSnapshot.id);
        const current = customerProfilesById.get(customerId);
        if (!current || customerSnapshot.id === customerId) {
          customerProfilesById.set(customerId, {
            documentId: customerSnapshot.id,
            data: data
          });
        }
      });
      customerProfilesLoadError = false;
      customerProfilesLoaded = true;
      updateCustomerStatus();
      renderBuyers();
      populateCustomerForm();
    }, function (error) {
      if (selectedStoreId !== listeningStoreId) return;
      console.error("Không tải được hồ sơ khách hàng:", error);
      customerProfilesLoadError = true;
      customerProfilesLoaded = true;
      updateCustomerStatus();
      renderBuyers();
      customerSubmit.disabled = true;
      customerFormStatus.textContent = "Không tải được hồ sơ khách hàng. Hãy kiểm tra quyền Firestore cho mục customers.";
    });
  }

  function aggregateBuyers(paidOrders) {
    const buyersById = new Map();
    paidOrders.forEach(function (order) {
      const customerId = String(order.data.customerId || "").trim();
      if (!customerId) return;
      let buyer = buyersById.get(customerId);
      if (!buyer) {
        buyer = {
          id: customerId,
          nameFromOrder: "",
          phoneFromOrder: "",
          orderCount: 0,
          lastPurchase: null,
          lastPurchaseValue: 0
        };
        buyersById.set(customerId, buyer);
      }

      buyer.orderCount += 1;
      buyer.nameFromOrder = buyer.nameFromOrder || order.data.customerName || "";
      buyer.phoneFromOrder = buyer.phoneFromOrder || order.data.customerPhone || "";
      const purchaseValue = timestampValue(order.data.createdAt);
      if (purchaseValue >= buyer.lastPurchaseValue) {
        buyer.lastPurchase = order.data.createdAt || null;
        buyer.lastPurchaseValue = purchaseValue;
      }
    });

    return Array.from(buyersById.values()).sort(function (left, right) {
      return right.lastPurchaseValue - left.lastPurchaseValue ||
        displayBuyerName(left).localeCompare(displayBuyerName(right), "vi");
    });
  }

  function renderBuyers(errorMessage) {
    customerRows.replaceChildren();
    customerCount.textContent = buyers.length.toLocaleString("vi-VN");
    if (errorMessage) {
      appendEmptyRow(errorMessage);
      return;
    }
    if (!selectedStoreId) {
      appendEmptyRow("Chọn cửa hàng để xem khách hàng.");
      return;
    }
    if (!ordersLoaded) {
      appendEmptyRow("Đang tải khách hàng từ đơn hàng...");
      return;
    }
    if (ordersLoadError) {
      appendEmptyRow("Không thể tải đơn hàng để xác định khách đã mua.");
      return;
    }

    const query = customerSearch.value.trim().toLocaleLowerCase("vi");
    const filteredBuyers = buyers.filter(function (buyer) {
      const profile = customerProfilesById.get(buyer.id);
      const profileData = profile ? profile.data : {};
      return [
        displayBuyerName(buyer),
        buyer.id,
        buyer.phoneFromOrder,
        profileData.phone,
        profileData.email,
        profileData.address
      ].some(function (value) {
        return String(value || "").toLocaleLowerCase("vi").indexOf(query) !== -1;
      });
    });
    if (filteredBuyers.length === 0) {
      appendEmptyRow(buyers.length === 0
        ? "Chưa có khách hàng trong đơn đã thanh toán."
        : "Không tìm thấy khách hàng phù hợp.");
      return;
    }

    filteredBuyers.forEach(function (buyer) {
      const row = document.createElement("tr");
      if (buyer.id === selectedCustomerId) row.className = "is-selected";
      const nameCell = document.createElement("td");
      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "customer-select-button";
      const name = document.createElement("strong");
      const profile = customerProfilesById.get(buyer.id);
      const profileData = profile ? profile.data : {};
      name.textContent = profileData.name || profileData.fullName || profileData.customerName ||
        buyer.nameFromOrder || buyer.id;
      const id = document.createElement("small");
      id.textContent = "Mã khách: " + buyer.id;
      selectButton.append(name, id);
      selectButton.addEventListener("click", function () { selectBuyer(buyer); });
      nameCell.append(selectButton);

      const ordersCell = document.createElement("td");
      ordersCell.textContent = buyer.orderCount.toLocaleString("vi-VN");
      const profileCell = document.createElement("td");
      profileCell.className = "customer-profile-state" + (profile ? " is-complete" : "");
      profileCell.textContent = profile ? "Đã bổ sung" : "Cần bổ sung";
      row.append(nameCell, ordersCell, profileCell);
      customerRows.append(row);
    });
  }

  function selectBuyer(buyer) {
    selectedCustomerId = buyer.id;
    customerFormStatus.textContent = "";
    populateCustomerForm();
    renderBuyers();
  }

  function populateCustomerForm() {
    const buyer = buyers.find(function (item) { return item.id === selectedCustomerId; });
    if (!buyer) {
      clearCustomerForm();
      return;
    }

    const profile = customerProfilesById.get(buyer.id);
    const data = profile ? profile.data : {};
    customerDetailFields.disabled = false;
    customerSubmit.disabled = !customerProfilesLoaded || customerProfilesLoadError || savingCustomer;
    document.getElementById("customerName").value =
      data.name || data.fullName || data.customerName || buyer.nameFromOrder || "";
    document.getElementById("customerPhone").value =
      data.phone || data.phoneNumber || buyer.phoneFromOrder || "";
    document.getElementById("customerEmail").value = data.email || "";
    document.getElementById("customerAddress").value = data.address || "";
    document.getElementById("customerFormTitle").textContent =
      profile ? "Cập nhật thông tin khách hàng" : "Bổ sung thông tin khách hàng";
    document.getElementById("selectedCustomerSummary").textContent =
      "Mã " + buyer.id + " · " + buyer.orderCount.toLocaleString("vi-VN") +
      " đơn đã mua · Gần nhất " + formatTimestamp(buyer.lastPurchase);
  }

  function saveCustomerProfile(event) {
    event.preventDefault();
    if (!currentUser || !selectedStoreId ||
        !ownedStores.some(function (store) { return store.id === selectedStoreId; })) {
      customerFormStatus.textContent = "Vui lòng chọn cửa hàng hợp lệ.";
      return;
    }
    if (customerProfilesLoadError) {
      customerFormStatus.textContent = "Không thể lưu khi chưa tải được hồ sơ hiện tại.";
      return;
    }
    if (!customerProfilesLoaded) {
      customerFormStatus.textContent = "Đang tải hồ sơ khách hàng. Vui lòng đợi một chút.";
      return;
    }
    const buyer = buyers.find(function (item) { return item.id === selectedCustomerId; });
    if (!buyer) {
      customerFormStatus.textContent = "Hãy chọn khách hàng đã mua hàng trước.";
      return;
    }

    const name = document.getElementById("customerName").value.trim();
    if (!name) {
      customerFormStatus.textContent = "Vui lòng nhập tên khách hàng.";
      return;
    }
    const profile = customerProfilesById.get(selectedCustomerId);
    const profileRef = firebase.firestore().collection("stores").doc(selectedStoreId)
      .collection("customers").doc(profile ? profile.documentId : encodeURIComponent(selectedCustomerId));
    const profileData = {
      customerId: selectedCustomerId,
      name: name,
      phone: document.getElementById("customerPhone").value.trim(),
      email: document.getElementById("customerEmail").value.trim(),
      address: document.getElementById("customerAddress").value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!profile) profileData.createdAt = firebase.firestore.FieldValue.serverTimestamp();

    savingCustomer = true;
    customerStore.disabled = true;
    customerSubmit.disabled = true;
    customerFormStatus.textContent = "Đang lưu thông tin khách hàng...";
    profileRef.set(profileData, { merge: true }).then(function () {
      customerFormStatus.textContent = "Đã lưu thông tin khách hàng.";
    }).catch(function (error) {
      console.error("Không thể lưu hồ sơ khách hàng:", error);
      customerFormStatus.textContent = "Không thể lưu hồ sơ khách hàng. Hãy kiểm tra quyền truy cập Firestore.";
    }).then(function () {
      savingCustomer = false;
      customerStore.disabled = ownedStores.length === 0;
      customerSubmit.disabled = !selectedCustomerId || customerProfilesLoadError;
    });
  }

  function clearCustomerForm() {
    customerForm.reset();
    customerDetailFields.disabled = true;
    customerSubmit.disabled = true;
    document.getElementById("customerFormTitle").textContent = "Thông tin khách hàng";
    document.getElementById("selectedCustomerSummary").textContent =
      "Chọn khách hàng đã mua để bổ sung thông tin.";
    if (!savingCustomer) customerFormStatus.textContent = "";
  }

  function displayBuyerName(buyer) {
    const profile = customerProfilesById.get(buyer.id);
    const data = profile ? profile.data : {};
    return String(data.name || data.fullName || data.customerName || buyer.nameFromOrder || buyer.id);
  }

  function appendEmptyRow(message) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.className = "customer-empty";
    cell.textContent = message;
    row.append(cell);
    customerRows.append(row);
  }

  function updateCustomerStatus() {
    if (!selectedStoreId) return;
    if (ordersLoadError) {
      customerStatus.textContent = "Không tải được đơn hàng để lập danh sách khách hàng.";
    } else if (customerProfilesLoadError) {
      customerStatus.textContent = "Không tải được hồ sơ. Hãy kiểm tra quyền Firestore cho mục customers.";
    } else if (!ordersLoaded || !customerProfilesLoaded) {
      customerStatus.textContent = "Đang tải dữ liệu khách hàng...";
    } else {
      customerStatus.textContent = "Đã tìm thấy " + buyers.length.toLocaleString("vi-VN") +
        " khách hàng có đơn đã thanh toán.";
    }
  }

  function timestampValue(value) {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.getTime();
    return 0;
  }

  function formatTimestamp(value) {
    const date = value && typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date ? value : null;
    return date
      ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date)
      : "không rõ";
  }
})();
