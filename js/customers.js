/**
 * CustomerController Module
 * Handles DataTables initialization, skeleton loading state, button spinners, and CRUD operations.
 */
const CustomerController = {
  dataTable: null,
  data: [],
  customerModal: null,
  fleetModal: null,
  toastInstance: null,

  init() {
    this.customerModal = new bootstrap.Modal(document.getElementById("customerModal"));
    this.fleetModal = new bootstrap.Modal(document.getElementById("customerFleetModal"));
    this.toastInstance = new bootstrap.Toast(document.getElementById("liveToast"), { delay: 4000 });

    this.initDataTable();
    this.load();
  },

  showToast(message, type = "success") {
    const toastEl = document.getElementById("liveToast");
    const msgEl = document.getElementById("toastMessage");
    toastEl.className = `toast align-items-center text-white border-0 bg-${type === "error" ? "danger" : type}`;
    msgEl.innerText = message;
    this.toastInstance.show();
  },

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  cleanPhone(phone) {
    return (phone || "").replace(/\D/g, "");
  },

  // Generates 4 rows of animated placeholder cells
  renderSkeleton() {
    const tbody = document.getElementById("customerTableBody");
    const skeletonRows = Array.from({ length: 4 }).map(() => `
      <tr class="skeleton-row">
        <td><div class="skeleton-box" style="width: 70px;"></div></td>
        <td><div class="skeleton-box" style="width: 160px;"></div></td>
        <td><div class="skeleton-box" style="width: 120px;"></div></td>
        <td><div class="skeleton-box" style="width: 200px;"></div></td>
        <td class="text-center"><div class="skeleton-box" style="width: 60px;"></div></td>
        <td><div class="skeleton-box" style="width: 80px;"></div></td>
        <td><div class="skeleton-box" style="width: 65px;"></div></td>
        <td class="text-end"><div class="skeleton-box" style="width: 50px;"></div></td>
      </tr>
    `).join("");

    tbody.innerHTML = skeletonRows;
  },

  initDataTable() {
    this.dataTable = $("#customerDataTable").DataTable({
      paging: true,
      pageLength: 10,
      lengthMenu: [5, 10, 25, 50, 100],
      searching: true,
      ordering: true,
      info: true,
      responsive: true,
      language: {
        search: "_INPUT_",
        searchPlaceholder: "Search any field...",
        lengthMenu: "Show _MENU_ records",
        emptyTable: "No customers found in database",
        info: "Showing _START_ to _END_ of _TOTAL_ customers",
        paginate: {
          previous: "<i class='bi bi-chevron-left'></i>",
          next: "<i class='bi bi-chevron-right'></i>"
        }
      },
      columns: [
        { data: "id", className: "fw-bold text-muted" },
        { 
          data: "name", 
          className: "fw-semibold text-primary",
          render: (data) => CustomerController.escapeHtml(data)
        },
        { 
          data: null,
          render: (data, type, row) => {
            const p1 = CustomerController.cleanPhone(row.mobile);
            const p2 = CustomerController.cleanPhone(row.mobile_2);
            const p3 = CustomerController.cleanPhone(row.mobile_3);
            const waText = encodeURIComponent(`Hello ${row.name}, regarding your vehicle compliance documents from FleetERP.`);

            const primaryContact = `
              <div class="d-flex align-items-center gap-2 mb-1">
                <a href="tel:+91${p1}" class="text-decoration-none fw-bold text-dark contact-phone-badge">${CustomerController.escapeHtml(row.mobile)}</a>
                <a href="https://wa.me/91${p1}?text=${waText}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-success border-0 p-0 px-1 whatsapp-action-btn" title="Message on WhatsApp">
                  <i class="bi bi-whatsapp"></i>
                </a>
              </div>
            `;

            let extraContacts = "";
            if (p2 || p3) {
              extraContacts = `
                <div class="text-muted small d-flex gap-2">
                  ${p2 ? `<a href="tel:+91${p2}" class="text-secondary text-decoration-none"><i class="bi bi-telephone me-1"></i>${CustomerController.escapeHtml(row.mobile_2)}</a>` : ""}
                  ${p3 ? `<a href="tel:+91${p3}" class="text-secondary text-decoration-none"><i class="bi bi-telephone me-1"></i>${CustomerController.escapeHtml(row.mobile_3)}</a>` : ""}
                </div>
              `;
            }
            return `${primaryContact}${extraContacts}`;
          }
        },
        { 
          data: null,
          render: (data, type, row) => {
            return `
              <div class="text-truncate" style="max-width: 220px;" title="${CustomerController.escapeHtml(row.address)}">${CustomerController.escapeHtml(row.address) || '<span class="text-muted">-</span>'}</div>
              <div class="text-muted" style="font-size: 0.75rem;">${CustomerController.escapeHtml(row.remarks) || ''}</div>
            `;
          }
        },
        { 
          data: "total_vehicles",
          className: "text-center",
          render: (data, type, row) => {
            return `
              <button class="btn btn-sm btn-outline-dark py-0 px-2" onclick='CustomerController.viewFleetById("${CustomerController.escapeHtml(row.id)}")'>
                <i class="bi bi-truck me-1"></i>${data || 0}
              </button>
            `;
          }
        },
        { 
          data: "overall_health",
          render: (data, type, row) => {
            if (data === "EXPIRED") {
              return `<span class="badge badge-expired"><i class="bi bi-exclamation-circle-fill me-1"></i>${row.expired_count} Expired</span>`;
            } else if (data === "URGENT") {
              return `<span class="badge badge-urgent"><i class="bi bi-clock-fill me-1"></i>${row.urgent_count} Due Soon</span>`;
            } else if (data === "HEALTHY") {
              return `<span class="badge badge-valid"><i class="bi bi-check-circle-fill me-1"></i>All Clear</span>`;
            }
            return `<span class="badge bg-light text-muted border">No Fleet</span>`;
          }
        },
        { 
          data: "status",
          render: (data, type, row) => {
            const isActive = (data || "active") === "active";
            return `
              <button id="btnStatus_${CustomerController.escapeHtml(row.id)}" 
                      class="btn btn-sm ${isActive ? 'btn-outline-success' : 'btn-outline-secondary'} py-0 px-2 rounded-pill"
                      onclick="CustomerController.toggleStatus('${CustomerController.escapeHtml(row.id)}', '${data}')"
                      title="Click to toggle status">
                ${isActive ? 'Active' : 'Inactive'}
              </button>
            `;
          }
        },
        { 
          data: null,
          orderable: false,
          className: "text-end action-btn-group",
          render: (data, type, row) => {
            return `
              <button class="btn btn-sm btn-outline-primary me-1" onclick='CustomerController.openEditById("${CustomerController.escapeHtml(row.id)}")' title="Edit">
                <i class="bi bi-pencil"></i>
              </button>
              <button id="btnDel_${CustomerController.escapeHtml(row.id)}" class="btn btn-sm btn-outline-danger" onclick="CustomerController.delete('${CustomerController.escapeHtml(row.id)}', ${row.total_vehicles || 0})" title="Delete">
                <i class="bi bi-trash"></i>
              </button>
            `;
          }
        }
      ]
    });

    // Custom filtering function for health status
    $.fn.dataTable.ext.search.push((settings, data, dataIndex, rowData) => {
      const selectedHealth = document.getElementById("healthFilter").value;
      if (!selectedHealth) return true;
      return rowData.overall_health === selectedHealth;
    });
  },

  async load() {
    const refreshIcon = document.getElementById("refreshIcon");
    if (refreshIcon) refreshIcon.classList.add("spin-animation");

    // Clear DataTables display and show skeleton rows during fetch
    this.dataTable.clear().draw(false);
    this.renderSkeleton();

    try {
      this.data = await Api.request("/customers");
      this.dataTable.clear().rows.add(this.data).draw();
    } catch (err) {
      this.showToast("Failed to load customers: " + err.message, "error");
    } finally {
      if (refreshIcon) refreshIcon.classList.remove("spin-animation");
    }
  },

  applyHealthFilter() {
    if (this.dataTable) {
      this.dataTable.draw();
    }
  },

 viewFleetById(customerId) {
    const customer = this.data.find(c => c.id === customerId);
    if (!customer) return;

    document.getElementById("fleetModalCustomerName").innerText = `${customer.name}'s Fleet`;
    document.getElementById("fleetModalCustomerId").innerText = `Client ID: ${customer.id} | Total Vehicles: ${customer.total_vehicles || 0}`;

    const tbody = document.getElementById("fleetModalRows");
    const vehicles = Array.isArray(customer.vehicles) ? customer.vehicles : [];

    if (vehicles.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No vehicles registered for this client.</td></tr>`;
    } else {
        tbody.innerHTML = vehicles.map(v => {
            let badge = '<span class="badge badge-valid">Valid</span>';
            if (v.compliance_status === "EXPIRED") badge = '<span class="badge badge-expired">Expired</span>';
            if (v.compliance_status === "EXPIRING_SOON") badge = '<span class="badge badge-urgent">Action Due</span>';

            return `
              <tr>
                <td class="fw-bold text-primary">${this.escapeHtml(v.registration_no)}</td>
                <td><span class="badge bg-secondary">${this.escapeHtml(v.vehicle_category)}</span></td>
                <td>${Api.formatDateBadge(v.insurance_expiry)}</td>
                <td>${Api.formatDateBadge(v.fc_expiry)}</td>
                <td>${Api.formatDateBadge(v.puc_expiry)}</td>
                <td>${Api.formatDateBadge(v.road_tax_due)}</td>
                <td>${Api.formatDateBadge(v.permit_expiry)}</td>
                <td>${Api.formatDateBadge(v.national_permit_expiry)}</td>
                <td>${badge}</td>
              </tr>
            `;
        }).join("");
    }

    this.fleetModal.show();
},

  openModal() {
    document.getElementById("customerModalTitle").innerText = "Add Customer";
    document.getElementById("cust_id").value = "";
    document.getElementById("cust_name").value = "";
    document.getElementById("cust_mobile").value = "";
    document.getElementById("cust_mobile_2").value = "";
    document.getElementById("cust_mobile_3").value = "";
    document.getElementById("cust_address").value = "";
    document.getElementById("cust_remarks").value = "";
    document.getElementById("cust_status").value = "active";
    this.customerModal.show();
  },

  openEditById(customerId) {
    const customer = this.data.find(c => c.id === customerId);
    if (!customer) return;

    document.getElementById("customerModalTitle").innerText = "Edit Customer";
    document.getElementById("cust_id").value = customer.id;
    document.getElementById("cust_name").value = customer.name || "";
    document.getElementById("cust_mobile").value = customer.mobile || "";
    document.getElementById("cust_mobile_2").value = customer.mobile_2 || "";
    document.getElementById("cust_mobile_3").value = customer.mobile_3 || "";
    document.getElementById("cust_address").value = customer.address || "";
    document.getElementById("cust_remarks").value = customer.remarks || "";
    document.getElementById("cust_status").value = customer.status || "active";
    this.customerModal.show();
  },

  async save() {
    const saveBtn = document.getElementById("btnSaveCustomer");
    const spinner = document.getElementById("saveBtnSpinner");
    const btnText = document.getElementById("saveBtnText");
    const id = document.getElementById("cust_id").value;

    const rawMobile = this.cleanPhone(document.getElementById("cust_mobile").value);
    if (rawMobile.length !== 10) {
      this.showToast("Primary Mobile must be exactly 10 digits.", "warning");
      return;
    }

    const payload = {
      id: id || undefined,
      name: document.getElementById("cust_name").value.trim(),
      mobile: rawMobile,
      mobile_2: this.cleanPhone(document.getElementById("cust_mobile_2").value) || null,
      mobile_3: this.cleanPhone(document.getElementById("cust_mobile_3").value) || null,
      address: document.getElementById("cust_address").value.trim() || null,
      remarks: document.getElementById("cust_remarks").value.trim() || null,
      status: document.getElementById("cust_status").value
    };

    saveBtn.disabled = true;
    spinner.classList.remove("d-none");
    btnText.innerText = "Saving...";

    try {
      const method = id ? "PUT" : "POST";
      await Api.request("/customers", method, payload);
      this.customerModal.hide();
      this.showToast(`Customer ${id ? "updated" : "created"} successfully!`, "success");
      await this.load();
    } catch (err) {
      this.showToast(err.message, "error");
    } finally {
      saveBtn.disabled = false;
      spinner.classList.add("d-none");
      btnText.innerText = "Save Customer";
    }
  },

  async toggleStatus(id, currentStatus) {
    const btn = document.getElementById(`btnStatus_${id}`);
    const originalText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm" style="width: 0.75rem; height: 0.75rem;"></span>`;
    }

    const newStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      await Api.request("/customers", "PUT", { id, status: newStatus });
      this.showToast(`Account status updated to ${newStatus}.`, "info");
      await this.load();
    } catch (err) {
      this.showToast(err.message, "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  },

  async delete(id, totalVehicles) {
    if (totalVehicles > 0) {
      this.showToast(`Action Blocked: Customer has ${totalVehicles} vehicle(s) assigned. Reassign or delete them first.`, "warning");
      return;
    }

    if (!confirm("Are you sure you want to delete this customer record? This cannot be undone.")) return;

    const delBtn = document.getElementById(`btnDel_${id}`);
    if (delBtn) {
      delBtn.disabled = true;
      delBtn.innerHTML = `<span class="spinner-border spinner-border-sm" style="width: 0.75rem; height: 0.75rem;"></span>`;
    }

    try {
      await Api.request(`/customers?id=${id}`, "DELETE");
      this.showToast("Customer deleted successfully.", "success");
      await this.load();
    } catch (err) {
      this.showToast(err.message, "error");
      if (delBtn) {
        delBtn.disabled = false;
        delBtn.innerHTML = `<i class="bi bi-trash"></i>`;
      }
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  Auth.requireAuth();
  Auth.initNavbarUser();
  CustomerController.init();
});