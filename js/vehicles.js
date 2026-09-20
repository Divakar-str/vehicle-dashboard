/**
 * Vehicle Controller
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
  tomSelectForm: null,
  tomSelectFilter: null,
  activeMetricFilter: "ALL",
  activeViewVehicleId: null,

  tyreMatrix: {
    "4 TYRE": { amount: 1450, category: "LGV" },
    "6 TYRE": { amount: 3500, category: "MGV" },
    "10 TYRE": { amount: 7200, category: "HGV" },
    "12 TYRE": { amount: 9350, category: "HGV" },
    "14 TYRE": { amount: 11500, category: "HGV" },
    "16 TYRE": { amount: 13150, category: "HGV" },
    "22 TYRE": { amount: 10600, category: "HGV" }
  },

  init() {
    this.vehicleModal = new bootstrap.Modal(document.getElementById("vehicleModal"));
    this.viewModal = new bootstrap.Modal(document.getElementById("vehicleViewModal"));
    this.quickDateModal = new bootstrap.Modal(document.getElementById("quickDateModal"));
    this.quickRemarksModal = new bootstrap.Modal(document.getElementById("quickRemarksModal"));
    this.toast = new bootstrap.Toast(document.getElementById("liveToast"), { delay: 4000 });

    document.getElementById("btnSwitchToEdit").addEventListener("click", () => {
      if (this.activeViewVehicleId) {
        this.viewModal.hide();
        this.openEdit(this.activeViewVehicleId);
      }
    });

    document.getElementById("v_np_app").addEventListener("change", (e) => {
      const npDate = document.getElementById("v_np_expiry");
      if (e.target.value === "Yes") {
        npDate.removeAttribute("disabled");
      } else {
        npDate.value = "";
        npDate.setAttribute("disabled", true);
      }
    });

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
    return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
  },

  getDaysLeft(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split("-").map(Number);
    const target = new Date(parts[0], parts[1] - 1, parts[2]);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((target - now) / (1000 * 60 * 60 * 24));
  },

  renderDateBadge(dateStr, vehicleId, fieldKey, fieldLabel) {
    if (!dateStr) return `<span class="text-muted small">-</span>`;
    const days = this.getDaysLeft(dateStr);
    let cssClass = "safe";
    let statusHint = `${days}d left`;

    if (days <= 0) {
      cssClass = "expired";
      statusHint = "Expired / Lapsed";
    } else if (days <= 15) {
      cssClass = "urgent";
      statusHint = `${days}d (Urgent)`;
    } else if (days <= 30) {
      cssClass = "soon";
      statusHint = `${days}d (Soon)`;
    } else if (days <= 45) {
      cssClass = "soon";
      statusHint = `${days}d`;
    }

    return `
      <span class="exp-pill ${cssClass}"
            title="${statusHint} - Click to edit date"
            onclick="event.stopPropagation(); VehicleController.openQuickDate('${vehicleId}', '${fieldKey}', '${fieldLabel}', '${dateStr}')">
        ${this.formatDisplayDate(dateStr)}
      </span>
    `;
  },

  printReport() {
    document.getElementById("printDateStamp").innerText = new Date().toLocaleString();
    const prevLength = this.dataTable.page.len();
    this.dataTable.page.len(-1).draw();

    setTimeout(() => {
      window.print();
      this.dataTable.page.len(prevLength).draw();
    }, 300);
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

  updateTopMetrics() {
    const total = this.data.length;
    let expired = 0, due15 = 0, due30 = 0, due45 = 0, validClear = 0;

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
    statusSelect.value = this.activeMetricFilter === "ALL" ? "" : this.activeMetricFilter;
    this.applyFilters();
  },

  clearAllFilters() {
    if (this.tomSelectFilter) this.tomSelectFilter.clear();
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
      order: [],
      info: true,
      autoWidth: false,
      language: {
        search: "Search Records:",
        searchPlaceholder: "Plate, Owner, Category, Chassis...",
        lengthMenu: "Show _MENU_ vehicles",
        emptyTable: "No vehicles found in database",
        info: "Showing _START_ to _END_ of _TOTAL_ vehicles"
      },
      columns: [
        // 1. Vehicle & Tax Spec: Merged Sub-row Stack
        {
          data: "registration_no",
          render: (data, type, row) => {
            const statusClass = (row.active_status || "Active").toLowerCase();
            const isLTT = row.tax_type === "Lifetime";

            return `
              <div class="cell-merged-stack">
                <div class="sub-row">
                  <div class="d-flex align-items-center">
                    <a href="#" onclick="VehicleController.openEdit('${VehicleController.escape(row.vehicle_id)}'); return false;" class="reg-no-link" title="Click to edit record">
                      ${VehicleController.escape(data)}
                    </a>
                    <span class="status-dot ${statusClass}" title="Status: ${row.active_status || 'Active'}"></span>
                  </div>
                </div>
                <div class="sub-row">
                  <span class="cat-badge">${VehicleController.escape(row.vehicle_category || 'LGV')}</span>
                  <code class="text-secondary small" style="font-size: 0.72rem;" title="Chassis">[${VehicleController.escape(row.chassis_no) || '-'}]</code>
                </div>
                <div class="sub-row">
                  <span class="tyre-text fw-bold">${row.no_of_tyres ? `${row.no_of_tyres}` : 'N/A'}</span>
                  ${isLTT ? `
                    <span class="badge bg-secondary text-white" style="font-size: 0.65rem;">LTT</span>
                  ` : `
                    <span class="tax-amount-text">₹${Number(row.tax_amount || 0).toLocaleString('en-IN')} <small class="text-muted fw-bold">(Q)</small></span>
                  `}
                </div>
              </div>
            `;
          }
        },
        // 2. Customer & Owner: Merged Sub-rows, No truncation, Full Alt-phone rendering
        {
          data: null,
          render: (data, type, row) => {
            // Find matched customer record if present to grab all stored phone fields
            const cust = VehicleController.customerList.find(c => String(c.id) === String(row.customer_id)) || {};

            // Harvest candidate numbers from row and matching customer record
            const rawNumbers = [
              row.customer_mobile,
              row.mobile,
              row.phone,
              row.phone1,
              row.alt_phone,
              row.secondary_phone,
              cust.mobile,
              cust.mobile_2,
              cust.mobile_3,
              cust.alt_phone,
              cust.contact_no
            ];

            // Split on comma/slash/space if multiple numbers were packed into one string
            const phoneList = [];
            rawNumbers.forEach(item => {
              if (item) {
                String(item).split(/[,/|]/).forEach(num => {
                  const cleaned = num.trim();
                  if (cleaned && !phoneList.includes(cleaned)) {
                    phoneList.push(cleaned);
                  }
                });
              }
            });

            const phoneBadgeHtml = phoneList.length > 0
              ? phoneList.map(p => `<span class="badge bg-light text-secondary border font-monospace me-1"><i class="bi bi-telephone-fill me-1" style="font-size: 0.6rem;"></i>${VehicleController.escape(p)}</span>`).join('')
              : '<span class="text-muted small">-</span>';

            return `
              <div class="cell-merged-stack">
                <div class="sub-row">
                  <span class="sub-row-label">Owner:</span>
                  <div class="sub-row-content full-text-wrap fw-bold text-dark text-start">
                    ${VehicleController.escape(row.owner_name)}
                  </div>
                </div>
                <div class="sub-row">
                  <span class="sub-row-label">Firm:</span>
                  <div class="sub-row-content full-text-wrap text-muted text-start">
                    ${VehicleController.escape(row.customer_name || 'Individual')}
                  </div>
                </div>
                <div class="sub-row">
                  <span class="sub-row-label">Phone:</span>
                  <div class="sub-row-content full-text-wrap">
                    ${phoneBadgeHtml}
                  </div>
                </div>
              </div>
            `;
          }
        },
        // 3. Permits: State Permit & NP (Merged Sub-rows)
        {
          data: null,
          render: (data, type, row) => {
            if (row.permit_applicable !== "Yes") {
              return `
                <div class="cell-merged-stack">
                  <div class="sub-row justify-content-center p-3">
                    <span class="text-muted small fw-bold">No Permit</span>
                  </div>
                </div>
              `;
            }

            const pDays = VehicleController.getDaysLeft(row.permit_expiry);
            let fineBadge = "";
            if (pDays !== null) {
              if (pDays <= 0) fineBadge = `<span class="badge-permit-lapsed ms-1">LAPSED</span>`;
              else if (pDays <= 15) fineBadge = `<span class="badge-permit-fine ms-1">FINE</span>`;
              else if (pDays <= 30) fineBadge = `<span class="badge-permit-safe ms-1">NO FINE</span>`;
            }

            return `
              <div class="cell-merged-stack">
                <div class="sub-row">
                  <div><span class="badge-tag-permit">Permit</span> ${fineBadge}</div>
                  <div>${VehicleController.renderDateBadge(row.permit_expiry, row.vehicle_id, 'permit_expiry', 'Permit Expiry')}</div>
                </div>
                <div class="sub-row">
                  <span class="badge-tag-np">NP</span>
                  <div>
                    ${row.national_permit_applicable === "Yes"
                      ? VehicleController.renderDateBadge(row.national_permit_expiry, row.vehicle_id, 'national_permit_expiry', 'National Permit Expiry')
                      : '<span class="text-muted small">-</span>'}
                  </div>
                </div>
              </div>
            `;
          }
        },
        // 4. FC Expiry, Road Tax Due & Green Tax (Merged Sub-rows)
        {
          data: null,
          render: (data, type, row) => {
            const isLTT = row.tax_type === "Lifetime";
            return `
              <div class="cell-merged-stack">
                <div class="sub-row">
                  <span class="sub-row-label">FC:</span>
                  <div>${VehicleController.renderDateBadge(row.fc_expiry, row.vehicle_id, 'fc_expiry', 'FC Expiry')}</div>
                </div>
                <div class="sub-row">
                  <span class="sub-row-label">Tax:</span>
                  <div>
                    ${isLTT ? '<span class="text-muted small fw-bold">LTT (N/A)</span>' : VehicleController.renderDateBadge(row.road_tax_due, row.vehicle_id, 'road_tax_due', 'Road Tax Due Date')}
                  </div>
                </div>
                ${row.green_tax_due ? `
                  <div class="sub-row">
                    <span class="sub-row-label"><i class="bi bi-shield-shaded me-1"></i>GTax:</span>
                    <div>${VehicleController.renderDateBadge(row.green_tax_due, row.vehicle_id, 'green_tax_due', 'Green Tax Due')}</div>
                  </div>
                ` : ''}
              </div>
            `;
          }
        },
        // 5. Insurance & PUC (Merged Sub-rows)
        {
          data: null,
          render: (data, type, row) => `
            <div class="cell-merged-stack">
              <div class="sub-row">
                <span class="sub-row-label">INS:</span>
                <div>${VehicleController.renderDateBadge(row.insurance_expiry, row.vehicle_id, 'insurance_expiry', 'Insurance Expiry')}</div>
              </div>
              <div class="sub-row">
                <span class="sub-row-label">PUC:</span>
                <div>${VehicleController.renderDateBadge(row.puc_expiry, row.vehicle_id, 'puc_expiry', 'PUC Expiry')}</div>
              </div>
            </div>
          `
        },
        // 6. Dedicated Remarks Column (Blocker Notice + Orange Text)
        {
          data: "remarks",
          render: (data, type, row) => {
            let blockerHtml = "";
            if (Array.isArray(row.dependency_blockers) && row.dependency_blockers.length > 0) {
              blockerHtml = `
                <div class="blocker-alert-box">
                  <i class="bi bi-exclamation-octagon-fill me-1"></i>${VehicleController.escape(row.dependency_blockers[0])}
                </div>
              `;
            }

            const text = data ? VehicleController.escape(data) : "";

            return `
              <div class="remarks-cell-box"
                   ondblclick="event.stopPropagation(); VehicleController.openQuickRemarks('${row.vehicle_id}', '${VehicleController.escape(data || '')}')"
                   title="Double-click to edit remarks">
                ${blockerHtml}
                ${text ? `<span>${text}</span>` : `<span class="text-muted fst-italic no-print-placeholder">Double-click to add note...</span>`}
              </div>
            `;
          }
        },
        // 7. Action Controls
        {
          data: null,
          orderable: false,
          className: "text-end action-col",
          render: (data, type, row) => `
            <div class="d-inline-flex gap-2 p-2" onclick="event.stopPropagation()">
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

    $("#vehicleDataTable tbody").on("dblclick", "tr", function (e) {
      if ($(e.target).closest(".exp-pill, .remarks-cell-box, .btn, a, button").length > 0) return;
      const data = VehicleController.dataTable.row(this).data();
      if (data && data.vehicle_id) {
        VehicleController.openView(data.vehicle_id);
      }
    });

    $.fn.dataTable.ext.search.push((settings, data, dataIndex, rowData) => {
      const customerVal = document.getElementById("customerFilter").value;
      const statusVal = document.getElementById("statusFilter").value;
      const catVal = document.getElementById("categoryFilter").value;
      const filterPermitOnly = document.getElementById("btnTogglePermit").checked;
      const filterNPOnly = document.getElementById("btnToggleNP").checked;

      const dateFrom = document.getElementById("customDateFrom").value;
      const dateTo = document.getElementById("customDateTo").value;

      if (customerVal && String(rowData.customer_id) !== String(customerVal)) return false;
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
    const refreshBtn = document.getElementById("btnRefresh");
    const refreshText = document.getElementById("refreshBtnText");

    if (icon) icon.classList.add("spin-animation");
    if (refreshBtn) refreshBtn.disabled = true;

    try {
      const cacheBust = `?_nocache=${Date.now()}`;
      const [vehicles, customers] = await Promise.all([
        Api.request(`/vehicles${cacheBust}`),
        Api.request(`/customers${cacheBust}`)
      ]);

      if (refreshBtn) {
        refreshBtn.classList.remove("btn-refresh-needed", "btn-danger");
        refreshBtn.classList.add("btn-outline-secondary");
      }
      if (refreshText) refreshText.innerText = "Refresh";

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
      if (refreshBtn) {
        refreshBtn.classList.remove("btn-outline-secondary");
        refreshBtn.classList.add("btn-refresh-needed");
      }
      if (refreshText) refreshText.innerText = "Reload Needed!";

      this.showToast("Failed to load data: " + err.message, "error");
    } finally {
      if (icon) icon.classList.remove("spin-animation");
      if (refreshBtn) refreshBtn.disabled = false;
    }
  },

  populateCustomerFilter() {
    const custFilterSelect = document.getElementById("customerFilter");
    if (this.tomSelectFilter) {
      this.tomSelectFilter.destroy();
      this.tomSelectFilter = null;
    }

    custFilterSelect.innerHTML = '<option value="">All Customers</option>' +
      this.customerList.map(c => `
        <option value="${c.id}">
          ${c.name} (${c.mobile || ''})
        </option>
      `).join('');

    this.tomSelectFilter = new TomSelect("#customerFilter", {
      create: false,
      placeholder: "Search customer or firm...",
      allowEmptyOption: true
    });
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
      this.showToast(`Updated date for ${vehicle.registration_no}`);
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
    this.activeViewVehicleId = id;

    document.getElementById("viewRegNo").innerText = v.registration_no;

    const cust = this.customerList.find(c => String(c.id) === String(v.customer_id)) || {};
    const numbers = [v.customer_mobile, v.mobile, v.phone, v.alt_mobile, cust.mobile, cust.phone].filter(Boolean);
    const uniquePhones = [...new Set(numbers)].join(", ") || "No phone registered";

    document.getElementById("viewCustomerInfo").innerText = `Owner: ${v.owner_name} | Firm: ${v.customer_name || 'Individual'} (${uniquePhones})`;

    const isLTT = v.tax_type === "Lifetime";

    const renderDateBlock = (label, dateVal) => {
      const days = this.getDaysLeft(dateVal);
      let badge = '<span class="text-muted small">Not set</span>';
      if (dateVal) {
        let badgeClass = "bg-success";
        let text = `${days} days left`;
        if (days <= 0) { badgeClass = "bg-danger"; text = "Expired"; }
        else if (days <= 15) { badgeClass = "bg-warning text-dark"; text = `${days} days (Urgent)`; }
        else if (days <= 30) { badgeClass = "bg-info text-dark"; text = `${days} days`; }

        badge = `<span class="fw-bold">${this.formatDisplayDate(dateVal)}</span> <span class="badge ${badgeClass} ms-2">${text}</span>`;
      }
      return `
        <div class="col-sm-6 border-bottom py-2">
          <small class="text-secondary d-block">${label}</small>
          <div>${badge}</div>
        </div>
      `;
    };

    document.getElementById("viewModalBody").innerHTML = `
      <div class="row g-2">
        <div class="col-sm-6 border-bottom py-2">
          <small class="text-secondary d-block">Status</small>
          <span class="badge ${v.active_status === 'Active' ? 'bg-success' : 'bg-secondary'}">${this.escape(v.active_status || 'Active')}</span>
        </div>
        <div class="col-sm-6 border-bottom py-2">
          <small class="text-secondary d-block">Category &amp; Tyres</small>
          <strong>${this.escape(v.vehicle_category)} (${v.no_of_tyres ? `${v.no_of_tyres} TYRE` : 'N/A'})</strong>
        </div>
        <div class="col-sm-6 border-bottom py-2">
          <small class="text-secondary d-block">Chassis Number</small>
          <code>${this.escape(v.chassis_no) || '-'}</code>
        </div>
        <div class="col-sm-6 border-bottom py-2">
          <small class="text-secondary d-block">Engine Number</small>
          <code>${this.escape(v.engine_no) || '-'}</code>
        </div>
        <div class="col-sm-6 border-bottom py-2">
          <small class="text-secondary d-block">Date of Registration</small>
          <strong>${this.formatDisplayDate(v.date_of_registration)}</strong>
        </div>
        <div class="col-sm-6 border-bottom py-2">
          <small class="text-secondary d-block">Tax Type &amp; Amount</small>
          <strong>${isLTT ? 'Lifetime Tax (LTT)' : `₹${Number(v.tax_amount || 0).toLocaleString('en-IN')} (Quarterly)`}</strong>
        </div>

        ${renderDateBlock("State Permit Expiry", v.permit_applicable === 'Yes' ? v.permit_expiry : null)}
        ${renderDateBlock("National Permit Expiry", v.national_permit_applicable === 'Yes' ? v.national_permit_expiry : null)}
        ${renderDateBlock("Fitness Certificate (FC) Expiry", v.fc_expiry)}
        ${renderDateBlock("Road Tax Due Date", isLTT ? null : v.road_tax_due)}
        ${renderDateBlock("Insurance Expiry", v.insurance_expiry)}
        ${renderDateBlock("Pollution (PUC) Expiry", v.puc_expiry)}
        ${renderDateBlock("Green Tax Due", v.green_tax_due)}

        <div class="col-12 mt-3 pt-2">
          <small class="text-secondary d-block mb-1">Remarks &amp; Notes</small>
          <div class="p-2 bg-light rounded border fw-semibold" style="color: #ea580c;">${this.escape(v.remarks) || '<span class="text-muted">No notes recorded</span>'}</div>
        </div>
      </div>
    `;

    this.viewModal.show();
  },

  setupCustomerSelect(selectedId = null) {
    const select = document.getElementById("v_cust_id");

    if (this.tomSelectForm) {
      this.tomSelectForm.destroy();
      this.tomSelectForm = null;
    }

    select.innerHTML = '<option value="">Search customer or firm...</option>' +
      this.customerList.map(c => `
        <option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>
          ${c.name} (${c.mobile || ''})
        </option>
      `).join('');

    this.tomSelectForm = new TomSelect("#v_cust_id", {
      create: false,
      maxItems: 1,
      placeholder: "Search customer or firm..."
    });

    if (selectedId) {
      this.tomSelectForm.setValue(selectedId, true);
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
    document.getElementById("vehicleForm").reset();
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
const tyre = String(v.no_of_tyres).trim();

tyreEl.value = tyre.includes("TYRE") ? tyre : tyre + " TYRE";

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
      no_of_tyres: document.getElementById("v_no_of_tyres").value,
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