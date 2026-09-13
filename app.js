// Worker API URL Endpoint
const API_BASE = "https://vehicle-api.dhiwakardiva111.workers.dev/api";

// ------------------- API CLIENT -------------------
const Api = {
  getHeaders() {
    return {
      "Content-Type": "application/json",
      "X-Auth-User": sessionStorage.getItem("auth_user") || "",
      "X-Auth-Pass": sessionStorage.getItem("auth_pass") || ""
    };
  },
  async request(endpoint, method = "GET", body = null) {
    const opts = { method, headers: this.getHeaders() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    if (res.status === 401) {
      Auth.logout();
      throw new Error("Unauthorized");
    }
    return res.json();
  }
};

// ------------------- AUTHENTICATION -------------------
const Auth = {
  async login() {
    const user = document.getElementById("loginUser").value.trim();
    const pass = document.getElementById("loginPass").value.trim();

    sessionStorage.setItem("auth_user", user);
    sessionStorage.setItem("auth_pass", pass);

    try {
      await Api.request("/stats");
      document.getElementById("loginAlert").classList.add("d-none");
      this.showApp();
    } catch (e) {
      sessionStorage.clear();
      document.getElementById("loginAlert").classList.remove("d-none");
    }
  },
  logout() {
    sessionStorage.clear();
    location.reload();
  },
  check() {
    if (sessionStorage.getItem("auth_user")) {
      this.showApp();
    }
  },
  showApp() {
    document.getElementById("viewLogin").classList.add("d-none");
    document.getElementById("viewApp").classList.remove("d-none");
    document.getElementById("userDisplay").innerText = sessionStorage.getItem("auth_user");
    Navigation.switchTab("dashboard");
  }
};

// ------------------- UI ROUTER -------------------
const Navigation = {
  currentTab: "dashboard",
  switchTab(tab) {
    this.currentTab = tab;
    ["dashboard", "customers", "vehicles", "reports"].forEach(t => {
      document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.add("d-none");
    });
    document.querySelectorAll(".nav-pills .nav-link").forEach(link => link.classList.remove("active"));

    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.remove("d-none");
    const activeLink = Array.from(document.querySelectorAll(".nav-pills .nav-link")).find(l => l.innerText.toLowerCase().includes(tab));
    if (activeLink) activeLink.classList.add("active");

    const titles = {
      dashboard: "Dashboard & Key Indicators",
      customers: "Customer Management Directory",
      vehicles: "Vehicle Fleet & Expiry Records",
      reports: "Compliance Reporting & CSV Exports"
    };
    document.getElementById("sectionTitle").innerText = titles[tab];

    if (tab === "dashboard") Dashboard.load();
    if (tab === "customers") Customers.load();
    if (tab === "vehicles") Vehicles.load();
    if (tab === "reports") Reports.load();
  }
};

// ------------------- HELPERS -------------------
function getBadge(dateString) {
  if (!dateString) return '<span class="text-muted">-</span>';
  const target = new Date(dateString);
  const now = new Date();
  const days = Math.ceil((target - now) / (1000 * 60 * 60 * 24));

  if (days < 0) return `<span class="badge badge-expired">${dateString}</span>`;
  if (days <= 30) return `<span class="badge badge-urgent">${dateString} (${days}d)</span>`;
  return `<span class="text-dark">${dateString}</span>`;
}

// ------------------- DASHBOARD MODULE -------------------
const Dashboard = {
  async load() {
    try {
      const [stats, vehicles] = await Promise.all([
        Api.request("/stats"),
        Api.request("/vehicles")
      ]);

      document.getElementById("kpiCustomers").innerText = stats.totalCustomers;
      document.getElementById("kpiVehicles").innerText = stats.totalVehicles;
      document.getElementById("kpiExpired").innerText = stats.expired;
      document.getElementById("kpiUrgent").innerText = stats.urgent;

      // Filter urgent/expired vehicles
      const criticalVehicles = vehicles.filter(v => v.compliance_status !== "VALID");
      const tbody = document.getElementById("priorityVehicleRows");

      if (criticalVehicles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">All compliance certificates are up to date.</td></tr>';
        return;
      }

      tbody.innerHTML = criticalVehicles.map(v => `
        <tr>
          <td class="fw-bold text-primary">${v.registration_no}</td>
          <td>${v.owner_name}</td>
          <td>${v.customer_mobile || '-'}</td>
          <td><span class="badge bg-secondary">${v.vehicle_category}</span></td>
          <td><span class="badge bg-danger">${v.critical_item}</span></td>
          <td class="fw-bold ${v.min_days_remaining < 0 ? 'text-danger' : 'text-warning'}">
            ${v.min_days_remaining < 0 ? `${Math.abs(v.min_days_remaining)} days ago (EXPIRED)` : `Due in ${v.min_days_remaining} days`}
          </td>
          <td>
            <button class="btn btn-sm btn-outline-primary" onclick="Navigation.switchTab('vehicles')">View</button>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error(e);
    }
  }
};

// ------------------- CUSTOMER MODULE -------------------
const Customers = {
  list: [],
  customerModal: null,

  async load() {
    if (!this.customerModal) {
      this.customerModal = new bootstrap.Modal(document.getElementById("modalCustomer"));
    }
    this.list = await Api.request("/customers");
    this.render(this.list);
  },

  render(data) {
    const tbody = document.getElementById("customerRows");
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No customers found.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(c => `
      <tr>
        <td class="fw-bold text-secondary">${c.id}</td>
        <td class="fw-semibold">${c.name}</td>
        <td>${c.mobile}</td>
        <td>${c.address || '-'}</td>
        <td><span class="badge ${c.status === 'active' ? 'bg-success' : 'bg-secondary'}">${c.status}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1" onclick='Customers.openEdit(${JSON.stringify(c)})'><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="Customers.delete('${c.id}')"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
  },

  filter() {
    const q = document.getElementById("customerSearch").value.toLowerCase();
    const filtered = this.list.filter(c => 
      c.name.toLowerCase().includes(q) || c.mobile.includes(q) || c.id.toLowerCase().includes(q)
    );
    this.render(filtered);
  },

  openModal() {
    document.getElementById("customerModalTitle").innerText = "Add Customer";
    document.getElementById("cust_id").value = "";
    document.getElementById("cust_name").value = "";
    document.getElementById("cust_mobile").value = "";
    document.getElementById("cust_address").value = "";
    document.getElementById("cust_status").value = "active";
    this.customerModal.show();
  },

  openEdit(c) {
    document.getElementById("customerModalTitle").innerText = "Edit Customer";
    document.getElementById("cust_id").value = c.id;
    document.getElementById("cust_name").value = c.name;
    document.getElementById("cust_mobile").value = c.mobile;
    document.getElementById("cust_address").value = c.address || "";
    document.getElementById("cust_status").value = c.status;
    this.customerModal.show();
  },

  async save() {
    const id = document.getElementById("cust_id").value;
    const payload = {
      id: id || undefined,
      name: document.getElementById("cust_name").value.trim(),
      mobile: document.getElementById("cust_mobile").value.trim(),
      address: document.getElementById("cust_address").value.trim(),
      status: document.getElementById("cust_status").value
    };

    const method = id ? "PUT" : "POST";
    await Api.request("/customers", method, payload);
    this.customerModal.hide();
    this.load();
  },

  async delete(id) {
    if (!confirm("Are you sure you want to delete this customer?")) return;
    await Api.request(`/customers?id=${id}`, "DELETE");
    this.load();
  }
};

// ------------------- VEHICLE MODULE -------------------
const Vehicles = {
  list: [],
  vehicleModal: null,

  async load() {
    if (!this.vehicleModal) {
      this.vehicleModal = new bootstrap.Modal(document.getElementById("modalVehicle"));
    }
    this.list = await Api.request("/vehicles");
    this.render(this.list);
  },

  render(data) {
    const tbody = document.getElementById("vehicleMasterRows");
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-muted">No vehicles found.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(v => {
      let badge = '<span class="badge badge-valid">Valid</span>';
      if (v.compliance_status === "EXPIRED") badge = '<span class="badge badge-expired">Expired</span>';
      if (v.compliance_status === "EXPIRING_SOON") badge = '<span class="badge badge-urgent">Action Due</span>';

      return `
        <tr>
          <td class="fw-bold text-primary">${v.registration_no}</td>
          <td>
            <div>${v.owner_name}</div>
            <small class="text-muted">${v.customer_name || 'No Customer Assigned'}</small>
          </td>
          <td>${v.customer_mobile || '-'}</td>
          <td><span class="badge bg-secondary">${v.vehicle_category}</span></td>
          <td>${getBadge(v.insurance_expiry)}</td>
          <td>${getBadge(v.fc_expiry)}</td>
          <td>${getBadge(v.puc_expiry)}</td>
          <td>${getBadge(v.road_tax_due)}</td>
          <td>${getBadge(v.permit_expiry)}</td>
          <td>${badge}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary me-1" onclick='Vehicles.openEdit(${JSON.stringify(v)})'><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="Vehicles.delete('${v.vehicle_id}')"><i class="bi bi-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filter() {
    const q = document.getElementById("vehicleSearch").value.toLowerCase();
    const st = document.getElementById("vehicleStatusFilter").value;

    const filtered = this.list.filter(v => {
      const matchesText = (v.registration_no && v.registration_no.toLowerCase().includes(q)) ||
                          (v.owner_name && v.owner_name.toLowerCase().includes(q)) ||
                          (v.customer_mobile && v.customer_mobile.includes(q));
      const matchesStatus = (st === "ALL") || (v.compliance_status === st);
      return matchesText && matchesStatus;
    });

    this.render(filtered);
  },

  async openAddModal() {
    document.getElementById("vehicleModalTitle").innerText = "Add Vehicle";
    await this.populateCustomerSelect();
    document.getElementById("veh_id").value = "";
    document.getElementById("veh_reg_no").value = "";
    document.getElementById("veh_reg_no").removeAttribute("readonly");
    document.getElementById("veh_owner").value = "";
    document.getElementById("veh_insurance").value = "";
    document.getElementById("veh_fc").value = "";
    document.getElementById("veh_puc").value = "";
    document.getElementById("veh_road_tax").value = "";
    document.getElementById("veh_permit").value = "";
    document.getElementById("veh_remarks").value = "";
    this.vehicleModal.show();
  },

  async openEdit(v) {
    document.getElementById("vehicleModalTitle").innerText = "Edit Vehicle";
    await this.populateCustomerSelect(v.customer_id);
    document.getElementById("veh_id").value = v.vehicle_id;
    document.getElementById("veh_reg_no").value = v.registration_no;
    document.getElementById("veh_reg_no").setAttribute("readonly", true);
    document.getElementById("veh_owner").value = v.owner_name;
    document.getElementById("veh_category").value = v.vehicle_category;
    document.getElementById("veh_insurance").value = v.insurance_expiry || "";
    document.getElementById("veh_fc").value = v.fc_expiry || "";
    document.getElementById("veh_puc").value = v.puc_expiry || "";
    document.getElementById("veh_road_tax").value = v.road_tax_due || "";
    document.getElementById("veh_permit").value = v.permit_expiry || "";
    document.getElementById("veh_remarks").value = v.remarks || "";
    this.vehicleModal.show();
  },

  async populateCustomerSelect(selectedId = null) {
    const customers = await Api.request("/customers");
    const select = document.getElementById("veh_cust_select");
    select.innerHTML = customers.map(c => `
      <option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${c.name} (${c.mobile})</option>
    `).join('');
  },

  async save() {
    const id = document.getElementById("veh_id").value;
    const payload = {
      vehicle_id: id || undefined,
      registration_no: document.getElementById("veh_reg_no").value.trim().toUpperCase(),
      customer_id: document.getElementById("veh_cust_select").value,
      owner_name: document.getElementById("veh_owner").value.trim(),
      vehicle_category: document.getElementById("veh_category").value,
      insurance_expiry: document.getElementById("veh_insurance").value || null,
      fc_expiry: document.getElementById("veh_fc").value || null,
      puc_expiry: document.getElementById("veh_puc").value || null,
      road_tax_due: document.getElementById("veh_road_tax").value || null,
      permit_expiry: document.getElementById("veh_permit").value || null,
      remarks: document.getElementById("veh_remarks").value.trim()
    };

    const method = id ? "PUT" : "POST";
    await Api.request("/vehicles", method, payload);
    this.vehicleModal.hide();
    this.load();
  },

  async delete(id) {
    if (!confirm("Are you sure you want to delete this vehicle?")) return;
    await Api.request(`/vehicles?id=${id}`, "DELETE");
    this.load();
  }
};

// ------------------- REPORTS MODULE -------------------
const Reports = {
  data: [],

  async load() {
    this.data = await Api.request("/vehicles");
    this.render();
  },

  getFilteredData() {
    const doc = document.getElementById("reportDocType").value;
    const win = document.getElementById("reportTimeWindow").value;

    return this.data.filter(v => {
      if (win === "ALL_ACTIVE") return true;

      const keys = doc === "ALL" ? 
        [v.insurance_expiry, v.fc_expiry, v.puc_expiry, v.road_tax_due, v.permit_expiry] : 
        [v[`${doc}_expiry`] || v[`${doc}_due`]];

      const diffs = keys.filter(Boolean).map(d => {
        const target = new Date(d);
        const now = new Date();
        return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
      });

      if (win === "EXPIRED") return diffs.some(days => days < 0);
      if (win === "30") return diffs.some(days => days >= 0 && days <= 30);
      if (win === "60") return diffs.some(days => days >= 0 && days <= 60);
      return true;
    });
  },

  render() {
    const list = this.getFilteredData();
    const tbody = document.getElementById("reportRows");
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No records match the report parameters.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(v => `
      <tr>
        <td class="fw-bold">${v.registration_no}</td>
        <td>${v.owner_name}</td>
        <td>${v.customer_mobile || '-'}</td>
        <td>${v.insurance_expiry || '-'}</td>
        <td>${v.fc_expiry || '-'}</td>
        <td>${v.puc_expiry || '-'}</td>
        <td>${v.road_tax_due || '-'}</td>
        <td>${v.permit_expiry || '-'}</td>
        <td><span class="badge ${v.compliance_status === 'VALID' ? 'bg-success' : 'bg-danger'}">${v.compliance_status}</span></td>
      </tr>
    `).join('');
  },

  downloadCSV() {
    const list = this.getFilteredData();
    if (!list.length) {
      alert("No data available to export.");
      return;
    }

    const headers = ["Reg No", "Owner", "Customer Mobile", "Category", "Insurance", "FC", "PUC", "Road Tax", "Permit", "Status"];
    const rows = list.map(v => [
      `"${v.registration_no}"`,
      `"${v.owner_name}"`,
      `"${v.customer_mobile || ''}"`,
      `"${v.vehicle_category}"`,
      `"${v.insurance_expiry || ''}"`,
      `"${v.fc_expiry || ''}"`,
      `"${v.puc_expiry || ''}"`,
      `"${v.road_tax_due || ''}"`,
      `"${v.permit_expiry || ''}"`,
      `"${v.compliance_status}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `vehicle_compliance_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// Auto-run auth verification on page load
window.onload = () => Auth.check();