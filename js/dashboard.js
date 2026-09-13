/**
 * DashboardController Module with Full Customer Names & Single/Double-Click Actions
 */
const DashboardController = {
  vehicles: [],
  customers: [],
  priorityQueueFilter: "ALL",
  customerTableFilter: "ALL",
  currentHorizonDays: 30,
  activeTrackerFilters: { fc: "ALL", permit: "ALL", np: "ALL" },
  editModal: null,
  toast: null,

  init() {
    const toastEl = document.getElementById("liveToast");
    if (toastEl) {
      this.toast = new bootstrap.Toast(toastEl, { delay: 3500 });
    }
    const modalEl = document.getElementById("quickEditModal");
    if (modalEl) {
      this.editModal = new bootstrap.Modal(modalEl);
    }
    this.load();
  },

  showToast(message, type = "success") {
    if (!this.toast) return;
    const toastEl = document.getElementById("liveToast");
    const msgEl = document.getElementById("toastMessage");
    if (toastEl && msgEl) {
      toastEl.className = `toast align-items-center text-white border-0 shadow bg-${type === "error" ? "danger" : (type === "warning" ? "warning text-dark" : "dark")}`;
      msgEl.innerText = message;
      this.toast.show();
    }
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

  safeSetText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.innerText = text;
  },

  safeSetAttribute(elementId, attr, value) {
    const el = document.getElementById(elementId);
    if (el) el.setAttribute(attr, value);
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

    msgLines.push(``);
    msgLines.push(`Please arrange renewal to avoid penalties.`);

    const encodedText = encodeURIComponent(msgLines.join("\n"));
    return `https://wa.me/${formattedPhone}?text=${encodedText}`;
  },

  generateCustomerWhatsAppLink(customer, clientVehicles) {
    const primaryPhone = customer.mobile || "";
    if (!primaryPhone) return null;

    const cleanNumber = primaryPhone.replace(/\D/g, "");
    const formattedPhone = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;

    const urgentVehicles = clientVehicles.filter(v => v.min_days_remaining !== null && v.min_days_remaining <= 30);
    if (urgentVehicles.length === 0) return null;

    const msgLines = [];
    msgLines.push(`*FLEET COMPLIANCE SUMMARY: ${customer.name}*`);
    msgLines.push(`Total Vehicles: ${clientVehicles.length} | Pending/Expiring: ${urgentVehicles.length}`);
    msgLines.push(``);

    urgentVehicles.forEach(v => {
      const days = v.min_days_remaining;
      const statusText = days <= 0 ? `OVERDUE (${Math.abs(days)}d)` : `Due in ${days}d`;
      msgLines.push(`• *${v.registration_no}* (${v.critical_item || 'Doc'}): ${statusText}`);
    });

    msgLines.push(``);
    msgLines.push(`Kindly arrange renewals at your earliest convenience.`);

    const encodedText = encodeURIComponent(msgLines.join("\n"));
    return `https://wa.me/${formattedPhone}?text=${encodedText}`;
  },

  changeHorizon(days) {
    this.currentHorizonDays = parseInt(days, 10) || 30;
    this.renderPriorityQueue();
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

      this.renderHealthBar();
      this.renderMissingDocsBanner();
      this.renderDocumentBreakdowns();
      this.renderKPIs();
      this.renderFcTracker();
      this.renderPermitTracker();
      this.renderNpTracker();
      this.renderTaxQuarters();
      this.renderCustomerDashboard();
      this.renderPriorityQueue();
      this.renderActivityTicker();
    } catch (err) {
      this.showToast("Failed to load dashboard: " + err.message, "error");
    } finally {
      if (icon) icon.classList.remove("spin-animation");
    }
  },

  renderHealthBar() {
    const total = this.vehicles.length;
    if (total === 0) return;

    let valid = 0, warning = 0, overdue = 0;
    this.vehicles.forEach(v => {
      const d = v.min_days_remaining;
      if (v.compliance_status === "EXPIRED" || (d !== null && d <= 0)) overdue++;
      else if (d !== null && d <= 15) warning++;
      else valid++;
    });

    const validPct = Math.round((valid / total) * 100);
    const warningPct = Math.round((warning / total) * 100);
    const overduePct = Math.round((overdue / total) * 100);

    const barValid = document.getElementById("healthBarValid");
    const barWarning = document.getElementById("healthBarWarning");
    const barOverdue = document.getElementById("healthBarOverdue");

    if (barValid) barValid.style.width = `${validPct}%`;
    if (barWarning) barWarning.style.width = `${warningPct}%`;
    if (barOverdue) barOverdue.style.width = `${overduePct}%`;
    this.safeSetText("fleetHealthPercentText", `${validPct}% Roadworthy (${valid}/${total} Vehicles)`);
  },

  renderMissingDocsBanner() {
    let missingCount = 0;
    this.vehicles.forEach(v => {
      const missingPermit = v.permit_applicable === "Yes" && !v.permit_expiry;
      const missingNP = v.national_permit_applicable === "Yes" && !v.national_permit_expiry;
      const missingFC = !v.fc_expiry;
      const missingTax = v.tax_type !== "Lifetime" && !v.road_tax_due;
      const missingIns = !v.insurance_expiry;
      const missingPUC = !v.puc_expiry;

      if (missingPermit || missingNP || missingFC || missingTax || missingIns || missingPUC) {
        missingCount++;
      }
    });

    const banner = document.getElementById("missingDocsBanner");
    if (banner) {
      if (missingCount > 0) {
        this.safeSetText("missingDocsCount", missingCount);
        banner.classList.remove("d-none");
      } else {
        banner.classList.add("d-none");
      }
    }
  },

  renderActivityTicker() {
    const tickerBox = document.getElementById("recentActivityTicker");
    if (!tickerBox) return;

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const activities = [
      `[${nowStr}] Checked ${this.vehicles.length} vehicle compliance records across ${this.customers.length} clients.`
    ];

    const recentlyEdited = this.vehicles.find(v => v.last_updated);
    if (recentlyEdited) {
      activities.push(`[${nowStr}] Last updated record: Vehicle ${recentlyEdited.registration_no}.`);
    }

    tickerBox.innerHTML = activities.map(act => `<div class="activity-item"><i class="bi bi-dot text-primary"></i><span>${this.escape(act)}</span></div>`).join("");
  },

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

    this.safeSetText("docFcExpired", counts.fc.expired);
    this.safeSetText("docFcWarning", counts.fc.warning);
    this.safeSetText("docFcExpiring", counts.fc.expiring);

    this.safeSetText("docPermitExpired", counts.permit.expired);
    this.safeSetText("docPermitWarning", counts.permit.warning);
    this.safeSetText("docPermitExpiring", counts.permit.expiring);

    this.safeSetText("docNpExpired", counts.np.expired);
    this.safeSetText("docNpWarning", counts.np.warning);
    this.safeSetText("docNpExpiring", counts.np.expiring);

    this.safeSetText("docTaxExpired", counts.tax.expired);
    this.safeSetText("docTaxWarning", counts.tax.warning);
    this.safeSetText("docTaxExpiring", counts.tax.expiring);

    this.safeSetText("docGtaxExpired", counts.gtax.expired);
    this.safeSetText("docGtaxWarning", counts.gtax.warning);
    this.safeSetText("docGtaxExpiring", counts.gtax.expiring);

    this.safeSetText("docInsExpired", counts.ins.expired);
    this.safeSetText("docInsWarning", counts.ins.warning);
    this.safeSetText("docInsExpiring", counts.ins.expiring);

    this.safeSetText("docPucExpired", counts.puc.expired);
    this.safeSetText("docPucWarning", counts.puc.warning);
    this.safeSetText("docPucExpiring", counts.puc.expiring);
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

    this.safeSetText("kpiOverdueCount", overdue);
    this.safeSetText("kpiFineCount", fine);
    this.safeSetText("kpiSafeCount", safe);
    this.safeSetText("kpiNoticeCount", notice);
    this.safeSetText("kpiMissingCount", missing);
    this.safeSetText("kpiTotalVehicles", this.vehicles.length);
    this.safeSetText("kpiTotalCustomers", this.customers.length);
  },

  filterTracker(docKey, tier, btnEl) {
    if (this.activeTrackerFilters[docKey] === tier) {
      this.activeTrackerFilters[docKey] = "ALL";
      btnEl.classList.remove("border-dark", "shadow-sm");
    } else {
      this.activeTrackerFilters[docKey] = tier;
      const cardEl = btnEl.closest(".dash-card");
      if (cardEl) {
        cardEl.querySelectorAll(".btn-tier-filter").forEach(b => b.classList.remove("border-dark", "shadow-sm"));
        btnEl.classList.add("border-dark", "shadow-sm");
      }
    }

    if (docKey === 'fc') this.renderFcTracker();
    if (docKey === 'permit') this.renderPermitTracker();
    if (docKey === 'np') this.renderNpTracker();
  },

