/**
 * CustomerController Module
 * Handles DataTables initialization, unique serial number sequence, phone auto-jump,
 * explicit empty-string saving for cleared fields, CSV/Print export,
 * instant vehicle modal search, and CRUD operations.
 */
const CustomerController = {
    dataTable: null,
    data: [],
    currentFleetVehicles: [],
    customerModal: null,
    fleetModal: null,
    toastInstance: null,

    // Filter states
    selectedHealthFilter: "",
    selectedAccountFilter: "",

    init() {
        const customerModalEl = document.getElementById("customerModal");
        this.customerModal = new bootstrap.Modal(customerModalEl);
        this.fleetModal = new bootstrap.Modal(document.getElementById("customerFleetModal"));
        this.toastInstance = new bootstrap.Toast(document.getElementById("liveToast"), { delay: 4000 });

        customerModalEl.addEventListener("shown.bs.modal", () => {
            const nameInput = document.getElementById("cust_name");
            if (nameInput) nameInput.focus();
        });

        this.initPhoneAutoJump();
        this.initLiveConflictChecks();
        this.initFleetModalSearch();
        this.initDataTable();
        this.load();
    },

    initPhoneAutoJump() {
        const phoneInputs = document.querySelectorAll(".phone-auto-jump");
        phoneInputs.forEach((input) => {
            input.addEventListener("input", (e) => {
                let cleaned = this.cleanPhone(e.target.value);
                if (e.target.value !== cleaned) {
                    e.target.value = cleaned;
                }

                if (cleaned.length === 10) {
                    const nextId = e.target.getAttribute("data-next-input");
                    if (nextId) {
                        const nextEl = document.getElementById(nextId);
                        if (nextEl) {
                            nextEl.focus();
                            if (nextEl.select && nextEl.tagName === "INPUT") {
                                nextEl.select();
                            }
                        }
                    }
                }
            });

            input.addEventListener("keydown", (e) => {
                if (e.key === "Backspace" && e.target.value.length === 0) {
                    if (e.target.id === "cust_mobile_3") {
                        document.getElementById("cust_mobile_2")?.focus();
                    } else if (e.target.id === "cust_mobile_2") {
                        document.getElementById("cust_mobile")?.focus();
                    }
                }
            });
        });
    },

    initLiveConflictChecks() {
        const printIdInput = document.getElementById("cust_printid");
        const printFeedback = document.getElementById("printIdFeedback");

        if (printIdInput && printFeedback) {
            printIdInput.addEventListener("input", () => {
                const rawId = document.getElementById("cust_id").value.trim();
                const val = parseInt(printIdInput.value, 10);
                if (!val || val < 1) {
                    printFeedback.classList.add("d-none");
                    printIdInput.classList.remove("is-invalid");
                    return;
                }
                const conflict = this.findPrintIdConflict(val, rawId || null);
                if (conflict) {
                    const nextFree = this.getNextAvailablePrintId(rawId || null);
                    printFeedback.textContent = `Used by "${conflict.name}". Next free number: ${nextFree}`;
                    printFeedback.classList.remove("d-none");
                    printIdInput.classList.add("is-invalid");
                } else {
                    printFeedback.classList.add("d-none");
                    printIdInput.classList.remove("is-invalid");
                }
            });
        }

        const mobileInput = document.getElementById("cust_mobile");
        const phoneFeedback = document.getElementById("phoneConflictFeedback");

        if (mobileInput && phoneFeedback) {
            mobileInput.addEventListener("input", () => {
                const rawId = document.getElementById("cust_id").value.trim();
                const cleaned = this.cleanPhone(mobileInput.value);
                if (cleaned.length !== 10) {
                    phoneFeedback.classList.add("d-none");
                    return;
                }
                const dup = this.findPhoneConflict(cleaned, rawId || null);
                if (dup) {
                    phoneFeedback.textContent = `Note: Number already linked to "${dup.name}" (Serial No. #${dup.printid || "-"})`;
                    phoneFeedback.classList.remove("d-none");
                } else {
                    phoneFeedback.classList.add("d-none");
                }
            });
        }
    },

    initFleetModalSearch() {
        const searchInput = document.getElementById("fleetModalSearchInput");
        if (!searchInput) return;

        searchInput.addEventListener("input", (e) => {
            this.renderFleetModalRows(e.target.value.trim());
        });
    },

    showToast(message, type = "success") {
        const toastEl = document.getElementById("liveToast");
        const msgEl = document.getElementById("toastMessage");
        const closeBtn = document.getElementById("toastCloseBtn");

        const bgMap = {
            error: "bg-danger text-white",
            danger: "bg-danger text-white",
            warning: "bg-warning text-dark",
            info: "bg-info text-dark",
            success: "bg-success text-white"
        };
        const badgeStyle = bgMap[type] || "bg-success text-white";
        const isDarkText = type === "warning" || type === "info";

        toastEl.className = `toast align-items-center border-0 shadow-lg rounded-3 ${badgeStyle}`;
        if (closeBtn) {
            closeBtn.className = `btn-close ${isDarkText ? "" : "btn-close-white"} me-2 m-auto`;
        }
        msgEl.innerText = message;
        this.toastInstance.show();
    },

    escapeHtml(str) {
        if (!str && str !== 0) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    cleanPhone(phone) {
        let digits = String(phone || "").replace(/\D/g, "");
        if (digits.length === 12 && digits.startsWith("91")) {
            digits = digits.slice(2);
        } else if (digits.length === 11 && digits.startsWith("0")) {
            digits = digits.slice(1);
        }
        return digits.slice(0, 10);
    },

    getNextAvailablePrintId(excludeCustomerId = null) {
        const existingIds = new Set(
            this.data
                .filter(c => excludeCustomerId === null || String(c.id) !== String(excludeCustomerId))
                .map(c => Number(c.printid))
                .filter(id => !isNaN(id) && id > 0)
        );

        let nextId = 1;
        while (existingIds.has(nextId)) {
            nextId++;
        }
        return nextId;
    },

    fillNextPrintId() {
        const rawId = document.getElementById("cust_id").value.trim();
        const nextId = this.getNextAvailablePrintId(rawId || null);
        const input = document.getElementById("cust_printid");
        input.value = nextId;
        input.classList.remove("is-invalid");
        document.getElementById("printIdFeedback")?.classList.add("d-none");
        this.showToast(`Assigned lowest available Serial No.: ${nextId}`, "info");
    },

    findPrintIdConflict(printId, excludeCustomerId = null) {
        return this.data.find(c =>
            (excludeCustomerId === null || String(c.id) !== String(excludeCustomerId)) &&
            Number(c.printid) === Number(printId)
        );
    },

    findPhoneConflict(cleanMobile, excludeCustomerId = null) {
        if (!cleanMobile || cleanMobile.length !== 10) return null;
        return this.data.find(c => {
            if (excludeCustomerId !== null && String(c.id) === String(excludeCustomerId)) return false;
            return (
                this.cleanPhone(c.mobile) === cleanMobile ||
                this.cleanPhone(c.mobile_2) === cleanMobile ||
                this.cleanPhone(c.mobile_3) === cleanMobile
            );
        });
    },

    formatDateWithBadge(dateString) {
        if (!dateString) return '<span class="text-muted">-</span>';

        const cleanDate = String(dateString).split("T")[0];
        const parts = cleanDate.split("-");
        let displayDate = cleanDate;
        let targetDate;

        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            targetDate = new Date(year, month, day);
            displayDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else {
            targetDate = new Date(dateString);
        }

        if (isNaN(targetDate.getTime())) {
            return `<span class="text-muted">${this.escapeHtml(dateString)}</span>`;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        targetDate.setHours(0, 0, 0, 0);

        const diffDays = Math.round((targetDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return `<span class="badge badge-expired">${displayDate}</span>`;
        } else if (diffDays <= 30) {
            return `<span class="badge badge-urgent">${displayDate} (${diffDays}d)</span>`;
        }
        return `<span class="text-dark fw-medium">${displayDate}</span>`;
    },

    updateTotalClientCount() {
        const counterEl = document.getElementById("totalClientCount");
        if (counterEl) {
            counterEl.textContent = Array.isArray(this.data) ? this.data.length : 0;
        }
    },

    renderSkeleton() {
        const tbody = document.getElementById("customerTableBody");
        if (!tbody) return;
        const skeletonRows = Array.from({ length: 5 }).map(() => `
            <tr class="skeleton-row">
                <td class="text-center"><div class="skeleton-box mx-auto" style="width: 34px;"></div></td>
                <td><div class="skeleton-box" style="width: 150px;"></div></td>
                <td><div class="skeleton-box" style="width: 115px;"></div></td>
                <td><div class="skeleton-box" style="width: 180px;"></div></td>
                <td class="text-center"><div class="skeleton-box mx-auto" style="width: 50px;"></div></td>
                <td><div class="skeleton-box" style="width: 85px;"></div></td>
                <td><div class="skeleton-box" style="width: 65px;"></div></td>
                <td class="text-end"><div class="skeleton-box ms-auto" style="width: 55px;"></div></td>
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
            order: [[1, "asc"]],
            info: true,
            autoWidth: false,
            deferRender: true,
            createdRow: (row, data) => {
                if ((data.status || "active") === "inactive") {
                    row.classList.add("customer-row-inactive");
                }
            },
            language: {
                search: "",
                searchPlaceholder: "Search name, phone, serial no...",
                lengthMenu: "Show _MENU_",
                emptyTable: "No customers found",
                zeroRecords: "No matching customers found",
                info: "Showing _START_ to _END_ of _TOTAL_ clients",
                paginate: {
                    previous: "<i class='bi bi-chevron-left'></i>",
                    next: "<i class='bi bi-chevron-right'></i>"
                }
            },
            columns: [
                { data: "id", visible: false },
                {
                    data: "printid",
                    className: "text-center fw-bold text-dark",
                    render: (data, type) => {
                        const val = data !== null && data !== undefined && data !== "" ? Number(data) : null;
                        if (type === "sort" || type === "type") {
                            return val !== null && !isNaN(val) ? val : 999999;
                        }
                        return val ? `<span class="print-id-badge">${val}</span>` : '<span class="text-muted">-</span>';
                    }
                },
                {
                    data: "name",
                    render: (data, type, row) => {
                        if (type !== "display") return data || "";
                        return `
                            <a href="javascript:void(0)" class="customer-name-link fw-semibold text-primary text-decoration-none" data-action="edit" data-id="${CustomerController.escapeHtml(row.id)}" title="Click to edit customer">
                                ${CustomerController.escapeHtml(data)}
                            </a>
                        `;
                    }
                },
                {
                    data: null,
                    render: (data, type, row) => {
                        const p1 = CustomerController.cleanPhone(row.mobile);
                        const p2 = CustomerController.cleanPhone(row.mobile_2);
                        const p3 = CustomerController.cleanPhone(row.mobile_3);

                        if (type !== "display") {
                            return `${p1} ${p2} ${p3}`;
                        }

                        const waText = encodeURIComponent(`Hello ${row.name || ""}, regarding your vehicle documents.`);

                        const primaryContact = p1 ? `
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <a href="tel:+91${p1}" class="text-decoration-none fw-bold text-dark phone-link">
                                    <i class="bi bi-telephone-fill text-primary me-1" style="font-size: 0.72rem;"></i>${CustomerController.escapeHtml(p1)}
                                </a>
                                <a href="https://wa.me/91${p1}?text=${waText}" target="_blank" rel="noopener noreferrer" class="btn-wa-pill" title="Send WhatsApp Message">
                                    <i class="bi bi-whatsapp"></i>
                                </a>
                            </div>
                        ` : '<span class="text-muted">-</span>';

                        let extraContacts = "";
                        if (p2 || p3) {
                            extraContacts = `
                                <div class="text-muted small d-flex flex-wrap gap-2">
                                    ${p2 ? `<a href="tel:+91${p2}" class="text-secondary text-decoration-none extra-phone-link"><i class="bi bi-telephone me-1"></i>${CustomerController.escapeHtml(p2)}</a>` : ""}
                                    ${p3 ? `<a href="tel:+91${p3}" class="text-secondary text-decoration-none extra-phone-link"><i class="bi bi-telephone me-1"></i>${CustomerController.escapeHtml(p3)}</a>` : ""}
                                </div>
                            `;
                        }
                        return `${primaryContact}${extraContacts}`;
                    }
                },
                {
                    data: null,
                    render: (data, type, row) => {
                        const addr = (row.address || "").trim();
                        const rem = (row.remarks || "").trim();
                        if (type !== "display") {
                            return `${addr} ${rem}`;
                        }
                        return `
                            <div class="text-truncate fw-medium text-dark" style="max-width: 210px;" title="${CustomerController.escapeHtml(addr)}">
                                ${addr ? CustomerController.escapeHtml(addr) : '<span class="text-muted fw-normal">-</span>'}
                            </div>
                            <div class="text-muted text-truncate" style="font-size: 0.75rem; max-width: 210px;" title="${CustomerController.escapeHtml(rem)}">
                                ${rem ? CustomerController.escapeHtml(rem) : ""}
                            </div>
                        `;
                    }
                },
                {
                    data: "total_vehicles",
                    className: "text-center",
                    render: (data, type, row) => {
                        const count = Number(data) || 0;
                        if (type === "sort" || type === "type") return count;
                        return `
                            <button type="button" class="btn btn-sm btn-fleet-count py-1 px-2" data-action="fleet" data-id="${CustomerController.escapeHtml(row.id)}" title="View Customer Vehicles">
                                <i class="bi bi-truck me-1"></i>${count}
                            </button>
                        `;
                    }
                },
                {
                    data: "overall_health",
                    render: (data, type, row) => {
                        const expCount = Number(row.expired_count) || 0;
                        const urgCount = Number(row.urgent_count) || 0;

                        if (type === "sort" || type === "type") {
                            if (data === "EXPIRED" || expCount > 0) return 1;
                            if (data === "URGENT" || urgCount > 0) return 2;
                            if (data === "HEALTHY") return 3;
                            return 4;
                        }

                        if (expCount > 0 || urgCount > 0) {
                            const badges = [];
                            if (expCount > 0) {
                                badges.push(`<span class="badge badge-expired"><i class="bi bi-exclamation-circle-fill me-1"></i>${expCount} Expired</span>`);
                            }
                            if (urgCount > 0) {
                                badges.push(`<span class="badge badge-urgent"><i class="bi bi-clock-fill me-1"></i>${urgCount} Due Soon</span>`);
                            }
                            return `<div class="d-flex flex-wrap gap-1">${badges.join("")}</div>`;
                        }

                        if (data === "HEALTHY") {
                            return `<span class="badge badge-valid"><i class="bi bi-check-circle-fill me-1"></i>All Clear</span>`;
                        }
                        return `<span class="badge bg-light text-muted border">No Vehicles</span>`;
                    }
                },
                {
                    data: "status",
                    render: (data, type, row) => {
                        const statusVal = (data || "active").toLowerCase();
                        const isActive = statusVal === "active";
                        if (type !== "display") return statusVal;

                        return `
                            <button type="button" id="btnStatus_${CustomerController.escapeHtml(row.id)}" class="btn btn-sm ${isActive ? "btn-status-active" : "btn-status-inactive"} py-1 px-3 rounded-pill" data-action="status" data-id="${CustomerController.escapeHtml(row.id)}" title="Click to toggle account status">
                                ${isActive ? "Active" : "Inactive"}
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
                                <button type="button" class="btn btn-sm btn-action-icon btn-outline-primary" data-action="edit" data-id="${CustomerController.escapeHtml(row.id)}" title="Edit Customer">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button type="button" id="btnDel_${CustomerController.escapeHtml(row.id)}" class="btn btn-sm btn-action-icon btn-outline-danger" data-action="delete" data-id="${CustomerController.escapeHtml(row.id)}" title="Delete Customer">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        `;
                    }
                }
            ]
        });

        // Delegated Event Listeners
        $("#customerDataTable tbody").on("click", "[data-action]", function (e) {
            e.stopPropagation();
            const action = this.getAttribute("data-action");
            const id = this.getAttribute("data-id");
            if (!id) return;

            if (action === "edit") {
                CustomerController.openEditById(id);
            } else if (action === "fleet") {
                CustomerController.viewFleetById(id);
            } else if (action === "status") {
                CustomerController.toggleStatus(id);
            } else if (action === "delete") {
                CustomerController.delete(id);
            }
        });

        // Custom DataTables Filter Logic
        $.fn.dataTable.ext.search.push((settings, searchData, dataIndex, rowData) => {
            if (settings.nTable.id !== "customerDataTable") return true;

            const rowStatus = (rowData.status || "active").toLowerCase();
            const expCount = Number(rowData.expired_count) || 0;
            const urgCount = Number(rowData.urgent_count) || 0;

            if (CustomerController.selectedAccountFilter && rowStatus !== CustomerController.selectedAccountFilter) {
                return false;
            }

            if (CustomerController.selectedHealthFilter) {
                if (CustomerController.selectedAccountFilter !== "inactive" && rowStatus === "inactive") {
                    return false;
                }

                if (CustomerController.selectedHealthFilter === "EXPIRED") {
                    return rowData.overall_health === "EXPIRED" || expCount > 0;
                }
                if (CustomerController.selectedHealthFilter === "URGENT") {
                    return rowData.overall_health === "URGENT" || urgCount > 0;
                }
                if (CustomerController.selectedHealthFilter === "HEALTHY") {
                    return rowData.overall_health === "HEALTHY";
                }
            }

            return true;
        });
    },

    setFilter(type, value, buttonElement) {
        const parentContainer = buttonElement.parentElement;

        if (type === "health") {
            this.selectedHealthFilter = value;
            parentContainer.querySelectorAll('[data-filter-group="health"]').forEach((btn) => {
                const btnVal = btn.getAttribute("data-filter-val");
                const isSelected = btnVal === value;

                btn.classList.remove(
                    "active",
                    "btn-dark", "btn-outline-dark",
                    "btn-danger", "btn-outline-danger",
                    "btn-warning", "btn-outline-warning",
                    "btn-success", "btn-outline-success"
                );

                if (btnVal === "") {
                    btn.classList.add(isSelected ? "btn-dark" : "btn-outline-dark");
                } else if (btnVal === "EXPIRED") {
                    btn.classList.add(isSelected ? "btn-danger" : "btn-outline-danger");
                } else if (btnVal === "URGENT") {
                    btn.classList.add(isSelected ? "btn-warning" : "btn-outline-warning");
                } else if (btnVal === "HEALTHY") {
                    btn.classList.add(isSelected ? "btn-success" : "btn-outline-success");
                }

                if (isSelected) btn.classList.add("active");
            });
        } else if (type === "account") {
            if (this.selectedAccountFilter === value) {
                this.selectedAccountFilter = "";
            } else {
                this.selectedAccountFilter = value;
            }

            parentContainer.querySelectorAll('[data-filter-group="account"]').forEach((btn) => {
                const btnVal = btn.getAttribute("data-filter-val");
                const isSelected = btnVal === this.selectedAccountFilter;
                btn.classList.remove("active", "btn-secondary", "btn-outline-secondary");
                btn.classList.add(isSelected ? "btn-secondary" : "btn-outline-secondary");
                if (isSelected) btn.classList.add("active");
            });
        }

        if (this.dataTable) {
            this.dataTable.draw();
        }
    },

    async load(preservePage = false) {
        const refreshIcon = document.getElementById("refreshIcon");
        if (refreshIcon) refreshIcon.classList.add("spin-animation");

        if (!preservePage && this.data.length === 0) {
            this.renderSkeleton();
        }

        try {
            const response = await Api.request("/customers");
            this.data = Array.isArray(response) ? response : [];
            this.updateTotalClientCount();
            this.dataTable.clear().rows.add(this.data).draw(!preservePage);
        } catch (err) {
            this.dataTable.clear().draw();
            this.showToast("Failed to load customers: " + err.message, "error");
        } finally {
            if (refreshIcon) refreshIcon.classList.remove("spin-animation");
        }
    },

    exportFilteredCSV() {
        if (!this.dataTable) return;
        const rows = this.dataTable.rows({ search: "applied" }).data().toArray();

        if (rows.length === 0) {
            this.showToast("No matching customers in current view to export.", "warning");
            return;
        }

        const headers = ["Serial No.", "Customer Name", "Primary Phone", "Extra Phone 2", "Extra Phone 3", "Address", "Remarks", "Total Vehicles", "Document Status", "Account State"];
        const escapeCsv = (val) => `"${String(val || "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

        const lines = [headers.map(escapeCsv).join(",")];
        rows.forEach(r => {
            lines.push([
                r.printid || "",
                r.name || "",
                this.cleanPhone(r.mobile),
                this.cleanPhone(r.mobile_2),
                this.cleanPhone(r.mobile_3),
                r.address || "",
                r.remarks || "",
                r.total_vehicles || 0,
                r.overall_health || "",
                r.status || "active"
            ].map(escapeCsv).join(","));
        });

        const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `customers_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.showToast(`Exported ${rows.length} customer(s) to CSV.`, "success");
    },

    printFilteredList() {
        if (!this.dataTable) return;
        const rows = this.dataTable.rows({ search: "applied" }).data().toArray();

        if (rows.length === 0) {
            this.showToast("No matching customers to print.", "warning");
            return;
        }

        const tableRowsHtml = rows.map(r => `
            <tr>
                <td style="text-align:center; font-weight:700;">${this.escapeHtml(r.printid || "-")}</td>
                <td style="font-weight:600;">${this.escapeHtml(r.name || "-")}</td>
                <td>${this.escapeHtml([this.cleanPhone(r.mobile), this.cleanPhone(r.mobile_2), this.cleanPhone(r.mobile_3)].filter(Boolean).join(", "))}</td>
                <td>${this.escapeHtml(r.address || "-")}</td>
                <td>${this.escapeHtml(r.remarks || "-")}</td>
                <td style="text-align:center;">${Number(r.total_vehicles) || 0}</td>
                <td style="text-transform:capitalize;">${this.escapeHtml(r.status || "active")}</td>
            </tr>
        `).join("");

        const printWin = window.open("", "_blank", "width=1024,height=768");
        if (!printWin) {
            this.showToast("Pop-up blocked. Please allow pop-ups.", "warning");
            return;
        }

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Customer List - Print View</title>
                <style>
                    body { font-family: system-ui, sans-serif; padding: 20px; color: #0f172a; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 16px; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; }
                    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; }
                    th { background: #f1f5f9; text-transform: uppercase; font-size: 11px; }
                    @media print { @page { margin: 10mm; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>Customer List</h2>
                    <div>Total: <strong>${rows.length}</strong></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width:60px; text-align:center;">Serial No.</th>
                            <th>Customer Name</th>
                            <th>Phone Numbers</th>
                            <th>Address</th>
                            <th>Remarks</th>
                            <th style="width:65px; text-align:center;">Vehicles</th>
                            <th style="width:70px;">State</th>
                        </tr>
                    </thead>
                    <tbody>${tableRowsHtml}</tbody>
                </table>
                <script>window.onload = function() { window.print(); };<\/script>
            </body>
            </html>
        `);
        printWin.document.close();
    },

    viewFleetById(customerId) {
        const customer = this.data.find(c => String(c.id) === String(customerId));
        if (!customer) {
            this.showToast("Could not find customer vehicle data.", "error");
            return;
        }

        document.getElementById("fleetModalCustomerName").innerText = `${customer.name}'s Vehicles`;
        document.getElementById("fleetModalCustomerId").innerText = `Serial No. #${customer.printid || "-"} • Total Vehicles: ${customer.total_vehicles || 0}`;

        this.currentFleetVehicles = Array.isArray(customer.vehicles) ? customer.vehicles : [];
        const searchInput = document.getElementById("fleetModalSearchInput");
        if (searchInput) searchInput.value = "";

        this.renderFleetModalRows("");
        this.fleetModal.show();
    },

    renderFleetModalRows(query = "") {
        const tbody = document.getElementById("fleetModalRows");
        const matchCountEl = document.getElementById("fleetModalMatchCount");
        const vehicles = this.currentFleetVehicles || [];

        if (vehicles.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No vehicles added for this customer.</td></tr>`;
            if (matchCountEl) matchCountEl.textContent = "0 vehicles";
            return;
        }

        const q = query.toLowerCase();
        const filtered = !q ? vehicles : vehicles.filter(v => {
            return (v.registration_no || "").toLowerCase().includes(q) ||
                   (v.vehicle_category || "").toLowerCase().includes(q) ||
                   (v.compliance_status || "").toLowerCase().includes(q);
        });

        if (matchCountEl) {
            matchCountEl.textContent = q ? `Showing ${filtered.length} of ${vehicles.length} vehicle(s)` : `Showing all ${vehicles.length} vehicle(s)`;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No vehicles match "${this.escapeHtml(query)}".</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(v => {
            let badge = '<span class="badge badge-valid">Valid</span>';
            if (v.compliance_status === "EXPIRED") badge = '<span class="badge badge-expired">Expired</span>';
            if (v.compliance_status === "EXPIRING_SOON") badge = '<span class="badge badge-urgent">Due Soon</span>';

            return `
                <tr>
                    <td class="ps-3 fw-bold text-primary">${this.escapeHtml(v.registration_no)}</td>
                    <td><span class="badge bg-secondary">${this.escapeHtml(v.vehicle_category)}</span></td>
                    <td>${this.formatDateWithBadge(v.fc_expiry)}</td>
                    <td>${this.formatDateWithBadge(v.road_tax_due)}</td>       
                     <td>${this.formatDateWithBadge(v.green_tax_due)}</td>          
                    <td>${this.formatDateWithBadge(v.permit_expiry)}</td>
                    <td>${this.formatDateWithBadge(v.national_permit_expiry)}</td>
                    <td>${this.formatDateWithBadge(v.insurance_expiry)}</td>
                    <td>${this.formatDateWithBadge(v.puc_expiry)}</td>
                    <td class="pe-3">${badge}</td>
                </tr>
            `;
        }).join("");
    },

    resetModalValidation() {
        document.getElementById("cust_printid")?.classList.remove("is-invalid");
        document.getElementById("printIdFeedback")?.classList.add("d-none");
        document.getElementById("phoneConflictFeedback")?.classList.add("d-none");
    },

    openModal() {
        this.resetModalValidation();
        document.getElementById("customerModalTitle").innerText = "Add New Customer";
        document.getElementById("cust_id").value = "";
        document.getElementById("cust_printid").value = this.getNextAvailablePrintId();
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

        this.resetModalValidation();
        document.getElementById("customerModalTitle").innerText = "Edit Customer Details";
        document.getElementById("cust_id").value = customer.id;

        const existingPrintId = customer.printid !== undefined && customer.printid !== null && customer.printid !== ""
            ? customer.printid
            : this.getNextAvailablePrintId(customer.id);

        document.getElementById("cust_printid").value = existingPrintId;
        document.getElementById("cust_name").value = customer.name || "";
        document.getElementById("cust_mobile").value = this.cleanPhone(customer.mobile);
        document.getElementById("cust_mobile_2").value = this.cleanPhone(customer.mobile_2);
        document.getElementById("cust_mobile_3").value = this.cleanPhone(customer.mobile_3);
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

        const nameVal = document.getElementById("cust_name").value.trim();
        if (!nameVal) {
            this.showToast("Customer / Business Name is required.", "warning");
            document.getElementById("cust_name").focus();
            return;
        }

        const rawMobile = this.cleanPhone(document.getElementById("cust_mobile").value);
        const rawMobile2 = this.cleanPhone(document.getElementById("cust_mobile_2").value);
        const rawMobile3 = this.cleanPhone(document.getElementById("cust_mobile_3").value);

        if (rawMobile.length !== 10) {
            this.showToast("Primary phone number must be exactly 10 digits.", "warning");
            document.getElementById("cust_mobile").focus();
            return;
        }

        if (rawMobile2.length > 0 && rawMobile2.length !== 10) {
            this.showToast("Extra Phone 2 must be exactly 10 digits (or left blank).", "warning");
            document.getElementById("cust_mobile_2").focus();
            return;
        }
        if (rawMobile3.length > 0 && rawMobile3.length !== 10) {
            this.showToast("Extra Phone 3 must be exactly 10 digits (or left blank).", "warning");
            document.getElementById("cust_mobile_3").focus();
            return;
        }

        const printIdValue = parseInt(document.getElementById("cust_printid").value, 10);
        if (isNaN(printIdValue) || printIdValue < 1) {
            const suggested = this.getNextAvailablePrintId(customerId);
            this.showToast(`Serial No. must be 1 or greater. Click 'Auto' for #${suggested}.`, "warning");
            document.getElementById("cust_printid").focus();
            return;
        }

        const conflict = this.findPrintIdConflict(printIdValue, customerId);
        if (conflict) {
            const nextAvailable = this.getNextAvailablePrintId(customerId);
            const printFeedback = document.getElementById("printIdFeedback");
            if (printFeedback) {
                printFeedback.textContent = `Used by "${conflict.name}". Click Auto for #${nextAvailable}.`;
                printFeedback.classList.remove("d-none");
            }
            document.getElementById("cust_printid").classList.add("is-invalid");
            document.getElementById("cust_printid").focus();
            this.showToast(`Serial No. #${printIdValue} is already assigned to "${conflict.name}". Click "Auto" to use #${nextAvailable}.`, "warning");
            return;
        }

        // FIX: Explicitly captures empty string "" when cleared so backend properly clears saved text
        const addressVal = document.getElementById("cust_address").value.trim();
        const remarksVal = document.getElementById("cust_remarks").value.trim();

        const payload = {
            printid: printIdValue,
            name: nameVal,
            mobile: rawMobile,
            mobile_2: rawMobile2,
            mobile_3: rawMobile3,
            address: addressVal,
            remarks: remarksVal,
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

            if (customerId !== null) {
                const idx = this.data.findIndex(c => String(c.id) === String(customerId));
                if (idx !== -1) {
                    this.data[idx] = { ...this.data[idx], ...payload };
                }
            }

            this.customerModal.hide();
            this.showToast("Customer saved successfully!", "success");
            await this.load(true);
        } catch (err) {
            this.showToast(err.message, "error");
        } finally {
            saveBtn.disabled = false;
            spinner.classList.add("d-none");
            btnText.innerText = "Save Customer";
        }
    },

    async toggleStatus(id) {
        const customer = this.data.find(c => String(c.id) === String(id));
        if (!customer) return;

        const btn = document.getElementById(`btnStatus_${id}`);
        const originalHtml = btn ? btn.innerHTML : "";
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm" style="width: 0.75rem; height: 0.75rem;"></span>`;
        }

        const parsedId = !isNaN(id) ? Number(id) : id;
        const currentStatus = (customer.status || "active").toLowerCase();
        const newStatus = currentStatus === "active" ? "inactive" : "active";

        const payload = {
            id: parsedId,
            printid: customer.printid,
            name: customer.name,
            mobile: this.cleanPhone(customer.mobile),
            mobile_2: this.cleanPhone(customer.mobile_2),
            mobile_3: this.cleanPhone(customer.mobile_3),
            address: (customer.address || "").trim(),
            remarks: (customer.remarks || "").trim(),
            status: newStatus
        };

        try {
            await Api.request("/customers", "PUT", payload);
            this.showToast(`Customer marked as ${newStatus}.`, "info");
            await this.load(true);
        } catch (err) {
            this.showToast(err.message, "error");
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }
    },

    async delete(id) {
        const customer = this.data.find(c => String(c.id) === String(id));
        const totalVehicles = customer ? Number(customer.total_vehicles) || 0 : 0;

        if (totalVehicles > 0) {
            this.showToast(`Cannot delete: "${customer.name}" has ${totalVehicles} vehicle(s) linked. Please delete or reassign vehicles first.`, "warning");
            return;
        }

        const confirmName = customer ? `"${customer.name}"` : "this customer";
        if (!confirm(`Are you sure you want to delete ${confirmName}? This cannot be undone.`)) return;

        const delBtn = document.getElementById(`btnDel_${id}`);
        if (delBtn) {
            delBtn.disabled = true;
            delBtn.innerHTML = `<span class="spinner-border spinner-border-sm" style="width: 0.75rem; height: 0.75rem;"></span>`;
        }

        try {
            await Api.request(`/customers?id=${encodeURIComponent(id)}`, "DELETE");
            this.showToast("Customer deleted successfully.", "success");
            await this.load(true);
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