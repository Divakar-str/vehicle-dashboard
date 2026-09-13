/**
 * DashboardController Module
 * Features:
 * 1. Document Expiry Breakdowns (FC, Permit, NP, Tax, GTax, Ins, PUC)
 * 2. Dedicated Fitness (FC) Card
 * 3. Dedicated Permit Card with 45-day window tracking
 * 4. Road Tax Quarters (Q1-Q4)
 * 5. NP 15-Year Rule with all milestone dates
 * 6. Customer Fleet Dashboard
 * 7. Priority Action Queue with filter tabs
 */
const DashboardController = {
  vehicles: [],
  customers: [],
  priorityQueueFilter: "ALL",
  toast: null,

  init() {
    this.toast = new bootstrap.Toast(document.getElementById("liveToast"), { delay: 3500 });
    this.load();
  },

  showToast(message, type = "success") {
    const toastEl = document.getElementById("liveToast");
    const msgEl = document.getElementById("toastMessage");
    toastEl.className = `toast align-items-center text-white border-0 shadow bg-${type === "error" ? "danger" : (type === "warning" ? "warning text-dark" : "dark")}`;
    msgEl.innerText = message;
    this.toast.show();
  },

  escape(str) {
    if (!str && str !== 0) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  formatDisplayDate(dateStr) {
    if (!dateStr) return "-";
    const cleanStr = String(dateStr).split("T")[0];
    const parts = cleanStr.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return cleanStr;
  },

  getDaysLeft(dateStr) {
    if (!dateStr) return null;
    const cleanStr = String(dateStr).split("T")[0];
    const target = new Date(cleanStr);
    const now = new Date();
    target.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  },

  addYearsToDate(dateStr, yearsToAdd) {
    if (!dateStr) return null;
    const cleanStr = String(dateStr).split("T")[0];
    const parts = cleanStr.split("-");
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10) + yearsToAdd;
    return `${y}-${parts[1]}-${parts[2]}`;
  },

  generateWhatsAppLink(v) {
    const cust = this.customers.find(c => c.id === v.customer_id) || {};
    const primaryPhone = cust.mobile || v.customer_mobile || "";
    if (!primaryPhone) return null;

    const cleanNumber = primaryPhone.replace(/\D/g, "");
    const formattedPhone = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;

    const msgLines = [];
    msgLines.push(`*VEHICLE RENEWAL NOTICE: ${v.registration_no}*`);
    msgLines.push(`Customer: ${v.customer_name || cust.name || 'Valued Client'}`);
    msgLines.push(`Owner: ${v.owner_name}`);
    msgLines.push(``);
    msgLines.push(`*Urgent Item Due:* ${v.critical_item || 'Document Expiry'}`);

    if (v.min_days_remaining !== null) {
      msgLines.push(v.min_days_remaining <= 0 
        ? `Status: OVERDUE by ${Math.abs(v.min_days_remaining)} days` 
        : `Status: Due in ${v.min_days_remaining} days`);
    }

    if (v.np_directive) {
      msgLines.push(``);
      msgLines.push(`*National Permit Rule Alert:* ${v.np_directive}`);
    } else if (Array.isArray(v.dependency_blockers) && v.dependency_blockers.length > 0) {
      msgLines.push(``);
      msgLines.push(`*Notice:* ${v.dependency_blockers[0]}`);
    }

    msgLines.push(``);
    msgLines.push(`Please send the required papers to avoid penalties.`);

    const encodedText = encodeURIComponent(msgLines.join("\n"));
    return `https://wa.me/${formattedPhone}?text=${encodedText}`;
  },

  async load() {
    const icon = document.getElementById("refreshIcon");
    if (icon) icon.classList.add("spin-animation");

    try {
      const cacheBust = `?_nocache=${Date.now()}`;
      const [vData, cData] = await Promise.all([
        Api.request(`/vehicles${cacheBust}`),
        Api.request(`/customers${cacheBust}`)
      ]);

      const vMap = new Map();
      (vData || []).forEach(v => {
        if (v.vehicle_id && !vMap.has(v.vehicle_id)) vMap.set(v.vehicle_id, v);
      });
      this.vehicles = Array.from(vMap.values());

      const cMap = new Map();
      (cData || []).forEach(c => {
        if (c.id && !cMap.has(c.id)) cMap.set(c.id, c);
      });
      this.customers = Array.from(cMap.values());

      this.renderDocumentBreakdowns();
      this.renderKPIs();
      this.renderFcTracker();
      this.renderPermitTracker();
      this.renderTaxQuarters();
      this.renderNpLifecycleWithDates();
      this.renderCustomerDashboard();
      this.renderPriorityQueue();
    } catch (err) {
      this.showToast("Failed to load dashboard: " + err.message, "error");
    } finally {
      if (icon) icon.classList.remove("spin-animation");
    }
  },

  // Document Breakdowns for all 7 types
  renderDocumentBreakdowns() {
    const counts = {
      fc: { expired: 0, warning: 0, expiring: 0 },
      permit: { expired: 0, warning: 0, expiring: 0 },
      np: { expired: 0, warning: 0, expiring: 0 },
      tax: { expired: 0, warning: 0, expiring: 0 },
      gtax: { expired: 0, warning: 0, expiring: 0 },
      ins: { expired: 0, warning: 0, expiring: 0 },
      puc: { expired: 0, warning: 0, expiring: 0 }
    };

    const check = (key, dateStr, isApplicable = true) => {
      if (!isApplicable || !dateStr) return;
      const days = this.getDaysLeft(dateStr);
      if (days === null) return;

      if (days <= 0) counts[key].expired++;
      else if (days <= 15) counts[key].warning++;
      else if (days <= 30) counts[key].expiring++;
    };

    this.vehicles.forEach(v => {
      check('fc', v.fc_expiry, true);
      check('permit', v.permit_expiry, v.permit_applicable === 'Yes');
      check('np', v.national_permit_expiry, v.national_permit_applicable === 'Yes');
      check('tax', v.road_tax_due, v.tax_type !== 'Lifetime');
      check('gtax', v.green_tax_due, Boolean(v.green_tax_due));
      check('ins', v.insurance_expiry, true);
      check('puc', v.puc_expiry, true);
    });

    document.getElementById("docFcExpired").innerText = counts.fc.expired;
    document.getElementById("docFcWarning").innerText = counts.fc.warning;
    document.getElementById("docFcExpiring").innerText = counts.fc.expiring;

    document.getElementById("docPermitExpired").innerText = counts.permit.expired;
    document.getElementById("docPermitWarning").innerText = counts.permit.warning;
    document.getElementById("docPermitExpiring").innerText = counts.permit.expiring;

    document.getElementById("docNpExpired").innerText = counts.np.expired;
    document.getElementById("docNpWarning").innerText = counts.np.warning;
    document.getElementById("docNpExpiring").innerText = counts.np.expiring;

    document.getElementById("docTaxExpired").innerText = counts.tax.expired;
    document.getElementById("docTaxWarning").innerText = counts.tax.warning;
    document.getElementById("docTaxExpiring").innerText = counts.tax.expiring;

    document.getElementById("docGtaxExpired").innerText = counts.gtax.expired;
    document.getElementById("docGtaxWarning").innerText = counts.gtax.warning;
    document.getElementById("docGtaxExpiring").innerText = counts.gtax.expiring;

    document.getElementById("docInsExpired").innerText = counts.ins.expired;
    document.getElementById("docInsWarning").innerText = counts.ins.warning;
    document.getElementById("docInsExpiring").innerText = counts.ins.expiring;

    document.getElementById("docPucExpired").innerText = counts.puc.expired;
    document.getElementById("docPucWarning").innerText = counts.puc.warning;
    document.getElementById("docPucExpiring").innerText = counts.puc.expiring;
  },

  renderKPIs() {
    let overdue = 0, fine = 0, safe = 0, notice = 0, missing = 0;

    this.vehicles.forEach(v => {
      const d = v.min_days_remaining;

      if (v.compliance_status === "EXPIRED" || (d !== null && d <= 0)) overdue++;
      else if (d !== null && d > 0 && d <= 15) fine++;
      else if (d !== null && d > 15 && d <= 30) safe++;
      else if (d !== null && d > 30 && d <= 45) notice++;

      const missingPermit = v.permit_applicable === "Yes" && !v.permit_expiry;
      const missingNP = v.national_permit_applicable === "Yes" && !v.national_permit_expiry;
      const missingFC = !v.fc_expiry;
      const missingTax = v.tax_type !== "Lifetime" && !v.road_tax_due;
      const missingIns = !v.insurance_expiry;
      const missingPUC = !v.puc_expiry;

      if (missingPermit || missingNP || missingFC || missingTax || missingIns || missingPUC) {
        missing++;
      }
    });

    document.getElementById("kpiOverdueCount").innerText = overdue;
    document.getElementById("kpiFineCount").innerText = fine;
    document.getElementById("kpiSafeCount").innerText = safe;
    document.getElementById("kpiNoticeCount").innerText = notice;
    document.getElementById("kpiMissingCount").innerText = missing;
    document.getElementById("kpiTotalVehicles").innerText = this.vehicles.length;
    document.getElementById("kpiTotalCustomers").innerText = this.customers.length;
  },

  // Dedicated Fitness (FC) Tracker Card
  renderFcTracker() {
    let fcExpired = 0, fcWarning = 0, fcSafe = 0;
    const fcAttentionList = [];

    this.vehicles.forEach(v => {
      if (!v.fc_expiry) return;
      const days = this.getDaysLeft(v.fc_expiry);
      if (days === null) return;

      if (days <= 0) {
        fcExpired++;
        fcAttentionList.push({ vehicle: v, days, status: "EXPIRED" });
      } else if (days <= 15) {
        fcWarning++;
        fcAttentionList.push({ vehicle: v, days, status: "WARNING" });
      } else if (days <= 30) {
        fcSafe++;
        fcAttentionList.push({ vehicle: v, days, status: "SAFE" });
      }
    });

    document.getElementById("fcSummaryExpired").innerText = fcExpired;
    document.getElementById("fcSummaryWarning").innerText = fcWarning;
    document.getElementById("fcSummarySafe").innerText = fcSafe;

    const tbody = document.getElementById("dashFcMiniTableBody");
    fcAttentionList.sort((a, b) => a.days - b.days);

    if (fcAttentionList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-2"><i class="bi bi-check-circle text-success me-1"></i> All vehicles have valid Fitness.</td></tr>`;
      return;
    }

    tbody.innerHTML = fcAttentionList.slice(0, 5).map(item => {
      let badgeClass = item.status === "EXPIRED" ? "cd-lapsed" : (item.status === "WARNING" ? "cd-fine" : "cd-safe");
      let text = item.days <= 0 ? (item.days === 0 ? "Today" : `${Math.abs(item.days)}d Over`) : `${item.days}d Left`;

      return `
        <tr>
          <td>
            <a href="reports.html?vehicle_id=${item.vehicle.vehicle_id}&doc=fc" class="reg-plate-link">
              ${this.escape(item.vehicle.registration_no)}
            </a>
          </td>
          <td class="font-monospace">${this.formatDisplayDate(item.vehicle.fc_expiry)}</td>
          <td><span class="countdown-pill ${badgeClass}">${text}</span></td>
        </tr>
      `;
    }).join("");
  },

  // Dedicated Permit Tracker Card (with 45-day window)
  renderPermitTracker() {
    let permitExpired = 0, permitWarning = 0, permitNotice = 0;
    const permitAttentionList = [];

    this.vehicles.forEach(v => {
      if (v.permit_applicable !== "Yes" || !v.permit_expiry) return;
      const days = this.getDaysLeft(v.permit_expiry);
      if (days === null) return;

      if (days <= 0) {
        permitExpired++;
        permitAttentionList.push({ vehicle: v, days, status: "EXPIRED" });
      } else if (days <= 15) {
        permitWarning++;
        permitAttentionList.push({ vehicle: v, days, status: "WARNING" });
      } else if (days > 30 && days <= 45) {
        permitNotice++;
        permitAttentionList.push({ vehicle: v, days, status: "NOTICE" });
      }
    });

    document.getElementById("permitSummaryExpired").innerText = permitExpired;
    document.getElementById("permitSummaryWarning").innerText = permitWarning;
    document.getElementById("permitSummaryNotice").innerText = permitNotice;

    const tbody = document.getElementById("dashPermitMiniTableBody");
    permitAttentionList.sort((a, b) => a.days - b.days);

    if (permitAttentionList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-2"><i class="bi bi-check-circle text-success me-1"></i> All permits are up to date.</td></tr>`;
      return;
    }

    tbody.innerHTML = permitAttentionList.slice(0, 5).map(item => {
      let badgeClass = item.status === "EXPIRED" ? "cd-lapsed" : (item.status === "WARNING" ? "cd-fine" : "cd-notice");
      let text = item.days <= 0 ? (item.days === 0 ? "Today" : `${Math.abs(item.days)}d Over`) : `${item.days}d Left`;

      return `
        <tr>
          <td>
            <a href="reports.html?vehicle_id=${item.vehicle.vehicle_id}&doc=permit" class="reg-plate-link">
              ${this.escape(item.vehicle.registration_no)}
            </a>
          </td>
          <td class="font-monospace">${this.formatDisplayDate(item.vehicle.permit_expiry)}</td>
          <td><span class="countdown-pill ${badgeClass}">${text}</span></td>
        </tr>
      `;
    }).join("");
  },

  // Road Tax Statutory Quarters
  renderTaxQuarters() {
    let q1 = 0, q2 = 0, q3 = 0, q4 = 0;
    let trackedCount = 0;
    const currentYear = new Date().getFullYear();

    this.vehicles.forEach(v => {
      if (v.tax_type === "Lifetime" || !v.road_tax_due) return;
      trackedCount++;

      const cleanDate = String(v.road_tax_due).split("T")[0];
      const parts = cleanDate.split("-");
      if (parts.length !== 3) return;

      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);

      if (month === 3 && day === 31) q1++;
      else if (month === 6 && day === 30) q2++;
      else if (month === 9 && day === 30) q3++;
      else if (month === 12 && day === 31) q4++;
      else {
        if (month <= 3) q1++;
        else if (month <= 6) q2++;
        else if (month <= 9) q3++;
        else q4++;
      }
    });

    document.getElementById("taxQ1Count").innerText = q1;
    document.getElementById("taxQ2Count").innerText = q2;
    document.getElementById("taxQ3Count").innerText = q3;
    document.getElementById("taxQ4Count").innerText = q4;
    document.getElementById("taxTotalTrackedText").innerText = `${trackedCount} Vehicles`;

    document.getElementById("linkTaxQ1").href = `reports.html?doc=tax&to=${currentYear}-03-31`;
    document.getElementById("linkTaxQ2").href = `reports.html?doc=tax&to=${currentYear}-06-30`;
    document.getElementById("linkTaxQ3").href = `reports.html?doc=tax&to=${currentYear}-09-30`;
    document.getElementById("linkTaxQ4").href = `reports.html?doc=tax&to=${currentYear}-12-31`;
  },

  // National Permit 15-Year Rule
  renderNpLifecycleWithDates() {
    const tbody = document.getElementById("dashNpLifecycleTableBody");
    const npVehicles = this.vehicles.filter(v => v.national_permit_applicable === "Yes" && v.date_of_registration);
    const actionable = [];

    npVehicles.forEach(v => {
      const regClean = String(v.date_of_registration).split("T")[0];
      const regDate = new Date(regClean);
      const now = new Date();
      const ageYears = (now.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

      if (ageYears >= 14) {
        actionable.push({
          vehicle: v,
          ageYears: parseFloat(ageYears.toFixed(1)),
          regDate: regClean,
          is15Plus: ageYears >= 15
        });
      }
    });

    actionable.sort((a, b) => b.ageYears - a.ageYears);

    if (actionable.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-2"><i class="bi bi-check-circle text-success me-1"></i> All National Permits are under 14 years old.</td></tr>`;
      return;
    }

    tbody.innerHTML = actionable.map(item => {
      const statusBadge = item.is15Plus 
        ? `<span class="badge bg-danger" style="font-size: 0.65rem;">🚨 GV Convert</span>`
        : `<span class="badge bg-warning text-dark" style="font-size: 0.65rem;">⚠️ Final Yr</span>`;

      return `
        <tr>
          <td>
            <a href="reports.html?vehicle_id=${item.vehicle.vehicle_id}&doc=np" class="reg-plate-link">
              ${this.escape(item.vehicle.registration_no)}
            </a>
          </td>
          <td class="font-monospace">${this.formatDisplayDate(item.regDate)}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join("");
  },

  // Customer Fleet Dashboard
  renderCustomerDashboard() {
    const tbody = document.getElementById("dashCustomerTableBody");

    const customerSummary = this.customers.map(c => {
      const clientVehicles = this.vehicles.filter(v => v.customer_id === c.id);
      const total = clientVehicles.length;

      let expired = 0, warning = 0;
      clientVehicles.forEach(v => {
        const d = v.min_days_remaining;
        if (v.compliance_status === "EXPIRED" || (d !== null && d <= 0)) expired++;
        else if (d !== null && d <= 15) warning++;
      });

      return { customer: c, total, expired, warning };
    });

    customerSummary.sort((a, b) => b.expired - a.expired || b.total - a.total);
    const activeClients = customerSummary.filter(item => item.total > 0);

    if (activeClients.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No active client fleets.</td></tr>`;
      return;
    }

    tbody.innerHTML = activeClients.slice(0, 8).map(item => `
      <tr>
        <td>
          <div class="fw-bold text-dark text-truncate" style="max-width: 140px;">${this.escape(item.customer.name)}</div>
          <small class="text-muted font-monospace">${this.escape(item.customer.mobile)}</small>
        </td>
        <td class="text-center fw-bold">${item.total}</td>
        <td class="text-center">
          ${item.expired > 0 ? `<span class="badge bg-danger">${item.expired}</span>` : '<span class="text-muted small">0</span>'}
        </td>
        <td class="text-center">
          ${item.warning > 0 ? `<span class="badge bg-warning text-dark">${item.warning}</span>` : '<span class="text-muted small">0</span>'}
        </td>
        <td class="text-end">
          <a href="reports.html?customer_id=${item.customer.id}" class="btn btn-sm btn-outline-primary py-0 px-2 fw-bold" style="font-size: 0.72rem;">
            Report &rarr;
          </a>
        </td>
      </tr>
    `).join("");
  },

  // Priority Action Queue
  filterPriorityQueue(filterType) {
    this.priorityQueueFilter = filterType;

    const btnMap = {
      ALL: { id: "pqBtnAll", active: "btn-dark", inactive: "btn-outline-dark" },
      OVERDUE: { id: "pqBtnOverdue", active: "btn-danger", inactive: "btn-outline-danger" },
      WARNING: { id: "pqBtnWarning", active: "btn-warning", inactive: "btn-outline-warning" },
      EXPIRING: { id: "pqBtnExpiring", active: "btn-success", inactive: "btn-outline-success" }
    };

    Object.keys(btnMap).forEach(key => {
      const btn = document.getElementById(btnMap[key].id);
      if (!btn) return;
      btn.className = `btn btn-sm ${key === filterType ? btnMap[key].active : btnMap[key].inactive} fw-bold py-1 px-2`;
    });

    this.renderPriorityQueue();
  },

  renderPriorityQueue() {
    const tbody = document.getElementById("dashUrgentTableBody");

    const priorityItems = this.vehicles
      .filter(v => v.min_days_remaining !== null && v.min_days_remaining <= 30)
      .map(v => {
        const days = v.min_days_remaining;
        let tier = "EXPIRING";
        if (days <= 0) tier = "OVERDUE";
        else if (days <= 15) tier = "WARNING";
        return { ...v, priorityTier: tier };
      });

    document.getElementById("pqCountAll").innerText = priorityItems.length;
    document.getElementById("pqCountOverdue").innerText = priorityItems.filter(v => v.priorityTier === "OVERDUE").length;
    document.getElementById("pqCountWarning").innerText = priorityItems.filter(v => v.priorityTier === "WARNING").length;
    document.getElementById("pqCountExpiring").innerText = priorityItems.filter(v => v.priorityTier === "EXPIRING").length;

    let visibleList = [...priorityItems];
    if (this.priorityQueueFilter !== "ALL") {
      visibleList = visibleList.filter(v => v.priorityTier === this.priorityQueueFilter);
    }

    visibleList.sort((a, b) => (a.min_days_remaining ?? 999) - (b.min_days_remaining ?? 999));

    if (visibleList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-success py-4"><i class="bi bi-check-circle me-1"></i> No vehicles found in this priority stage.</td></tr>`;
      return;
    }

    tbody.innerHTML = visibleList.slice(0, 10).map(v => {
      const waLink = this.generateWhatsAppLink(v);
      const days = v.min_days_remaining;

      let pillClass = "cd-clear";
      let pillText = `${days}d`;
      if (days <= 0) {
        pillClass = "cd-lapsed";
        pillText = days === 0 ? "Today" : `${Math.abs(days)}d Over`;
      } else if (days <= 15) {
        pillClass = "cd-fine";
        pillText = `${days}d Left`;
      } else {
        pillClass = "cd-safe";
        pillText = `${days}d Left`;
      }

      let criticalDate = "-";
      switch (v.critical_item) {
        case "FC": criticalDate = v.fc_expiry; break;
        case "Permit": criticalDate = v.permit_expiry; break;
        case "National Permit": criticalDate = v.national_permit_expiry; break;
        case "Road Tax": criticalDate = v.road_tax_due; break;
        case "Insurance": criticalDate = v.insurance_expiry; break;
        case "PUC": criticalDate = v.puc_expiry; break;
        case "Green Tax": criticalDate = v.green_tax_due; break;
      }

      return `
        <tr>
          <td>
            <a href="reports.html?vehicle_id=${v.vehicle_id}" class="reg-plate-link">
              ${this.escape(v.registration_no)}
            </a>
            <div class="text-muted small">${this.escape(v.vehicle_category || 'LGV')}</div>
          </td>
          <td>
            <div class="fw-bold text-dark text-truncate" style="max-width: 140px;">
              ${this.escape(v.customer_name || 'Individual')}
            </div>
            <div class="small font-monospace text-muted">${this.escape(v.customer_mobile || '-')}</div>
          </td>
          <td>
            <span class="badge bg-dark">${this.escape(v.critical_item || 'Document')}</span>
          </td>
          <td class="font-monospace fw-bold">
            ${this.formatDisplayDate(criticalDate)}
          </td>
          <td>
            <span class="countdown-pill ${pillClass}">${pillText}</span>
          </td>
          <td class="text-end">
            ${waLink ? `
              <a href="${waLink}" target="_blank" class="btn-whatsapp-icon" title="Send WhatsApp Message">
                <i class="bi bi-whatsapp"></i>
              </a>
            ` : '-'}
          </td>
        </tr>
      `;
    }).join("");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  Auth.requireAuth();
  Auth.initNavbarUser();
  DashboardController.init();
});