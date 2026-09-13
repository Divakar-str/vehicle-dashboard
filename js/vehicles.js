/**
 * Vehicle Controller
 * 1. In-memory deduplication via Map (by vehicle_id)
 * 2. Clean A4 landscape print view
 * 3. Double-click row to view full specifications modal
 * 4. Next Tax Cycle calculator & quick selector buttons (31-03, 30-06, 30-09, 31-12)
 * 5. Hover remarks tooltip + double-click quick inline remarks editor
 * 6. Green Tax (GTax) positioned under Road Tax
 * 7. Lifetime Tax (LTT) hides tax amounts
 * 8. Collapsible filter drawer with dedicated customer filter
 */
const VehicleController = {
  dataTable: null,
  data: [],
  customerList: [],
  vehicleModal: null,
  viewModal: null,
  quickDateModal: null,
  quickRemarksModal: null,
  toast: null,
  tomSelect: null,
  activeMetricFilter: "ALL",

  tyreMatrix: {
    "4 TYRE": { amount: 600, category: "LGV" },
    "6 TYRE": { amount: 1500, category: "MGV" },
    "10 TYRE": { amount: 5100, category: "HGV" },
    "12 TYRE": { amount: 9350, category: "HGV" },
    "14 TYRE": { amount: 7900, category: "HGV" },
    "16 TYRE": { amount: 10600, category: "HGV" },
    "22 TYRE": { amount: 10600, category: "HGV" }
  },

  init() {
    this.vehicleModal = new bootstrap.Modal(document.getElementById("vehicleModal"));
    this.viewModal = new bootstrap.Modal(document.getElementById("vehicleViewModal"));
    this.quickDateModal = new bootstrap.Modal(document.getElementById("quickDateModal"));
    this.quickRemarksModal = new bootstrap.Modal(document.getElementById("quickRemarksModal"));
    this.toast = new bootstrap.Toast(document.getElementById("liveToast"), { delay: 4000 });

    this.initTable();
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
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD -> DD-MM-YYYY
    }
    return dateStr;
  },

  getDaysLeft(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    const now = new Date();
    target.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  },

  printReport() {
    document.getElementById("printDateStamp").innerText = new Date().toLocaleString();
    window.print();
  },

  // --- TAX CYCLE UTILITIES (31-03, 30-06, 30-09, 31-12) ---

  /**
   * Computes the subsequent quarterly cycle date (YYYY-MM-DD)
   * given an existing date string. If no date is given, calculates from current date.
   */
  getNextTaxCycle(baseDateStr) {
    let year;
    let month; // 1 - 12
    let day;

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

    // Sequence: 31-03 -> 30-06 -> 30-09 -> 31-12 -> 31-03 (Next Year)
    if (month < 3 || (month === 3 && day < 31)) {
      return `${year}-03-31`;
    } else if (month < 6 || (month === 6 && day < 30)) {
      return `${year}-06-30`;
    } else if (month < 9 || (month === 9 && day < 30)) {
      return `${year}-09-30`;
    } else if (month < 12 || (month === 12 && day < 31)) {
      return `${year}-12-31`;
    } else {
      return `${year + 1}-03-31`;
    }
  },

  applyNextTaxCycleFromCurrent() {
    const nextDate = document.getElementById("btnApplyNextQuarter").getAttribute("data-next-date");
    if (nextDate) {
      document.getElementById("qd_input").value = nextDate;
      this.showToast(`Set to next tax cycle: ${this.formatDisplayDate(nextDate)}`, "info");
    }
  },

  setSpecificCycleDate(monthDay) {
    const currentVal = document.getElementById("qd_input").value;
    const year = currentVal ? currentVal.split("-")[0] : new Date().getFullYear();
    document.getElementById("qd_input").value = `${year}-${monthDay}`;
  },

  advanceFormTaxCycle() {
    const currentVal = document.getElementById("v_tax").value;
    const nextCycle = this.getNextTaxCycle(currentVal);
    document.getElementById("v_tax").value = nextCycle;
    this.showToast(`Advanced to: ${this.formatDisplayDate(nextCycle)}`, "info");
  },

  setFormCycleDate(monthDay) {
    const currentVal = document.getElementById("v_tax").value;
    const year = currentVal ? currentVal.split("-")[0] : new Date().getFullYear();
    document.getElementById("v_tax").value = `${year}-${monthDay}`;
  },

  // --- METRICS COUNTERS ---
  updateTopMetrics() {
    const total = this.data.length;
    let expired = 0;
    let due15 = 0;
    let due30 = 0;
    let due45 = 0;
    let validClear = 0;

    this.data.forEach(v => {
      const days = v.min_days_remaining;
      if (v.compliance_status === "EXPIRED" || (days !== null && days <= 0)) {
        expired++;
      } else if (days !== null && days <= 15) {
        due15++;
      } else if (days !== null && days <= 30) {
        due30++;
      } else if (days !== null && days <= 45) {
        due45++;
      } else {
        validClear++;
      }
    });

    document.getElementById("metricTotal").innerText = total;
    document.getElementById("metricExpired").innerText = expired;
    document.getElementById("metric15").innerText = due15;
    document.getElementById("metric30").innerText = due30;
    document.getElementById("metric45").innerText = due45;
    document.getElementById("metricValid").innerText = validClear;
  },

  filterByMetric(type, cardEl) {
    document.querySelectorAll(".metric-card").forEach(c => c.classList.remove("active-metric-filter"));
    if (this.activeMetricFilter === type) {
      this.activeMetricFilter = "ALL";
    } else {
      this.activeMetricFilter = type;
      if (cardEl) cardEl.classList.add("active-metric-filter");
    }

    const statusSelect = document.getElementById("statusFilter");
    if (this.activeMetricFilter === "ALL") statusSelect.value = "";
    else statusSelect.value = this.activeMetricFilter;

    this.applyFilters();
  },

  clearAllFilters() {
    document.getElementById("customerFilter").value = "";
    document.getElementById("statusFilter").value = "";
    document.getElementById("categoryFilter").value = "";
    document.getElementById("btnTogglePermit").checked = false;
    document.getElementById("btnToggleNP").checked = false;
    document.getElementById("customDateFrom").value = "";
    document.getElementById("customDateTo").value = "";

    document.querySelectorAll(".metric-card").forEach(c => c.classList.remove("active-metric-filter"));
    this.activeMetricFilter = "ALL";

    this.applyFilters();
  },

  initTable() {
    this.dataTable = $("#vehicleDataTable").DataTable({
      paging: true,
      pageLength: 10,
      lengthMenu: [5, 10, 25, 50, 100],
      searching: true,
      ordering: true,
      info: true,
      autoWidth: false,
      language: {
        search: "Search Records:",
        searchPlaceholder: "Plate, Owner, Category...",
        lengthMenu: "Show _MENU_ vehicles",
        emptyTable: "No vehicles found in database",
        info: "Showing _START_ to _END_ of _TOTAL_ vehicles"
      },
      columns: [
        // 1. Vehicle Number & Tax Spec
        {
          data: "registration_no",
          render: (data, type, row) => {
            const statusClass = (row.active_status || "Active").toLowerCase();
            const isLTT = row.tax_type === "Lifetime";

            return `
              <div>
                <div class="d-flex align-items-center">
                  <a href="#" onclick="VehicleController.openEdit('${VehicleController.escape(row.vehicle_id)}'); return false;" class="reg-no-link" title="Click to edit full record">
                    ${VehicleController.escape(data)}
                  </a>
                  <span class="status-dot ${statusClass}" title="Status: ${row.active_status || 'Active'}"></span>
                </div>

                <div class="d-flex align-items-center gap-1 mt-1">
                  <span class="cat-badge">${VehicleController.escape(row.vehicle_category || 'LGV')}</span>
                  <span class="tyre-text ms-1">${row.no_of_tyres ? `${row.no_of_tyres}T` : ''}</span>
                </div>

                <div class="tax-stacked-block">
                  ${isLTT ? `
                    <span class="badge bg-secondary text-white mt-1">LTT (Lifetime)</span>
                  ` : `
                    <div class="tax-amount-text">
                      ₹${Number(row.tax_amount || 0).toLocaleString('en-IN')} 
                      <small class="text-muted fw-bold">(QTR)</small>
                    </div>
                  `}
                </div>
              </div>
            `;
          }
        },
        // 2. Customer, Owner & Remarks
        {
          data: null,
          render: (data, type, row) => {
            let blockersHtml = "";
            if (Array.isArray(row.dependency_blockers) && row.dependency_blockers.length > 0) {
              blockersHtml = `
                <div class="blocker-alert-box mt-1">
                  <i class="bi bi-exclamation-octagon-fill me-1"></i>
                  <strong>Blocked:</strong> ${VehicleController.escape(row.dependency_blockers[0])}
                </div>
              `;
            }

            const remarkVal = row.remarks || "No remarks added (Double-click to add)";
            const remarksHtml = `
              <div class="remarks-wrapper mt-1">
                <div class="remarks-text-interactive" 
                     ondblclick="event.stopPropagation(); VehicleController.openQuickRemarks('${row.vehicle_id}', '${VehicleController.escape(row.remarks || '')}')"
                     title="Hover to view full note | Double-click to edit note">
                  <i class="bi bi-pencil-fill text-muted" style="font-size: 0.65rem;"></i>
                  <span>${VehicleController.escape(row.remarks || 'Add note...')}</span>
                </div>
                <div class="remarks-tooltip-content">
                  <strong>Notes / Remarks:</strong><br/>
                  ${VehicleController.escape(remarkVal)}
                </div>
              </div>
            `;

            return `
              <div>
                <div class="owner-title"><i class="bi bi-person-fill text-dark me-1"></i>${VehicleController.escape(row.owner_name)}</div>
                <div class="firm-subtitle mt-1"><i class="bi bi-building text-muted me-1"></i><strong>Firm:</strong> ${VehicleController.escape(row.customer_name || 'Individual')}</div>
                ${remarksHtml}
                ${blockersHtml}
              </div>
            `;
          }
        },
        // 3. Permits (State Permit & NP)
        {
          data: null,
          render: (data, type, row) => {
            if (row.permit_applicable !== "Yes") {
              return '<span class="text-muted small fw-bold">No Permit</span>';
            }

            const pDays = VehicleController.getDaysLeft(row.permit_expiry);
            let fineBadge = "";
            if (pDays !== null) {
              if (pDays <= 0) fineBadge = `<span class="badge-permit-lapsed ms-1">LAPSED</span>`;
              else if (pDays <= 15) fineBadge = `<span class="badge-permit-fine ms-1">FINE</span>`;
              else if (pDays <= 30) fineBadge = `<span class="badge-permit-safe ms-1">NO FINE</span>`;
            }

            const npDays = VehicleController.getDaysLeft(row.national_permit_expiry);

            return `
              <div>
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <div><span class="badge-tag-permit">Permit</span> ${fineBadge}</div>
                  <span class="date-val editable-date ${pDays !== null && pDays <= 30 ? 'urgent' : ''}" 
                        onclick="event.stopPropagation(); VehicleController.openQuickDate('${row.vehicle_id}', 'permit_expiry', 'Permit Expiry', '${row.permit_expiry || ''}')"
                        title="Click to edit date">
                    ${VehicleController.formatDisplayDate(row.permit_expiry)}
                  </span>
                </div>
                ${row.national_permit_applicable === "Yes" ? `
                  <div class="d-flex justify-content-between align-items-center mt-1">
                    <span class="badge-tag-np">NP</span>
                    <span class="date-val editable-date ${npDays !== null && npDays <= 30 ? 'urgent' : ''}" 
                          onclick="event.stopPropagation(); VehicleController.openQuickDate('${row.vehicle_id}', 'national_permit_expiry', 'National Permit Expiry', '${row.national_permit_expiry || ''}')"
                          title="Click to edit date">
                      ${VehicleController.formatDisplayDate(row.national_permit_expiry)}
                    </span>
                  </div>
                ` : ''}
              </div>
            `;
          }
        },
        // 4. FC Expiry, Road Tax Due & Green Tax (GTax)
        {
          data: null,
          render: (data, type, row) => {
            const fcDays = VehicleController.getDaysLeft(row.fc_expiry);
            const taxDays = VehicleController.getDaysLeft(row.road_tax_due);
            const gtaxDays = VehicleController.getDaysLeft(row.green_tax_due);
            const isGtaxDue = gtaxDays !== null && gtaxDays <= 30;

            let gtaxHtml = "";
            if (row.green_tax_due) {
              gtaxHtml = `
                <div class="d-flex justify-content-between align-items-center mt-1 pt-1 border-top">
                  <span class="text-secondary small fw-bold"><i class="bi bi-shield-shaded me-1"></i>GTax:</span>
                  <span class="date-val editable-date ${isGtaxDue ? 'urgent' : ''}"
                        onclick="event.stopPropagation(); VehicleController.openQuickDate('${row.vehicle_id}', 'green_tax_due', 'Green Tax Due', '${row.green_tax_due || ''}')"
                        title="Click to edit date">
                    ${VehicleController.formatDisplayDate(row.green_tax_due)}
                  </span>
                </div>
              `;
            }

            return `
              <div>
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="text-secondary small fw-bold">FC Expiry:</span>
                  <span class="date-val editable-date ${fcDays !== null && fcDays <= 30 ? 'urgent' : ''}"
                        onclick="event.stopPropagation(); VehicleController.openQuickDate('${row.vehicle_id}', 'fc_expiry', 'FC Expiry', '${row.fc_expiry || ''}')"
                        title="Click to edit date">
                    ${VehicleController.formatDisplayDate(row.fc_expiry)}
                  </span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-secondary small fw-bold">Road Tax:</span>
                  ${row.tax_type === "Lifetime" ? '<span class="text-muted small fw-bold">LTT (N/A)</span>' : `
                    <span class="date-val editable-date ${taxDays !== null && taxDays <= 30 ? 'urgent' : ''}"
                          onclick="event.stopPropagation(); VehicleController.openQuickDate('${row.vehicle_id}', 'road_tax_due', 'Road Tax Due Date', '${row.road_tax_due || ''}')"
                          title="Click to edit date">
                      ${VehicleController.formatDisplayDate(row.road_tax_due)}
                    </span>
                  `}
                </div>
                ${gtaxHtml}
              </div>
            `;
          }
        },
        // 5. Insurance & PUC
        {
          data: null,
          render: (data, type, row) => {
            const insDays = VehicleController.getDaysLeft(row.insurance_expiry);
            const pucDays = VehicleController.getDaysLeft(row.puc_expiry);

            return `
              <div class="bg-light p-2 rounded border small">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="text-muted fw-bold">INS:</span>
                  <span class="editable-date ${insDays !== null && insDays <= 30 ? 'text-danger fw-bold' : 'text-dark fw-bold'}"
                        onclick="event.stopPropagation(); VehicleController.openQuickDate('${row.vehicle_id}', 'insurance_expiry', 'Insurance Expiry', '${row.insurance_expiry || ''}')"
                        title="Click to edit date">
                    ${VehicleController.formatDisplayDate(row.insurance_expiry)}
                  </span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted fw-bold">PUC:</span>
                  <span class="editable-date ${pucDays !== null && pucDays <= 30 ? 'text-danger fw-bold' : 'text-dark fw-bold'}"
                        onclick="event.stopPropagation(); VehicleController.openQuickDate('${row.vehicle_id}', 'puc_expiry', 'PUC Expiry', '${row.puc_expiry || ''}')"
                        title="Click to edit date">
                    ${VehicleController.formatDisplayDate(row.puc_expiry)}
                  </span>
                </div>
              </div>
            `;
          }
        },
        // 6. Action Controls
        {
          data: null,
          orderable: false,
          className: "text-end",
          render: (data, type, row) => `
            <div class="d-inline-flex gap-2" onclick="event.stopPropagation()">
              <button class="btn-clean-action edit" onclick='VehicleController.openEdit("${VehicleController.escape(row.vehicle_id)}")' title="Edit Full Record">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn-clean-action delete" onclick='VehicleController.delete("${VehicleController.escape(row.vehicle_id)}", "${VehicleController.escape(row.registration_no)}")' title="Delete">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          `
        }
      ]
    });

    // Double-click row handler to view full vehicle modal
    $("#vehicleDataTable tbody").on("dblclick", "tr", function (e) {
      if ($(e.target).closest(".editable-date, .remarks-text-interactive, .btn-clean-action, a").length > 0) {
        return;
      }
      const data = VehicleController.dataTable.row(this).data();
      if (data && data.vehicle_id) {
        VehicleController.openView(data.vehicle_id);
      }
    });

    // Custom filtering
    $.fn.dataTable.ext.search.push((settings, data, dataIndex, rowData) => {
      const customerVal = document.getElementById("customerFilter").value;
      const statusVal = document.getElementById("statusFilter").value;
      const catVal = document.getElementById("categoryFilter").value;
      const filterPermitOnly = document.getElementById("btnTogglePermit").checked;
      const filterNPOnly = document.getElementById("btnToggleNP").checked;

      const dateFrom = document.getElementById("customDateFrom").value;
      const dateTo = document.getElementById("customDateTo").value;

      if (customerVal && rowData.customer_id !== customerVal) return false;
      if (catVal && rowData.vehicle_category !== catVal) return false;
      if (filterPermitOnly && rowData.permit_applicable !== "Yes") return false;
      if (filterNPOnly && rowData.national_permit_applicable !== "Yes") return false;

      const days = rowData.min_days_remaining;
      if (statusVal === "EXPIRED" && !(rowData.compliance_status === "EXPIRED" || (days !== null && days <= 0))) return false;
      if (statusVal === "LE_15" && !(days !== null && days > 0 && days <= 15)) return false;
      if (statusVal === "16_30" && !(days !== null && days > 15 && days <= 30)) return false;
      if (statusVal === "31_45" && !(days !== null && days > 30 && days <= 45)) return false;
      if (statusVal === "LE_45" && !(days !== null && days <= 45)) return false;
      if (statusVal === "VALID" && (days !== null && days <= 45)) return false;

      if (dateFrom || dateTo) {
        const dateFields = [
          rowData.permit_expiry,
          rowData.national_permit_expiry,
          rowData.fc_expiry,
          rowData.road_tax_due,
          rowData.insurance_expiry,
          rowData.puc_expiry,
          rowData.green_tax_due
        ].filter(Boolean);

        if (dateFields.length === 0) return false;

        const inRange = dateFields.some(d => {
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
          return true;
        });

        if (!inRange) return false;
      }

      return true;
    });
  },

  async load() {
    const icon = document.getElementById("refreshIcon");
    if (icon) icon.classList.add("spin-animation");

    try {
      const cacheBust = `?_nocache=${Date.now()}`;
      const [vehicles, customers] = await Promise.all([
        Api.request(`/vehicles${cacheBust}`),
        Api.request(`/customers${cacheBust}`)
      ]);

      // Deduplicate vehicles array by vehicle_id
      const uniqueMap = new Map();
      (vehicles || []).forEach(item => {
        if (item.vehicle_id && !uniqueMap.has(item.vehicle_id)) {
          uniqueMap.set(item.vehicle_id, item);
        }
      });
      this.data = Array.from(uniqueMap.values());
      this.customerList = customers || [];

      this.populateCustomerFilter();

      this.dataTable.clear();
      this.dataTable.rows.add(this.data);
      this.dataTable.draw(false);

      this.updateTopMetrics();
    } catch (err) {
      this.showToast("Failed to load fresh data: " + err.message, "error");
    } finally {
      if (icon) icon.classList.remove("spin-animation");
    }
  },

  populateCustomerFilter() {
    const custFilterSelect = document.getElementById("customerFilter");
    const currentVal = custFilterSelect.value;
    custFilterSelect.innerHTML = '<option value="">All Customers</option>' + 
      this.customerList.map(c => `
        <option value="${c.id}" ${c.id === currentVal ? 'selected' : ''}>
          ${c.name} (${c.mobile})
        </option>
      `).join('');
  },

  applyFilters() {
    const hasActiveFilter = 
      document.getElementById("customerFilter").value !== "" ||
      document.getElementById("statusFilter").value !== "" ||
      document.getElementById("categoryFilter").value !== "" ||
      document.getElementById("btnTogglePermit").checked ||
      document.getElementById("btnToggleNP").checked ||
      document.getElementById("customDateFrom").value !== "" ||
      document.getElementById("customDateTo").value !== "";

    const filterBadge = document.getElementById("activeFilterBadge");
    if (hasActiveFilter) filterBadge.classList.remove("d-none");
    else filterBadge.classList.add("d-none");

    if (this.dataTable) {
      this.dataTable.draw();
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

    const vehicle = this.data.find(v => v.vehicle_id === vehicleId);
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
      saveBtn.innerText = "Update Remarks";
    }
  },

  openQuickDate(vehicleId, fieldName, fieldLabel, currentDate) {
    document.getElementById("qd_vehicle_id").value = vehicleId;
    document.getElementById("qd_field_name").value = fieldName;
    document.getElementById("qd_label").innerText = `Update ${fieldLabel}`;
    document.getElementById("qd_input").value = currentDate || "";

    const taxCycleBox = document.getElementById("qd_tax_cycle_box");

    if (fieldName === "road_tax_due") {
      const vehicle = this.data.find(v => v.vehicle_id === vehicleId);
      if (vehicle && vehicle.tax_type === "Lifetime") {
        taxCycleBox.classList.add("d-none");
      } else {
        taxCycleBox.classList.remove("d-none");
        const nextCycle = this.getNextTaxCycle(currentDate);
        const formattedNext = this.formatDisplayDate(nextCycle);
        document.getElementById("qd_next_quarter_text").innerText = formattedNext;
        document.getElementById("btnApplyNextQuarter").setAttribute("data-next-date", nextCycle);
      }
    } else {
      taxCycleBox.classList.add("d-none");
    }

    this.quickDateModal.show();
  },

  async saveQuickDate() {
    const vehicleId = document.getElementById("qd_vehicle_id").value;
    const fieldName = document.getElementById("qd_field_name").value;
    const newDate = document.getElementById("qd_input").value;
    const saveBtn = document.getElementById("btnSaveQuickDate");

    const vehicle = this.data.find(v => v.vehicle_id === vehicleId);
    if (!vehicle) return;

    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";

    const updatedPayload = { ...vehicle, [fieldName]: newDate || null };

    try {
      await Api.request("/vehicles", "PUT", updatedPayload);
      this.quickDateModal.hide();
      this.showToast(`Updated date for ${vehicle.registration_no} successfully.`);
      await this.load();
    } catch (err) {
      this.showToast("Failed to update date: " + err.message, "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerText = "Update Date";
    }
  },

  openView(id) {
    const v = this.data.find(item => item.vehicle_id === id);
    if (!v) return;

    document.getElementById("viewRegNo").innerText = v.registration_no;
    document.getElementById("viewCustomerInfo").innerText = `Owner: ${v.owner_name} | Firm: ${v.customer_name || 'Individual'}`;

    const isLTT = v.tax_type === "Lifetime";

    document.getElementById("viewModalBody").innerHTML = `
      <div class="row g-3">
        <div class="col-sm-6 col-md-4">
          <small class="text-muted d-block fw-semibold">Status</small>
          <span class="badge ${v.active_status === 'Active' ? 'bg-success' : 'bg-secondary'}">${this.escape(v.active_status || 'Active')}</span>
        </div>
        <div class="col-sm-6 col-md-4">
          <small class="text-muted d-block fw-semibold">Category & Tyres</small>
          <strong>${this.escape(v.vehicle_category)} (${v.no_of_tyres ? `${v.no_of_tyres} TYRE` : 'N/A'})</strong>
        </div>
        <div class="col-sm-6 col-md-4">
          <small class="text-muted d-block fw-semibold">Tax Type & Amount</small>
          <strong>${isLTT ? 'Lifetime Tax (LTT)' : `₹${Number(v.tax_amount || 0).toLocaleString('en-IN')} (Quarterly)`}</strong>
        </div>

        <div class="col-sm-6 col-md-4">
          <small class="text-muted d-block fw-semibold">Engine No</small>
          <code>${this.escape(v.engine_no) || '-'}</code>
        </div>
        <div class="col-sm-6 col-md-4">
          <small class="text-muted d-block fw-semibold">Chassis No</small>
          <code>${this.escape(v.chassis_no) || '-'}</code>
        </div>
        <div class="col-sm-6 col-md-4">
          <small class="text-muted d-block fw-semibold">Registration Date</small>
          <strong>${this.escape(v.date_of_registration) || '-'}</strong>
        </div>

        <div class="col-12"><hr class="my-2" /></div>

        <div class="col-sm-6 col-md-3">
          <small class="text-muted d-block fw-semibold">Permit</small>
          <div>${v.permit_applicable === 'Yes' ? this.formatDisplayDate(v.permit_expiry) : '<span class="text-muted">No Permit</span>'}</div>
        </div>
        <div class="col-sm-6 col-md-3">
          <small class="text-muted d-block fw-semibold">National Permit</small>
          <div>${v.national_permit_applicable === 'Yes' ? this.formatDisplayDate(v.national_permit_expiry) : '<span class="text-muted">No Permit</span>'}</div>
        </div>
        <div class="col-sm-6 col-md-3">
          <small class="text-muted d-block fw-semibold">FC Expiry</small>
          <div>${this.formatDisplayDate(v.fc_expiry)}</div>
        </div>
        <div class="col-sm-6 col-md-3">
          <small class="text-muted d-block fw-semibold">Road Tax Due</small>
          <div>${isLTT ? '<span class="text-muted">LTT (N/A)</span>' : this.formatDisplayDate(v.road_tax_due)}</div>
        </div>

        <div class="col-sm-6 col-md-4 mt-3">
          <small class="text-muted d-block fw-semibold">Insurance</small>
          <div>${this.formatDisplayDate(v.insurance_expiry)}</div>
        </div>
        <div class="col-sm-6 col-md-4 mt-3">
          <small class="text-muted d-block fw-semibold">PUC Expiry</small>
          <div>${this.formatDisplayDate(v.puc_expiry)}</div>
        </div>
        <div class="col-sm-6 col-md-4 mt-3">
          <small class="text-muted d-block fw-semibold">Green Tax Due</small>
          <div>${this.formatDisplayDate(v.green_tax_due)}</div>
        </div>

        <div class="col-12 mt-3">
          <small class="text-muted d-block fw-semibold">Remarks & Operational Notes</small>
          <div class="p-2 bg-light rounded border fw-semibold">${this.escape(v.remarks) || 'No notes added.'}</div>
        </div>
      </div>
    `;

    this.viewModal.show();
  },

  setupCustomerSelect(selectedId = null) {
    const select = document.getElementById("v_cust_id");

    if (this.tomSelect) {
      this.tomSelect.destroy();
      this.tomSelect = null;
    }

    select.innerHTML = '<option value="">Search customer or firm...</option>' + 
      this.customerList.map(c => `
        <option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>
          ${c.name} (${c.mobile})
        </option>
      `).join('');

    this.tomSelect = new TomSelect("#v_cust_id", {
      create: false,
      maxItems: 1,
      placeholder: "Search customer or firm..."
    });

    if (selectedId) {
      this.tomSelect.setValue(selectedId, true);
    }
  },

  applyTyreRules(tyre) {
    const rule = this.tyreMatrix[tyre];
    if (rule) {
      document.getElementById("v_tax_amount").value = rule.amount;
      document.getElementById("v_category").value = rule.category;
    }
  },

  togglePermits(val) {
    const np = document.getElementById("v_np_app");
    const permitDate = document.getElementById("v_permit");
    const npDate = document.getElementById("v_np_expiry");

    if (val === "Yes") {
      np.removeAttribute("disabled");
      permitDate.removeAttribute("disabled");
    } else {
      np.value = "No";
      np.setAttribute("disabled", true);
      permitDate.value = "";
      permitDate.setAttribute("disabled", true);
      npDate.value = "";
      npDate.setAttribute("disabled", true);
    }

    np.onchange = () => {
      if (np.value === "Yes") {
        npDate.removeAttribute("disabled");
      } else {
        npDate.value = "";
        npDate.setAttribute("disabled", true);
      }
    };
  },

  toggleTaxType(type) {
    const taxInput = document.getElementById("v_tax");
    const hint = document.getElementById("lttHint");
    const amount = document.getElementById("v_tax_amount");

    if (type === "Lifetime") {
      taxInput.value = "";
      taxInput.setAttribute("disabled", true);
      hint.classList.remove("d-none");
      amount.value = "0.00";
    } else {
      taxInput.removeAttribute("disabled");
      hint.classList.add("d-none");
    }
  },

  fillNextRoadTaxQuarter() {
    if (document.getElementById("v_tax_type").value === "Lifetime") {
      this.showToast("Road Tax cycle does not apply to Lifetime Tax (LTT)", "warning");
      return;
    }

    const currentVal = document.getElementById("v_tax").value;
    const nextCycle = this.getNextTaxCycle(currentVal);
    document.getElementById("v_tax").value = nextCycle;
    this.showToast(`Set deadline to ${this.formatDisplayDate(nextCycle)}`, "success");
  },

  checkGreenTax() {
    const regDateStr = document.getElementById("v_reg_date").value;
    const gtax = document.getElementById("v_gtax");

    if (!regDateStr) {
      gtax.setAttribute("disabled", true);
      gtax.value = "";
      return;
    }

    const reg = new Date(regDateStr);
    const now = new Date();
    let age = now.getFullYear() - reg.getFullYear();
    const monthDiff = now.getMonth() - reg.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < reg.getDate())) {
      age--;
    }

    if (age >= 7) {
      gtax.removeAttribute("disabled");
    } else {
      gtax.setAttribute("disabled", true);
      gtax.value = "";
    }
  },

  unlockGreenTax() {
    document.getElementById("v_gtax").removeAttribute("disabled");
    document.getElementById("v_gtax").focus();
    this.showToast("Green Tax unlocked manually", "info");
  },

  openAdd() {
    document.getElementById("vehModalTitle").innerText = "Add Vehicle";
    document.getElementById("vehModalSubtitle").innerText = "Fill vehicle registration details";
    this.setupCustomerSelect();

    document.getElementById("v_id").value = "";
    const regInput = document.getElementById("v_reg_no");
    regInput.value = "";
    regInput.removeAttribute("readonly");

    document.getElementById("v_owner").value = "";
    document.getElementById("v_reg_date").value = "";
    document.getElementById("v_engine_no").value = "";
    document.getElementById("v_chassis_no").value = "";
    document.getElementById("v_active_status").value = "Active";

    document.getElementById("v_no_of_tyres").value = "14 TYRE";
    this.applyTyreRules("14 TYRE");

    document.getElementById("v_tax_type").value = "Quarterly";
    this.toggleTaxType("Quarterly");

    document.getElementById("v_permit_app").value = "No";
    this.togglePermits("No");

    document.getElementById("v_ins").value = "";
    document.getElementById("v_fc").value = "";
    document.getElementById("v_puc").value = "";
    document.getElementById("v_tax").value = "";
    document.getElementById("v_permit").value = "";
    document.getElementById("v_np_expiry").value = "";
    document.getElementById("v_gtax").value = "";
    document.getElementById("v_remarks").value = "";

    this.checkGreenTax();
    this.vehicleModal.show();
  },

  openEdit(id) {
    const v = this.data.find(item => item.vehicle_id === id);
    if (!v) return;

    document.getElementById("vehModalTitle").innerText = `Edit ${v.registration_no}`;
    document.getElementById("vehModalSubtitle").innerText = "Update details or edit vehicle registration number";
    this.setupCustomerSelect(v.customer_id);

    document.getElementById("v_id").value = v.vehicle_id;

    const regInput = document.getElementById("v_reg_no");
    regInput.value = v.registration_no;
    regInput.removeAttribute("readonly");

    document.getElementById("v_owner").value = v.owner_name || "";
    document.getElementById("v_reg_date").value = v.date_of_registration || "";
    document.getElementById("v_engine_no").value = v.engine_no || "";
    document.getElementById("v_chassis_no").value = v.chassis_no || "";
    document.getElementById("v_active_status").value = v.active_status || "Active";

    const tyreEl = document.getElementById("v_no_of_tyres");
    const match = Object.keys(this.tyreMatrix).find(k => k.startsWith(String(v.no_of_tyres)));
    tyreEl.value = match || (v.no_of_tyres ? "CUSTOM" : "");

    document.getElementById("v_category").value = v.vehicle_category || "LGV";
    document.getElementById("v_tax_amount").value = v.tax_amount || "";

    document.getElementById("v_tax_type").value = v.tax_type === "Lifetime" ? "Lifetime" : "Quarterly";
    this.toggleTaxType(document.getElementById("v_tax_type").value);

    document.getElementById("v_permit_app").value = v.permit_applicable || "No";
    this.togglePermits(v.permit_applicable || "No");

    document.getElementById("v_np_app").value = v.national_permit_applicable || "No";
    if (v.national_permit_applicable === "Yes") {
      document.getElementById("v_np_expiry").removeAttribute("disabled");
    }

    document.getElementById("v_ins").value = v.insurance_expiry || "";
    document.getElementById("v_fc").value = v.fc_expiry || "";
    document.getElementById("v_puc").value = v.puc_expiry || "";
    document.getElementById("v_tax").value = v.road_tax_due || "";
    document.getElementById("v_permit").value = v.permit_expiry || "";
    document.getElementById("v_np_expiry").value = v.national_permit_expiry || "";
    document.getElementById("v_gtax").value = v.green_tax_due || "";
    document.getElementById("v_remarks").value = v.remarks || "";

    this.checkGreenTax();
    if (v.green_tax_due) {
      document.getElementById("v_gtax").removeAttribute("disabled");
    }

    this.vehicleModal.show();
  },

  async save() {
    const saveBtn = document.getElementById("btnSaveVehicle");
    const spinner = document.getElementById("saveBtnSpinner");
    const btnText = document.getElementById("saveBtnText");
    const id = document.getElementById("v_id").value;

    const regNo = document.getElementById("v_reg_no").value.trim().toUpperCase().replace(/\s+/g, '');
    const custId = document.getElementById("v_cust_id").value;

    if (!regNo) {
      this.showToast("Registration number is required.", "warning");
      return;
    }
    if (!custId) {
      this.showToast("Please select a customer.", "warning");
      return;
    }

    const tyreVal = document.getElementById("v_no_of_tyres").value;
    const tyreNum = parseInt(tyreVal.replace(/\D/g, ""), 10) || null;

    const payload = {
      vehicle_id: id || undefined,
      registration_no: regNo,
      customer_id: custId,
      owner_name: document.getElementById("v_owner").value.trim(),
      vehicle_category: document.getElementById("v_category").value,

      engine_no: document.getElementById("v_engine_no").value.trim() || null,
      chassis_no: document.getElementById("v_chassis_no").value.trim() || null,
      date_of_registration: document.getElementById("v_reg_date").value || null,
      active_status: document.getElementById("v_active_status").value,

      permit_applicable: document.getElementById("v_permit_app").value,
      national_permit_applicable: document.getElementById("v_np_app").value,
      tax_type: document.getElementById("v_tax_type").value,
      tax_amount: document.getElementById("v_tax_type").value === "Lifetime" ? 0 : (parseFloat(document.getElementById("v_tax_amount").value) || 0),
      no_of_tyres: tyreNum,

      insurance_expiry: document.getElementById("v_ins").value || null,
      fc_expiry: document.getElementById("v_fc").value || null,
      puc_expiry: document.getElementById("v_puc").value || null,
      road_tax_due: document.getElementById("v_tax_type").value === "Lifetime" ? null : (document.getElementById("v_tax").value || null),
      permit_expiry: document.getElementById("v_permit").value || null,
      national_permit_expiry: document.getElementById("v_np_expiry").value || null,
      green_tax_due: document.getElementById("v_gtax").value || null,
      remarks: document.getElementById("v_remarks").value.trim() || null
    };

    saveBtn.disabled = true;
    spinner.classList.remove("d-none");
    btnText.innerText = "Saving...";

    try {
      const method = id ? "PUT" : "POST";
      await Api.request("/vehicles", method, payload);
      this.vehicleModal.hide();
      this.showToast(`Vehicle ${regNo} saved successfully.`);
      await this.load();
    } catch (err) {
      this.showToast(err.message, "error");
    } finally {
      saveBtn.disabled = false;
      spinner.classList.add("d-none");
      btnText.innerText = "Save Record";
    }
  },

  async delete(id, regNo) {
    if (!confirm(`Are you sure you want to delete ${regNo}?`)) return;

    try {
      await Api.request(`/vehicles?id=${id}`, "DELETE");
      this.showToast(`Vehicle ${regNo} deleted successfully.`);
      await this.load();
    } catch (err) {
      this.showToast("Could not delete: " + err.message, "error");
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  Auth.requireAuth();
  Auth.initNavbarUser();
  VehicleController.init();
});