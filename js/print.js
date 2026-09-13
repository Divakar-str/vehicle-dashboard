/**
 * PrintController Module - Full-Pledged Enterprise Print & Export Engine
 */
const PrintController = {
  vehicles: [],
  customers: [],

  async init() {
    document.getElementById("printDateStamp").innerText = new Date().toLocaleString();
    
    const params = new URLSearchParams(window.location.search);
    if (params.has("customer_id")) {
      document.getElementById("controlFilterType").value = "CUSTOMER";
      this.handleFilterTypeChange();
      setTimeout(() => {
        const custSearch = document.getElementById("printSearchCustomer");
        const targetCust = this.customers.find(c => c.id === params.get("customer_id") || c.customer_id === params.get("customer_id"));
        if (custSearch && targetCust) {
          custSearch.value = targetCust.customer_name || targetCust.name;
          document.getElementById("selectedCustomerId").value = targetCust.id || targetCust.customer_id;
        }
        this.applyFiltersAndRender();
      }, 100);
    } else {
      await this.loadData();
    }
  },

  toggleAllCheckboxes(selector, state) {
    document.querySelectorAll(selector).forEach(chk => {
      chk.checked = state;
    });
    this.applyFiltersAndRender();
  },

  handleFilterTypeChange() {
    const filterType = document.getElementById("controlFilterType").value;
    const container = document.getElementById("dynamicSubFilterContainer");
    if (!container) return;

    if (filterType === "CUSTOM") {
      container.innerHTML = `
        <label class="form-label small fw-bold text-secondary">Date Range</label>
        <div class="input-group input-group-sm">
          <input type="date" id="printDateFrom" class="form-control" onchange="PrintController.applyFiltersAndRender()">
          <span class="input-group-text">to</span>
          <input type="date" id="printDateTo" class="form-control" onchange="PrintController.applyFiltersAndRender()">
        </div>
      `;
    } else if (filterType === "CUSTOMER") {
      container.innerHTML = `
        <label class="form-label small fw-bold text-secondary">Search Owner / Client</label>
        <div class="position-relative">
          <input type="text" id="printSearchCustomer" class="form-control form-control-sm fw-bold" placeholder="Type customer name..." onkeyup="PrintController.filterCustomerDropdown(this.value)" autocomplete="off">
          <input type="hidden" id="selectedCustomerId" value="">
          <div id="customerSuggestionsList" class="dropdown-menu w-100 shadow-sm p-1" style="max-height: 150px; overflow-y: auto; display: none; position: absolute; z-index: 1000;"></div>
        </div>
      `;
    } else if (filterType === "DOC_TYPE") {
      container.innerHTML = `
        <label class="form-label small fw-bold text-secondary">Select Document</label>
        <select id="printSelectDoc" class="form-select form-select-sm fw-bold" onchange="PrintController.applyFiltersAndRender()">
          <option value="fc">Fitness (FC)</option>
          <option value="permit">Permit</option>
          <option value="np">National Permit</option>
          <option value="tax">Road Tax</option>
          <option value="ins">Insurance</option>
          <option value="puc">Pollution (PUC)</option>
          <option value="green_tax">Green Tax</option>
        </select>
      `;
    } else {
      container.innerHTML = ``;
    }

    this.applyFiltersAndRender();
  },

  filterCustomerDropdown(query) {
    const listDiv = document.getElementById("customerSuggestionsList");
    if (!listDiv) return;

    if (!query.trim()) {
      listDiv.style.display = "none";
      document.getElementById("selectedCustomerId").value = "";
      this.applyFiltersAndRender();
      return;
    }

    const matches = this.customers.filter(c => {
      const name = (c.customer_name || c.name || "").toLowerCase();
      const mob = (c.mobile_no_1 || c.mobile || "").toLowerCase();
      return name.includes(query.toLowerCase()) || mob.includes(query.toLowerCase());
    });

    if (matches.length === 0) {
      listDiv.innerHTML = `<div class="dropdown-item small text-muted">No customers found</div>`;
      listDiv.style.display = "block";
      return;
    }

    listDiv.innerHTML = matches.map(c => `
      <div class="dropdown-item small fw-bold py-1" style="cursor: pointer;" onclick="PrintController.selectCustomer('${c.id || c.customer_id}', '${this.escape(c.customer_name || c.name)}')">
        ${this.escape(c.customer_name || c.name)} <span class="text-muted font-monospace">(${c.mobile_no_1 || c.mobile || '-'})</span>
      </div>
    `).join("");

    listDiv.style.display = "block";
  },

  selectCustomer(id, name) {
    document.getElementById("printSearchCustomer").value = name;
    document.getElementById("selectedCustomerId").value = id;
    document.getElementById("customerSuggestionsList").style.display = "none";
    this.applyFiltersAndRender();
  },

  downloadPDF() {
    const element = document.getElementById("printableArea");
    const opt = {
      margin:       5,
      filename:     `Fleet_Compliance_Statement_${new Date().toISOString().split('T')[0]}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    document.querySelectorAll('.no-print').forEach(el => el.style.display = 'none');

    html2pdf().from(element).set(opt).save().then(() => {
      document.querySelectorAll('.no-print').forEach(el => el.style.display = '');
    });
  },

  formatDisplayDate(dateStr, blankOut = false) {
    if (blankOut || !dateStr) return "-";
    const cleanStr = String(dateStr).split("T")[0];
    const parts = cleanStr.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return cleanStr;
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

      this.vehicles = vData || [];
      this.customers = cData || [];

      this.applyFiltersAndRender();
    } catch (err) {
      alert("Failed to load print data: " + err.message);
    }
  },

  resetFilters() {
    document.getElementById("controlFilterType").value = "ALL";
    document.getElementById("printSearchInput").value = "";
    document.getElementById("toggleMakeDatesEmpty").checked = false;
    document.getElementById("printLayoutMode").value = "table";
    document.getElementById("dynamicSubFilterContainer").innerHTML = "";
    
    // Customer columns default to checked
    document.querySelectorAll(".cust-col-chk").forEach(chk => chk.checked = true);

    // Vehicle fields default to Owner, Chassis, Tax Amount, and Remarks checked
    document.querySelectorAll(".veh-col-chk").forEach(chk => {
      const val = chk.value;
      chk.checked = (val === 'owner' || val === 'chassis' || val === 'tax_amount' || val === 'remarks');
    });

    document.querySelectorAll(".doc-filter-chk").forEach(chk => chk.checked = true);

    this.applyFiltersAndRender();
  },

  applyFiltersAndRender() {
    const params = new URLSearchParams(window.location.search);
    const urlVehicleId = params.get("vehicle_id");

    const filterType = document.getElementById("controlFilterType").value;
    const searchQuery = document.getElementById("printSearchInput").value.trim().toLowerCase();
    const makeEmpty = document.getElementById("toggleMakeDatesEmpty").checked;
    const layoutMode = document.getElementById("printLayoutMode").value;

    let list = [...this.vehicles];
    let labelParts = [`Mode: ${filterType}`];

    if (urlVehicleId) list = list.filter(v => v.vehicle_id === urlVehicleId || v.id === urlVehicleId);

    if (filterType === "TODAY") {
      const todayStr = new Date().toISOString().split('T')[0];
      list = list.filter(v => {
        const dates = [v.fc_expiry, v.permit_expiry, v.national_permit_expiry, v.road_tax_due, v.insurance_expiry, v.puc_expiry, v.green_tax_due].filter(Boolean);
        return dates.some(d => String(d).split('T')[0] === todayStr);
      });
    } else if (filterType === "OVERDUE") {
      list = list.filter(v => (v.min_days_remaining ?? 999) <= 0);
    } else if (filterType === "CUSTOM") {
      const dFrom = document.getElementById("printDateFrom")?.value;
      const dTo = document.getElementById("printDateTo")?.value;
      if (dFrom || dTo) {
        list = list.filter(v => {
          const dates = [v.fc_expiry, v.permit_expiry, v.national_permit_expiry, v.road_tax_due, v.insurance_expiry, v.puc_expiry].filter(Boolean);
          return dates.some(d => {
            const cleanD = String(d).split('T')[0];
            if (dFrom && cleanD < dFrom) return false;
            if (dTo && cleanD > dTo) return false;
            return true;
          });
        });
      }
    } else if (filterType === "CUSTOMER") {
      const selectedCustId = document.getElementById("selectedCustomerId")?.value;
      if (selectedCustId) {
        list = list.filter(v => v.customer_id === selectedCustId);
      }
    } else if (filterType === "DOC_TYPE") {
      const docKey = document.getElementById("printSelectDoc")?.value || "fc";
      labelParts.push(`Doc: ${docKey.toUpperCase()}`);
    }

    if (searchQuery) {
      list = list.filter(v => {
        const cust = this.customers.find(c => c.id === v.customer_id || c.customer_id === v.customer_id) || {};
        const combined = `${v.registration_no} ${v.owner_name} ${v.engine_no} ${v.chassis_no} ${cust.customer_name || cust.name} ${cust.mobile_no_1 || cust.mobile} ${v.remarks}`.toLowerCase();
        return combined.includes(searchQuery);
      });
    }

    document.getElementById("printFilterLabel").innerText = labelParts.join(" | ");

    list.sort((a, b) => {
      const custA = this.customers.find(c => c.id === a.customer_id || c.customer_id === a.customer_id) || {};
      const custB = this.customers.find(c => c.id === b.customer_id || c.customer_id === b.customer_id) || {};
      const cA = (a.customer_name || custA.customer_name || custA.name || "").toLowerCase();
      const cB = (b.customer_name || custB.customer_name || custB.name || "").toLowerCase();
      return cA.localeCompare(cB);
    });

    if (layoutMode === "cards" || (urlVehicleId && list.length === 1)) {
      this.renderCardStatement(list, makeEmpty);
    } else {
      document.getElementById("printCardContainer").classList.add("d-none");
      document.getElementById("printTableWrapper").classList.remove("d-none");
      this.renderTable(list, makeEmpty);
    }
  },

  renderCardStatement(list, makeEmpty) {
    const cardContainer = document.getElementById("printCardContainer");
    document.getElementById("printTableWrapper").classList.add("d-none");
    cardContainer.classList.remove("d-none");

    if (list.length === 0) {
      cardContainer.innerHTML = `<div class="col-12 text-center text-muted py-4">No records found matching criteria.</div>`;
      return;
    }

    cardContainer.innerHTML = list.map((v, idx) => {
      const cust = this.customers.find(c => c.id === v.customer_id || c.customer_id === v.customer_id) || {};
      const cName = this.escape(v.customer_name || cust.customer_name || cust.name || 'Individual');
      const mob1 = this.escape(cust.mobile_no_1 || cust.mobile || v.customer_mobile || '-');
      const address = this.escape(cust.address || '');
      const remarks = this.escape(v.remarks || cust.remarks || 'None');
      const taxAmtStr = v.tax_amount ? ` (₹${v.tax_amount})` : '';

      return `
        <div class="col-md-6">
          <div class="print-vehicle-card h-100">
            <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
              <span class="print-reg-plate">#${idx + 1} - ${this.escape(v.registration_no)}</span>
              <span class="badge ${v.active_status === 'Inactive' ? 'bg-secondary' : (v.compliance_status === 'EXPIRED' ? 'bg-danger' : 'bg-success')}">${v.active_status || v.compliance_status || 'ACTIVE'}</span>
            </div>
            <div class="small">
              <div><strong>Customer:</strong> ${cName} (<span class="font-monospace">${mob1}</span>)</div>
              ${address ? `<div><strong>Address:</strong> ${address}</div>` : ''}
              <div> ${this.escape(v.owner_name || '-')} | <strong>Chassis:</strong> <span class="font-monospace">${this.escape(v.chassis_no || '-')}</span></div>
              <div><strong>Tax Amount:</strong> <span class="font-monospace text-dark fw-bold">₹${v.tax_amount || '0'}</span></div>
              <hr class="my-2">
              <div><strong>FC:</strong> <span class="font-monospace">${this.formatDisplayDate(v.fc_expiry, makeEmpty)}</span> | <strong>Ins:</strong> <span class="font-monospace">${this.formatDisplayDate(v.insurance_expiry, makeEmpty)}</span></div>
              <div><strong>Permit:</strong> <span class="font-monospace">${v.permit_applicable === 'Yes' ? this.formatDisplayDate(v.permit_expiry, makeEmpty) : 'N/A'}</span></div>
              <div><strong>Road Tax:</strong> <span class="font-monospace">${v.tax_type || '-'} ${taxAmtStr} due: ${this.formatDisplayDate(v.road_tax_due, makeEmpty)}</span></div>
              <div><strong>PUC:</strong> <span class="font-monospace">${this.formatDisplayDate(v.puc_expiry, makeEmpty)}</span></div>
              <div><strong>Remarks:</strong> <span class="text-danger">${remarks}</span></div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  renderTable(list, makeEmpty) {
    const tbody = document.getElementById("printTableBody");
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">No records found matching print criteria.</td></tr>`;
      return;
    }

    const filterType = document.getElementById("controlFilterType").value;
    const specificDocKey = filterType === "DOC_TYPE" ? document.getElementById("printSelectDoc")?.value : null;

    const getChk = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.checked : true;
    };

    const showCustName = getChk('.cust-col-chk[value="name"]');
    const showCustMob1 = getChk('.cust-col-chk[value="mob1"]');
    const showCustMob2 = getChk('.cust-col-chk[value="mob2"]');
    const showCustMob3 = getChk('.cust-col-chk[value="mob3"]');
    const showCustAddr = getChk('.cust-col-chk[value="address"]');

    const showVehCat = getChk('.veh-col-chk[value="category"]');
    const showVehOwner = getChk('.veh-col-chk[value="owner"]');
    const showVehEngine = getChk('.veh-col-chk[value="engine"]');
    const showVehChassis = getChk('.veh-col-chk[value="chassis"]');
    const showVehRegDate = getChk('.veh-col-chk[value="reg_date"]');
    const showVehTyres = getChk('.veh-col-chk[value="tyres"]');
    const showVehTaxAmt = getChk('.veh-col-chk[value="tax_amount"]');
    const showVehRemarks = getChk('.veh-col-chk[value="remarks"]');

    const isDocMode = filterType === "DOC_TYPE";

    let html = "";
    let lastCustId = null;
    let customerRowSpans = {};

    list.forEach(v => {
      const cKey = v.customer_id;
      customerRowSpans[cKey] = (customerRowSpans[cKey] || 0) + 1;
    });

    list.forEach((v, idx) => {
      const cust = this.customers.find(c => c.id === v.customer_id || c.customer_id === v.customer_id) || {};
      const cName = this.escape(v.customer_name || cust.customer_name || cust.name || 'Individual');
      const mob1 = this.escape(cust.mobile_no_1 || cust.mobile || v.customer_mobile || '-');
      const mob2 = this.escape(cust.mobile_no_2 || cust.alt_mobile || '');
      const mob3 = this.escape(cust.mobile_no_3 || '');
      const address = this.escape(cust.address || '');

      const ownerName = this.escape(v.owner_name || '-');
      const engineNo = this.escape(v.engine_no || '-');
      const chassisNo = this.escape(v.chassis_no || '-');
      const cat = this.escape(v.vehicle_category || 'LGV');
      const regDate = this.formatDisplayDate(v.date_of_registration, makeEmpty);
      const tyres = v.no_of_tyres || '-';
      const taxAmount = v.tax_amount ? `₹${v.tax_amount}` : '-';
      const remarks = this.escape(v.remarks || '');
      const isNewCustomer = v.customer_id !== lastCustId;

      html += `<tr class="print-group-row">`;

      // Column 1: S.No
      html += `<td class="text-center fw-extrabold">${idx + 1}</td>`;

      // Column 2: Vehicle Details
      html += `<td>
        <div class="print-reg-plate">${this.escape(v.registration_no)}</div>`;
      if (showVehCat) html += `<div class="text-secondary small fw-bold"> ${cat}</div>`;
      if (showVehOwner) html += `<div class="text-dark small fw-extrabold">${ownerName}</div>`;
      if (showVehEngine) html += `<div class="font-monospace text-muted small">Eng: ${engineNo}</div>`;
      if (showVehChassis) html += `<div class="font-monospace text-muted small">Ch: ${chassisNo}</div>`;
      if (showVehRegDate && regDate !== '-') html += `<div class="text-muted small">Reg: ${regDate}</div>`;
      if (showVehTyres && tyres !== '-') html += `<div class="text-muted small">${tyres}</div>`;
      if (showVehTaxAmt && taxAmount !== '-') html += `<div class="text-dark fw-bold small"> ${taxAmount}</div>`;
      html += `</td>`;

      // Column 3: Customer / Owner Group (Merged cell)
      if (isNewCustomer) {
        const span = customerRowSpans[v.customer_id];
        html += `<td rowspan="${span}" class="align-middle fw-bold bg-light">`;
        if (showCustName) html += `<div class="text-dark fs-6">${cName}</div>`;
        
        let mobList = [];
        if (showCustMob1 && mob1 && mob1 !== '-') mobList.push(mob1);
        if (showCustMob2 && mob2) mobList.push(mob2);
        if (showCustMob3 && mob3) mobList.push(mob3);
        if (mobList.length > 0) {
          html += `<div class="small font-monospace text-muted mt-1"><i class="bi bi-phone me-1"></i>${mobList.join(' / ')}</div>`;
        }
        if (showCustAddr && address) {
          html += `<div class="small text-secondary mt-1 fw-normal"><i class="bi bi-geo-alt me-1"></i>${address}</div>`;
        }
        html += `</td>`;
        lastCustId = v.customer_id;
      }

      if (isDocMode) {
        let docDateVal = "-";
        let docLabel = specificDocKey.toUpperCase();
        if (specificDocKey === 'fc') { docDateVal = this.formatDisplayDate(v.fc_expiry, makeEmpty); docLabel = "Fitness (FC)"; }
        else if (specificDocKey === 'permit') { docDateVal = v.permit_applicable === 'Yes' ? this.formatDisplayDate(v.permit_expiry, makeEmpty) : 'N/A'; docLabel = "Permit"; }
        else if (specificDocKey === 'np') { docDateVal = v.national_permit_applicable === 'Yes' ? this.formatDisplayDate(v.national_permit_expiry, makeEmpty) : 'N/A'; docLabel = "National Permit"; }
        else if (specificDocKey === 'tax') { docDateVal = v.tax_type === 'Lifetime' ? 'Lifetime Tax' : this.formatDisplayDate(v.road_tax_due, makeEmpty); docLabel = "Road Tax"; }
        else if (specificDocKey === 'ins') { docDateVal = this.formatDisplayDate(v.insurance_expiry, makeEmpty); docLabel = "Insurance"; }
        else if (specificDocKey === 'puc') { docDateVal = this.formatDisplayDate(v.puc_expiry, makeEmpty); docLabel = "PUC"; }
        else if (specificDocKey === 'green_tax') { docDateVal = this.formatDisplayDate(v.green_tax_due, makeEmpty); docLabel = "Green Tax"; }

        html += `
          <td colspan="4" class="text-center">
            <div class="fw-bold text-primary">${docLabel} Expiry</div>
            <div class="font-monospace fs-6 fw-extrabold text-dark mt-1">${docDateVal}</div>
          </td>
          <td>
            <div class="mt-1"><span class="badge ${v.active_status === 'Inactive' ? 'bg-secondary' : (v.compliance_status === 'EXPIRED' ? 'bg-danger' : 'bg-success')}">${v.active_status || v.compliance_status || 'ACTIVE'}</span></div>
          </td>
        `;
      } else {
        const taxDisplay = v.tax_type === 'Lifetime' ? 'Lifetime Tax' : this.formatDisplayDate(v.road_tax_due, makeEmpty);
        const greenDisplay = v.green_tax_due ? this.formatDisplayDate(v.green_tax_due, makeEmpty) : 'N/A';
        const permitDisplay = v.permit_applicable === 'Yes' ? this.formatDisplayDate(v.permit_expiry, makeEmpty) : 'N/A';
        const npDisplay = v.national_permit_applicable === 'Yes' ? this.formatDisplayDate(v.national_permit_expiry, makeEmpty) : 'N/A';

        // Column 4: Fitness & Insurance
        html += `<td>
          <div><strong>FC:</strong> <span class="font-monospace">${this.formatDisplayDate(v.fc_expiry, makeEmpty)}</span></div>
          <div><strong>Ins:</strong> <span class="font-monospace">${this.formatDisplayDate(v.insurance_expiry, makeEmpty)}</span></div>
        </td>`;

        // Column 5: Permit & NP
        html += `<td>
          <div><strong>Permit:</strong> <span class="font-monospace">${permitDisplay}</span></div>
          <div><strong>NP:</strong> <span class="font-monospace">${npDisplay}</span></div>
        </td>`;

        // Column 6: Road & Green Tax
        html += `<td>
          <div><strong>Tax (${v.tax_type || '-'}):</strong> <span class="font-monospace">${taxDisplay}</span></div>
          <div><strong>Green:</strong> <span class="font-monospace">${greenDisplay}</span></div>
        </td>`;

        // Column 7: PUC & Status
        html += `<td>
          <div><strong>PUC:</strong> <span class="font-monospace">${this.formatDisplayDate(v.puc_expiry, makeEmpty)}</span></div>
          <div class="mt-1"><span class="badge ${v.active_status === 'Inactive' ? 'bg-secondary' : (v.compliance_status === 'EXPIRED' ? 'bg-danger' : 'bg-success')}">${v.active_status || v.compliance_status || 'ACTIVE'}</span></div>
        </td>`;
      }

      // Column 8: Remarks
      html += `<td class="font-monospace small text-danger fw-bold">${showVehRemarks ? remarks : '-'}</td>`;

      html += `</tr>`;
    });

    tbody.innerHTML = html;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  Auth.requireAuth();
  PrintController.init();
});