/* ================================================================ 
   CORE DATA & FAST CACHING (IndexedDB via Localforage)
   ================================================================ */
      localforage.config({ name: "ThuChiDB", storeName: "finance_data" });

      const GAS_URL_BUILTIN =
        "https://script.google.com/macros/s/AKfycbxX2TnGYpOSGZMurKLWuCaQilqlZhdhBXl5Yj-yDImUf37drUUAw7Du05kc6CfDvhIBMA/exec";

      const CATS = {
        expense: [
          { id: "food", e: "🍜", n: "Ăn uống", c: "#f59e0b" },
          { id: "shop", e: "🛍️", n: "Mua sắm", c: "#8b5cf6" },
          { id: "transport", e: "🚗", n: "Di chuyển", c: "#3b82f6" },
          { id: "bills", e: "🧾", n: "Hóa đơn", c: "#f43f5e" },
          { id: "home", e: "🏠", n: "Nhà cửa", c: "#06b6d4" },
          { id: "health", e: "💊", n: "Sức khỏe", c: "#10b981" },
          { id: "fun", e: "🎮", n: "Giải trí", c: "#ec4899" },
          { id: "edu", e: "📚", n: "Học tập", c: "#6366f1" },
          { id: "coffee", e: "☕", n: "Cà phê", c: "#d97706" },
          { id: "gift", e: "🎁", n: "Quà tặng", c: "#eab308" },
          { id: "beauty", e: "💄", n: "Làm đẹp", c: "#f472b6" },
          { id: "other_e", e: "📦", n: "Khác", c: "#71717a" },
        ],
        income: [
          { id: "salary", e: "💰", n: "Lương", c: "#10b981" },
          { id: "bonus", e: "🎉", n: "Thưởng", c: "#eab308" },
          { id: "invest", e: "📈", n: "Đầu tư", c: "#3b82f6" },
          { id: "biz", e: "🏪", n: "Kinh doanh", c: "#8b5cf6" },
          { id: "gift_i", e: "🧧", n: "Được tặng", c: "#f43f5e" },
          { id: "other_i", e: "💵", n: "Khác", c: "#71717a" },
        ],
        debt: [
          { id: "loan", e: "📤", n: "Cho vay", c: "#f59e0b" },
          { id: "borrow", e: "📥", n: "Đi vay", c: "#ec4899" },
          { id: "repay", e: "💸", n: "Trả nợ", c: "#10b981" },
          { id: "collect", e: "🤝", n: "Thu nợ", c: "#3b82f6" },
        ],
      };
      const catMap = {};
      [...CATS.expense, ...CATS.income, ...CATS.debt].forEach((c) => (catMap[c.id] = c));
      
      function getCatInfo(id) {
          if (catMap[id]) return catMap[id];
          if (DB.customCats) {
              const c = DB.customCats.find(x => x.id === id);
              if (c) return c;
          }
          return { e: "📦", n: "Khác", c: "#888" };
      }

      let GAS_URL = "";
      const today = () => {
        const d = new Date();
        return (
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0")
        );
      };

      // In-memory state
      let DB = {
        tx: [],
        wallets: ["Tiền mặt", "Ngân hàng", "Ví điện tử"],
        budgets: {},
        goals: [],
        customCats: [],
        hasKey: false,
      };
      let chat = [];
      let state = {
        tab: "home",
        range: "day",
        customDate: today(),
        statRange: "week",
        addType: "expense",
        selCat: "food",
        editId: null,
        editGoal: null,
        editBudgetCat: null,
      };
      let isSyncing = false;

      // Tối ưu UI
      function showSync(on) {
        const el = document.getElementById("syncing");
        if (on) {
          el.classList.add("show");
          isSyncing = true;
        } else {
          el.classList.remove("show");
          isSyncing = false;
        }
      }

      // Giao tiếp Google Apps Script siêu tối ưu (Background Sync)
      async function api(action, payload, bg = false) {
        if (!bg) showSync(true);
        try {
          const res = await fetch(GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(Object.assign({ action }, payload || {})),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          return data;
        } finally {
          if (!bg) showSync(false);
        }
      }

      // Lưu db vào IndexedDB tốc độ cao
      async function cacheDB(data) {
        try {
          await localforage.setItem("offline_db", data);
        } catch (e) {}
      }

      const fmt = (n) => {
        n = Math.round(n || 0);
        return n.toLocaleString("vi-VN") + "đ";
      };
      const fmtShort = (n) => {
        n = Math.abs(n);
        if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "T";
        if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "Tr";
        if (n >= 1e3) return Math.round(n / 1e3) + "k";
        return n + "";
      };
      function fmtAmt(el) {
        let v = el.value.replace(/\D/g, "");
        el.value = v ? parseInt(v).toLocaleString("vi-VN") + "đ" : "";
      }
      const parseAmt = (s) => parseInt((s || "").replace(/\D/g, "")) || 0;
      function toast(m) {
        const t = document.getElementById("toast");
        t.textContent = m;
        t.classList.add("show");
        clearTimeout(t._t);
        t._t = setTimeout(() => t.classList.remove("show"), 3000);
      }
      function autogrow(el) {
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 120) + "px";
      }
      const esc = (s) =>
        ("" + (s == null ? "" : s)).replace(
          /[&<>"]/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
        );
      function fmtDate(d) {
        const dt = new Date(d + "T00:00");
        return (
          String(dt.getDate()).padStart(2, "0") +
          "/" +
          String(dt.getMonth() + 1).padStart(2, "0")
        );
      }
      function inRange(d, r) {
        const dt = new Date(d + "T00:00"),
          now = new Date();
        if (r === "all") return true;
        if (r === "day") return d === (state.customDate || today());
        if (r === "week") {
          const s = new Date(now);
          s.setDate(
            now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1),
          );
          s.setHours(0, 0, 0, 0);
          return dt >= s;
        }
        if (r === "month")
          return (
            dt.getMonth() === now.getMonth() &&
            dt.getFullYear() === now.getFullYear()
          );
        if (r === "year") return dt.getFullYear() === now.getFullYear();
        return true;
      }

      function render() {
        renderHome();
        renderStats();
        renderBudget();
        renderAI();
        renderSettings();
      }

      function renderHome() {
        const list = DB.tx.filter((t) => inRange(t.date, state.range));
        const inc = list
          .filter((t) => t.type === "income")
          .reduce((a, b) => a + b.amount, 0);
        const exp = list
          .filter((t) => t.type === "expense")
          .reduce((a, b) => a + b.amount, 0);
        const bal = DB.tx.reduce(
          (a, b) => a + (b.type === "income" || (b.type === "debt" && (b.cat === "borrow" || b.cat === "collect")) ? b.amount : -b.amount),
          0,
        );

        document.getElementById("balVal").textContent = fmt(bal);
        let rn = {
          day: "hôm nay",
          week: "tuần này",
          month: "tháng này",
          year: "năm nay",
          all: "tất cả",
        }[state.range];

        const btnDay = document.getElementById("btnDayFilter");
        if (state.customDate && state.customDate !== today()) {
          if (state.range === "day") rn = "ngày " + fmtDate(state.customDate);
          btnDay.textContent = fmtDate(state.customDate);
        } else {
          btnDay.textContent = "Ngày";
        }

        document.getElementById("balSub").textContent =
          "Phân tích dữ liệu • Lọc: " + rn;
          
        const walletBals = {};
        DB.wallets.forEach((w) => (walletBals[w] = 0));
        DB.tx.forEach((b) => {
            const isPlus = b.type === "income" || (b.type === "debt" && (b.cat === "borrow" || b.cat === "collect"));
            walletBals[b.wallet] = (walletBals[b.wallet] || 0) + (isPlus ? b.amount : -b.amount);
        });
        
        document.getElementById("walletBals").innerHTML = Object.entries(walletBals).map(([w, amt]) => {
            const isNeg = amt < 0;
            return `<div style="flex:0 0 auto; background:var(--card2); border:1px solid var(--stroke2); padding:8px 12px; border-radius:12px; text-align:left;">
                <div style="font-size:11px; color:var(--txt2); font-weight:700; margin-bottom:4px;">${esc(w)}</div>
                <div class="num-font" style="font-size:14px; font-weight:800; color:${isNeg ? 'var(--red)' : 'var(--txt)'}">${fmt(amt)}</div>
            </div>`;
        }).join("");

        document.getElementById("incVal").textContent = fmt(inc);
        document.getElementById("expVal").textContent = fmt(exp);

        const sorted = [...list].sort(
          (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
        );
        document.getElementById("txCount").textContent =
          sorted.length + " BẢN GHI";
        const el = document.getElementById("recentList");

        if (!sorted.length) {
          el.innerHTML =
            '<div class="empty"><div class="e">🛸</div><div style="font-weight:700;font-size:18px;color:var(--txt);letter-spacing:-0.02em;">Vùng không gian trống</div><div style="margin-top:8px;font-size:14px;">Hệ thống chưa ghi nhận dữ liệu nào. Khởi tạo bằng nút [+] bên dưới.</div></div>';
          return;
        }

        // RENDER WITH FIXED SWIPE LAYERS
        el.innerHTML =
          '<div class="txlist">' +
          sorted
            .map((t) => {
              const c = getCatInfo(t.cat);
              const isInc = t.type === "income" || (t.type === "debt" && (t.cat === "borrow" || t.cat === "collect"));
              return `<div class="txrow">
      <div class="txactions">
        <button class="edit" onclick="editTx(${t.id})"><span class="ic">✏️</span>Sửa</button>
        <button class="del" onclick="delTxById(${t.id})"><span class="ic">🗑️</span>Xóa</button>
      </div>
      <div class="tx fadein" data-id="${t.id}">
        <div class="txic" style="background:${c.c}20;color:${c.c};box-shadow:inset 0 0 0 1px ${c.c}40">${c.e}</div>
        <div class="txmid"><div class="n">${esc(t.note) || c.n}</div><div class="m">${c.n} <span style="margin:0 6px;color:var(--stroke)">|</span> ${fmtDate(t.date)} <span style="margin:0 6px;color:var(--stroke)">|</span> ${esc(t.wallet)}</div></div>
        <div class="txamt num-font" style="color:${isInc ? "var(--green)" : "var(--txt)"}">${isInc ? "+" : "-"}${fmt(t.amount)}</div>
      </div>
    </div>`;
            })
            .join("") +
          '</div><div class="swipehint">Vuốt thẻ sang trái để kích hoạt lệnh Sửa / Xóa</div>';
        bindSwipe();
      }

      function bindSwipe() {
        document.querySelectorAll("#recentList .tx").forEach((el) => {
          let sx = 0,
            sy = 0,
            dx = 0,
            dragging = false,
            decided = false,
            horiz = false;
          const OPEN = -160;
          const start = (e) => {
            sx = e.clientX;
            sy = e.clientY;
            dragging = true;
            decided = false;
            horiz = false;
            el.style.transition = "none";
            if (e.type === "pointerdown" && e.pointerType === "mouse")
              e.target.setPointerCapture(e.pointerId);
          };
          const move = (e) => {
            if (!dragging) return;
            const mx = e.clientX - sx,
              my = e.clientY - sy;
            if (!decided) {
              if (Math.abs(mx) > 8 || Math.abs(my) > 8) {
                decided = true;
                horiz = Math.abs(mx) > Math.abs(my);
              }
            }
            if (!horiz) return;
            if (e.cancelable) e.preventDefault();
            const base = el.classList.contains("open") ? OPEN : 0;
            dx = Math.max(OPEN, Math.min(0, base + mx));
            el.style.transform = "translateX(" + dx + "px)";
          };
          const end = (e) => {
            if (!dragging) return;
            dragging = false;
            el.style.transition = "";
            if (e.type === "pointerup" && e.pointerType === "mouse")
              e.target.releasePointerCapture(e.pointerId);
            if (!horiz) return;
            closeAllSwipe(el);
            el.style.transform = "";
            el.classList.toggle("open", dx < OPEN / 2);
          };
          el.addEventListener("pointerdown", start, { passive: true });
          el.addEventListener("pointermove", move, { passive: false });
          el.addEventListener("pointerup", end);
          el.addEventListener("pointercancel", end);
          el.addEventListener("click", (e) => {
            if (decided && horiz) return;
            if (el.classList.contains("open")) {
              el.classList.remove("open");
            } else {
              closeAllSwipe(el);
              el.classList.add("open");
            }
          });
        });
      }
      function closeAllSwipe(except) {
        document.querySelectorAll("#recentList .tx.open").forEach((el) => {
          if (el !== except) el.classList.remove("open");
        });
      }
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".txrow")) closeAllSwipe(null);
      });

      function renderStats() {
        const r = state.statRange;
        let buckets = [],
          labels = [];
        const now = new Date();
        if (r === "week") {
          const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
          for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            buckets.push(
              d.getFullYear() +
                "-" +
                String(d.getMonth() + 1).padStart(2, "0") +
                "-" +
                String(d.getDate()).padStart(2, "0"),
            );
            labels.push(days[d.getDay()]);
          }
        } else if (r === "month") {
          for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
            buckets.push(
              d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
            );
            labels.push(
              d.getMonth() + 1 + "/" + String(d.getFullYear()).slice(2),
            );
          }
        } else {
          for (let i = 0; i < 6; i++) {
            const y = now.getFullYear() - 5 + i;
            buckets.push("" + y);
            labels.push("" + y);
          }
        }
        const vals = buckets.map((b) =>
          DB.tx
            .filter(
              (t) =>
                t.type === "expense" &&
                (r === "week"
                  ? t.date === b
                  : r === "month"
                    ? t.date.slice(0, 7) === b
                    : t.date.slice(0, 4) === b),
            )
            .reduce((a, x) => a + x.amount, 0),
        );
        const max = Math.max(...vals, 1);
        document.getElementById("barChart").innerHTML = buckets
          .map(
            (b, i) =>
              `<div class="barcol"><div class="bar" style="height:${Math.max((vals[i] / max) * 100, 2)}%" title="${fmt(vals[i])}"></div><div class="barlbl">${labels[i]}</div></div>`,
          )
          .join("");
        const mTx = DB.tx.filter(
          (t) => t.type === "expense" && inRange(t.date, "month"),
        );
        const byCat = {};
        mTx.forEach((t) => (byCat[t.cat] = (byCat[t.cat] || 0) + t.amount));
        const total = Object.values(byCat).reduce((a, b) => a + b, 0);
        document.getElementById("catTotal").textContent = fmt(total);
        const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
        const svg = document.getElementById("donut");
        if (!total) {
          svg.innerHTML =
            '<text x="100" y="105" text-anchor="middle" fill="var(--txt3)" font-size="14" font-weight="700">Trống</text>';
          document.getElementById("catLegend").innerHTML = "";
          return;
        }
        let off = 0,
          paths = "";
        entries.forEach(([cat, v]) => {
          const c = getCatInfo(cat);
          const len = (v / total) * 2 * Math.PI * 75;
          paths += `<circle cx="100" cy="100" r="75" fill="none" stroke="${c.c}" stroke-width="32" stroke-dasharray="${len} ${2 * Math.PI * 75}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)" style="transition:all 1s cubic-bezier(0.34, 1.56, 0.64, 1); filter:drop-shadow(0 0 4px ${c.c}60)"/>`;
          off += len;
        });
        svg.innerHTML =
          paths +
          `<text x="100" y="94" text-anchor="middle" fill="var(--txt2)" font-size="12" font-weight="700" letter-spacing="0.1em">TỔNG CHI</text><text x="100" y="120" text-anchor="middle" fill="var(--txt)" font-size="20" font-family="'Space Grotesk', sans-serif" font-weight="800">${fmtShort(total)}</text>`;
        document.getElementById("catLegend").innerHTML = entries
          .map(([cat, v]) => {
            const c = getCatInfo(cat);
            return `<div class="legrow"><div class="dot" style="background:${c.c};width:14px;height:14px"></div><div class="nm">${c.e} ${c.n}</div><div class="pc">${Math.round((v / total) * 100)}%</div><div class="am num-font">${fmt(v)}</div></div>`;
          })
          .join("");
          
        renderHealthScore();
      }

      function renderHealthScore() {
        const mTx = DB.tx.filter((t) => inRange(t.date, "month"));
        let totalInc = mTx.filter(t => t.type === "income").reduce((a, b) => a + b.amount, 0);
        let totalExp = mTx.filter(t => t.type === "expense").reduce((a, b) => a + b.amount, 0);
        
        let savingsRate = totalInc > 0 ? ((totalInc - totalExp) / totalInc) * 100 : 0;
        
        // Calculate Debt
        const walletBals = {};
        DB.wallets.forEach((w) => (walletBals[w] = 0));
        DB.tx.forEach((b) => {
            const isPlus = b.type === "income" || (b.type === "debt" && (b.cat === "borrow" || b.cat === "collect"));
            walletBals[b.wallet] = (walletBals[b.wallet] || 0) + (isPlus ? b.amount : -b.amount);
        });
        
        let totalCash = 0;
        let totalDebt = 0;
        Object.values(walletBals).forEach(amt => {
            if (amt > 0) totalCash += amt;
            else totalDebt += Math.abs(amt);
        });

        // Score 0 - 100
        let score = 50; 
        if (savingsRate > 20) score += 20;
        else if (savingsRate > 0) score += 10;
        else score -= 20;

        if (totalDebt === 0) score += 15;
        else if (totalDebt < totalInc) score += 5;
        else score -= 15;

        let monthsSurvival = totalExp > 0 ? (totalCash / totalExp) : 0;
        if (monthsSurvival > 6) score += 15;
        else if (monthsSurvival > 3) score += 10;
        else score -= 10;

        score = Math.max(0, Math.min(100, Math.round(score)));

        let status = "Khá";
        let color = "var(--orange)";
        if (score >= 80) { status = "Tuyệt vời"; color = "var(--green)"; }
        else if (score < 40) { status = "Báo động"; color = "var(--red)"; }

        const hsEl = document.getElementById("healthScoreContainer");
        if (hsEl) {
            hsEl.innerHTML = `
            <div class="card">
                <div style="font-weight: 800; font-size: 18px; letter-spacing: -0.02em; margin-bottom: 16px;">Sức khỏe Tài chính</div>
                <div style="display:flex; align-items:center; gap: 16px;">
                    <div style="width: 80px; height: 80px; border-radius: 50%; border: 6px solid ${color}; display:flex; align-items:center; justify-content:center; font-size: 24px; font-weight: 800; color: ${color};" class="num-font">${score}</div>
                    <div style="flex: 1;">
                        <div style="font-size: 16px; font-weight: 700;">Đánh giá: <span style="color:${color}">${status}</span></div>
                        <div style="font-size: 13px; color: var(--txt2); margin-top: 4px;">Tỷ lệ tiết kiệm: ${Math.round(savingsRate)}%</div>
                        <div style="font-size: 13px; color: var(--txt2); margin-top: 2px;">Sinh tồn (quỹ KH): ${monthsSurvival.toFixed(1)} tháng</div>
                    </div>
                </div>
                <div style="margin-top: 16px; padding: 12px; background: rgba(0,0,0,0.1); border-radius: 12px; font-size: 12px; color: var(--txt2); line-height: 1.5;">
                    💡 Điểm số tính toán dựa trên Tỷ lệ tiết kiệm hàng tháng, Số dư quỹ khẩn cấp (tháng sinh tồn) và Tỷ lệ Công nợ.
                </div>
            </div>`;
        }
      }

      function renderBudget() {
        document.getElementById("budgetMonthLbl").textContent =
          "Phân tích Ngân sách Tháng " +
          (new Date().getMonth() + 1) +
          "/" +
          new Date().getFullYear();
          
        const mTx = DB.tx.filter((t) => inRange(t.date, "month"));
        let totalInc = mTx.filter(t => t.type === "income").reduce((a, b) => a + b.amount, 0);
        if (totalInc === 0) totalInc = 1; // Prevent division by zero
        
        const rule50 = totalInc * 0.5;
        const rule30 = totalInc * 0.3;
        const rule20 = totalInc * 0.2;
        
        const needsCats = ["food", "transport", "bills", "home", "health"];
        const wantsCats = ["shop", "fun", "coffee", "beauty"];
        // 20% savings/debt repay
        
        let spentNeeds = 0, spentWants = 0, spentSavings = 0;
        
        mTx.forEach((t) => {
            if (t.type === "expense") {
                if (needsCats.includes(t.cat)) spentNeeds += t.amount;
                else if (wantsCats.includes(t.cat)) spentWants += t.amount;
                else spentSavings += t.amount;
            } else if (t.type === "debt" && t.cat === "repay") {
                spentSavings += t.amount; // Paying off debt counts as saving
            }
        });

        const bl = document.getElementById("budgetList");
        
        let html503020 = `
        <div style="background: rgba(0,0,0,0.1); border: 1px solid var(--stroke); border-radius: 20px; padding: 16px; margin-bottom: 24px;">
            <div style="font-weight: 800; font-size: 15px; margin-bottom: 12px; color: var(--txt);">Quy tắc 50/30/20 (Dựa trên Thu nhập)</div>
            
            <div style="margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px">
                    <span style="font-weight:700">🏠 50% Thiết yếu</span>
                    <span style="color:${spentNeeds > rule50 ? 'var(--red)' : 'var(--txt2)'};font-weight:700" class="num-font">${fmt(spentNeeds)} / ${fmt(rule50)}</span>
                </div>
                <div class="bgbar" style="height:10px; margin:0"><i style="width:${Math.min((spentNeeds/rule50)*100, 100)}%;background:${spentNeeds > rule50 ? 'var(--red)' : 'var(--blue)'}"></i></div>
            </div>
            
            <div style="margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px">
                    <span style="font-weight:700">🎉 30% Linh hoạt</span>
                    <span style="color:${spentWants > rule30 ? 'var(--red)' : 'var(--txt2)'};font-weight:700" class="num-font">${fmt(spentWants)} / ${fmt(rule30)}</span>
                </div>
                <div class="bgbar" style="height:10px; margin:0"><i style="width:${Math.min((spentWants/rule30)*100, 100)}%;background:${spentWants > rule30 ? 'var(--red)' : 'var(--purple)'}"></i></div>
            </div>
            
            <div>
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px">
                    <span style="font-weight:700">📈 20% Tích lũy/Trả nợ</span>
                    <span style="color:${spentSavings < rule20 && totalInc > 1 ? 'var(--orange)' : 'var(--txt2)'};font-weight:700" class="num-font">${fmt(spentSavings)} / ${fmt(rule20)}</span>
                </div>
                <div class="bgbar" style="height:10px; margin:0"><i style="width:${Math.min((spentSavings/rule20)*100, 100)}%;background:${spentSavings < rule20 && totalInc > 1 ? 'var(--orange)' : 'var(--green)'}"></i></div>
            </div>
        </div>
        `;
        
        const spent = {};
        mTx.filter((t) => t.type === "expense").forEach((t) => (spent[t.cat] = (spent[t.cat] || 0) + t.amount));
        
        // Lọc bỏ các ngân sách đã bị xoá (null, 0)
        const keys = Object.keys(DB.budgets).filter(k => {
            const val = DB.budgets[k];
            if (val === null || val === undefined || val === 0 || k === "__customCats") return false;
            return true;
        });
        
        let customBudgetHtml = !keys.length
          ? '<div class="empty" style="padding:20px"><div class="e" style="font-size:32px">🎯</div><div style="font-weight:700;font-size:14px;color:var(--txt);">Chưa thiết lập ngân sách riêng</div></div>'
          : keys
              .map((cat) => {
                const c = getCatInfo(cat);
                const rawVal = DB.budgets[cat];
                let lim = 0;
                let limDisplay = "";
                
                if (rawVal < 0) {
                    const pct = Math.abs(rawVal);
                    lim = (pct / 100) * totalInc;
                    limDisplay = `${pct}% thu nhập (${fmt(lim)})`;
                } else {
                    lim = rawVal;
                    limDisplay = fmt(lim);
                }

                const sp = spent[cat] || 0,
                  pct = Math.min((sp / lim) * 100, 100),
                  over = sp > lim;
                return `<div style="margin-bottom:20px; cursor:pointer;" onclick="editBudget('${cat}')"><div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span style="font-weight:800">${c.e} ${c.n}</span><span style="color:${over ? "var(--red)" : "var(--txt2)"};font-weight:700" class="num-font">${fmt(sp)} / ${limDisplay}</span></div><div class="bgbar" style="height:8px; margin:0"><i style="width:${pct}%;background:${over ? "var(--red)" : sp / lim > 0.85 ? "var(--orange)" : c.c};box-shadow:0 0 10px ${over ? "var(--red)" : sp / lim > 0.85 ? "var(--orange)" : c.c}"></i></div></div>`;
              })
              .join("");
              
        bl.innerHTML = html503020 + '<div style="font-weight:800;font-size:15px;margin-bottom:16px;">Hạn mức tùy chỉnh (Chạm để sửa)</div>' + customBudgetHtml;

        const gl = document.getElementById("goalList");
        gl.innerHTML = !DB.goals.length
          ? '<div class="empty" style="padding:32px 20px"><div class="e">🌌</div><div style="font-weight:700;font-size:18px;color:var(--txt);">Chưa có mục tiêu</div></div>'
          : DB.goals
              .map((g, i) => {
                const pct = Math.min((g.saved / g.target) * 100, 100);
                return `<div style="margin-bottom:20px;cursor:pointer;background:rgba(0,0,0,0.2);padding:18px;border-radius:22px;border:1px solid var(--stroke);transition:transform .2s;" onclick="editGoal(${i})" onactive="this.style.transform='scale(0.96)'"><div style="display:flex;justify-content:space-between;font-size:17px"><span style="font-weight:800">${g.emoji || "🚀"} ${esc(g.name)}</span><span style="font-weight:800;color:var(--blue);text-shadow:0 0 10px rgba(59,130,246,0.5);" class="num-font">${Math.round(pct)}%</span></div><div class="bgbar" style="height:14px;margin:16px 0 10px"><i style="width:${pct}%;background:var(--accent-grad)"></i></div><div style="font-size:13px;color:var(--txt2);font-weight:700" class="num-font">${fmt(g.saved)} / ${fmt(g.target)}</div></div>`;
              })
              .join("");
      }

      function renderSettings() {
        document.getElementById("keyStatus").innerHTML = DB.hasKey
          ? "<span style='color:var(--green);font-weight:800;font-size:18px'>✓ CẤP QUYỀN THÀNH CÔNG</span><br><span style='font-size:12px;opacity:0.7;margin-top:4px;display:block'>Mô-đun ngôn ngữ tự nhiên đã trực tuyến.</span>"
          : "<span style='color:var(--orange);font-weight:800;font-size:16px'>⚠️ YÊU CẦU ỦY QUYỀN</span>";
        document.getElementById("walletMgr").innerHTML = DB.wallets
          .map(
            (w, i) =>
              `<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--stroke2)"><span style="flex:1;font-size:16px;font-weight:700">💳 ${esc(w)}</span>${DB.wallets.length > 1 ? `<button onclick="delWallet(${i})" style="background:rgba(244,63,94,.15);color:var(--red);border:none;padding:8px 16px;border-radius:14px;font-weight:800;cursor:pointer;transition:transform .2s;" onactive="this.style.transform='scale(0.9)'">Gỡ</button>` : ""}</div>`,
          )
          .join("");
        document.getElementById("gasUrlShow").textContent = GAS_URL;
        const sel = document.getElementById("walletIn");
        if (sel)
          sel.innerHTML = DB.wallets
            .map((w) => `<option>${esc(w)}</option>`)
            .join("");
      }

      function renderAI() {
        document
          .getElementById("aiNoKey")
          .classList.toggle("hidden", DB.hasKey);
        document
          .getElementById("aiChat")
          .classList.toggle("hidden", !DB.hasKey);
        if (DB.hasKey) {
          const m = document.getElementById("msgs");
          if (!chat.length) {
            m.innerHTML =
              '<div class="msg a">Xin chào Chỉ huy. Khối óc phân tích tài chính đã sẵn sàng. Ngài có thể tra cứu thông số hoặc yêu cầu trích xuất dữ liệu bằng ngôn ngữ tự nhiên (vd: <b>"Hôm nay chi tiền cafe 65k"</b>).</div>';
            document.getElementById("chips").innerHTML = [
              "Nạp nhiên liệu 70k",
              "Chi phí tháng này?",
              "Phân tích dòng tiền",
            ]
              .map(
                (c) =>
                  `<span class="chip" onclick="quickAsk('${c}')">${c}</span>`,
              )
              .join("");
          } else {
            m.innerHTML = chat
              .map(
                (x) =>
                  `<div class="msg ${x.role === "user" ? "u" : "a"}">${esc(x.text)}</div>`,
              )
              .join("");
            document.getElementById("chips").innerHTML = "";
            m.scrollTop = m.scrollHeight;
          }
        }
      }

      function switchTab(t) {
        state.tab = t;
        ["home", "stats", "budget", "ai"].forEach((x) =>
          document
            .getElementById("tab-" + x)
            .classList.toggle("hidden", x !== t),
        );
        document
          .querySelectorAll(".nav button[data-tab]")
          .forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
        document.getElementById("scroll").scrollTop = 0;
        closeAllSwipe(null);
        if (t === "ai")
          setTimeout(() => {
            const m = document.getElementById("msgs");
            if (m) m.scrollTop = m.scrollHeight;
          }, 50);
      }

      function toggleCustomCat(val) {
        const wrap = document.getElementById("bgCustomWrap");
        if (wrap) {
            if (val === "custom") {
                wrap.classList.remove("hidden");
            } else {
                wrap.classList.add("hidden");
            }
        }
      }

      function openSheet(name) {
        if (name === "add") prepAdd();
        if (name === "budget") {
          state.editBudgetCat = null;
          let opts = CATS.expense.map((c) => `<option value="${c.id}">${c.e} ${c.n}</option>`);
          if (DB.customCats) {
             opts = opts.concat(DB.customCats.map((c) => `<option value="${c.id}">${c.e} ${c.n}</option>`));
          }
          opts.push(`<option value="custom" style="font-weight:bold; color:var(--blue)">+ Tạo mục khác...</option>`);
          document.getElementById("bgCat").innerHTML = opts.join("");
          document.getElementById("bgVal").value = "";
          document.getElementById("bgCustomName").value = "";
          document.getElementById("bgCustomEmoji").value = "";
          document.querySelector('#bgTypeSeg button[data-t="fixed"]').click();
          document.getElementById("delBgBtn").classList.add("hidden");
          toggleCustomCat(document.getElementById("bgCat").value);
        }
        if (name === "goal") prepGoal();
        if (name === "settings") {
          document.getElementById("keyPw").value = "";
          document.getElementById("keyInput").value = "";
          renderSettings();
        }
        document.getElementById("ov-" + name).classList.add("show");
      }
      function closeSheet() {
        document
          .querySelectorAll(".ov")
          .forEach((o) => o.classList.remove("show"));
      }
      document.querySelectorAll(".ov").forEach((o) =>
        o.addEventListener("click", (e) => {
          if (e.target === o) closeSheet();
        }),
      );

      function prepAdd() {
        state.editId = null;
        state.addType = "expense";
        state.selCat = "food";
        document.getElementById("addTitle").textContent = "Khởi tạo Bản ghi";
        document.getElementById("amtIn").value = "";
        document.getElementById("noteIn").value = "";
        document.getElementById("aiQuickIn").value = "";
        document.getElementById("dateIn").value = today();
        document.getElementById("delTxBtn").classList.add("hidden");
        document.getElementById("walletIn").innerHTML = DB.wallets
          .map((w) => `<option>${esc(w)}</option>`)
          .join("");
        setType("expense");
        document
          .querySelectorAll("#typeSeg button")
          .forEach((b) => b.classList.toggle("on", b.dataset.t === "expense"));
      }

      function setType(t) {
        state.addType = t;
        const cats = CATS[t];
        if (!cats.find((c) => c.id === state.selCat)) state.selCat = cats[0].id;
        renderCatGrid();
      }
      function renderCatGrid() {
        let list = CATS[state.addType] || [];
        if (state.addType === 'expense' && DB.customCats && DB.customCats.length > 0) {
            list = [...list, ...DB.customCats];
        }
        document.getElementById("catGrid").innerHTML = list
          .map(
            (c) =>
              `<div class="catpick ${c.id === state.selCat ? "on" : ""}" onclick="pickCat('${c.id}')"><span class="ce">${c.e}</span>${c.n}</div>`,
          )
          .join("");
      }
      function pickCat(id) {
        state.selCat = id;
        renderCatGrid();
      }
      document.getElementById("typeSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        document
          .querySelectorAll("#typeSeg button")
          .forEach((x) => x.classList.toggle("on", x === b));
        setType(b.dataset.t);
      });

      document.getElementById("aiQuickIn").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          aiFillTx();
        }
      });

      /* ================================================================ 
   HỖ TRỢ AI NHẬP NHANH
   ================================================================ */
      async function aiFillTx() {
        const inp = document.getElementById("aiQuickIn"),
          q = inp.value.trim();
        if (!q) return;
        const btn = document.getElementById("aiFillBtn");
        btn.disabled = true;
        btn.innerHTML =
          '<div class="spin" style="width:22px;height:22px;border-width:3px;border-top-color:var(--bg);animation-duration:0.6s;"></div>';
        try {
          const prompt = `Phân tích câu này thành giao dịch: "${q}". Trả về ĐÚNG 1 dòng cấu trúc JSON này: [ADD_TX: {"type":"expense|income|debt", "amount": số, "cat": "ID", "note": "tóm tắt", "date": "${today()}"}]. 
Danh mục Chi ID: food, shop, transport, bills, home, health, fun, edu, coffee, gift, beauty, other_e. 
Thu ID: salary, bonus, invest, biz, gift_i, other_i.
Nợ ID: loan (Cho vay), borrow (Đi vay), repay (Trả nợ), collect (Thu nợ). Không cần nói gì thêm.`;
          const r = await api("chat", {
            message: prompt,
            history: [],
            context: "",
          });
          const match = r.reply.match(/\[ADD_TX:\s*(\{[\s\S]*?\})\s*\]/);
          if (match) {
            const data = JSON.parse(match[1]);
            if (data.type) {
              document
                .querySelectorAll("#typeSeg button")
                .forEach((x) =>
                  x.classList.toggle("on", x.dataset.t === data.type),
                );
              setType(data.type);
            }
            if (data.cat) {
              pickCat(data.cat);
            }
            if (data.amount) {
              const aIn = document.getElementById("amtIn");
              aIn.value = data.amount;
              fmtAmt(aIn);
            }
            if (data.note) document.getElementById("noteIn").value = data.note;
            if (data.date) document.getElementById("dateIn").value = data.date;
            inp.value = "";
            toast("✨ Trích xuất dữ liệu thành công.");
          } else {
            toast("⚠️ Lỗi diễn giải ngôn ngữ tự nhiên.");
          }
        } catch (e) {
          toast("Mất kết nối mô-đun AI: " + e.message);
        }
        btn.disabled = false;
        btn.textContent = "➤";
      }

      /* ================================================================ 
   FAST UPDATE
   ================================================================ */
      async function saveTx() {
        const amt = parseAmt(document.getElementById("amtIn").value);
        if (!amt) {
          toast("Vui lòng nhập định mức giá trị");
          return;
        }
        const obj = {
          type: state.addType,
          amount: amt,
          cat: state.selCat,
          note: document.getElementById("noteIn").value.trim(),
          date: document.getElementById("dateIn").value || today(),
          wallet: document.getElementById("walletIn").value,
        };

        const btn = document.getElementById("saveTxBtn");
        btn.disabled = true;

        try {
          if (state.editId) {
            obj.id = state.editId;
            const i = DB.tx.findIndex((t) => t.id === state.editId);
            if (i > -1) DB.tx[i] = { ...DB.tx[i], ...obj };
            render();
            closeSheet();
            cacheDB(DB);
            toast("Ghi đè bản ghi thành công ⚡");
            api("editTx", { tx: obj }, true);
          } else {
            obj.id = Date.now();
            DB.tx.push(obj);
            render();
            closeSheet();
            cacheDB(DB);
            toast("Khởi tạo bản ghi hoàn tất ⚡");
            api("addTx", { tx: obj }, true).then((r) => {
              const i = DB.tx.findIndex((t) => t.id === obj.id);
              if (i > -1 && r && r.id) {
                DB.tx[i].id = r.id;
                cacheDB(DB);
              }
            });
          }
        } catch (e) {
          toast("Lỗi thực thi: " + e.message);
        }
        btn.disabled = false;
      }

      function editTx(id) {
        const t = DB.tx.find((x) => x.id === id);
        if (!t) return;
        closeAllSwipe(null);
        state.editId = id;
        state.addType = t.type;
        state.selCat = t.cat;
        document.getElementById("addTitle").textContent = "Chỉnh sửa Bản ghi";
        document.getElementById("amtIn").value =
          t.amount.toLocaleString("vi-VN") + "đ";
        document.getElementById("noteIn").value = t.note;
        document.getElementById("dateIn").value = t.date;
        document.getElementById("walletIn").innerHTML = DB.wallets
          .map(
            (w) =>
              `<option ${w === t.wallet ? "selected" : ""}>${esc(w)}</option>`,
          )
          .join("");
        document
          .querySelectorAll("#typeSeg button")
          .forEach((b) => b.classList.toggle("on", b.dataset.t === t.type));
        setType(t.type);
        document.getElementById("delTxBtn").classList.remove("hidden");
        document.getElementById("ov-add").classList.add("show");
      }

      function delTxCommon(id) {
        DB.tx = DB.tx.filter((t) => t.id !== id);
        render();
        cacheDB(DB);
        toast("Đã hủy bản ghi 🗑️");
        api("delTx", { id }, true);
      }
      function delTx() {
        if (!state.editId) return;
        const id = state.editId;
        closeSheet();
        delTxCommon(id);
      }
      function delTxById(id) {
        closeAllSwipe(null);
        delTxCommon(id);
      }

      let currentBudgetType = "fixed";
      document.getElementById("bgTypeSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        currentBudgetType = b.dataset.t;
        document.querySelectorAll("#bgTypeSeg button").forEach((x) => x.classList.toggle("on", x === b));
        
        const inEl = document.getElementById("bgVal");
        const lbl = document.getElementById("bgValLbl");
        
        if (currentBudgetType === "percent") {
            lbl.textContent = "Tỷ lệ phần trăm (%)";
            inEl.placeholder = "0%";
            // Reset to plain number if it had formatting
            inEl.value = inEl.value.replace(/\D/g, "");
            inEl.oninput = function() {
                let v = this.value.replace(/\D/g, "");
                if (v && parseInt(v) > 100) v = "100";
                this.value = v ? v + "%" : "";
            };
        } else {
            lbl.textContent = "Hạn mức tối đa / tháng";
            inEl.placeholder = "0đ";
            inEl.value = inEl.value.replace(/\D/g, "");
            inEl.oninput = function() { fmtAmt(this) };
            if(inEl.value) fmtAmt(inEl);
        }
      });

      async function saveBudget() {
        let cat = document.getElementById("bgCat").value;
        
        if (cat === "custom") {
            const cName = document.getElementById("bgCustomName").value.trim();
            const cEmoji = document.getElementById("bgCustomEmoji").value || "✨";
            if (!cName) {
                toast("Vui lòng nhập tên danh mục mới");
                return;
            }
            cat = "c_" + Date.now();
            const newCat = { id: cat, e: cEmoji, n: cName, c: "#" + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0') }; 
            if (!DB.customCats) DB.customCats = [];
            DB.customCats.push(newCat);
        }

        const valRaw = document.getElementById("bgVal").value;
        const val = parseAmt(valRaw);
        
        if (!val) {
          toast("Vui lòng thiết lập định mức/tỷ lệ hợp lệ");
          return;
        }
        
        // Lưu giá trị âm nếu là percent để dễ phân biệt, và tương thích với GAS (chỉ nhận số)
        const storedVal = currentBudgetType === "percent" ? -Math.abs(val) : Math.abs(val);
        DB.budgets[cat] = storedVal;
        
        // Luôn đồng bộ customCats thành một budget ẩn dạng chuỗi để GAS chấp nhận
        if (DB.customCats && DB.customCats.length > 0) {
            DB.budgets["__customCats"] = JSON.stringify(DB.customCats);
        }
        
        render();
        closeSheet();
        cacheDB(DB);
        toast("Thiết lập ngân sách thành công ✓");
        
        // Gửi lên server
        api("setBudget", { cat, amount: storedVal }, true);
        if (DB.customCats && DB.customCats.length > 0) {
            api("setBudget", { cat: "__customCats", amount: JSON.stringify(DB.customCats) }, true);
        }
      }
      
      window.editBudget = function(cat) {
        state.editBudgetCat = cat;
        let opts = CATS.expense.map((c) => `<option value="${c.id}" ${c.id === cat ? 'selected' : ''}>${c.e} ${c.n}</option>`);
        if (DB.customCats) {
            opts = opts.concat(DB.customCats.map((c) => `<option value="${c.id}" ${c.id === cat ? 'selected' : ''}>${c.e} ${c.n}</option>`));
        }
        opts.push(`<option value="custom" style="font-weight:bold; color:var(--blue)">+ Tạo mục khác...</option>`);
        
        document.getElementById("bgCat").innerHTML = opts.join("");
        toggleCustomCat(cat);
          
        const rawVal = DB.budgets[cat];
        let type = "fixed";
        let val = rawVal;
        
        if (rawVal < 0) {
            type = "percent";
            val = Math.abs(rawVal);
        }
        
        const btnType = document.querySelector(`#bgTypeSeg button[data-t="${type}"]`);
        if(btnType) btnType.click();
        
        const inEl = document.getElementById("bgVal");
        if (type === "percent") {
            inEl.value = val + "%";
        } else {
            inEl.value = val;
            fmtAmt(inEl);
        }
        
        document.getElementById("delBgBtn").classList.remove("hidden");
        document.getElementById("ov-budget").classList.add("show");
      }
      
      window.delBudget = async function() {
        try {
            const cat = state.editBudgetCat;
            if(cat) {
                // Xoá cục bộ
                delete DB.budgets[cat];
                state.editBudgetCat = null;
                render();
                closeSheet();
                cacheDB(DB);
                toast("Đã xóa ngân sách");
                // Đẩy lên Server qua setBudget với amount = 0 để vô hiệu hoá trên DB
                api("setBudget", { cat, amount: 0 }, true);
            }
        } catch (err) {
            console.error(err);
            toast("Lỗi thực thi xoá: " + err.message);
        }
      }
      // Also export editBudget to window to be absolutely safe
      window.editBudget = editBudget;

      function prepGoal() {
        state.editGoal = null;
        ["goalName", "goalTarget", "goalSaved", "goalEmoji"].forEach(
          (id) => (document.getElementById(id).value = ""),
        );
        document.getElementById("delGoalBtn").classList.add("hidden");
      }
      function editGoal(i) {
        const g = DB.goals[i];
        state.editGoal = i;
        document.getElementById("goalName").value = g.name;
        document.getElementById("goalTarget").value =
          g.target.toLocaleString("vi-VN") + "đ";
        document.getElementById("goalSaved").value =
          g.saved.toLocaleString("vi-VN") + "đ";
        document.getElementById("goalEmoji").value = g.emoji || "🎯";
        document.getElementById("delGoalBtn").classList.remove("hidden");
        document.getElementById("ov-goal").classList.add("show");
      }
      async function saveGoal() {
        const name = document.getElementById("goalName").value.trim(),
          target = parseAmt(document.getElementById("goalTarget").value);
        if (!name || !target) {
          toast("Dữ liệu khởi tạo không hợp lệ");
          return;
        }
        const g = {
          name,
          target,
          saved: parseAmt(document.getElementById("goalSaved").value),
          emoji: document.getElementById("goalEmoji").value || "🎯",
        };
        if (state.editGoal != null) DB.goals[state.editGoal] = g;
        else DB.goals.push(g);
        render();
        closeSheet();
        cacheDB(DB);
        toast("Đồng bộ mục tiêu hoàn tất");
        api("saveGoals", { goals: DB.goals }, true);
      }
      async function delGoal() {
        if (state.editGoal == null) return;
        DB.goals.splice(state.editGoal, 1);
        render();
        closeSheet();
        cacheDB(DB);
        toast("Đã hủy mục tiêu");
        api("saveGoals", { goals: DB.goals }, true);
      }

      async function addWallet() {
        const v = document.getElementById("newWallet").value.trim();
        if (!v) return;
        DB.wallets.push(v);
        document.getElementById("newWallet").value = "";
        renderSettings();
        cacheDB(DB);
        api("saveWallets", { wallets: DB.wallets }, true);
      }
      async function delWallet(i) {
        if (DB.wallets.length <= 1) return;
        DB.wallets.splice(i, 1);
        renderSettings();
        cacheDB(DB);
        api("saveWallets", { wallets: DB.wallets }, true);
      }

      async function saveKey() {
        const pw = document.getElementById("keyPw").value,
          k = document.getElementById("keyInput").value.trim();
        if (!pw) {
          toast("Yêu cầu nhập mật mã bảo mật");
          return;
        }
        if (!k) {
          toast("Chuỗi API không hợp lệ");
          return;
        }
        try {
          await api("setKey", { pw, apiKey: k });
          DB.hasKey = true;
          document.getElementById("keyPw").value = "";
          document.getElementById("keyInput").value = "";
          cacheDB(DB);
          renderSettings();
          renderAI();
          toast("🚀 Lõi AI trực tuyến.");
        } catch (e) {
          toast("Lỗi xác thực: " + e.message);
        }
      }

      function toggleTheme() {
        const isLight = document.body.classList.toggle("light");
        document.getElementById("themeBtn").textContent = isLight ? "☀️" : "🌙";
        localforage.setItem("dd_theme", isLight ? "light" : "dark");
      }

      function setCustomDate(val) {
        if (val) {
          state.customDate = val;
          state.range = "day";
          document
            .querySelectorAll("#rangeSeg button")
            .forEach((x) => x.classList.toggle("on", x.dataset.r === "day"));
          renderHome();
        }
      }

      document.getElementById("rangeSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        state.range = b.dataset.r;
        document
          .querySelectorAll("#rangeSeg button")
          .forEach((x) => x.classList.toggle("on", x === b));
        renderHome();
      });
      document.getElementById("statSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        state.statRange = b.dataset.r;
        document
          .querySelectorAll("#statSeg button")
          .forEach((x) => x.classList.toggle("on", x === b));
        renderStats();
      });

      function quickAsk(q) {
        document.getElementById("chatInput").value = q;
        sendChat();
      }
      function buildContext() {
        const mTx = DB.tx.filter((t) => inRange(t.date, "month"));
        const inc = mTx
          .filter((t) => t.type === "income")
          .reduce((a, b) => a + b.amount, 0);
        const exp = mTx
          .filter((t) => t.type === "expense")
          .reduce((a, b) => a + b.amount, 0);
        const byCat = {};
        mTx
          .filter((t) => t.type === "expense")
          .forEach((t) => {
            const c = getCatInfo(t.cat);
            byCat[c ? c.n : t.cat] = (byCat[c ? c.n : t.cat] || 0) + t.amount;
          });
        const recent = [...DB.tx]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 30)
          .map(
            (t) =>
              `${t.date} ${t.type === "income" ? "+" : "-"}${t.amount} ${getCatInfo(t.cat).n}${t.note ? " (" + t.note + ")" : ""}`,
          )
          .join("\n");
        return `Bạn là AI phân tích tài chính thuộc hệ thống quản trị của Đặng Duyên.
Hôm nay: ${today()}.
Phân loại: Chi(food, shop, transport, bills, home, health, fun, edu, coffee, gift, beauty, other_e). Thu(salary, bonus, invest, biz, gift_i, other_i). Công nợ(loan, borrow, repay, collect).
GIAO THỨC LƯU TRỮ: Nếu người dùng ra lệnh thêm bản ghi, TRẢ LỜI ĐÚNG JSON NÀY ĐẦU TIÊN: [ADD_TX: {"type":"expense|income|debt", "amount": số, "cat": "ID", "note": "tóm tắt", "date": "${today()}"}]. Sau đó phản hồi tự nhiên.
Nhật ký gần nhất: ${recent || "chưa có"}`;
      }
      let sending = false;
      async function sendChat() {
        if (sending) return;
        const inp = document.getElementById("chatInput"),
          q = inp.value.trim();
        if (!q) return;
        inp.value = "";
        autogrow(inp);
        chat.push({ role: "user", text: q });
        renderAI();
        const m = document.getElementById("msgs");
        document.getElementById("chips").innerHTML = "";
        const typ = document.createElement("div");
        typ.className = "msg a";
        typ.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>';
        m.appendChild(typ);
        m.scrollTop = m.scrollHeight;
        sending = true;
        document.getElementById("sendBtn").disabled = true;
        try {
          const r = await api("chat", {
            message: q,
            history: chat.slice(0, -1),
            context: buildContext(),
          });
          let replyText = r.reply;
          let saved = false;
          const match = replyText.match(/\[ADD_TX:\s*(\{[\s\S]*?\})\s*\]/);
          if (match) {
            try {
              const txData = JSON.parse(match[1]);
              if (txData.amount && txData.type) {
                txData.wallet = DB.wallets[0];
                txData.id = Date.now();
                DB.tx.push(txData);
                saved = true;
                api("addTx", { tx: txData }, true).then((sv) => {
                  const idx = DB.tx.findIndex((t) => t.id === txData.id);
                  if (idx > -1 && sv && sv.id) {
                    DB.tx[idx].id = sv.id;
                    cacheDB(DB);
                  }
                });
              }
            } catch (e) {}
            replyText = replyText.replace(match[0], "").trim();
            if (!replyText) replyText = "Đã thực thi lệnh lưu trữ hệ thống ✓";
          }

          typ.remove();
          chat.push({ role: "model", text: replyText });
          renderAI();
          if (saved) {
            cacheDB(DB);
            render();
            toast("Mô-đun AI đã hoàn tất thủ tục lưu trữ 🤖");
          }
        } catch (e) {
          typ.remove();
          chat.push({
            role: "model",
            text: "⚠️ Ngắt kết nối trung tâm: " + e.message,
          });
          renderAI();
        }
        sending = false;
        document.getElementById("sendBtn").disabled = false;
      }

      async function forceSync() {
        const btn = document.getElementById("refreshBtn");
        btn.style.transform = "rotate(360deg)";
        setTimeout(() => {
          btn.style.transform = "";
        }, 400);
        try {
          const d = await api("load");
          DB = { ...DB, ...d };
          if (DB.budgets && typeof DB.budgets["__customCats"] === "string") {
              try {
                  DB.customCats = JSON.parse(DB.budgets["__customCats"]);
              } catch(e){}
          }
          cacheDB(DB);
          render();
          toast("Cập nhật dữ liệu vệ tinh thành công ☁️");
        } catch (e) {
          toast("Cảnh báo đồng bộ: " + e.message);
        }
      }

      async function connectGas() {
        const url = document.getElementById("gasUrlInput").value.trim();
        const err = document.getElementById("setupErr");
        err.textContent = "";
        if (!/^https:\/\/script\.google\.com\/macros\/s\//.test(url)) {
          err.textContent =
            "Định dạng Endpoint không hợp lệ. Phải bắt đầu bằng https://script.google.com/...";
          return;
        }
        GAS_URL = url;
        try {
          const d = await api("load");
          DB = { ...DB, ...d };
          
          if (DB.budgets && typeof DB.budgets["__customCats"] === "string") {
              try {
                  DB.customCats = JSON.parse(DB.budgets["__customCats"]);
              } catch(e){}
          }
          
          await localforage.setItem("dd_gas_url", url);
          await cacheDB(DB);
          document.getElementById("splash").classList.add("hidden");
          document.getElementById("app").classList.remove("hidden");
          boot();
        } catch (e) {
          err.textContent =
            "Truy cập bị từ chối. Kiểm tra phân quyền truy cập Ẩn danh (Anyone).";
        }
      }

      function changeGas() {
        closeSheet();
        GAS_URL = "";
        localforage.removeItem("dd_gas_url");
        document.getElementById("app").classList.add("hidden");
        document.getElementById("splash").classList.remove("hidden");
        document.getElementById("splashBody").classList.add("hidden");
        document.getElementById("setupForm").classList.remove("hidden");
        document.getElementById("gasUrlInput").value = "";
      }

      function boot() {
        document.getElementById("todayLbl").textContent =
          new Date().toLocaleDateString("vi-VN", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
        document.getElementById("customDateIn").value = today();
        
        // Khắc phục dữ liệu rác: Đảm bảo mọi giao dịch đều có ID hợp lệ
        if (DB.tx) {
            let fixed = false;
            DB.tx.forEach((t, idx) => {
                if (!t.id) {
                    t.id = Date.now() + idx; // Cấp phát ID nội bộ dự phòng
                    fixed = true;
                }
            });
            if (fixed) cacheDB(DB);
        }
        
        // Dọn dẹp dữ liệu ngân sách bị sai định dạng (object) thành số nguyên để đồng bộ với GAS
        if (DB.budgets) {
            let bFixed = false;
            Object.keys(DB.budgets).forEach(k => {
                let v = DB.budgets[k];
                if (typeof v === 'object' && v !== null) {
                    DB.budgets[k] = v.type === 'percent' ? -Math.abs(v.value || 0) : Math.abs(v.value || 0);
                    bFixed = true;
                }
            });
            if (bFixed) cacheDB(DB);
        }
        
        render();
      }

      async function init() {
        const theme = await localforage.getItem("dd_theme");
        if (theme === "dark") {
          document.body.classList.remove("light");
          document.getElementById("themeBtn").textContent = "🌙";
        }

        const savedUrl =
          GAS_URL_BUILTIN || (await localforage.getItem("dd_gas_url"));
        if (savedUrl) {
          GAS_URL = savedUrl;
          const cached = await localforage.getItem("offline_db");
          if (cached) {
            DB = cached;
            document.getElementById("splash").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
            boot();
            api("load", null, true)
              .then((d) => {
                DB = { ...DB, ...d };
                cacheDB(DB);
                render();
              })
              .catch((e) => console.log("Offline mode"));
          } else {
            try {
              const d = await api("load");
              DB = { ...DB, ...d };
              if (DB.budgets && typeof DB.budgets["__customCats"] === "string") {
                  try {
                      DB.customCats = JSON.parse(DB.budgets["__customCats"]);
                  } catch(e){}
              }
              cacheDB(DB);
              document.getElementById("splash").classList.add("hidden");
              document.getElementById("app").classList.remove("hidden");
              boot();
            } catch (e) {
              toast("Lỗi khởi tạo hệ thống: " + e.message);
            }
          }
        } else {
          document.getElementById("splashBody").classList.add("hidden");
          document.getElementById("setupForm").classList.remove("hidden");
        }
      }
      init();