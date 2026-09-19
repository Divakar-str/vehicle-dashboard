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
    
    // Filter states
    selectedHealthFilter: "",
    selectedAccountFilter: "",

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

    formatDateWithBadge(dateString) {
        if (!dateString) return '<span class="text-muted">-</span>';
        
        const cleanDate = dateString.split("T")[0];
        const parts = cleanDate.split("-");
        let displayDate = dateString;
        if (parts.length === 3) {
            displayDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        const target = new Date(dateString);
        const now = new Date();
        const days = Math.ceil((target - now) / (1000 * 60 * 60 * 24));

        if (days < 0) {
            return `<span class="badge badge-expired">${displayDate}</span>`;
        } else if (days <= 30) {
            return `<span class="badge badge-urgent">${displayDate} (${days}d)</span>`;
        }
        return `<span class="text-dark">${displayDate}</span>`;
    },

    renderSkeleton() {
        const tbody = document.getElementById("customerTableBody");
        const skeletonRows = Array.from({ length: 4 }).map(() => `
            <tr class="skeleton-row">
                <td><div class="skeleton-box" style="width: 140px;"></div></td>
                <td><div class="skeleton-box" style="width: 110px;"></div></td>
                <td><div class="skeleton-box" style="width: 180px;"></div></td>
                <td class="text-center"><div class="skeleton-box" style="width: 50px;"></div></td>
                <td><div class="skeleton-box" style="width: 70px;"></div></td>
                <td><div class="skeleton-box" style="width: 60px;"></div></td>
                <td class="text-end"><div class="skeleton-box" style="width: 45px;"></div></td>
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
                searchPlaceholder: "Search customers...",
                lengthMenu: "Show _MENU_ records",
                emptyTable: "No customers found",
                info: "Showing _START_ to _END_ of _TOTAL_ customers",
                paginate: {
                    previous: "<i class='bi bi-chevron-left'></i>",
                    next: "<i class='bi bi-chevron-right'></i>"
                }
            },
            columns: [
                { data: "id", visible: false }, // ID column hidden
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
                        const waText = encodeURIComponent(`Hello ${row.name}, regarding your vehicle documents.`);
                        
                        const primaryContact = `
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <a href="tel:+91${p1}" class="text-decoration-none fw-bold text-dark" onclick="event.stopPropagation();">${CustomerController.escapeHtml(row.mobile)}</a>
                                <a href="https://wa.me/91${p1}?text=${waText}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-success border-0 p-0 px-1" title="Send WhatsApp Message" onclick="event.stopPropagation();">
                                    <i class="bi bi-whatsapp"></i>
                                </a>
                            </div>
                        `;
                        let extraContacts = "";
                        if (p2 || p3) {
                            extraContacts = `
                                <div class="text-muted small d-flex gap-2">
                                    ${p2 ? `<a href="tel:+91${p2}" class="text-secondary text-decoration-none" onclick="event.stopPropagation();"><i class="bi bi-telephone me-1"></i>${CustomerController.escapeHtml(row.mobile_2)}</a>` : ""}
                                    ${p3 ? `<a href="tel:+91${p3}" class="text-secondary text-decoration-none" onclick="event.stopPropagation();"><i class="bi bi-telephone me-1"></i>${CustomerController.escapeHtml(row.mobile_3)}</a>` : ""}
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
                            <div class="text-truncate" style="max-width: 200px;" title="${CustomerController.escapeHtml(row.address)}">${CustomerController.escapeHtml(row.address) || '<span class="text-muted">-</span>'}</div>
                            <div class="text-muted" style="font-size: 0.75rem;">${CustomerController.escapeHtml(row.remarks) || ''}</div>
                        `;
                    } 
                },
                { 
                    data: "total_vehicles", 
                    className: "text-center", 
                    render: (data, type, row) => {
                        return `
                            <button class="btn btn-sm btn-outline-dark py-0 px-2" onclick='event.stopPropagation(); CustomerController.viewFleetById("${row.id}")' title="View Vehicles">
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
                        return `<span class="badge bg-light text-muted border">No Vehicles</span>`;
                    } 
                },
                { 
                    data: "status", 
                    render: (data, type, row) => {
                        const isActive = (data || "active") === "active";
                        return `
                            <button id="btnStatus_${CustomerController.escapeHtml(row.id)}" class="btn btn-sm ${isActive ? 'btn-outline-success' : 'btn-outline-secondary'} py-0 px-2 rounded-pill" onclick="event.stopPropagation(); CustomerController.toggleStatus('${CustomerController.escapeHtml(row.id)}', '${data}')" title="Click to change status">
                                ${isActive ? 'Active' : 'Inactive'}
                            </button>
                        `;
                    } 
                },
                { 
                    data: null, 
                    orderable: false, 
                    className: "text-end", 
                    render: (data, type, row) => {
                        return `
                        <div class="d-flex justify-content-end gap-1">
                            <button class="btn btn-sm btn-outline-primary me-1" onclick='event.stopPropagation(); CustomerController.openEditById("${CustomerController.escapeHtml(row.id)}")' title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button id="btnDel_${CustomerController.escapeHtml(row.id)}" class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); CustomerController.delete('${CustomerController.escapeHtml(row.id)}', ${row.total_vehicles || 0})" title="Delete">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                        `;
                    } 
                }
            ]
        });

        // Double-click / double-tap handler on table rows now opens the EDIT form for customer data
        $('#customerDataTable tbody').on('dblclick', 'tr', function() {
            const rowData = CustomerController.dataTable.row(this).data();
            if (rowData) {
                CustomerController.openEditById(rowData.id);
            }
        });

        // Custom filter integration for DataTables
        $.fn.dataTable.ext.search.push((settings, data, dataIndex, rowData) => {
            if (CustomerController.selectedHealthFilter && rowData.overall_health !== CustomerController.selectedHealthFilter) {
                return false;
            }
            if (CustomerController.selectedAccountFilter && (rowData.status || "active") !== CustomerController.selectedAccountFilter) {
                return false;
            }
            return true;
        });
    },

    setFilter(type, value, buttonElement) {
        const parentContainer = buttonElement.parentElement;
        
        if (type === 'health') {
            this.selectedHealthFilter = value;
            parentContainer.querySelectorAll('[onclick*="health"]').forEach(b => {
                if (b.textContent.trim() === buttonElement.textContent.trim()) {
                    b.classList.remove('btn-outline-danger', 'btn-outline-warning', 'btn-outline-success', 'btn-outline-dark', 'btn-outline-secondary');
                    b.classList.add('btn-dark');
                } else {
                    b.classList.remove('btn-dark');
                    if (b.textContent.includes('Expired')) b.classList.add('btn-outline-danger');
                    else if (b.textContent.includes('Due Soon')) b.classList.add('btn-outline-warning');
                    else if (b.textContent.includes('Valid')) b.classList.add('btn-outline-success');
                    else b.classList.add('btn-dark');
                }
            });
        } else if (type === 'account') {
            if (this.selectedAccountFilter === value) {
                this.selectedAccountFilter = ""; 
                buttonElement.classList.remove('btn-secondary');
                buttonElement.classList.add('btn-outline-secondary');
            } else {
                this.selectedAccountFilter = value;
                parentContainer.querySelectorAll('[onclick*="account"]').forEach(b => {
                    b.classList.remove('btn-secondary');
                    b.classList.add('btn-outline-secondary');
                });
                buttonElement.classList.remove('btn-outline-secondary');
                buttonElement.classList.add('btn-secondary');
            }
        }

        if (this.dataTable) {
            this.dataTable.draw();
        }
    },

    async load() {
        const refreshIcon = document.getElementById("refreshIcon");
        if (refreshIcon) refreshIcon.classList.add("spin-animation");

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

    viewFleetById(customerId) {
        const customer = this.data.find(c => String(c.id) === String(customerId));
        if (!customer) {
            this.showToast("Could not find customer vehicle data.", "error");
            return;
        }

        document.getElementById("fleetModalCustomerName").innerText = `${customer.name}'s Vehicles`;
        document.getElementById("fleetModalCustomerId").innerText = `Total Vehicles: ${customer.total_vehicles || 0}`;

        const tbody = document.getElementById("fleetModalRows");
        const vehicles = Array.isArray(customer.vehicles) ? customer.vehicles : [];

        if (vehicles.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No vehicles added for this customer.</td></tr>`;
        } else {
            tbody.innerHTML = vehicles.map(v => {
                let badge = '<span class="badge badge-valid">Valid</span>';
                if (v.compliance_status === "EXPIRED") badge = '<span class="badge badge-expired">Expired</span>';
                if (v.compliance_status === "EXPIRING_SOON") badge = '<span class="badge badge-urgent">Due Soon</span>';

                return `
                    <tr>
                        <td class="fw-bold text-primary">${this.escapeHtml(v.registration_no)}</td>
                        <td><span class="badge bg-secondary">${this.escapeHtml(v.vehicle_category)}</span></td>
                        <td>${this.formatDateWithBadge(v.insurance_expiry)}</td>
                        <td>${this.formatDateWithBadge(v.fc_expiry)}</td>
                        <td>${this.formatDateWithBadge(v.puc_expiry)}</td>
                        <td>${this.formatDateWithBadge(v.road_tax_due)}</td>
                        <td>${this.formatDateWithBadge(v.permit_expiry)}</td>
                        <td>${this.formatDateWithBadge(v.national_permit_expiry)}</td>
                        <td>${badge}</td>
                    </tr>
                `;
            }).join("");
        }
        this.fleetModal.show();
    },

    openModal() {
        document.getElementById("customerModalTitle").innerText = "Add New Customer";
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
        const customer = this.data.find(c => String(c.id) === String(customerId));
        if (!customer) return;

        document.getElementById("customerModalTitle").innerText = "Edit Customer Details";
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
        
        const rawId = document.getElementById("cust_id").value.trim();
        const customerId = rawId ? (!isNaN(rawId) ? Number(rawId) : rawId) : null;
        const rawMobile = this.cleanPhone(document.getElementById("cust_mobile").value);

        if (rawMobile.length !== 10) {
            this.showToast("Primary phone number must be exactly 10 digits.", "warning");
            return;
        }

        const payload = {
            name: document.getElementById("cust_name").value.trim(),
            mobile: rawMobile,
            mobile_2: this.cleanPhone(document.getElementById("cust_mobile_2").value) || null,
            mobile_3: this.cleanPhone(document.getElementById("cust_mobile_3").value) || null,
            address: document.getElementById("cust_address").value.trim() || null,
            remarks: document.getElementById("cust_remarks").value.trim() || null,
            status: document.getElementById("cust_status").value
        };

        if (customerId !== null) {
            payload.id = customerId;
        }

        saveBtn.disabled = true;
        spinner.classList.remove("d-none");
        btnText.innerText = "Saving...";

        try {
            const method = customerId !== null ? "PUT" : "POST";
            await Api.request("/customers", method, payload);
            this.customerModal.hide();
            this.showToast(`Customer saved successfully!`, "success");
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

        const parsedId = !isNaN(id) ? Number(id) : id;
        const newStatus = currentStatus === "active" ? "inactive" : "active";

        try {
            await Api.request("/customers", "PUT", { id: parsedId, status: newStatus });
            this.showToast(`Status updated successfully.`, "info");
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
            this.showToast(`Cannot delete: Customer has ${totalVehicles} vehicle(s) linked. Please delete or reassign vehicles first.`, "warning");
            return;
        }

        if (!confirm("Are you sure you want to delete this customer? This cannot be undone.")) return;

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