openQuickEditModal(type, recordId, fieldName, fieldLabel, currentValue) {
    document.getElementById("qeRecordId").value = recordId;
    document.getElementById("qeFieldType").value = type;
    document.getElementById("qeFieldName").value = fieldName || "";
    document.getElementById("qeLabel").innerText = `Update ${fieldLabel}`;

    const container = document.getElementById("qeInputContainer");
    const cleanVal = currentValue ? String(currentValue).split("T")[0] : "";

    if (type === "vehicle_date") {
      container.innerHTML = `<input type="date" id="qeInput" class="form-control form-control-sm fw-bold font-monospace" value="${cleanVal}" />`;
    } else {
      container.innerHTML = `<input type="text" id="qeInput" class="form-control form-control-sm fw-bold" value="${cleanVal}" />`;
    }
    
    if (this.editModal) {
      this.editModal.show();
    }
  },

  async executeQuickSave() {
    const recordId = document.getElementById("qeRecordId").value;
    const type = document.getElementById("qeFieldType").value;
    const fieldName = document.getElementById("qeFieldName").value;
    const newValue = document.getElementById("qeInput").value.trim();

    if (!newValue) {
      this.showToast("Value cannot be empty.", "warning");
      return;
    }

    try {
      if (type === "customer") {
        const cust = this.customers.find(c => c.id === recordId);
        if (!cust) return;
        const payload = { ...cust, name: newValue };
        await Api.request("/customers", "PUT", payload);
      } else if (type === "vehicle_date") {
        const vehicle = this.vehicles.find(v => v.vehicle_id === recordId);
        if (!vehicle) return;
        const payload = { ...vehicle, [fieldName]: newValue };
        await Api.request("/vehicles", "PUT", payload);
      }

      if (this.editModal) {
        this.editModal.hide();
      }
      this.showToast("Yes to save: Updated successfully!");
      await this.load();
    } catch (err) {
      this.showToast("Failed to save changes: " + err.message, "error");
    }
  },

  renderFcTracker() {
    let c0 = 0, c15 = 0, c30 = 0, c45 = 0;
    const list = [];

    this.vehicles.forEach(v => {
      if (!v.fc_expiry) return;
      const days = this.getDaysLeft(v.fc_expiry);
      if (days === null) return;

      if (days <= 0) { c0++; if (this.activeTrackerFilters.fc === 'ALL' || this.activeTrackerFilters.fc === '0d') list.push({ vehicle: v, days }); }
      else if (days <= 15) { c15++; if (this.activeTrackerFilters.fc === 'ALL' || this.activeTrackerFilters.fc === '15d') list.push({ vehicle: v, days }); }
      else if (days <= 30) { c30++; if (this.activeTrackerFilters.fc === 'ALL' || this.activeTrackerFilters.fc === '30d') list.push({ vehicle: v, days }); }
      else if (days <= 45) { c45++; if (this.activeTrackerFilters.fc === 'ALL' || this.activeTrackerFilters.fc === '45d') list.push({ vehicle: v, days }); }
    });

    this.safeSetText("fcSum0", c0);
    this.safeSetText("fcSum15", c15);
    this.safeSetText("fcSum30", c30);
    this.safeSetText("fcSum45", c45);

    const tbody = document.getElementById("dashFcMiniTableBody");
    if (!tbody) return;
    list.sort((a, b) => a.days - b.days);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-2">No vehicles in this tier.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.slice(0, 5).map(item => {
      let badgeClass = item.days <= 0 ? "cd-lapsed" : (item.days <= 15 ? "cd-fine" : "cd-safe");
      let text = item.days <= 0 ? (item.days === 0 ? "Today" : `${Math.abs(item.days)}d Over`) : `${item.days}d Left`;

      return `
        <tr ondblclick="window.location.href='reports.html?vehicle_id=${item.vehicle.vehicle_id}&doc=fc'" title="Double-click to open in Reports" style="cursor: pointer;">
          <td><span class="reg-plate-link">${this.escape(item.vehicle.registration_no)}</span></td>
          <td class="font-monospace" ondblclick="event.stopPropagation(); DashboardController.openQuickEditModal('vehicle_date', '${item.vehicle.vehicle_id}', 'fc_expiry', 'Fitness (FC) Expiry', '${item.vehicle.fc_expiry}')" title="Double-click date to edit">${this.formatDisplayDate(item.vehicle.fc_expiry)}</td>
          <td><span class="countdown-pill ${badgeClass}">${text}</span></td>
        </tr>
      `;
    }).join("");
  },

  renderPermitTracker() {
    let c0 = 0, c15 = 0, c30 = 0, c45 = 0;
    const list = [];

    this.vehicles.forEach(v => {
      if (v.permit_applicable !== "Yes" || !v.permit_expiry) return;
      const days = this.getDaysLeft(v.permit_expiry);
      if (days === null) return;

      if (days <= 0) { c0++; if (this.activeTrackerFilters.permit === 'ALL' || this.activeTrackerFilters.permit === '0d') list.push({ vehicle: v, days }); }
      else if (days <= 15) { c15++; if (this.activeTrackerFilters.permit === 'ALL' || this.activeTrackerFilters.permit === '15d') list.push({ vehicle: v, days }); }
      else if (days <= 30) { c30++; if (this.activeTrackerFilters.permit === 'ALL' || this.activeTrackerFilters.permit === '30d') list.push({ vehicle: v, days }); }
      else if (days <= 45) { c45++; if (this.activeTrackerFilters.permit === 'ALL' || this.activeTrackerFilters.permit === '45d') list.push({ vehicle: v, days }); }
    });

    this.safeSetText("permitSum0", c0);
    this.safeSetText("permitSum15", c15);
    this.safeSetText("permitSum30", c30);
    this.safeSetText("permitSum45", c45);

    const tbody = document.getElementById("dashPermitMiniTableBody");
    if (!tbody) return;
    list.sort((a, b) => a.days - b.days);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-2">No vehicles in this tier.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.slice(0, 5).map(item => {
      let badgeClass = item.days <= 0 ? "cd-lapsed" : (item.days <= 15 ? "cd-fine" : "cd-safe");
      let text = item.days <= 0 ? (item.days === 0 ? "Today" : `${Math.abs(item.days)}d Over`) : `${item.days}d Left`;

      return `
        <tr ondblclick="window.location.href='reports.html?vehicle_id=${item.vehicle.vehicle_id}&doc=permit'" title="Double-click to open in Reports" style="cursor: pointer;">
          <td><span class="reg-plate-link">${this.escape(item.vehicle.registration_no)}</span></td>
          <td class="font-monospace" ondblclick="event.stopPropagation(); DashboardController.openQuickEditModal('vehicle_date', '${item.vehicle.vehicle_id}', 'permit_expiry', 'Permit Expiry', '${item.vehicle.permit_expiry}')" title="Double-click date to edit">${this.formatDisplayDate(item.vehicle.permit_expiry)}</td>
          <td><span class="countdown-pill ${badgeClass}">${text}</span></td>
        </tr>
      `;
    }).join("");
  },

  renderNpTracker() {
    let c0 = 0, c15 = 0, c30 = 0, c45 = 0;
    const list = [];

    this.vehicles.forEach(v => {
      if (v.national_permit_applicable !== "Yes" || !v.national_permit_expiry) return;
      const days = this.getDaysLeft(v.national_permit_expiry);
      if (days === null) return;

      if (days <= 0) { c0++; if (this.activeTrackerFilters.np === 'ALL' || this.activeTrackerFilters.np === '0d') list.push({ vehicle: v, days }); }
      else if (days <= 15) { c15++; if (this.activeTrackerFilters.np === 'ALL' || this.activeTrackerFilters.np === '15d') list.push({ vehicle: v, days }); }
      else if (days <= 30) { c30++; if (this.activeTrackerFilters.np === 'ALL' || this.activeTrackerFilters.np === '30d') list.push({ vehicle: v, days }); }
      else if (days <= 45) { c45++; if (this.activeTrackerFilters.np === 'ALL' || this.activeTrackerFilters.np === '45d') list.push({ vehicle: v, days }); }
    });

    this.safeSetText("npSum0", c0);
    this.safeSetText("npSum15", c15);
    this.safeSetText("npSum30", c30);
    this.safeSetText("npSum45", c45);

    const tbody = document.getElementById("dashNpMiniTableBody");
    if (!tbody) return;
    list.sort((a, b) => a.days - b.days);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-2">No vehicles in this tier.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.slice(0, 5).map(item => {
      let badgeClass = item.days <= 0 ? "cd-lapsed" : (item.days <= 15 ? "cd-fine" : "cd-safe");
      let text = item.days <= 0 ? (item.days === 0 ? "Today" : `${Math.abs(item.days)}d Over`) : `${item.days}d Left`;

      return `
        <tr ondblclick="window.location.href='reports.html?vehicle_id=${item.vehicle.vehicle_id}&doc=np'" title="Double-click to open in Reports" style="cursor: pointer;">
          <td><span class="reg-plate-link">${this.escape(item.vehicle.registration_no)}</span></td>
          <td class="font-monospace" ondblclick="event.stopPropagation(); DashboardController.openQuickEditModal('vehicle_date', '${item.vehicle.vehicle_id}', 'national_permit_expiry', 'National Permit Expiry', '${item.vehicle.national_permit_expiry}')" title="Double-click date to edit">${this.formatDisplayDate(item.vehicle.national_permit_expiry)}</td>
          <td><span class="countdown-pill ${badgeClass}">${text}</span></td>
        </tr>
      `;
    }).join("");
  },

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

    this.safeSetText("taxQ1Count", q1);
    this.safeSetText("taxQ2Count", q2);
    this.safeSetText("taxQ3Count", q3);
    this.safeSetText("taxQ4Count", q4);
    this.safeSetText("taxTotalTrackedText", `${trackedCount} Vehicles`);

    this.safeSetAttribute("linkTaxQ1", "href", `reports.html?doc=tax&to=${currentYear}-03-31`);
    this.safeSetAttribute("linkTaxQ2", "href", `reports.html?doc=tax&to=${currentYear}-06-30`);
    this.safeSetAttribute("linkTaxQ3", "href", `reports.html?doc=tax&to=${currentYear}-09-30`);
    this.safeSetAttribute("linkTaxQ4", "href", `reports.html?doc=tax&to=${currentYear}-12-31`);
  },

  filterCustomerTable(filterType) {
    this.customerTableFilter = filterType;
    const btnAll = document.getElementById("custBtnAll");
    const btnTroubled = document.getElementById("custBtnTroubled");
    if (btnAll) btnAll.className = `btn btn-sm ${filterType === 'ALL' ? 'btn-dark' : 'btn-outline-dark'} fw-bold py-0 px-2`;
    if (btnTroubled) btnTroubled.className = `btn btn-sm ${filterType === 'TROUBLED' ? 'btn-danger' : 'btn-outline-danger'} fw-bold py-0 px-2`;
    this.renderCustomerDashboard();
  },

  renderCustomerDashboard() {
    const tbody = document.getElementById("dashCustomerTableBody");
    if (!tbody) return;

    const searchInput = document.getElementById("customerSearchInput");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const customerSummary = this.customers.map(c => {
      const clientVehicles = this.vehicles.filter(v => v.customer_id === c.id);
      const total = clientVehicles.length;

      let expired = 0, warning = 0;
      clientVehicles.forEach(v => {
        const d = v.min_days_remaining;
        if (v.compliance_status === "EXPIRED" || (d !== null && d <= 0)) expired++;
        else if (d !== null && d <= 15) warning++;
      });

      return { customer: c, clientVehicles, total, expired, warning };
    });

    customerSummary.sort((a, b) => b.expired - a.expired || b.total - a.total);
    
    let activeClients = customerSummary.filter(item => item.total > 0);

    if (query) {
      activeClients = activeClients.filter(item => 
        item.customer.name.toLowerCase().includes(query) || 
        String(item.customer.mobile || "").includes(query)
      );
    }

    if (this.customerTableFilter === "TROUBLED") {
      activeClients = activeClients.filter(item => item.expired > 0 || item.warning > 0);
    }

    if (activeClients.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No matching client fleets.</td></tr>`;
      return;
    }

    tbody.innerHTML = activeClients.slice(0, 8).map(item => {
      const waSummaryLink = this.generateCustomerWhatsAppLink(item.customer, item.clientVehicles);

      return `
        <tr ondblclick="DashboardController.openQuickEditModal('customer', '${item.customer.id}', '', 'Client Name', '${this.escape(item.customer.name)}')">
          <td>
            <div class="fw-bold text-dark" title="Double-click to edit client">${this.escape(item.customer.name)}</div>
            <small class="text-muted font-monospace">${this.escape(item.customer.mobile)}</small>
          </td>
          <td class="text-center fw-bold">${item.total}</td>
          <td class="text-center">
            ${item.expired > 0 ? `<span class="badge bg-danger">${item.expired}</span>` : '<span class="text-muted small">0</span>'}
          </td>
          <td class="text-end">
            <div class="d-flex gap-1 justify-content-end">
              ${waSummaryLink ? `
                <a href="${waSummaryLink}" target="_blank" class="btn-whatsapp-icon" title="Send Consolidated WhatsApp Fleet Notice">
                  <i class="bi bi-whatsapp"></i>
                </a>
              ` : ''}
              <a href="reports.html?customer_id=${item.customer.id}" class="btn btn-sm btn-outline-primary py-0 px-2 fw-bold" style="font-size: 0.72rem;">
                Report &rarr;
              </a>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  },

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
    if (!tbody) return;
    const horizon = this.currentHorizonDays;

    const priorityItems = this.vehicles
      .filter(v => v.min_days_remaining !== null && v.min_days_remaining <= horizon)
      .map(v => {
        const days = v.min_days_remaining;
        let tier = "EXPIRING";
        if (days <= 0) tier = "OVERDUE";
        else if (days <= 15) tier = "WARNING";
        return { ...v, priorityTier: tier };
      });

    this.safeSetText("pqCountAll", priorityItems.length);
    this.safeSetText("pqCountOverdue", priorityItems.filter(v => v.priorityTier === "OVERDUE").length);
    this.safeSetText("pqCountWarning", priorityItems.filter(v => v.priorityTier === "WARNING").length);
    this.safeSetText("pqCountExpiring", priorityItems.filter(v => v.priorityTier === "EXPIRING").length);

    let visibleList = [...priorityItems];
    if (this.priorityQueueFilter !== "ALL") {
      visibleList = visibleList.filter(v => v.priorityTier === this.priorityQueueFilter);
    }

    visibleList.sort((a, b) => (a.min_days_remaining ?? 999) - (b.min_days_remaining ?? 999));

    if (visibleList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-success py-4"><i class="bi bi-check-circle me-1"></i> No vehicles found within the ${horizon}-day horizon.</td></tr>`;
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
            <a href="reports.html?vehicle_id=${v.vehicle_id}" class="reg-plate-link">${this.escape(v.registration_no)}</a>
            <div class="text-muted small">${this.escape(v.vehicle_category || 'LGV')}</div>
          </td>
          <td>
            <div class="fw-bold text-dark text-truncate" style="max-width: 130px;">${this.escape(v.customer_name || 'Individual')}</div>
            <div class="small font-monospace text-muted">${this.escape(v.customer_mobile || '-')}</div>
          </td>
          <td><span class="badge bg-dark">${this.escape(v.critical_item || 'Document')}</span></td>
          <td class="font-monospace fw-bold">${this.formatDisplayDate(criticalDate)}</td>
          <td><span class="countdown-pill ${pillClass}">${pillText}</span></td>
          <td class="text-end">
            ${waLink ? `<a href="${waLink}" target="_blank" class="btn-whatsapp-icon" title="Send WhatsApp"><i class="bi bi-whatsapp"></i></a>` : '-'}
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