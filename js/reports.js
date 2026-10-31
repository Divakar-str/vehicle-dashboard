/**
 * ReportController Module - Master Executive Edition
 * - Cleaned typography: "A3817" (no Ch:), "12T" (no TYRE), "₹9,350 (QTR)" (no Tax:)
 * - 60-Day multi-tier color coding
 * - Multi-document combined blockers (e.g. "Pay Road Tax & Clear FC First")
 * - Completely suppresses DataTables 2.x search/paging in print
 */
const ReportController = {
  dataTable: null,
  vehicles: [],
  customers: [],
  filteredRows: [],
  activePreset: "ALL",
  targetVehicleId: null,
  targetRegNo: null,
  targetCustomerId: null,
  tomSelect: null,
  quickDateModal: null,
  quickRemarksModal: null,
  toast: null,

  tyreMatrix: {
    4: "LGV",
    6: "MGV",
    10: "HGV",
    12: "HGV",
    14: "HGV",
    16: "HGV",
    22: "HGV"
  },

  init() {
    const qDateEl = document.getElementById("quickDateModal");
    const qRemEl = document.getElementById("quickRemarksModal");
    const toastEl = document.getElementById("liveToast");

    if (qDateEl) this.quickDateModal = new bootstrap.Modal(qDateEl);
    if (qRemEl) this.quickRemarksModal = new bootstrap.Modal(qRemEl);
    if (toastEl) this.toast = new bootstrap.Toast(toastEl, { delay: 3500 });

    this.initDoubleTapDelegate();
    this.readUrlParameters();
    this.load();
  },

  initDoubleTapDelegate() {
    document.addEventListener("dblclick", (e) => {
      const target = e.target.closest("[data-quick-date]");
      if (target) {
        e.preventDefault();
        this.openQuickDate(
          target.getAttribute("data-vehicle-id"),
          target.getAttribute("data-field-key"),
          target.getAttribute("data-field-label"),
          target.getAttribute("data-date-str") || ""
        );
      }
    });
  },

  readUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    if (params.has("preset")) this.activePreset = params.get("preset").trim().toUpperCase();
    if (params.has("vehicle_id")) this.targetVehicleId = params.get("vehicle_id").trim();
    if (params.has("customer_id")) this.targetCustomerId = params.get("customer_id").trim();
    if (params.has("reg_no")) this.targetRegNo = params.get("reg_no").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

    document.querySelectorAll(".chip-btn").forEach(chip => {
      const onClickAttr = chip.getAttribute("onclick") || "";
      if (onClickAttr.includes(`'${this.activePreset}'`)) {
        document.querySelectorAll(".chip-btn").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
      }
    });
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

  normalizeIsoDate(dateVal) {
    if (!dateVal) return "";
    const raw = String(dateVal).trim().split("T")[0].split(" ")[0].replace(/\//g, "-");
    const parts = raw.split("-");
    if (parts.length === 3) {
      if (parts[0].length === 2 && parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    }
    return raw;
  },

  formatDisplayDate(dateStr) {
    if (!dateStr) return "-";
    const iso = this.normalizeIsoDate(dateStr);
    const parts = iso.split("-");
    return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : iso;
  },

  getDaysLeft(dateStr) {
    if (!dateStr) return null;
    const iso = this.normalizeIsoDate(dateStr);
    const parts = iso.split("-").map(Number);
    if (parts.length !== 3 || isNaN(parts[0])) return null;
    const target = new Date(parts[0], parts[1] - 1, parts[2]);
    const now = new Date();
    target.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  },

  getVehicleAge(regDateStr) {
    if (!regDateStr) return null;
    const iso = this.normalizeIsoDate(regDateStr);
    const parts = iso.split("-").map(Number);
    if (parts.length !== 3 || isNaN(parts[0])) return null;
    const regDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const now = new Date();
    let age = now.getFullYear() - regDate.getFullYear();
    const m = now.getMonth() - regDate.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < regDate.getDate())) age--;
    return age;
  },

  resolveCategory(tyres, recordedCategory) {
    const validCats = ["LGV", "MGV", "HGV", "LPV", "MPV", "LMV"];
    if (recordedCategory && validCats.includes(recordedCategory.toUpperCase())) {
      return recordedCategory.toUpperCase();
    }
    if (!tyres) return "LGV";
    const num = parseInt(String(tyres).replace(/\D/g, ""), 10);
    return this.tyreMatrix[num] || "LGV";
  },

  /**
   * Chain Dependency Evaluator with Combined Action Strings
   */
  evaluateComplianceChain(v) {
    const age = this.getVehicleAge(v.date_of_registration);
    const gTaxDays = this.getDaysLeft(v.green_tax_due);
    const roadTaxDays = this.getDaysLeft(v.road_tax_due);
    const fcDays = this.getDaysLeft(v.fc_expiry);
    const permitDays = this.getDaysLeft(v.permit_expiry);
    const npDays = this.getDaysLeft(v.national_permit_expiry);

    const isGTaxExpired = gTaxDays !== null && gTaxDays <= 0;
    const isRoadTaxExpired = roadTaxDays !== null && roadTaxDays <= 0;
    const isFcExpired = fcDays !== null && fcDays <= 0;
    const isPermitExpired = v.permit_applicable === "Yes" && (permitDays === null || permitDays <= 0);
    const isNpExpired = v.national_permit_applicable === "Yes" && (npDays === null || npDays <= 0);

    let rootBlocker = null;
    let npStatus = "READY";
    let statePermitStatus = "READY";

    if (age !== null && age >= 15) {
      rootBlocker = "Vehicle Age 15+ (Permits Barred)";
      npStatus = "BARRED_AGE";
      statePermitStatus = "BARRED_AGE";
    } else {
      const blockers = [];
      if (isGTaxExpired) blockers.push("Green Tax");
      if (isRoadTaxExpired) blockers.push("Road Tax");
      if (isFcExpired) blockers.push("FC");
      if (isPermitExpired) blockers.push("State Permit");
      if (isNpExpired) blockers.push("National Permit");

      if (blockers.length >= 2) {
        rootBlocker = `Pay ${blockers[0]} & Clear ${blockers[1]} First`;
        npStatus = "BLOCKED";
        statePermitStatus = "BLOCKED";
      } else if (blockers.length === 1) {
        if (isGTaxExpired) rootBlocker = "Pay Green Tax First";
        else if (isRoadTaxExpired) rootBlocker = "Pay Road Tax First";
        else if (isFcExpired) rootBlocker = "Clear Fitness (FC) First";
        else if (isPermitExpired) rootBlocker = "Renew State Permit First";
        else if (isNpExpired) rootBlocker = "Renew National Permit";
        npStatus = "BLOCKED";
        statePermitStatus = "BLOCKED";
      }
    }

    const missingMandatory = [];
    const missingOptional = [];

    if (v.permit_applicable === "Yes" && !v.permit_expiry) missingMandatory.push("State Permit Missing");
    if (v.national_permit_applicable === "Yes" && !v.national_permit_expiry) missingMandatory.push("National Permit Missing");
    if (!v.fc_expiry) missingMandatory.push("FC Missing");
    if (v.tax_type !== "Lifetime" && !v.road_tax_due) missingMandatory.push("Road Tax Missing");

    if (!v.insurance_expiry) missingOptional.push("Insurance Pending");
    if (!v.puc_expiry) missingOptional.push("PUC Pending");

    const allMissing = [...missingMandatory, ...missingOptional];

    const mandatoryDays = [];
    if (gTaxDays !== null) mandatoryDays.push(gTaxDays);
    if (roadTaxDays !== null) mandatoryDays.push(roadTaxDays);
    if (fcDays !== null) mandatoryDays.push(fcDays);
    if (v.permit_applicable === "Yes" && permitDays !== null) mandatoryDays.push(permitDays);
    if (v.national_permit_applicable === "Yes" && npDays !== null) mandatoryDays.push(npDays);

    const minDays = mandatoryDays.length > 0 ? Math.min(...mandatoryDays) : null;

    return {
      age,
      rootBlocker,
      npStatus,
      statePermitStatus,
      missingMandatory,
      missingOptional,
      allMissing,
      minDays,
      isAnyExpired: minDays !== null && minDays <= 0
    };
  },

  generateWhatsAppLink(v) {
    const cust = this.customers.find(c => String(c.id) === String(v.customer_id)) || {};
    const primaryPhone = cust.mobile || v.customer_mobile || "";
    if (!primaryPhone) return null;

    let cleanNumber = String(primaryPhone).replace(/\D/g, "");
    if (cleanNumber.length === 11 && cleanNumber.startsWith("0")) cleanNumber = cleanNumber.slice(1);
    const formattedPhone = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;

    const lines = [];
    lines.push(`*VEHICLE RENEWAL REMINDER: ${v.registration_no}*`);
    lines.push(`Customer: ${cust.name || v.owner_name}`);
    lines.push(``);
    lines.push(`*Upcoming Expiry Dates:*`);
    if (v.permit_applicable === "Yes") lines.push(`- State Permit: ${this.formatDisplayDate(v.permit_expiry)}`);
    if (v.national_permit_applicable === "Yes") lines.push(`- National Permit: ${this.formatDisplayDate(v.national_permit_expiry)}`);
    lines.push(`- Fitness Certificate: ${this.formatDisplayDate(v.fc_expiry)}`);
    lines.push(`- Road Tax: ${v.tax_type === "Lifetime" ? "Lifetime Paid" : this.formatDisplayDate(v.road_tax_due)}`);
    if (v.green_tax_due) lines.push(`- Green Tax: ${this.formatDisplayDate(v.green_tax_due)}`);
    if (v.insurance_expiry) lines.push(`- Insurance: ${this.formatDisplayDate(v.insurance_expiry)}`);
    if (v.puc_expiry) lines.push(`- Pollution (PUC): ${this.formatDisplayDate(v.puc_expiry)}`);

    if (v.chainEval.rootBlocker) {
      lines.push(``);
      lines.push(`*Action Required:* ${v.chainEval.rootBlocker}`);
    }

    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(lines.join("\n"))}`;
  },

  async load() {
    const icon = document.getElementById("refreshIcon");
    if (icon) icon.classList.add("fa-spin");

    try {
      const cacheBust = `?_nocache=${Date.now()}`;
      const [vData, cData] = await Promise.all([
        Api.request(`/vehicles${cacheBust}`),
        Api.request(`/customers${cacheBust}`)
      ]);

      this.vehicles = vData || [];
      this.customers = cData || [];

      this.setupCustomerSelect();
      this.applyFilters();
    } catch (err) {
      this.showToast("Failed to load records: " + err.message, "error");
    } finally {
      if (icon) icon.classList.remove("fa-spin");
    }
  },

  setupCustomerSelect() {
    const select = document.getElementById("reportCustomerSelect");
    if (!select) return;
    if (this.tomSelect) {
      this.tomSelect.destroy();
      this.tomSelect = null;
    }

    select.innerHTML = '<option value="">All Customers / Firms</option>' +
      this.customers.map(c => `<option value="${c.id}">${this.escape(c.name)} (${this.escape(c.mobile)})</option>`).join("");

    this.tomSelect = new TomSelect("#reportCustomerSelect", {
      create: false,
      maxItems: 1,
      placeholder: "Search customer...",
      onChange: () => ReportController.applyFilters()
    });

    if (this.targetCustomerId && this.tomSelect) {
      this.tomSelect.setValue(this.targetCustomerId, true);
    }
  },

  resetDates() {
    document.getElementById("dateFilterFrom").value = "";
    document.getElementById("dateFilterTo").value = "";
    this.targetVehicleId = null;
    this.targetRegNo = null;
    this.applyFilters();
  },

  setQuickPreset(presetVal, chipEl) {
    document.querySelectorAll(".chip-btn").forEach(c => c.classList.remove("active"));
    if (chipEl) chipEl.classList.add("active");
    this.activePreset = presetVal;
    this.applyFilters();
  },

  applyFilters() {
    const custId = document.getElementById("reportCustomerSelect")?.value || "";
    const catVal = document.getElementById("reportCategoryFilter")?.value || "";
    const permitRule = document.getElementById("reportPermitFilter")?.value || "ALL";
    const dateFrom = document.getElementById("dateFilterFrom")?.value || "";
    const dateTo = document.getElementById("dateFilterTo")?.value || "";
    const preset = this.activePreset;

    let list = this.vehicles.filter(v => (v.active_status || "Active") === "Active");

    if (this.targetVehicleId) {
      list = list.filter(v => String(v.vehicle_id) === String(this.targetVehicleId));
    }
    if (this.targetRegNo) {
      list = list.filter(v => (v.registration_no || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === this.targetRegNo);
    }
    if (custId) {
      list = list.filter(v => String(v.customer_id) === String(custId));
    }
    if (catVal) {
      list = list.filter(v => this.resolveCategory(v.no_of_tyres, v.vehicle_category) === catVal);
    }

    if (permitRule === "PERMIT_ONLY") {
      list = list.filter(v => v.permit_applicable === "Yes" && v.national_permit_applicable !== "Yes");
      document.getElementById("col_permit").checked = true;
      document.getElementById("col_np").checked = false;
    } else if (permitRule === "NP_ONLY") {
      list = list.filter(v => v.national_permit_applicable === "Yes");
      document.getElementById("col_np").checked = true;
    } else if (permitRule === "BOTH_PERMIT") {
      list = list.filter(v => v.permit_applicable === "Yes" && v.national_permit_applicable === "Yes");
      document.getElementById("col_permit").checked = true;
      document.getElementById("col_np").checked = true;
    } else if (permitRule === "NO_PERMIT") {
      list = list.filter(v => v.permit_applicable !== "Yes" && v.national_permit_applicable !== "Yes");
      document.getElementById("col_permit").checked = false;
      document.getElementById("col_np").checked = false;
    }

    if (dateFrom || dateTo) {
      list = list.filter(v => {
        const dates = [v.permit_expiry, v.national_permit_expiry, v.fc_expiry, v.road_tax_due, v.green_tax_due, v.insurance_expiry, v.puc_expiry].filter(Boolean);
        return dates.some(d => {
          const iso = this.normalizeIsoDate(d);
          if (dateFrom && iso < dateFrom) return false;
          if (dateTo && iso > dateTo) return false;
          return true;
        });
      });
    }

    list = list.map(v => {
      const evaluation = this.evaluateComplianceChain(v);
      return Object.assign({}, v, {
        derivedCategory: this.resolveCategory(v.no_of_tyres, v.vehicle_category),
        chainEval: evaluation
      });
    });

    if (preset === "MISSING_ONLY") {
      list = list.filter(v => v.chainEval.allMissing && v.chainEval.allMissing.length > 0);
    } else if (preset === "OVERDUE") {
      list = list.filter(v => v.chainEval.minDays !== null && v.chainEval.minDays <= 0);
    } else if (preset === "CRITICAL_7") {
      list = list.filter(v => v.chainEval.minDays !== null && v.chainEval.minDays > 0 && v.chainEval.minDays <= 7);
    } else if (preset === "UPCOMING_15") {
      list = list.filter(v => v.chainEval.minDays !== null && v.chainEval.minDays > 7 && v.chainEval.minDays <= 15);
    } else if (preset === "WINDOW_30") {
      list = list.filter(v => v.chainEval.minDays !== null && v.chainEval.minDays > 15 && v.chainEval.minDays <= 30);
    } else if (preset === "WINDOW_45") {
      list = list.filter(v => v.chainEval.minDays !== null && v.chainEval.minDays > 30 && v.chainEval.minDays <= 45);
    } else if (preset === "WINDOW_60") {
      list = list.filter(v => v.chainEval.minDays !== null && v.chainEval.minDays > 45 && v.chainEval.minDays <= 60);
    } else if (preset === "BLOCKED_ONLY") {
      list = list.filter(v => v.chainEval.npStatus === "BLOCKED" || v.chainEval.statePermitStatus === "BLOCKED");
    } else if (preset === "AGE_BARRED") {
      list = list.filter(v => v.chainEval.age !== null && v.chainEval.age >= 15);
    }

    this.filteredRows = list;
    this.renderDataTable();
  },

  renderDateCell(vehicleId, fieldName, fieldLabel, dateStr, isApplicable = true, showRemDays = false) {
    if (!isApplicable) return '<span class="text-muted font-mono" style="font-size:0.75rem;">N/A</span>';
    const iso = this.normalizeIsoDate(dateStr);

    if (!iso) {
      return `
        <div class="date-box">
          <span class="date-unset" title="Double-click to set date" data-quick-date="1" data-vehicle-id="${this.escape(vehicleId)}" data-field-key="${this.escape(fieldName)}" data-field-label="${this.escape(fieldLabel)}">-</span>
        </div>
      `;
    }

    const days = this.getDaysLeft(iso);
    let colorClass = "date-safe";

    if (days !== null) {
      if (days <= 0) colorClass = "date-overdue";
      else if (days <= 7) colorClass = "date-crit";
      else if (days <= 15) colorClass = "date-soon";
      else if (days <= 30) colorClass = "date-warn";
      else if (days <= 60) colorClass = "date-notice";
    }

    return `
      <div class="date-box">
        <span class="date-val ${colorClass}" title="Double-click to update or advance" data-quick-date="1" data-vehicle-id="${this.escape(vehicleId)}" data-field-key="${this.escape(fieldName)}" data-field-label="${this.escape(fieldLabel)}" data-date-str="${this.escape(iso)}">
          ${this.formatDisplayDate(iso)}
        </span>
      </div>
    `;
  },

  renderDataTable() {
    const badge = document.getElementById("reportCountBadge");
    if (badge) badge.innerText = `${this.filteredRows.length} Vehicles`;

    const getVal = (id) => document.getElementById(id)?.checked || false;
    const showAge = getVal("fld_age");
    const showEngine = getVal("fld_engine");
    const showAudit = getVal("fld_audit");
    const showAltContacts = getVal("fld_alt_contacts");
    const showRemDays = getVal("fld_rem_days");

    const showPermit = getVal("col_permit");
    const showNP = getVal("col_np");
    const showFC = getVal("col_fc");
    const showTax = getVal("col_tax");
    const showGTax = getVal("col_gtax");
    const showIns = getVal("col_ins");
    const showPUC = getVal("col_puc");

    if ($.fn.DataTable.isDataTable("#reportDataTable")) {
      this.dataTable.destroy();
      $("#reportDataTable").empty();
    }

    const columns = [
      {
        title: "Vehicle Details",
        className: "col-veh",
        data: null,
        render: (d, t, row) => {
          const cat = row.derivedCategory || "LGV";
          const catBadge = `<span class="cat-badge cat-${cat}">${cat}</span>`;
          
          // Pure values without extra text prefixes
          const tyresClean = row.no_of_tyres ? `${String(row.no_of_tyres).replace(/\D/g, "")}T` : "4T";
          const chassisClean = row.chassis_no ? ReportController.escape(row.chassis_no) : "-";
          const taxAmtClean = row.tax_amount ? `₹${Number(row.tax_amount).toLocaleString("en-IN")}` : "";
          const taxTypeClean = row.tax_type === "Lifetime" ? "LTT" : (row.tax_type || "QTR");

          const engineStr = (showEngine && row.engine_no) ? `<div class="font-mono text-muted" style="font-size:0.67rem;">${ReportController.escape(row.engine_no)}</div>` : "";
          const ageStr = (showAge && row.chainEval.age !== null) ? `<span class="text-secondary font-mono">(${row.chainEval.age}y)</span>` : "";
          const auditCreated = (showAudit && row.created_date) ? `<div class="text-muted font-mono" style="font-size:0.62rem;">${this.normalizeIsoDate(row.created_date)}</div>` : "";

          return `
            <div class="veh-block">
              <!-- ROW 1: REG NUMBER + CATEGORY -->
              <div class="veh-row1">
                <span class="veh-reg font-mono">${ReportController.escape(row.registration_no)}</span>
                ${catBadge} ${ageStr}
              </div>
              <!-- ROW 2: CHASSIS NO + TYRES -->
              <div class="veh-row2 font-mono">
                ${chassisClean} &bull; ${tyresClean}
              </div>
              <!-- ROW 3: TAX AMOUNT + TYPE -->
              <div class="veh-row3 font-mono">
                ${taxAmtClean} ${taxTypeClean}
              </div>
              ${engineStr}
              ${auditCreated}
            </div>
          `;
        }
      },
      {
        title: "Owner / Contacts",
        className: "col-owner",
        data: null,
        render: (d, t, row) => {
          const cust = ReportController.customers.find(c => String(c.id) === String(row.customer_id)) || {};
          const p1 = cust.mobile || row.customer_mobile;
          const waLink = ReportController.generateWhatsAppLink(row);

          return `
            <div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="fw-bold text-dark text-truncate" style="max-width: 120px;">${ReportController.escape(cust.name || row.owner_name)}</span>
                ${waLink ? `<a href="${waLink}" target="_blank" class="text-success ms-1 d-print-none" title="Send WhatsApp Notice"><i class="bi bi-whatsapp"></i></a>` : ""}
              </div>
              <div class="text-muted small">${ReportController.escape(row.owner_name)}</div>
              ${p1 ? `<div class="font-mono" style="font-size:0.75rem;"><a href="tel:${p1}" class="text-decoration-none text-primary fw-bold"><i class="bi bi-telephone-fill me-1"></i>${ReportController.escape(p1)}</a></div>` : ""}
              ${showAltContacts && cust.mobile_2 ? `<div class="font-mono text-muted" style="font-size:0.67rem;"><a href="tel:${cust.mobile_2}" class="text-secondary text-decoration-none">${ReportController.escape(cust.mobile_2)}</a></div>` : ""}
              ${showAltContacts && cust.mobile_3 ? `<div class="font-mono text-muted" style="font-size:0.67rem;"><a href="tel:${cust.mobile_3}" class="text-secondary text-decoration-none">${ReportController.escape(cust.mobile_3)}</a></div>` : ""}
            </div>
          `;
        }
      }
    ];

    if (showPermit) {
      columns.push({
        title: "State Permit",
        className: "col-doc",
        data: null,
        render: (d, t, row) => ReportController.renderDateCell(row.vehicle_id, "permit_expiry", "State Permit", row.permit_expiry, row.permit_applicable === "Yes", showRemDays)
      });
    }

    if (showNP) {
      columns.push({
        title: "NP",
        className: "col-doc",
        data: null,
        render: (d, t, row) => {
          if (row.chainEval.age !== null && row.chainEval.age >= 15) {
            return '<span class="badge bg-danger font-mono" style="font-size:0.65rem;">BARRED 15y+</span>';
          }
          return ReportController.renderDateCell(row.vehicle_id, "national_permit_expiry", "National Permit", row.national_permit_expiry, row.national_permit_applicable === "Yes", showRemDays);
        }
      });
    }

    if (showFC) {
      columns.push({
        title: "Fitness (FC)",
        className: "col-doc",
        data: null,
        render: (d, t, row) => ReportController.renderDateCell(row.vehicle_id, "fc_expiry", "Fitness (FC)", row.fc_expiry, true, showRemDays)
      });
    }

    if (showTax) {
      columns.push({
        title: "Road Tax",
        className: "col-doc",
        data: null,
        render: (d, t, row) => {
          if (row.tax_type === "Lifetime") return '<span class="badge bg-secondary font-mono" style="font-size:0.68rem;">LTT</span>';
          return ReportController.renderDateCell(row.vehicle_id, "road_tax_due", "Road Tax", row.road_tax_due, true, showRemDays);
        }
      });
    }

    if (showGTax) {
      columns.push({
        title: "Green Tax",
        className: "col-doc",
        data: null,
        render: (d, t, row) => ReportController.renderDateCell(row.vehicle_id, "green_tax_due", "Green Tax", row.green_tax_due, Boolean(row.green_tax_due), showRemDays)
      });
    }

    if (showIns) {
      columns.push({
        title: "Insurance",
        className: "col-doc",
        data: null,
        render: (d, t, row) => ReportController.renderDateCell(row.vehicle_id, "insurance_expiry", "Insurance", row.insurance_expiry, true, showRemDays)
      });
    }

    if (showPUC) {
      columns.push({
        title: "Pollution",
        className: "col-doc",
        data: null,
        render: (d, t, row) => ReportController.renderDateCell(row.vehicle_id, "puc_expiry", "PUC", row.puc_expiry, true, showRemDays)
      });
    }

    columns.push({
      title: "Action Required & Remarks",
      className: "col-act",
      data: null,
      render: (d, t, row) => {
        let actionHtml = "";
        if (row.chainEval.rootBlocker) {
          actionHtml = `<div class="chain-alert chain-blocked"><i class="fa fa-exclamation-triangle me-1"></i>${ReportController.escape(row.chainEval.rootBlocker)}</div>`;
        } else {
          actionHtml = `<div class="chain-alert chain-ready"><i class="fa fa-check me-1"></i>All Papers Up to Date</div>`;
        }

        let missingHtml = "";
        if (row.chainEval.allMissing && row.chainEval.allMissing.length > 0) {
          const pills = [];
          (row.chainEval.missingMandatory || []).forEach(m => pills.push(`<span class="missing-pill missing-mandatory">${m}</span>`));
          (row.chainEval.missingOptional || []).forEach(o => pills.push(`<span class="missing-pill missing-opt">${o}</span>`));
          missingHtml = `<div class="mt-1 d-flex flex-wrap gap-1">${pills.join("")}</div>`;
        }

        return `
          <div>
            ${actionHtml}
            ${missingHtml}
            <div class="small text-muted mt-0.5 text-truncate" style="max-width: 170px;" ondblclick="ReportController.openQuickRemarks('${row.vehicle_id}', '${ReportController.escape(row.remarks || '')}')">
              ${row.remarks ? ReportController.escape(row.remarks) : '<span class="text-black-50">-</span>'}
            </div>
          </div>
        `;
      }
    });

    this.dataTable = $("#reportDataTable").DataTable({
      data: this.filteredRows,
      columns: columns,
      paging: true,
      pageLength: 10,
      searching: true,
      ordering: true,
      info: true,
      autoWidth: false,
      deferRender: true
    });
  },

  openQuickDate(vehicleId, fieldName, fieldLabel, currentDate) {
    const iso = this.normalizeIsoDate(currentDate);
    const vehicle = this.vehicles.find(v => String(v.vehicle_id) === String(vehicleId));
    if (!vehicle) return;

    document.getElementById("qd_vehicle_id").value = vehicleId;
    document.getElementById("qd_field_name").value = fieldName;
    document.getElementById("qd_original_val").value = iso;
    document.getElementById("qd_label").innerText = `Update ${fieldLabel}`;
    document.getElementById("qd_input").value = iso;

    document.getElementById("qd_diff_old").innerText = iso ? this.formatDisplayDate(iso) : "(Blank)";
    document.getElementById("qd_diff_new").innerText = iso ? this.formatDisplayDate(iso) : "(Blank)";

    const shortcutsContainer = document.getElementById("qd_advance_shortcuts");
    shortcutsContainer.innerHTML = "";

    const age = this.getVehicleAge(vehicle.date_of_registration);

    if (fieldName === "road_tax_due") {
      const nextQtr = this.getNextQuarterEnd(iso);
      shortcutsContainer.innerHTML += `
        <button type="button" class="btn btn-outline-primary btn-sm py-0 px-2 fw-bold" onclick="ReportController.setQuickInputDate('${nextQtr}')">
          Next Qtr: ${this.formatDisplayDate(nextQtr)}
        </button>
      `;
    } else if (fieldName === "fc_expiry") {
      const addYears = (age !== null && age < 8) ? 2 : 1;
      const nextFc = this.addYearsToDate(iso || new Date().toISOString(), addYears);
      shortcutsContainer.innerHTML += `
        <button type="button" class="btn btn-outline-primary btn-sm py-0 px-2 fw-bold" onclick="ReportController.setQuickInputDate('${nextFc}')">
          +${addYears}y: ${this.formatDisplayDate(nextFc)}
        </button>
      `;
    } else if (fieldName === "permit_expiry") {
      const nextPermit = this.addYearsToDate(iso || new Date().toISOString(), 5);
      shortcutsContainer.innerHTML += `
        <button type="button" class="btn btn-outline-primary btn-sm py-0 px-2 fw-bold" onclick="ReportController.setQuickInputDate('${nextPermit}')">
          +5y: ${this.formatDisplayDate(nextPermit)}
        </button>
      `;
    } else if (fieldName === "national_permit_expiry") {
      if (age !== null && age >= 15) {
        shortcutsContainer.innerHTML = `<span class="text-danger small fw-bold">15+ Yrs: Cannot advance NP</span>`;
      } else {
        const nextNp = this.addYearsToDate(iso || new Date().toISOString(), 1);
        shortcutsContainer.innerHTML += `
          <button type="button" class="btn btn-outline-primary btn-sm py-0 px-2 fw-bold" onclick="ReportController.setQuickInputDate('${nextNp}')">
            +1y: ${this.formatDisplayDate(nextNp)}
          </button>
        `;
      }
    } else {
      const next1Yr = this.addYearsToDate(iso || new Date().toISOString(), 1);
      shortcutsContainer.innerHTML += `
        <button type="button" class="btn btn-outline-primary btn-sm py-0 px-2 fw-bold" onclick="ReportController.setQuickInputDate('${next1Yr}')">
          +1y: ${this.formatDisplayDate(next1Yr)}
        </button>
      `;
    }

    this.quickDateModal.show();
  },

  onDateInputChange() {
    const newVal = document.getElementById("qd_input").value;
    document.getElementById("qd_diff_new").innerText = newVal ? this.formatDisplayDate(newVal) : "(Cleared / Blank)";
  },

  setQuickInputDate(newIsoDate) {
    document.getElementById("qd_input").value = newIsoDate;
    this.onDateInputChange();
  },

  clearInput(id) {
    const el = document.getElementById(id);
    if (el) el.value = "";
    this.onDateInputChange();
  },

  getNextQuarterEnd(baseDateStr) {
    const iso = this.normalizeIsoDate(baseDateStr);
    let y, m;
    if (iso) {
      const parts = iso.split("-").map(Number);
      y = parts[0];
      m = parts[1];
    } else {
      const now = new Date();
      y = now.getFullYear();
      m = now.getMonth() + 1;
    }
    if (m <= 3) return `${y}-06-30`;
    if (m <= 6) return `${y}-09-30`;
    if (m <= 9) return `${y}-12-31`;
    return `${y + 1}-03-31`;
  },

  addYearsToDate(baseDateStr, yearsToAdd) {
    const iso = this.normalizeIsoDate(baseDateStr);
    let y, m, d;
    if (iso) {
      const parts = iso.split("-");
      y = parseInt(parts[0], 10) + yearsToAdd;
      m = parts[1];
      d = parts[2];
    } else {
      const now = new Date();
      y = now.getFullYear() + yearsToAdd;
      m = String(now.getMonth() + 1).padStart(2, "0");
      d = String(now.getDate()).padStart(2, "0");
    }
    return `${y}-${m}-${d}`;
  },

  async saveQuickDate() {
    const vehicleId = document.getElementById("qd_vehicle_id").value;
    const fieldName = document.getElementById("qd_field_name").value;
    const newDate = document.getElementById("qd_input").value;
    const vehicle = this.vehicles.find(v => String(v.vehicle_id) === String(vehicleId));
    if (!vehicle) return;

    try {
      const payload = Object.assign({}, vehicle, {
        [fieldName]: newDate || null,
        updated_date: new Date().toISOString(),
        last_updated: new Date().toISOString()
      });
      await Api.request("/vehicles", "PUT", payload);
      this.quickDateModal.hide();
      this.showToast(`Updated date for ${vehicle.registration_no}`);
      await this.load();
    } catch (err) {
      this.showToast("Failed to update date: " + err.message, "error");
    }
  },

  openQuickRemarks(vehicleId, remarks) {
    document.getElementById("qr_vehicle_id").value = vehicleId;
    document.getElementById("qr_input").value = remarks || "";
    this.quickRemarksModal.show();
  },

  async saveQuickRemarks() {
    const vehicleId = document.getElementById("qr_vehicle_id").value;
    const remarks = document.getElementById("qr_input").value.trim();
    const vehicle = this.vehicles.find(v => String(v.vehicle_id) === String(vehicleId));
    if (!vehicle) return;

    try {
      const payload = Object.assign({}, vehicle, {
        remarks: remarks || null,
        updated_date: new Date().toISOString(),
        last_updated: new Date().toISOString()
      });
      await Api.request("/vehicles", "PUT", payload);
      this.quickRemarksModal.hide();
      this.showToast(`Updated remarks for ${vehicle.registration_no}`);
      await this.load();
    } catch (err) {
      this.showToast("Failed to update remarks: " + err.message, "error");
    }
  },

  printReport() {
    const stamp = document.getElementById("printDateStamp");
    if (stamp) stamp.innerText = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

    if (this.dataTable) {
      const origLength = this.dataTable.page.len();
      this.dataTable.page.len(-1).draw();
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          this.dataTable.page.len(origLength).draw();
        }, 500);
      }, 700);
    } else {
      window.print();
    }
  },

  exportCSV() {
    if (this.filteredRows.length === 0) {
      this.showToast("No data to export", "warning");
      return;
    }
    const headers = [
      "Registration No", "Category", "Tyres", "Tax Amount", "Tax Type", "Chassis No", "Engine No", "Age",
      "Owner", "Customer", "Primary Mobile", "State Permit", "National Permit", "FC Expiry",
      "Road Tax Due", "Green Tax Due", "Insurance", "PUC", "Action Required", "Missing Mandatory", "Missing Optional", "Remarks"
    ];

    const rows = this.filteredRows.map(v => {
      const cust = this.customers.find(c => String(c.id) === String(v.customer_id)) || {};
      return [
        v.registration_no,
        v.derivedCategory,
        v.no_of_tyres || "",
        v.tax_amount || "0",
        v.tax_type || "",
        v.chassis_no || "",
        v.engine_no || "",
        v.chainEval.age || "",
        v.owner_name || "",
        cust.name || "",
        cust.mobile || "",
        v.permit_expiry || "",
        v.national_permit_expiry || "",
        v.fc_expiry || "",
        v.road_tax_due || "",
        v.green_tax_due || "",
        v.insurance_expiry || "",
        v.puc_expiry || "",
        v.chainEval.rootBlocker || "Up to Date",
        (v.chainEval.missingMandatory || []).join(", "),
        (v.chainEval.missingOptional || []).join(", "),
        v.remarks || ""
      ];
    });

    const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Compliance_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  Auth.requireAuth();
  Auth.initNavbarUser();
  ReportController.init();
});