/**
 * ReportController Module
 * 1. Targeted Document Filtering: Clicking an action item from dashboard (e.g., ?doc=permit&preset=EXPIRED_ONLY)
 *    filters strictly by that specific document's expiry date rather than global vehicle status.
 * 2. General URL Query Routing (?customer_id=..., ?vehicle_id=..., ?reg_no=..., ?preset=..., ?autoprint=true).
 * 3. Permit Category Filter: State Permit, NP, Not Applicable (No Permit).
 * 4. Toggleable Remaining Days under dates (FC, Ins, PUC, Tax, Permit).
 * 5. Top Margin on Stacked Date Cells.
 * 6. Single-line Tax Amount/Type (e.g. ₹3,500 (QUARTERLY)).
 * 7. Centered & Bold Vehicle Plate Number.
 * 8. Quick Tax Cycle rollover button and modal helper (+1 Qtr).
 * 9. NP 15-Year Age Lifecycle Rule (14y final warning & 15y+ convert to GV).
 */
const ReportController = {
  dataTable: null,
  vehicles: [],
  customers: [],
  filteredRows: [],
  activePreset: "ALL",
  targetVehicleId: null,
  targetRegNo: null,
  targetDoc: null, // Holds 'fc', 'permit', 'np', 'tax', 'gtax', 'ins', 'puc'
  autoPrintOnLoad: false,
  tomSelect: null,
  quickDateModal: null,
  quickRemarksModal: null,
  toast: null,

  init() {
    this.quickDateModal = new bootstrap.Modal(document.getElementById("quickDateModal"));
    this.quickRemarksModal = new bootstrap.Modal(document.getElementById("quickRemarksModal"));
    this.toast = new bootstrap.Toast(document.getElementById("liveToast"), { delay: 3500 });

    // 1. Parse URL Parameters
    this.readUrlParameters();

    // 2. Load API Data and Build Views
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
    const parts = dateStr.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return dateStr;
  },

  getDaysLeft(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    const now = new Date();
    target.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  },

  getNextTaxCycle(baseDateStr) {
    let year, month, day;
    if (baseDateStr) {
      const parts = baseDateStr.split("-");
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
      day = now.getDate();
    }

    if (month < 3 || (month === 3 && day < 31)) return `${year}-03-31`;
    if (month < 6 || (month === 6 && day < 30)) return `${year}-06-30`;
    if (month < 9 || (month === 9 && day < 30)) return `${year}-09-30`;
    if (month < 12 || (month === 12 && day < 31)) return `${year}-12-31`;
    return `${year + 1}-03-31`;
  },

  readUrlParameters() {
    const params = new URLSearchParams(window.location.search);

    if (params.has("vehicle_id")) {
      this.targetVehicleId = params.get("vehicle_id").trim();
    }
    if (params.has("reg_no")) {
      this.targetRegNo = params.get("reg_no").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    }
    if (params.has("preset")) {
      this.activePreset = params.get("preset").trim();
    }
    if (params.has("doc")) {
      this.targetDoc = params.get("doc").trim().toLowerCase();
    }
    if (params.get("autoprint") === "true" || params.get("print") === "true") {
      this.autoPrintOnLoad = true;
    }
  },

  // Advance Road Tax directly to next quarter via row button
  async quickAdvanceTax(vehicleId) {
    const vehicle = this.vehicles.find(v => v.vehicle_id === vehicleId);
    if (!vehicle || vehicle.tax_type === "Lifetime") return;

    const nextCycle = this.getNextTaxCycle(vehicle.road_tax_due);
    const updatedPayload = { ...vehicle, road_tax_due: nextCycle };

    try {
      await Api.request("/vehicles", "PUT", updatedPayload);
      this.showToast(`Advanced Road Tax for ${vehicle.registration_no} to ${this.formatDisplayDate(nextCycle)}`);
      await this.load();
    } catch (err) {
      this.showToast("Failed to advance tax: " + err.message, "error");
    }
  },

  resetDates() {
    document.getElementById("dateFilterFrom").value = "";
    document.getElementById("dateFilterTo").value = "";
    this.targetVehicleId = null;
    this.targetRegNo = null;
    this.targetDoc = null; // Clear document filter lock
    this.applyFilters();
  },

  setQuickPreset(presetVal, chipEl) {
    document.querySelectorAll(".filter-preset-chip").forEach(c => c.classList.remove("active"));
    if (chipEl) chipEl.classList.add("active");
    this.activePreset = presetVal;

    // Clear URL-pinned single document lock when switching presets manually
    this.targetDoc = null;

    this.applyFilters();
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

      // Deduplicate vehicles
      const vMap = new Map();
      (vData || []).forEach(v => {
        if (v.vehicle_id && !vMap.has(v.vehicle_id)) vMap.set(v.vehicle_id, v);
      });
      this.vehicles = Array.from(vMap.values());

      // Deduplicate customers
      const cMap = new Map();
      (cData || []).forEach(c => {
        if (c.id && !cMap.has(c.id)) cMap.set(c.id, c);
      });
      this.customers = Array.from(cMap.values());

      // Setup customer dropdown UI
      this.setupCustomerSelect();

      // Sync UI controls with URL params
      this.syncUrlFiltersToUI();

      // Apply filters and build DataTables
      this.applyFilters();

      // Auto-trigger print if requested via URL
      if (this.autoPrintOnLoad) {
        setTimeout(() => {
          this.printReport();
          this.autoPrintOnLoad = false;
        }, 600);
      }
    } catch (err) {
      this.showToast("Failed to load reports: " + err.message, "error");
    } finally {
      if (icon) icon.classList.remove("spin-animation");
    }
  },

  setupCustomerSelect() {
    const select = document.getElementById("reportCustomerSelect");
    if (this.tomSelect) {
      this.tomSelect.destroy();
      this.tomSelect = null;
    }

    select.innerHTML = '<option value="">All Customers / Firms</option>' + 
      this.customers.map(c => `
        <option value="${c.id}">${this.escape(c.name)} (${this.escape(c.mobile)})</option>
      `).join('');

    this.tomSelect = new TomSelect("#reportCustomerSelect", {
      create: false,
      maxItems: 1,
      placeholder: "Search customer or firm...",
      onChange: () => ReportController.applyFilters()
    });
  },

  syncUrlFiltersToUI() {
    const params = new URLSearchParams(window.location.search);

    if (params.has("customer_id") && this.tomSelect) {
      this.tomSelect.setValue(params.get("customer_id"), true);
    }
    if (params.has("category")) {
      const catSelect = document.getElementById("reportCategoryFilter");
      if (catSelect) catSelect.value = params.get("category");
    }
    if (params.has("permit")) {
      const permitSelect = document.getElementById("reportPermitFilter");
      if (permitSelect) permitSelect.value = params.get("permit");
    }
    if (params.has("from")) {
      document.getElementById("dateFilterFrom").value = params.get("from");
    }
    if (params.has("to")) {
      document.getElementById("dateFilterTo").value = params.get("to");
    }

    // Isolate document column visibility in dropdown if ?doc=... is present
    if (this.targetDoc) {
      const docCheckboxes = {
        fc: "col_fc",
        permit: "col_permit",
        np: "col_np",
        tax: "col_tax",
        gtax: "col_gtax",
        ins: "col_ins",
        puc: "col_puc"
      };

      if (docCheckboxes[this.targetDoc]) {
        Object.keys(docCheckboxes).forEach(k => {
          const chk = document.getElementById(docCheckboxes[k]);
          if (chk) chk.checked = (k === this.targetDoc);
        });
      }
    }

    // Sync Preset Chips UI
    document.querySelectorAll(".filter-preset-chip").forEach(c => {
      c.classList.remove("active");
      const onclickAttr = c.getAttribute("onclick") || "";
      if (onclickAttr.includes(`'${this.activePreset}'`)) {
        c.classList.add("active");
      }
    });
  },

  applyFilters() {
    const custId = document.getElementById("reportCustomerSelect").value;
    const catVal = document.getElementById("reportCategoryFilter").value;
    const permitMode = document.getElementById("reportPermitFilter").value;
    const dateFrom = document.getElementById("dateFilterFrom").value;
    const dateTo = document.getElementById("dateFilterTo").value;
    const preset = this.activePreset;

    let list = [...this.vehicles];

    // Filter by specific Vehicle ID (if passed via URL)
    if (this.targetVehicleId) {
      list = list.filter(v => v.vehicle_id === this.targetVehicleId);
    }

    // Filter by specific Registration Number (if passed via URL)
    if (this.targetRegNo) {
      list = list.filter(v => (v.registration_no || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === this.targetRegNo);
    }

    if (custId) list = list.filter(v => v.customer_id === custId);
    if (catVal) list = list.filter(v => v.vehicle_category === catVal);

    // 1. Permit Category Filter (Permit, NP, No Permit)
    if (permitMode === "PERMIT_ONLY") {
      list = list.filter(v => v.permit_applicable === "Yes");
    } else if (permitMode === "NP_ONLY") {
      list = list.filter(v => v.national_permit_applicable === "Yes");
    } else if (permitMode === "NO_PERMIT") {
      list = list.filter(v => v.permit_applicable !== "Yes");
    }

    // 2. Date Range Filter
    if (dateFrom || dateTo) {
      list = list.filter(v => {
        const dates = [
          v.permit_expiry,
          v.national_permit_expiry,
          v.fc_expiry,
          v.road_tax_due,
          v.green_tax_due,
          v.insurance_expiry,
          v.puc_expiry
        ].filter(Boolean);

        if (dates.length === 0) return false;
        return dates.some(d => {
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
          return true;
        });
      });
    }

    // Helper: extracts the specific date for a target document
    const getTargetDocDate = (v, docKey) => {
      switch (docKey) {
        case 'fc': return v.fc_expiry;
        case 'permit': return v.permit_applicable === 'Yes' ? v.permit_expiry : null;
        case 'np': return v.national_permit_applicable === 'Yes' ? v.national_permit_expiry : null;
        case 'tax': return v.tax_type === 'Lifetime' ? null : v.road_tax_due;
        case 'gtax': return v.green_tax_due;
        case 'ins': return v.insurance_expiry;
        case 'puc': return v.puc_expiry;
        default: return null;
      }
    };

    // 3. TARGETED DOCUMENT FILTER vs GLOBAL STATUS FILTER
    if (this.targetDoc) {
      list = list.filter(v => {
        const docDate = getTargetDocDate(v, this.targetDoc);

        if (preset === "MISSING_ONLY") {
          if (this.targetDoc === 'permit') return v.permit_applicable === 'Yes' && !v.permit_expiry;
          if (this.targetDoc === 'np') return v.national_permit_applicable === 'Yes' && !v.national_permit_expiry;
          if (this.targetDoc === 'tax') return v.tax_type !== 'Lifetime' && !v.road_tax_due;
          if (this.targetDoc === 'gtax') return false;
          return !docDate;
        }

        if (!docDate) return false;
        const days = this.getDaysLeft(docDate);
        if (days === null) return false;

        if (preset === "EXPIRED_ONLY") return days <= 0;
        if (preset === "FINE_ONLY") return days > 0 && days <= 15;
        if (preset === "SAFE_ONLY") return days > 15 && days <= 30;
        if (preset === "NOTICE_ONLY") return days > 30 && days <= 45;
        return true; // preset === 'ALL'
      });
    } else {
      // Global multi-item status filter
      if (preset === "MISSING_ONLY") {
        list = list.filter(v => {
          const missingPermit = v.permit_applicable === "Yes" && !v.permit_expiry;
          const missingNP = v.national_permit_applicable === "Yes" && !v.national_permit_expiry;
          const missingFC = !v.fc_expiry;
          const missingTax = v.tax_type !== "Lifetime" && !v.road_tax_due;
          const missingIns = !v.insurance_expiry;
          const missingPUC = !v.puc_expiry;
          return missingPermit || missingNP || missingFC || missingTax || missingIns || missingPUC;
        });
      } else if (preset === "EXPIRED_ONLY") {
        list = list.filter(v => v.compliance_status === "EXPIRED" || (v.min_days_remaining !== null && v.min_days_remaining <= 0));
      } else if (preset === "FINE_ONLY") {
        list = list.filter(v => v.min_days_remaining !== null && v.min_days_remaining > 0 && v.min_days_remaining <= 15);
      } else if (preset === "SAFE_ONLY") {
        list = list.filter(v => v.min_days_remaining !== null && v.min_days_remaining > 15 && v.min_days_remaining <= 30);
      } else if (preset === "NOTICE_ONLY") {
        list = list.filter(v => v.min_days_remaining !== null && v.min_days_remaining > 30 && v.min_days_remaining <= 45);
      }
    }

    this.filteredRows = list;
    this.renderDataTable();
  },

  renderCountdownPill(dateStr) {
    if (!dateStr) return '';
    const days = this.getDaysLeft(dateStr);
    if (days === null) return '';

    let pillClass = "cd-clear";
    let text = `${days}d`;

    if (days <= 0) {
      pillClass = "cd-lapsed";
      text = days === 0 ? "Today" : `${Math.abs(days)}d Over`;
    } else if (days <= 7) {
      pillClass = "cd-fine";
      text = `${days}d Crit`;
    } else if (days <= 15) {
      pillClass = "cd-fine";
      text = `${days}d Fine`;
    } else if (days <= 30) {
      pillClass = "cd-safe";
      text = `${days}d Safe`;
    } else if (days <= 45) {
      pillClass = "cd-notice";
      text = `${days}d Notice`;
    }

    return `<span class="countdown-pill ${pillClass}">${text}</span>`;
  },

  generateWhatsAppLink(v) {
    const cust = this.customers.find(c => c.id === v.customer_id) || {};
    const primaryPhone = cust.mobile || v.customer_mobile || "";
    if (!primaryPhone) return null;

    const cleanNumber = primaryPhone.replace(/\D/g, "");
    const formattedPhone = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;

    const msgLines = [];
    msgLines.push(`*VEHICLE COMPLIANCE REMINDER: ${v.registration_no}*`);
    msgLines.push(`Customer: ${v.customer_name || cust.name || 'Client'}`);
    msgLines.push(`Owner: ${v.owner_name}`);
    msgLines.push(``);
    msgLines.push(`*Document Expiry Status:*`);

    if (v.permit_applicable === "Yes") {
      msgLines.push(`- Permit: ${this.formatDisplayDate(v.permit_expiry)} (${this.getDaysLeft(v.permit_expiry)}d)`);
    }
    if (v.national_permit_applicable === "Yes") {
      msgLines.push(`- NP: ${this.formatDisplayDate(v.national_permit_expiry)} (${this.getDaysLeft(v.national_permit_expiry)}d)`);
    }
    msgLines.push(`- Fitness (FC): ${this.formatDisplayDate(v.fc_expiry)} (${this.getDaysLeft(v.fc_expiry)}d)`);
    msgLines.push(`- Road Tax: ${v.tax_type === 'Lifetime' ? 'LTT' : this.formatDisplayDate(v.road_tax_due)}`);
    msgLines.push(`- Insurance: ${this.formatDisplayDate(v.insurance_expiry)}`);
    msgLines.push(`- Pollution (PUC): ${this.formatDisplayDate(v.puc_expiry)}`);

    if (v.np_directive) {
      msgLines.push(``);
      msgLines.push(`*National Permit Rule Alert:* ${v.np_directive}`);
    } else if (Array.isArray(v.dependency_blockers) && v.dependency_blockers.length > 0) {
      msgLines.push(``);
      msgLines.push(`*Important Notice:* ${v.dependency_blockers[0]}`);
    }

    msgLines.push(``);
    msgLines.push(`Please renew required items to avoid penalty.`);

    const encodedText = encodeURIComponent(msgLines.join("\n"));
    return `https://wa.me/${formattedPhone}?text=${encodedText}`;
  },

  renderDateCell(vehicleId, fieldName, fieldLabel, dateStr, isApplicable = true, showRemDays = true) {
    if (!isApplicable) {
      return '<span class="text-muted small">N/A</span>';
    }

    if (!dateStr) {
      return `
        <span class="editable-report-date text-muted fw-bold"
              ondblclick="ReportController.openQuickDate('${vehicleId}', '${fieldName}', '${fieldLabel}', '')"
              title="Double-click to set date">-</span>
      `;
    }

    return `
      <div class="date-stack-cell">
        <span class="editable-report-date"
              ondblclick="ReportController.openQuickDate('${vehicleId}', '${fieldName}', '${fieldLabel}', '${dateStr}')"
              title="Double-click to edit date">
          ${this.formatDisplayDate(dateStr)}
        </span>
        ${showRemDays ? this.renderCountdownPill(dateStr) : ''}
      </div>
    `;
  },

  renderDataTable() {
    const badge = document.getElementById("reportCountBadge");
    badge.innerText = `${this.filteredRows.length} Vehicles`;

    // Dropdown 1: Vehicle & Contact Fields
    const showChassis = document.getElementById("fld_chassis").checked;
    const showCat = document.getElementById("fld_category").checked;
    const showTyre = document.getElementById("fld_tyre").checked;
    const showTaxAmt = document.getElementById("fld_tax_amt").checked;
    const showTaxType = document.getElementById("fld_tax_type").checked;
    const showRemDays = document.getElementById("fld_rem_days").checked;
    const showAltContacts = document.getElementById("fld_alt_contacts").checked;

    // Dropdown 2: Documents Visible
    const showPermit = document.getElementById("col_permit").checked;
    const showNP = document.getElementById("col_np").checked;
    const showFC = document.getElementById("col_fc").checked;
    const showTax = document.getElementById("col_tax").checked;
    const showGTax = document.getElementById("col_gtax").checked;
    const showIns = document.getElementById("col_ins").checked;
    const showPUC = document.getElementById("col_puc").checked;

    if ($.fn.DataTable.isDataTable("#reportDataTable")) {
      this.dataTable.destroy();
      $("#reportDataTable").empty();
    }

    const columns = [];

    // Column 1: Vehicle Profile
    columns.push({
      title: "Vehicle Profile",
      data: null,
      render: (data, type, row) => {
        const isLTT = row.tax_type === "Lifetime";
        
        const specs = [];
        if (showCat) specs.push(`<span class="badge bg-dark">${ReportController.escape(row.vehicle_category || 'LGV')}</span>`);
        
        if (showTyre && row.no_of_tyres) {
          const numOnly = String(row.no_of_tyres).replace(/[^0-9]/g, "");
          specs.push(numOnly ? `${numOnly} Tyres` : "");
        }
        
        if (showTaxAmt || showTaxType) {
          const taxText = isLTT ? "LTT" : `₹${Number(row.tax_amount || 0).toLocaleString("en-IN")}`;
          const taxTypeLabel = isLTT ? "Lifetime" : (row.tax_type || "QTR");

          if (showTaxAmt && showTaxType) {
            specs.push(`<span class="tax-highlight-single-line">${taxText} (${taxTypeLabel})</span>`);
          } else if (showTaxAmt) {
            specs.push(`<span class="tax-highlight-single-line">${taxText}</span>`);
          } else {
            specs.push(`<span class="tax-highlight-single-line">(${taxTypeLabel})</span>`);
          }
        }

        const specHtml = specs.filter(Boolean).length > 0 
          ? `<div class="spec-stack">${specs.filter(Boolean).join(" &bull; ")}</div>` 
          : "";

        const chassisHtml = showChassis && row.chassis_no 
          ? `<div class="text-center mt-1"><small class="text-muted font-monospace fw-bold">Chassis: ${ReportController.escape(row.chassis_no)}</small></div>` 
          : "";

        return `
          <div>
            <div class="reg-no-text">${ReportController.escape(row.registration_no)}</div>
            ${specHtml}
            ${chassisHtml}
          </div>
        `;
      }
    });

    // Column 2: Customer Contacts
    columns.push({
      title: "Customer Contacts",
      data: null,
      render: (data, type, row) => {
        const cust = ReportController.customers.find(c => c.id === row.customer_id) || {};
        const waLink = ReportController.generateWhatsAppLink(row);

        let altContactsHtml = "";
        if (showAltContacts) {
          const alt2 = cust.mobile_2 ? `<div class="spec-stack text-start"><i class="bi bi-phone me-1 text-muted"></i>Alt 2: <span class="font-monospace fw-bold">${ReportController.escape(cust.mobile_2)}</span></div>` : "";
          const alt3 = cust.mobile_3 ? `<div class="spec-stack text-start"><i class="bi bi-phone me-1 text-muted"></i>Alt 3: <span class="font-monospace fw-bold">${ReportController.escape(cust.mobile_3)}</span></div>` : "";
          altContactsHtml = alt2 + alt3;
        }

        return `
          <div>
            <div class="d-flex justify-content-between align-items-center">
              <div class="customer-name-heading text-truncate" style="max-width: 150px;">${ReportController.escape(row.customer_name || cust.name || 'Individual')}</div>
              ${waLink ? `
                <a href="${waLink}" target="_blank" class="btn-whatsapp-icon ms-1" title="Send WhatsApp Notice">
                  <i class="bi bi-whatsapp"></i>
                </a>
              ` : ''}
            </div>
            <div class="owner-sub"><i class="bi bi-person-fill me-1 text-secondary"></i>Owner: ${ReportController.escape(row.owner_name)}</div>
            <div class="contact-phone-block">
              ${cust.mobile || row.customer_mobile ? `
                <div>
                  <a href="tel:${cust.mobile || row.customer_mobile}" class="phone-link">
                    <i class="bi bi-telephone-fill me-1 text-primary"></i>${ReportController.escape(cust.mobile || row.customer_mobile)}
                  </a>
                </div>
              ` : ''}
              ${altContactsHtml}
            </div>
          </div>
        `;
      }
    });

    // Document Columns
    if (showPermit) {
      columns.push({
        title: "Permit",
        data: null,
        render: (d, t, row) => ReportController.renderDateCell(row.vehicle_id, "permit_expiry", "Permit Expiry", row.permit_expiry, row.permit_applicable === "Yes", showRemDays)
      });
    }

    if (showNP) {
      columns.push({
        title: "NP",
        data: null,
        render: (d, t, row) => {
          if (row.national_permit_applicable !== "Yes") {
            return '<span class="text-muted small">N/A</span>';
          }

          let npRuleBadge = "";
          if (row.date_of_registration) {
            const regYear = new Date(row.date_of_registration).getFullYear();
            const currentYear = new Date().getFullYear();
            const age = currentYear - regYear;

            if (age >= 15) {
              npRuleBadge = `
                <div class="mt-1">
                  <span class="badge-np-convert-gv" title="Over 15 Years: National Permit not allowed">
                    🚨 15y+: Convert to GV
                  </span>
                </div>
              `;
            } else if (age >= 14) {
              npRuleBadge = `
                <div class="mt-1">
                  <span class="badge-np-final-year" title="14th Year: Final year for NP">
                    ⚠️ 14y: Final NP Year
                  </span>
                </div>
              `;
            }
          }

          return `
            <div>
              ${ReportController.renderDateCell(row.vehicle_id, "national_permit_expiry", "National Permit Expiry", row.national_permit_expiry, true, showRemDays)}
              ${npRuleBadge}
            </div>
          `;
        }
      });
    }

    if (showFC) {
      columns.push({
        title: "Fitness (FC)",
        data: null,
        render: (d, t, row) => ReportController.renderDateCell(row.vehicle_id, "fc_expiry", "FC Expiry", row.fc_expiry, true, showRemDays)
      });
    }

    if (showTax) {
      columns.push({
        title: "Road Tax",
        data: null,
        render: (d, t, row) => {
          if (row.tax_type === "Lifetime") {
            return '<span class="badge bg-secondary">LTT (N/A)</span>';
          }

          return `
            <div>
              ${ReportController.renderDateCell(row.vehicle_id, "road_tax_due", "Road Tax Due", row.road_tax_due, true, showRemDays)}
              <div class="mt-1">
                <button type="button" class="btn-quick-tax-cycle" onclick="ReportController.quickAdvanceTax('${row.vehicle_id}')" title="Advance to next quarter cycle">
                  <i class="bi bi-arrow-repeat me-1"></i>+1 Qtr
                </button>
              </div>
            </div>
          `;
        }
      });
    }

    if (showGTax) {
      columns.push({
        title: "Green Tax",
        data: null,
        render: (d, t, row) => ReportController.renderDateCell(row.vehicle_id, "green_tax_due", "Green Tax Due", row.green_tax_due, Boolean(row.green_tax_due), showRemDays)
      });
    }
    if (showIns) {
      columns.push({
        title: "Insurance",
        data: null,
        render: (d, t, row) => ReportController.renderDateCell(row.vehicle_id, "insurance_expiry", "Insurance Expiry", row.insurance_expiry, true, showRemDays)
      });
    }
    if (showPUC) {
      columns.push({
        title: "PUC",
        data: null,
        render: (d, t, row) => ReportController.renderDateCell(row.vehicle_id, "puc_expiry", "PUC Expiry", row.puc_expiry, true, showRemDays)
      });
    }

    // Column: Remarks & Overdue Rules
    columns.push({
      title: "Remarks & Overdue Rules",
      data: null,
      render: (data, type, row) => {
        let blockerHtml = "";
        if (Array.isArray(row.dependency_blockers) && row.dependency_blockers.length > 0) {
          blockerHtml = row.dependency_blockers.map(b => `
            <div>
              <span class="blocker-pill">
                <i class="bi bi-exclamation-octagon-fill me-1"></i>${ReportController.escape(b)}
              </span>
            </div>
          `).join("");
        }

        const hasRemark = Boolean(row.remarks && row.remarks.trim());
        const displayRemark = hasRemark ? ReportController.escape(row.remarks) : '<span class="text-muted small">-</span>';

        return `
          <div>
            <div class="report-remarks-box" 
                 ondblclick="ReportController.openQuickRemarks('${row.vehicle_id}', '${ReportController.escape(row.remarks || '')}')"
                 title="Double-click to edit notes">
              <i class="bi bi-pencil-fill me-1 text-muted" style="font-size: 0.65rem;"></i>${displayRemark}
            </div>
            ${blockerHtml}
          </div>
        `;
      }
    });

    this.dataTable = $("#reportDataTable").DataTable({
      data: this.filteredRows,
      columns: columns,
      paging: true,
      pageLength: 10,
      lengthMenu: [5, 10, 25, 50, 100],
      searching: true,
      ordering: true,
      info: true,
      autoWidth: false,
      language: {
        search: "Search Records:",
        searchPlaceholder: "Plate, Customer, Category...",
        lengthMenu: "Show _MENU_ vehicles",
        emptyTable: "No records match the active criteria",
        info: "Showing _START_ to _END_ of _TOTAL_ vehicles",
        paginate: {
          previous: "<i class='bi bi-chevron-left'></i>",
          next: "<i class='bi bi-chevron-right'></i>"
        }
      }
    });
  },

  openQuickDate(vehicleId, fieldName, fieldLabel, currentDate) {
    document.getElementById("qd_vehicle_id").value = vehicleId;
    document.getElementById("qd_field_name").value = fieldName;
    document.getElementById("qd_label").innerText = `Update ${fieldLabel}`;
    document.getElementById("qd_input").value = currentDate || "";

    const taxCycleBox = document.getElementById("qd_tax_cycle_box");

    if (fieldName === "road_tax_due") {
      const vehicle = this.vehicles.find(v => v.vehicle_id === vehicleId);
      if (vehicle && vehicle.tax_type === "Lifetime") {
        taxCycleBox.classList.add("d-none");
      } else {
        taxCycleBox.classList.remove("d-none");
        this.updateModalCyclePreview(currentDate);
      }
    } else {
      taxCycleBox.classList.add("d-none");
    }

    this.quickDateModal.show();
  },

  updateModalCyclePreview(baseDate) {
    const nextCycle = this.getNextTaxCycle(baseDate);
    const formatted = this.formatDisplayDate(nextCycle);
    document.getElementById("qd_next_quarter_text").innerText = formatted;
    document.getElementById("btnApplyNextQuarter").setAttribute("data-next-date", nextCycle);
  },

  onQuickDateInputChange() {
    const fieldName = document.getElementById("qd_field_name").value;
    if (fieldName === "road_tax_due") {
      const currentVal = document.getElementById("qd_input").value;
      this.updateModalCyclePreview(currentVal);
    }
  },

  applyNextTaxCycleFromModal() {
    const nextDate = document.getElementById("btnApplyNextQuarter").getAttribute("data-next-date");
    if (nextDate) {
      document.getElementById("qd_input").value = nextDate;
      this.updateModalCyclePreview(nextDate);
      this.showToast(`Set to next cycle: ${this.formatDisplayDate(nextDate)}`, "info");
    }
  },

  setModalCycleDate(monthDay) {
    const currentVal = document.getElementById("qd_input").value;
    const year = currentVal ? currentVal.split("-")[0] : new Date().getFullYear();
    const newDate = `${year}-${monthDay}`;
    document.getElementById("qd_input").value = newDate;
    this.updateModalCyclePreview(newDate);
  },

  async saveQuickDate() {
    const vehicleId = document.getElementById("qd_vehicle_id").value;
    const fieldName = document.getElementById("qd_field_name").value;
    const newDate = document.getElementById("qd_input").value;
    const saveBtn = document.getElementById("btnSaveQuickDate");

    const vehicle = this.vehicles.find(v => v.vehicle_id === vehicleId);
    if (!vehicle) return;

    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";

    const updatedPayload = { ...vehicle, [fieldName]: newDate || null };

    try {
      await Api.request("/vehicles", "PUT", updatedPayload);
      this.quickDateModal.hide();
      this.showToast(`Updated date for ${vehicle.registration_no}`);
      await this.load();
    } catch (err) {
      this.showToast("Failed to update date: " + err.message, "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerText = "Update Date";
    }
  },

  openQuickRemarks(vehicleId, currentRemarks) {
    document.getElementById("qr_vehicle_id").value = vehicleId;
    document.getElementById("qr_input").value = currentRemarks || "";
    this.quickRemarksModal.show();
  },

  async saveQuickRemarks() {
    const vehicleId = document.getElementById("qr_vehicle_id").value;
    const newRemarks = document.getElementById("qr_input").value.trim();
    const saveBtn = document.getElementById("btnSaveQuickRemarks");

    const vehicle = this.vehicles.find(v => v.vehicle_id === vehicleId);
    if (!vehicle) return;

    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";

    const updatedPayload = { ...vehicle, remarks: newRemarks || null };

    try {
      await Api.request("/vehicles", "PUT", updatedPayload);
      this.quickRemarksModal.hide();
      this.showToast(`Updated remarks for ${vehicle.registration_no}`);
      await this.load();
    } catch (err) {
      this.showToast("Failed to update remarks: " + err.message, "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerText = "Save Remarks";
    }
  },

  printReport() {
    document.getElementById("printDateStamp").innerText = new Date().toLocaleString();

    if (this.dataTable) {
      const origLength = this.dataTable.page.len();
      this.dataTable.page.len(-1).draw();

      setTimeout(() => {
        window.print();
        this.dataTable.page.len(origLength).draw();
      }, 300);
    } else {
      window.print();
    }
  },

  exportCSV() {
    if (this.filteredRows.length === 0) {
      this.showToast("No data available to export", "warning");
      return;
    }

    const showChassis = document.getElementById("fld_chassis").checked;
    const showCat = document.getElementById("fld_category").checked;
    const showTyre = document.getElementById("fld_tyre").checked;
    const showTaxAmt = document.getElementById("fld_tax_amt").checked;
    const showTaxType = document.getElementById("fld_tax_type").checked;
    const showAltContacts = document.getElementById("fld_alt_contacts").checked;

    let headers = ["Vehicle Reg No"];
    if (showCat) headers.push("Category");
    if (showTyre) headers.push("Tyres");
    if (showTaxType) headers.push("Tax Type");
    if (showTaxAmt) headers.push("Tax Amount");
    if (showChassis) headers.push("Chassis No");

    headers.push("Customer", "Owner", "Primary Mobile");
    if (showAltContacts) headers.push("Alt Mobile 2", "Alt Mobile 3");

    headers.push("Permit Expiry", "NP Expiry", "NP Age Status", "FC Expiry", "Road Tax Due", "Green Tax Due", "Insurance Expiry", "PUC Expiry", "Remarks", "Overdue Rule");

    const rows = this.filteredRows.map(v => {
      const cust = this.customers.find(c => c.id === v.customer_id) || {};
      const numOnly = v.no_of_tyres ? String(v.no_of_tyres).replace(/[^0-9]/g, "") : "";

      let r = [v.registration_no];
      if (showCat) r.push(v.vehicle_category || "");
      if (showTyre) r.push(numOnly ? `${numOnly} Tyres` : "");
      if (showTaxType) r.push(v.tax_type || "");
      if (showTaxAmt) r.push(v.tax_amount || 0);
      if (showChassis) r.push(v.chassis_no || "");

      r.push(
        v.customer_name || cust.name || "",
        v.owner_name || "",
        cust.mobile || v.customer_mobile || ""
      );

      if (showAltContacts) {
        r.push(cust.mobile_2 || "", cust.mobile_3 || "");
      }

      r.push(
        v.permit_expiry || "",
        v.national_permit_expiry || "",
        v.np_directive || "",
        v.fc_expiry || "",
        v.tax_type === "Lifetime" ? "LTT" : (v.road_tax_due || ""),
        v.green_tax_due || "",
        v.insurance_expiry || "",
        v.puc_expiry || "",
        v.remarks || "",
        (v.dependency_blockers && v.dependency_blockers[0]) || ""
      );

      return r;
    });

    const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FleetERP_Compliance_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("CSV Export downloaded successfully");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  Auth.requireAuth();
  Auth.initNavbarUser();
  ReportController.init();
});