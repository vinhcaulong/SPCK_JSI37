      const homeStatus = document.getElementById("homeStatus");
      const userEmail = document.getElementById("userEmail");
      const userBalance = document.getElementById("userBalance");
      const topbarBalance = document.getElementById("topbarBalance");
      const currentDate = document.getElementById("currentDate");
      const productCount = document.getElementById("productCount");
      const todayRevenue = document.getElementById("todayRevenue");
      const weeklyOrderCount = document.getElementById("weeklyOrderCount");
      const recentOrdersList = document.getElementById("recentOrdersList");
      const revenueChart = document.getElementById("revenueChart");
      const reportToday = new Date();
      reportToday.setHours(0, 0, 0, 0);
      const reportStart = new Date(reportToday);
      reportStart.setDate(reportStart.getDate() - 6);
      const reportStartTimestamp = firebase.firestore.Timestamp.fromDate(reportStart);
      let unsubscribeCountStores = null;
      let unsubscribeBalance = null;
      let productCountUnsubscribers = {};
      let productCountsByStore = {};
      let recentOrderUnsubscribers = {};
      let recentOrdersByStore = {};
      let recentOrderLoadErrors = {};
      let analyticsOrderUnsubscribers = {};
      let analyticsOrdersByStore = {};
      let analyticsOrderLoadErrors = {};
      let storeNamesById = {};

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

        listenProductCount(user.uid);

        if (unsubscribeBalance) unsubscribeBalance();
        const userRef = firebase.firestore().collection("users").doc(user.uid);
        unsubscribeBalance = userRef.onSnapshot(function (snapshot) {
          if (!snapshot.exists) {
            userRef.set({ email: user.email || "", balance: 0 }, { merge: true })
              .catch(function (error) {
                console.error("Không thể tạo hồ sơ số dư:", error);
                homeStatus.textContent = "Không thể khởi tạo số dư tài khoản.";
                topbarBalance.textContent = "Không tải được";
              });
            return;
          }

          const balance = Number(snapshot.data().balance || 0);
          if (!Number.isFinite(balance)) {
            topbarBalance.textContent = "Không hợp lệ";
            homeStatus.textContent = "Số dư tài khoản không hợp lệ.";
            return;
          }

          const formattedBalance = new Intl.NumberFormat("vi-VN", {
            maximumFractionDigits: 2
          }).format(balance);
          userBalance.textContent = formattedBalance;
          topbarBalance.textContent = formattedBalance + " đ";
        }, function (error) {
          console.error("Không tải được số dư tài khoản:", error);
          homeStatus.textContent = "Không tải được số dư tài khoản.";
          topbarBalance.textContent = "Không tải được";
        });

      });

      function listenProductCount(uid) {
        if (unsubscribeCountStores) unsubscribeCountStores();
        Object.keys(productCountUnsubscribers).forEach(function (storeId) {
          productCountUnsubscribers[storeId]();
        });
        Object.keys(recentOrderUnsubscribers).forEach(function (storeId) {
          recentOrderUnsubscribers[storeId]();
        });
        Object.keys(analyticsOrderUnsubscribers).forEach(function (storeId) {
          analyticsOrderUnsubscribers[storeId]();
        });
        productCountUnsubscribers = {};
        productCountsByStore = {};
        recentOrderUnsubscribers = {};
        recentOrdersByStore = {};
        recentOrderLoadErrors = {};
        analyticsOrderUnsubscribers = {};
        analyticsOrdersByStore = {};
        analyticsOrderLoadErrors = {};
        storeNamesById = {};

        unsubscribeCountStores = firebase.firestore().collection("stores")
          .where("ownerId", "==", uid)
          .onSnapshot(function (snapshot) {
            const storeIds = [];
            const storeSnapshotsById = new Map();
            snapshot.forEach(function (storeSnapshot) {
              const storeId = storeSnapshot.id;
              storeIds.push(storeId);
              storeSnapshotsById.set(storeId, storeSnapshot);
              const storeData = storeSnapshot.data();
              storeNamesById[storeId] = storeData.name || storeData.storeName || "Cửa hàng " + storeId;

              if (productCountUnsubscribers[storeId]) return;
              productCountUnsubscribers[storeId] = storeSnapshot.ref.collection("products")
                .onSnapshot(function (productsSnapshot) {
                  productCountsByStore[storeId] = productsSnapshot.size;
                  updateProductCount();
                }, function (error) {
                  console.error("Không đếm được sản phẩm:", error);
                  homeStatus.textContent = "Không tải được số lượng sản phẩm.";
                });
            });

            storeIds.forEach(function (storeId) {
              const storeSnapshot = storeSnapshotsById.get(storeId);
              if (!storeSnapshot) return;
              const ordersRef = storeSnapshot.ref.collection("orders");
              if (!recentOrderUnsubscribers[storeId]) {
                recentOrderUnsubscribers[storeId] = ordersRef.orderBy("createdAt", "desc").limit(5)
                  .onSnapshot(function (ordersSnapshot) {
                    recentOrdersByStore[storeId] = [];
                    delete recentOrderLoadErrors[storeId];
                    ordersSnapshot.forEach(function (orderSnapshot) {
                      recentOrdersByStore[storeId].push({
                        id: orderSnapshot.id,
                        storeId: storeId,
                        data: orderSnapshot.data()
                      });
                    });
                    renderRecentOrders();
                  }, function (error) {
                    console.error("Không tải được đơn hàng gần đây:", error);
                    recentOrderLoadErrors[storeId] = true;
                    renderRecentOrders();
                    homeStatus.textContent = "Không tải được đơn hàng gần đây.";
                  });
              }
              if (!analyticsOrderUnsubscribers[storeId]) {
                analyticsOrderUnsubscribers[storeId] = ordersRef
                  .where("createdAt", ">=", reportStartTimestamp)
                  .orderBy("createdAt", "desc")
                  .onSnapshot(function (ordersSnapshot) {
                    analyticsOrdersByStore[storeId] = [];
                    delete analyticsOrderLoadErrors[storeId];
                    ordersSnapshot.forEach(function (orderSnapshot) {
                      analyticsOrdersByStore[storeId].push({
                        id: orderSnapshot.id,
                        storeId: storeId,
                        data: orderSnapshot.data()
                      });
                    });
                    renderDashboardStats();
                  }, function (error) {
                    console.error("Không tải được dữ liệu đơn hàng tổng quan:", error);
                    analyticsOrderLoadErrors[storeId] = true;
                    renderDashboardStats();
                    homeStatus.textContent = "Không tải được dữ liệu đơn hàng tổng quan.";
                  });
              }
            });

            Object.keys(productCountUnsubscribers).forEach(function (storeId) {
              if (storeIds.indexOf(storeId) === -1) {
                productCountUnsubscribers[storeId]();
                delete productCountUnsubscribers[storeId];
                delete productCountsByStore[storeId];
              }
            });
            Object.keys(recentOrderUnsubscribers).forEach(function (storeId) {
              if (storeIds.indexOf(storeId) === -1) {
                recentOrderUnsubscribers[storeId]();
                delete recentOrderUnsubscribers[storeId];
                delete recentOrdersByStore[storeId];
                delete recentOrderLoadErrors[storeId];
                delete storeNamesById[storeId];
              }
            });
            Object.keys(analyticsOrderUnsubscribers).forEach(function (storeId) {
              if (storeIds.indexOf(storeId) === -1) {
                analyticsOrderUnsubscribers[storeId]();
                delete analyticsOrderUnsubscribers[storeId];
                delete analyticsOrdersByStore[storeId];
                delete analyticsOrderLoadErrors[storeId];
              }
            });
            updateProductCount();
            renderDashboardStats();
            renderRecentOrders();
          }, function (error) {
            console.error("Không tải được cửa hàng để đếm sản phẩm:", error);
            productCount.textContent = "—";
            homeStatus.textContent = "Không tải được số lượng sản phẩm.";
          });
      }

      function updateProductCount() {
        const total = Object.keys(productCountsByStore).reduce(function (sum, storeId) {
          return sum + productCountsByStore[storeId];
        }, 0);
        productCount.textContent = total.toLocaleString("vi-VN");
      }

      function renderDashboardStats() {
        const orders = [];
        Object.keys(analyticsOrdersByStore).forEach(function (storeId) {
          orders.push.apply(orders, analyticsOrdersByStore[storeId]);
        });
        const hasOrderLoadErrors = Object.keys(analyticsOrderLoadErrors).length > 0;
        if (hasOrderLoadErrors) {
          todayRevenue.textContent = "—";
          weeklyOrderCount.textContent = "—";
        } else {
          const todayTotal = orders.reduce(function (sum, order) {
            if (order.data.paymentStatus !== "paid" || !isToday(order.data.createdAt)) return sum;
            const total = Number(order.data.total);
            return sum + (Number.isFinite(total) && total >= 0 ? total : 0);
          }, 0);
          todayRevenue.textContent = formatCurrency(todayTotal);
          weeklyOrderCount.textContent = orders.length.toLocaleString("vi-VN");
        }

        renderRevenueChart(orders, hasOrderLoadErrors);
      }

      function renderRecentOrders() {
        const recentOrders = [];
        Object.keys(recentOrdersByStore).forEach(function (storeId) {
          recentOrders.push.apply(recentOrders, recentOrdersByStore[storeId]);
        });
        recentOrders.sort(function (left, right) {
          return orderTimestampValue(right.data.createdAt) - orderTimestampValue(left.data.createdAt);
        });
        const hasOrderLoadErrors = Object.keys(recentOrderLoadErrors).length > 0;
        recentOrdersList.replaceChildren();
        if (recentOrders.length === 0) {
          const emptyState = document.createElement("div");
          emptyState.className = "empty-orders";
          const icon = document.createElement("span");
          icon.className = "empty-orders-icon";
          icon.textContent = "▤";
          const title = document.createElement("strong");
          title.textContent = hasOrderLoadErrors ? "Không tải được đơn hàng" : "Chưa có đơn hàng";
          const message = document.createElement("span");
          message.textContent = hasOrderLoadErrors
            ? "Kiểm tra kết nối và quyền truy cập Firestore."
            : "Đơn hàng mới sẽ xuất hiện tại đây.";
          emptyState.append(icon, title, message);
          recentOrdersList.append(emptyState);
          return;
        }

        recentOrders.slice(0, 5).forEach(function (order) {
          const data = order.data;
          const row = document.createElement("article");
          row.className = "recent-order-row";

          const details = document.createElement("div");
          details.className = "recent-order-details";
          const code = document.createElement("strong");
          code.textContent = data.orderCode || order.id;
          const customer = document.createElement("span");
          customer.textContent = "Khách hàng: " + (data.customerName || data.customerId || "—");
          const metadata = document.createElement("small");
          const itemCount = Array.isArray(data.items)
            ? data.items.reduce(function (sum, item) { return sum + (Number(item.quantity) || 0); }, 0)
            : 0;
          metadata.textContent = (storeNamesById[order.storeId] || "Cửa hàng") + " · " +
            itemCount.toLocaleString("vi-VN") + " sản phẩm · " +
            formatOrderTimestamp(data.createdAt);
          details.append(code, customer, metadata);

          const summary = document.createElement("div");
          summary.className = "recent-order-summary";
          const total = Number(data.total);
          const amount = document.createElement("strong");
          amount.textContent = Number.isFinite(total)
            ? formatCurrency(total) + " đ"
            : "—";
          const status = document.createElement("span");
          status.className = "recent-order-status" +
            (data.paymentStatus === "paid" ? " is-paid" : "");
          status.textContent = data.paymentStatus === "paid" ? "Đã thanh toán" : "Chưa thanh toán";
          summary.append(amount, status);
          row.append(details, summary);
          recentOrdersList.append(row);
        });
      }

      function renderRevenueChart(orders, hasOrderLoadErrors) {
        revenueChart.replaceChildren();
        if (hasOrderLoadErrors) {
          renderChartEmpty("Không tải được dữ liệu doanh thu", "Kiểm tra quyền truy cập Firestore.");
          return;
        }

        const days = [];
        for (let offset = 0; offset < 7; offset += 1) {
          const date = new Date(reportStart);
          date.setDate(reportStart.getDate() + offset);
          days.push({ date: date, total: 0 });
        }

        orders.forEach(function (order) {
          if (order.data.paymentStatus !== "paid") return;
          const date = orderDate(order.data.createdAt);
          const total = Number(order.data.total);
          if (!date || !Number.isFinite(total) || total < 0) return;
          const day = days.find(function (item) {
            return item.date.getFullYear() === date.getFullYear() &&
              item.date.getMonth() === date.getMonth() &&
              item.date.getDate() === date.getDate();
          });
          if (day) day.total += total;
        });

        if (!days.some(function (day) { return day.total > 0; })) {
          renderChartEmpty("Chưa có doanh thu", "Đơn đã thanh toán sẽ được tổng hợp tại đây.");
          return;
        }

        const bars = document.createElement("div");
        bars.className = "revenue-chart";
        bars.setAttribute("role", "list");
        bars.setAttribute("aria-label", "Doanh thu từng ngày trong 7 ngày qua");
        const maxTotal = Math.max.apply(null, days.map(function (day) { return day.total; }));
        days.forEach(function (day) {
          const column = document.createElement("div");
          column.className = "revenue-day";
          column.setAttribute("role", "listitem");
          column.setAttribute("aria-label", new Intl.DateTimeFormat("vi-VN", {
            day: "numeric",
            month: "long"
          }).format(day.date) + ": " + formatCurrency(day.total) + " đ");
          const barArea = document.createElement("div");
          barArea.className = "revenue-bar-area";
          const bar = document.createElement("span");
          bar.className = "revenue-day-bar" + (day.total === 0 ? " is-empty" : "");
          bar.style.height = day.total === 0
            ? "0%"
            : Math.max(6, day.total / maxTotal * 100) + "%";
          bar.title = formatCurrency(day.total) + " đ";
          barArea.append(bar);
          const label = document.createElement("small");
          label.textContent = new Intl.DateTimeFormat("vi-VN", {
            day: "2-digit",
            month: "2-digit"
          }).format(day.date);
          column.append(barArea, label);
          bars.append(column);
        });
        revenueChart.append(bars);
      }

      function renderChartEmpty(titleText, messageText) {
        const emptyState = document.createElement("div");
        emptyState.className = "chart-empty";
        const icon = document.createElement("div");
        icon.className = "empty-chart-icon";
        icon.textContent = "↗";
        const title = document.createElement("strong");
        title.textContent = titleText;
        const message = document.createElement("span");
        message.textContent = messageText;
        emptyState.append(icon, title, message);
        revenueChart.append(emptyState);
      }

      function isToday(timestamp) {
        const date = orderDate(timestamp);
        if (!date) return false;
        return date.getFullYear() === reportToday.getFullYear() &&
          date.getMonth() === reportToday.getMonth() &&
          date.getDate() === reportToday.getDate();
      }

      function orderDate(timestamp) {
        if (timestamp && typeof timestamp.toDate === "function") return timestamp.toDate();
        return timestamp instanceof Date ? timestamp : null;
      }

      function orderTimestampValue(timestamp) {
        const date = orderDate(timestamp);
        return date ? date.getTime() : 0;
      }

      function formatOrderTimestamp(timestamp) {
        const date = orderDate(timestamp);
        return date
          ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date)
          : "Chưa rõ thời gian";
      }

      function formatCurrency(amount) {
        return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(amount);
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