/**
 * PrintController - Enterprise Fleet Compliance Engine
 * Features:
 * - Common Header per customer [ # | Vehicle Details | TAX | GREEN | FC | PERMIT | NP | INS | PUC | Remarks ]
 * - Vehicle Details Row 1: [Vehicle Plate] | [Owner Name]
 * - Permit Only & NP Only vehicle filter support without dropping customer group cards
 * - Save Toner Mode Toggle
 */
const PrintController = {
  vehicles: [],
  customers: [],
  selectedDayWindow: "ALL", // 'ALL', '0', '15', '30', '45'
  selectedVehicleFilter: "ALL", // 'ALL', 'permit', 'np', 'tax', etc.
  isSaveToner: false,
  debounceTimer: null,

  async init() {
    const stampEl = document.getElementById("printDateStamp");
    if (stampEl) stampEl.innerText = new Date().toLocaleString();

    this.renderLoading();
    await this.loadData();
  },

  renderLoading() {
    const container = document.getElementById("printGroupedContainer");
    if (container) {
      container.innerHTML = `
        <div class="text-center py-5 text-muted">
          <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
          <span class="fw-black text-dark">Loading statements & compliance records...</span>
        </div>`;
    }
  },

  toggleSaveToner() {
    this.isSaveToner = !this.isSaveToner;
    const btn = document.getElementById("btnSaveToner");
    const label = document.getElementById("saveTonerState");
    const container = document.getElementById("printableArea");

    if (this.isSaveToner) {
      if (btn) {
        btn.classList.remove("btn-outline-success");
        btn.classList.add("btn-success", "text-white");
      }
      if (label) label.innerText = "ON";
      if (container) container.classList.add("save-toner-mode");
    } else {
      if (btn) {
        btn.classList.remove("btn-success", "text-white");
        btn.classList.add("btn-outline-success");
      }
      if (label) label.innerText = "OFF";
      if (container) container.classList.remove("save-toner-mode");
    }
  },

  setDayFilter(days, buttonEl) {
    this.selectedDayWindow = days;
    document.querySelectorAll(".btn-segment").forEach(btn => btn.classList.remove("active"));
    if (buttonEl) buttonEl.classList.add("active");
    this.applyFiltersAndRender();
  },

  setQuickDocFilter(filterType) {
    const docSelect = document.getElementById("controlFilterDoc");
    if (this.selectedVehicleFilter === filterType) {
      this.selectedVehicleFilter = "ALL";
      if (docSelect) docSelect.value = "ALL";
    } else {
      this.selectedVehicleFilter = filterType;
      if (docSelect) docSelect.value = filterType;
    }
    this.updateQuickFilterButtons();
    this.applyFiltersAndRender();
  },

  handleDocFilterChange(value) {
    this.selectedVehicleFilter = value;
    this.updateQuickFilterButtons();
    this.applyFiltersAndRender();
  },

  updateQuickFilterButtons() {
    const btnPermit = document.getElementById("btnFilterPermit");
    const btnNP = document.getElementById("btnFilterNP");

    if (btnPermit) {
      if (this.selectedVehicleFilter === "permit") {
        btnPermit.classList.remove("btn-outline-dark");
        btnPermit.classList.add("btn-dark");
      } else {
        btnPermit.classList.remove("btn-dark");
        btnPermit.classList.add("btn-outline-dark");
      }
    }

    if (btnNP) {
      if (this.selectedVehicleFilter === "np") {
        btnNP.classList.remove("btn-outline-dark");
        btnNP.classList.add("btn-dark");
      } else {
        btnNP.classList.remove("btn-dark");
        btnNP.classList.add("btn-outline-dark");
      }
    }
  },

  debouncedSearch() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.applyFiltersAndRender();
    }, 250);
  },

  toggleAllCheckboxes(selector, state) {
    document.querySelectorAll(selector).forEach(chk => {
      chk.checked = state;
    });
    this.applyFiltersAndRender();
  },

  getCalendarDaysDiff(targetDateStr) {
    if (!targetDateStr) return null;
    const cleanStr = String(targetDateStr).split("T")[0];
    const parts = cleanStr.split("-");
    if (parts.length !== 3) return null;

    const target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return Math.round((target - today) / (1000 * 60 * 60 * 24));
  },

  calculateMinDays(v) {
    if (v.min_days_remaining !== undefined && v.min_days_remaining !== null) {
      return Number(v.min_days_remaining);
    }
    const dates = [
      v.fc_expiry,
      v.insurance_expiry,
      v.puc_expiry,
      v.tax_type !== 'Lifetime' ? v.road_tax_due : null,
      (String(v.permit_applicable).toLowerCase() === 'yes' || v.permit_expiry) ? v.permit_expiry : null,
      (String(v.national_permit_applicable).toLowerCase() === 'yes' || v.national_permit_expiry) ? v.national_permit_expiry : null,
      v.green_tax_due
    ].filter(Boolean);

    if (dates.length === 0) return 999;

    let minDays = Infinity;
    dates.forEach(d => {
      const diff = this.getCalendarDaysDiff(d);
      if (diff !== null && diff < minDays) minDays = diff;
    });

    return minDays;
  },

  formatDisplayDate(dateStr, blankOut = false) {
    if (blankOut || !dateStr) return "";
    const cleanStr = String(dateStr).split("T")[0];
    const parts = cleanStr.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return cleanStr;
  },

  getPureDateSpan(dateStr, makeEmpty) {
    if (makeEmpty || !dateStr) return "";
    const days = this.getCalendarDaysDiff(dateStr);
    const dateFormatted = this.formatDisplayDate(dateStr, false);

    if (!dateFormatted) return "";
    if (days === null) return `<span class="date-txt date-txt-safe font-monospace">${dateFormatted}</span>`;

    let colorClass = "date-txt-safe";
    if (days <= 0) {
      colorClass = "date-txt-danger";
    } else if (days <= 15) {
      colorClass = "date-txt-warning";
    } else if (days <= 45) {
      colorClass = "date-txt-info";
    }

    return `<span class="date-txt ${colorClass} font-monospace">${dateFormatted}</span>`;
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

  async loadData() {
    try {
      const [vData, cData] = await Promise.all([
        Api.request("/vehicles"),
        Api.request("/customers")
      ]);
      this.vehicles = Array.isArray(vData) ? vData : [];
      this.customers = Array.isArray(cData) ? cData : [];
      this.applyFiltersAndRender();
    } catch (err) {
      const container = document.getElementById("printGroupedContainer");
      if (container) {
        container.innerHTML = `<div class="alert alert-danger py-3 fw-black">Failed to load fleet data: ${this.escape(err.message)}</div>`;
      }
    }
  },

  resetFilters() {
    this.selectedDayWindow = "ALL";
    this.selectedVehicleFilter = "ALL";

    document.querySelectorAll(".btn-segment").forEach(b => b.classList.remove("active"));
    document.querySelector('.btn-segment[data-days="ALL"]')?.classList.add("active");

    const search = document.getElementById("printSearchInput");
    if (search) search.value = "";

    const docSelect = document.getElementById("controlFilterDoc");
    if (docSelect) docSelect.value = "ALL";

    this.updateQuickFilterButtons();

    const blankToggle = document.getElementById("toggleMakeDatesEmpty");
    if (blankToggle) blankToggle.checked = false;

    document.querySelectorAll(".cust-col-chk").forEach(chk => chk.checked = true);
    document.querySelectorAll(".veh-col-chk").forEach(chk => {
      const val = chk.value;
      chk.checked = (val === 'owner' || val === 'chassis' || val === 'tax_type' || val === 'tax_amount' || val === 'remarks');
    });

    this.applyFiltersAndRender();
  },

  getCheckStates() {
    const chk = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.checked : true;
    };
    return {
      custMob1: chk('.cust-col-chk[value="mob1"]'),
      custMob2: chk('.cust-col-chk[value="mob2"]'),
      custMob3: chk('.cust-col-chk[value="mob3"]'),
      custAddr: chk('.cust-col-chk[value="address"]'),
      custRemarks: chk('.cust-col-chk[value="remarks"]'),
      vehCat: chk('.veh-col-chk[value="category"]'),
      vehOwner: chk('.veh-col-chk[value="owner"]'),
      vehEngine: chk('.veh-col-chk[value="engine"]'),
      vehChassis: chk('.veh-col-chk[value="chassis"]'),
      vehRegDate: chk('.veh-col-chk[value="reg_date"]'),
      vehTyres: chk('.veh-col-chk[value="tyres"]'),
      vehTaxType: chk('.veh-col-chk[value="tax_type"]'),
      vehTaxAmt: chk('.veh-col-chk[value="tax_amount"]'),
      vehRemarks: chk('.veh-col-chk[value="remarks"]')
    };
  },

  applyFiltersAndRender() {
    const searchQuery = (document.getElementById("printSearchInput")?.value || "").trim().toLowerCase();
    const makeEmpty = document.getElementById("toggleMakeDatesEmpty")?.checked || false;

    let list = [...this.vehicles];
    let labelParts = [];

    // 1. Filter vehicles by Permit Only / NP Only / Others
    if (this.selectedVehicleFilter === "permit") {
      list = list.filter(v => {
        const isPermitApp = String(v.permit_applicable || "").trim().toLowerCase() === "yes";
        return isPermitApp || Boolean(v.permit_expiry);
      });
      labelParts.push("Vehicles: Permit Only");
    } else if (this.selectedVehicleFilter === "np") {
      list = list.filter(v => {
        const isNpApp = String(v.national_permit_applicable || "").trim().toLowerCase() === "yes";
        return isNpApp || Boolean(v.national_permit_expiry);
      });
      labelParts.push("Vehicles: National Permit (NP) Only");
    } else if (this.selectedVehicleFilter !== "ALL") {
      const docKey = this.selectedVehicleFilter;
      list = list.filter(v => {
        if (docKey === "fc") return Boolean(v.fc_expiry);
        if (docKey === "tax") return Boolean(v.road_tax_due) || v.tax_type === "Lifetime";
        if (docKey === "green_tax") return Boolean(v.green_tax_due);
        if (docKey === "ins") return Boolean(v.insurance_expiry);
        if (docKey === "puc") return Boolean(v.puc_expiry);
        return true;
      });
      labelParts.push(`Doc Focus: ${docKey.toUpperCase()}`);
    } else {
      labelParts.push("All Vehicles");
    }

    // 2. Filter by Expiry Window
    if (this.selectedDayWindow !== "ALL") {
      const maxDays = parseInt(this.selectedDayWindow, 10);
      list = list.filter(v => {
        const diff = this.calculateMinDays(v);
        if (maxDays === 0) return diff <= 0;
        return diff <= maxDays;
      });
      labelParts.push(maxDays === 0 ? "Expired / 0 Days" : `≤ ${maxDays} Days to Expiry`);
    } else {
      labelParts.push("All Expiry Windows");
    }

    // 3. Search Query Filter
    if (searchQuery) {
      list = list.filter(v => {
        const cust = this.customers.find(c => String(c.id) === String(v.customer_id) || String(c.customer_id) === String(v.customer_id)) || {};
        const combined = [
          v.registration_no,
          v.owner_name,
          v.engine_no,
          v.chassis_no,
          v.vehicle_category,
          v.tax_type,
          cust.name,
          cust.customer_name,
          cust.mobile,
          cust.mobile_no_1,
          cust.mobile_2,
          cust.mobile_3,
          cust.address,
          cust.remarks,
          v.remarks
        ].filter(Boolean).join(" ").toLowerCase();
        return combined.includes(searchQuery);
      });
    }

    document.getElementById("printFilterLabel").innerText = labelParts.join(" | ");

    // 4. Group Vehicles Under Customers
    const grouped = new Map();
    list.forEach(v => {
      const cId = String(v.customer_id || "unassigned");
      if (!grouped.has(cId)) {
        const custObj = this.customers.find(c => String(c.id) === cId || String(c.customer_id) === cId) || {
          id: cId,
          name: v.owner_name || "Unassigned Customer",
          printid: 999999,
          mobile: "",
          address: "",
          remarks: ""
        };
        grouped.set(cId, { customer: custObj, vehicles: [] });
      }
      grouped.get(cId).vehicles.push(v);
    });

    // 5. Strictly Sort Customers by Integer printid
    const sortedCustomerGroups = Array.from(grouped.values()).sort((a, b) => {
      const pIdA = (a.customer.printid !== undefined && a.customer.printid !== null && a.customer.printid !== "")
        ? parseInt(a.customer.printid, 10) 
        : 999999;
      const pIdB = (b.customer.printid !== undefined && b.customer.printid !== null && b.customer.printid !== "")
        ? parseInt(b.customer.printid, 10) 
        : 999999;
      
      if (pIdA !== pIdB) return pIdA - pIdB;

      const nameA = (a.customer.name || a.customer.customer_name || "").toLowerCase();
      const nameB = (b.customer.name || b.customer.customer_name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    document.getElementById("printCustomerCount").innerText = `${sortedCustomerGroups.length} Customer${sortedCustomerGroups.length === 1 ? '' : 's'}`;
    document.getElementById("printVehicleCount").innerText = `${list.length} Vehicle${list.length === 1 ? '' : 's'}`;

    this.renderGroupedSections(sortedCustomerGroups, makeEmpty);
  },

  renderGroupedSections(sortedGroups, makeEmpty) {
    const container = document.getElementById("printGroupedContainer");
    if (!container) return;

    if (!sortedGroups || sortedGroups.length === 0) {
      container.innerHTML = `<div class="card p-4 text-center text-muted border-dashed fw-bold">No vehicles or customer records match the selected criteria.</div>`;
      return;
    }

    const cfg = this.getCheckStates();
    let html = "";
    let globalIndex = 0;

    sortedGroups.forEach((group, groupIdx) => {
      const { customer, vehicles } = group;
      const cName = this.escape(customer.name || customer.customer_name || 'Individual Client');
      const mob1 = this.escape(customer.mobile || customer.mobile_no_1 || '');
      const mob2 = this.escape(customer.mobile_2 || '');
      const mob3 = this.escape(customer.mobile_3 || '');
      const address = this.escape(customer.address || '');
      const custRemarks = this.escape(customer.remarks || '');

      const assignedPrintId = (customer.printid !== undefined && customer.printid !== null && customer.printid !== "" && customer.printid !== 999999)
        ? customer.printid 
        : (groupIdx + 1);

      let phones = [];
      if (cfg.custMob1 && mob1) phones.push(mob1);
      if (cfg.custMob2 && mob2) phones.push(mob2);
      if (cfg.custMob3 && mob3) phones.push(mob3);

      html += `
        <div class="customer-statement-card no-break">
          <!-- Customer Banner Header with Remarks -->
          <div class="customer-card-header d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <div class="customer-print-order-badge" title="Print Order ID">${assignedPrintId}</div>
              <div>
                <span class="customer-title text-dark">${cName}</span>
                <span class="customer-contact-meta ms-2">
                  ${phones.length > 0 ? `<span class="font-monospace text-dark fw-black customer-contact "><i class="bi bi-telephone-fill me-1 text-secondary"></i>${phones.join(" / ")}</span>` : ''}
                  ${cfg.custAddr && address ? `<span class="ms-2 text-secondary fw-bold"><i class="bi bi-geo-alt-fill me-1"></i>${address}</span>` : ''}
                  ${cfg.custRemarks && custRemarks ? `<span class="ms-2 badge bg-danger-subtle text-danger border border-danger-subtle fw-black"><i class="bi bi-chat-left-text me-1"></i>${custRemarks}</span>` : ''}
                </span>
              </div>
            </div>
            <div>
              <span class="badge cust-veh-count fw-black px-2 py-1">${vehicles.length} Vehicle</span>
            </div>
          </div>

          <!-- Common Header Table: Fully intact across all modes -->
          <div class="table-responsive">
            <table class="print-table align-middle">
              <thead>
                <tr class="common-header-row">
                  <th class="text-center" style="width: 2.5%;">#</th>
                  <th style="width: 23.5%;">Vehicle Details</th>
                  <th class="text-center" style="width: 8.5%;">TAX</th>
                  <th class="text-center" style="width: 8.5%;">GREEN</th>
                  <th class="text-center" style="width: 8.5%;">FC</th>
                  <th class="text-center" style="width: 8.5%;">PERMIT</th>
                  <th class="text-center" style="width: 8.5%;">NP</th>
                  <th class="text-center" style="width: 8.5%;">INS</th>
                  <th class="text-center" style="width: 8.5%;">PUC</th>
                  <th style="width: 13%;">Remarks</th>
                </tr>
              </thead>
              <tbody>
      `;

      vehicles.forEach((v) => {
        globalIndex++;
        const ownerName = this.escape(v.owner_name || '');
        const engineNo = this.escape(v.engine_no || '');
        const chassisNo = this.escape(v.chassis_no || '');
        const cat = this.escape(v.vehicle_category || 'LGV');
        const regDate = this.formatDisplayDate(v.date_of_registration, makeEmpty);
        const tyres = v.no_of_tyres || '';
        const taxType = this.escape(v.tax_type || '');
        const taxAmount = v.tax_amount ? `₹${v.tax_amount}` : '';
        const remarks = this.escape(v.remarks || '');

        const isTaxLifetime = v.tax_type === 'Lifetime';
        const isPermitApplicable = String(v.permit_applicable || "").toLowerCase() === 'yes' || Boolean(v.permit_expiry);
        const isNpApplicable = String(v.national_permit_applicable || "").toLowerCase() === 'yes' || Boolean(v.national_permit_expiry);

        const taxVal = isTaxLifetime 
          ? (makeEmpty ? "" : '<span class="date-txt date-txt-info font-monospace">Lifetime</span>') 
          : this.getPureDateSpan(v.road_tax_due, makeEmpty);
        const greenVal = this.getPureDateSpan(v.green_tax_due, makeEmpty);
        const fcVal = this.getPureDateSpan(v.fc_expiry, makeEmpty);
        
        const permitVal = isPermitApplicable 
          ? this.getPureDateSpan(v.permit_expiry, makeEmpty) 
          : (makeEmpty ? '' : '<span class="text-muted font-monospace fw-bold small">-</span>');
        
        const npVal = isNpApplicable 
          ? this.getPureDateSpan(v.national_permit_expiry, makeEmpty) 
          : (makeEmpty ? '' : '<span class="text-muted font-monospace fw-bold small">-</span>');
        
        const insVal = this.getPureDateSpan(v.insurance_expiry, makeEmpty);
        const pucVal = this.getPureDateSpan(v.puc_expiry, makeEmpty);

        html += `
          <tr class="veh-row">
            <td class="text-center fw-black text-dark cell-index">${globalIndex}</td>
            
            <!-- Vehicle Details Row 1: Plate | Owner Name -->
            <td class="py-1 cell-vehicle-details">
              <div class="veh-main-header-row d-flex align-items-baseline gap-2 flex-wrap">
                <span class="print-reg-plate">${this.escape(v.registration_no)}</span>
                ${cfg.vehOwner && ownerName ? `<span class="veh-owner-title text-uppercase fw-black text-dark">| ${ownerName}</span>` : ''}
                ${cfg.vehCat ? `<span class="badge cat-badge py-0 px-1 fw-black ms-auto">${cat}</span>` : ''}
              </div>
              <div class="specs-compact text-dark font-monospace mt-1">
                ${cfg.vehChassis && chassisNo ? `<span>Ch: <strong>${chassisNo}</strong></span>` : ''}
                ${cfg.vehEngine && engineNo ? `<span>Eng: <strong>${engineNo}</strong></span>` : ''}
                ${cfg.vehRegDate && regDate ? `<span>Reg: <strong>${regDate}</strong></span>` : ''}
                ${cfg.vehTyres && tyres ? `<span>Tyres: <strong>${tyres}</strong></span>` : ''}
                ${cfg.vehTaxType && taxType ? `<span>Type: <strong>${taxType}</strong></span>` : ''}
                ${cfg.vehTaxAmt && taxAmount ? `<span class="text-dark fw-black">Tax: ${taxAmount}</span>` : ''}
              </div>
            </td>

            <!-- Discrete Document Columns Under Common Header -->
            <td class="doc-col text-center">${taxVal}</td>
            <td class="doc-col text-center">${greenVal}</td>
            <td class="doc-col text-center">${fcVal}</td>
            <td class="doc-col text-center">${permitVal}</td>
            <td class="doc-col text-center">${npVal}</td>
            <td class="doc-col text-center">${insVal}</td>
            <td class="doc-col text-center">${pucVal}</td>

            <!-- Remarks Column -->
            <td class="cell-remarks fw-black">
              ${cfg.vehRemarks ? remarks : ''}
            </td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  async downloadPDF() {
    const btn = document.getElementById("btnDownloadPdf");
    const originalHtml = btn ? btn.innerHTML : "";
    if (btn) {
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Preparing PDF...`;
      btn.disabled = true;
    }

    const element = document.getElementById("printableArea");
    const opt = {
      margin: [5, 5, 5, 5],
      filename: `Fleet_Compliance_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    const noPrintElements = document.querySelectorAll('.no-print');
    noPrintElements.forEach(el => el.style.display = 'none');

    try {
      await html2pdf().from(element).set(opt).save();
    } catch (err) {
      alert("PDF Generation Error: " + err.message);
    } finally {
      noPrintElements.forEach(el => el.style.display = '');
      if (btn) {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (typeof Auth !== "undefined" && Auth.requireAuth) {
    Auth.requireAuth();
  }
  PrintController.init();
});