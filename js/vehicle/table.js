/**
 * Vehicle DataTables Setup, Metrics, Sorting & Cached Filtering
 * Location: js/vehicle/table.js
 */
Object.assign(VehicleController, {
    initTable() {
        this.dataTable = $("#vehicleDataTable").DataTable({
            paging: true,
            pageLength: 10,
            lengthMenu: [5, 10, 25, 50, 100],
            searching: true,
            ordering: true,
            order: [[1, 'asc']],
            info: true,
            autoWidth: false,
            deferRender: true,
            language: {
                search: "Search:",
                searchPlaceholder: "Plate, Owner, Firm, Mobile...",
                lengthMenu: "Show _MENU_",
                emptyTable: "No vehicles found in registry",
                info: "Showing _START_ to _END_ of _TOTAL_ vehicles"
            },
            columns: [
                {
                    data: "registration_no",
                    render: (data, type, row) => {
                        if (type !== "display") return data || "";
                        const statusClass = (row.active_status || "Active").toLowerCase();
                        const isLTT = row.tax_type === "Lifetime";
                        return `
                            <div class="cell-merged-stack">
                                <div class="sub-row">
                                    <div class="d-flex align-items-center">
                                        <a href="#" onclick="VehicleController.openEdit('${VehicleController.escape(row.vehicle_id)}'); return false;" class="reg-no-link" title="Click to edit vehicle">
                                            ${VehicleController.escape(data)}
                                        </a>
                                        <span class="status-dot ${statusClass}" title="Status: ${row.active_status || 'Active'}"></span>
                                    </div>
                                </div>
                                <div class="sub-row">
                                    <span class="cat-badge">${VehicleController.escape(row.vehicle_category || 'LGV')}</span>
                                    <code class="text-dark fw-bold small" style="font-size: 0.74rem;" title="Chassis Number">[${VehicleController.escape(row.chassis_no) || '-'}]</code>
                                </div>
                                <div class="sub-row">
                                    <span class="tyre-text fw-bold">${row.no_of_tyres ? `${row.no_of_tyres}` : 'N/A'}</span>
                                    ${isLTT
                                        ? `<span class="badge bg-secondary text-white fw-bold" style="font-size: 0.65rem;">LTT</span>`
                                        : `<span class="tax-amount-text fw-black">₹${Number(row.tax_amount || 0).toLocaleString('en-IN')} <small class="text-dark fw-bold">(Q)</small></span>`
                                    }
                                </div>
                            </div>
                        `;
                    }
                },
                {
                    data: null,
                    render: (data, type, row) => {
                        // Instant O(1) pre-computed sort & filter values!
                        if (type === "sort" || type === "type") return row._printIdNum ?? 999999;
                        if (type === "filter") return row._searchString || "";

                        const phoneList = row._phoneList || [];
                        const phoneBadgeHtml = phoneList.length > 0
                            ? phoneList.map(p => `<span class="phone-pill-bold"><i class="fa fa-phone-alt text-primary me-1" style="font-size: 0.6rem;"></i>${VehicleController.escape(p)}</span>`).join('')
                            : '<span class="text-muted small fw-bold">-</span>';

                        return `
                            <div class="cell-merged-stack">
                                <div class="sub-row">
                                    <span class="sub-row-label">Owner:</span>
                                    <div class="sub-row-content full-text-wrap fw-black text-dark text-end">
                                        ${VehicleController.escape(row.owner_name || '-')}
                                    </div>
                                </div>
                                <div class="sub-row">
                                    <span class="sub-row-label">Firm:</span>
                                    <div class="sub-row-content full-text-wrap fw-black text-dark text-end">
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
                {
                    data: null,
                    render: (data, type, row) => {
                        const hasPermit = row.permit_applicable === "Yes";
                        const hasNP = hasPermit && row.national_permit_applicable === "Yes";
                        let statusChip = "";
                        if (hasPermit) {
                            const pDays = VehicleController.getDaysLeft(row.permit_expiry);
                            if (pDays !== null) {
                                if (pDays <= 0) statusChip = `<span class="badge-permit-lapsed ms-1">Overdue</span>`;
                                else if (pDays <= 15) statusChip = `<span class="badge-permit-fine ms-1">Due Soon</span>`;
                            }
                        }
                        return `
                            <div class="cell-merged-stack">
                                <div class="sub-row">
                                    <div class="d-flex align-items-center"><span class="badge-tag-permit">Permit</span>${statusChip}</div>
                                    <div>${VehicleController.renderDateBadge(row.permit_expiry, row.vehicle_id, 'permit_expiry', 'State Permit Expiry', hasPermit)}</div>
                                </div>
                                <div class="sub-row">
                                    <span class="badge-tag-np">NP</span>
                                    <div>${VehicleController.renderDateBadge(row.national_permit_expiry, row.vehicle_id, 'national_permit_expiry', 'National Permit Expiry', hasNP)}</div>
                                </div>
                            </div>
                        `;
                    }
                },
                {
                    data: null,
                    render: (data, type, row) => {
                        if (type === "sort" || type === "type") {
                            return row.min_days_remaining !== null && row.min_days_remaining !== undefined ? Number(row.min_days_remaining) : 999999;
                        }
                        const isLTT = row.tax_type === "Lifetime";
                        const gtaxApp = row._gtaxApplicable ?? VehicleController.isGreenTaxApplicableForRow(row);
                        return `
                            <div class="cell-merged-stack">
                                <div class="sub-row">
                                    <span class="sub-row-label">FC:</span>
                                    <div>${VehicleController.renderDateBadge(row.fc_expiry, row.vehicle_id, 'fc_expiry', 'FC Expiry', true)}</div>
                                </div>
                                <div class="sub-row">
                                    <span class="sub-row-label">Tax:</span>
                                    <div>${VehicleController.renderDateBadge(row.road_tax_due, row.vehicle_id, 'road_tax_due', 'Road Tax Due Date', !isLTT)}</div>
                                </div>
                                <div class="sub-row">
                                    <span class="sub-row-label">GTax:</span>
                                    <div>${VehicleController.renderDateBadge(row.green_tax_due, row.vehicle_id, 'green_tax_due', 'Green Tax Due', gtaxApp)}</div>
                                </div>
                            </div>
                        `;
                    }
                },
                {
                    data: null,
                    render: (data, type, row) => `
                        <div class="cell-merged-stack">
                            <div class="sub-row">
                                <span class="sub-row-label">INS:</span>
                                <div>${VehicleController.renderDateBadge(row.insurance_expiry, row.vehicle_id, 'insurance_expiry', 'Insurance Expiry', true)}</div>
                            </div>
                            <div class="sub-row">
                                <span class="sub-row-label">PUC:</span>
                                <div>${VehicleController.renderDateBadge(row.puc_expiry, row.vehicle_id, 'puc_expiry', 'PUC Expiry', true)}</div>
                            </div>
                        </div>
                    `
                },
                {
                    data: "remarks",
                    render: (data, type, row) => {
                        let blockerHtml = "";
                        if (Array.isArray(row.dependency_blockers) && row.dependency_blockers.length > 0) {
                            blockerHtml = `
                                <div class="blocker-alert-box">
                                    <i class="fa fa-info-circle me-1"></i>${VehicleController.escape(row.dependency_blockers[0])}
                                </div>
                            `;
                        }
                        const text = data ? VehicleController.escape(data) : "";
                        return `
                            <div class="remarks-cell-box"
                                 ondblclick="event.stopPropagation(); VehicleController.openQuickRemarks('${row.vehicle_id}', '${VehicleController.escape(data || '')}')"
                                 title="Double-click to edit notes">
                                ${blockerHtml}
                                ${text ? `<span>${text}</span>` : `<span class="text-muted fst-italic fw-normal no-print-placeholder">-</span>`}
                            </div>
                        `;
                    }
                },
                {
                    data: null,
                    orderable: false,
                    className: "text-end action-col",
                    render: (data, type, row) => `
                        <div class="d-inline-flex gap-1 p-2" onclick="event.stopPropagation()">
                            <button class="btn-clean-action edit" onclick='VehicleController.openEdit("${VehicleController.escape(row.vehicle_id)}")' title="Edit Vehicle">
                                <i class="fa fa-pen"></i>
                            </button>
                            <button class="btn-clean-action delete" onclick='VehicleController.delete("${VehicleController.escape(row.vehicle_id)}", "${VehicleController.escape(row.registration_no)}")' title="Delete">
                                <i class="fa fa-trash"></i>
                            </button>
                        </div>
                    `
                }
            ]
        });

        $("#vehicleDataTable tbody").on("click", "tr", function (e) {
            if ($(e.target).closest("[data-quick-date], .exp-pill, .remarks-cell-box, .btn, a, button").length > 0) return;
            const data = VehicleController.dataTable.row(this).data();
            if (data && data.vehicle_id) {
                VehicleController.openView(data.vehicle_id);
            }
        });

        // Fast O(1) memory-cached filter (zero DOM lookups inside the row loop)
        $.fn.dataTable.ext.search.push((settings, data, dataIndex, rowData) => {
            const f = VehicleController.filterCache;

            if (f.customerVal && String(rowData.customer_id) !== f.customerVal) return false;
            if (f.catVal && rowData.vehicle_category !== f.catVal) return false;
            if (f.filterPermitOnly && rowData.permit_applicable !== "Yes") return false;
            if (f.filterNPOnly && rowData.national_permit_applicable !== "Yes") return false;

            const days = rowData.min_days_remaining;
            const s = f.statusVal;
            if (s) {
                if (s === "EXPIRED" && !(rowData.compliance_status === "EXPIRED" || (days !== null && days <= 0))) return false;
                if (s === "LE_15" && !(days !== null && days > 0 && days <= 15)) return false;
                if (s === "16_30" && !(days !== null && days > 15 && days <= 30)) return false;
                if (s === "31_45" && !(days !== null && days > 30 && days <= 45)) return false;
                if (s === "LE_45" && !(days !== null && days <= 45)) return false;
                if (s === "VALID" && (days !== null && days <= 45)) return false;
            }

            if (f.dateFrom || f.dateTo) {
                const dates = rowData._isoDates || [];
                if (dates.length === 0) return false;
                const inRange = dates.some(cleanD => {
                    if (f.dateFrom && cleanD < f.dateFrom) return false;
                    if (f.dateTo && cleanD > f.dateTo) return false;
                    return true;
                });
                if (!inRange) return false;
            }

            return true;
        });
    },

    updateTopMetrics() {
        const total = this.data.length;
        let expired = 0, due15 = 0, due30 = 0, due45 = 0, validClear = 0;

        for (let i = 0; i < total; i++) {
            const v = this.data[i];
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
        }

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setVal("metricTotal", total);
        setVal("metricExpired", expired);
        setVal("metric15", due15);
        setVal("metric30", due30);
        setVal("metric45", due45);
        setVal("metricValid", validClear);
    },

    filterByMetric(type, cardEl) {
        document.querySelectorAll(".metric-card").forEach(c => c.classList.remove("active-metric-filter"));
        if (this.activeMetricFilter === type && type !== "ALL") {
            this.activeMetricFilter = "ALL";
            document.querySelector('.metric-card[data-metric="ALL"]')?.classList.add("active-metric-filter");
        } else {
            this.activeMetricFilter = type;
            if (cardEl) cardEl.classList.add("active-metric-filter");
        }
        this.applyFilters();
    },

    applySorting(sortType) {
        if (!this.dataTable) return;
        if (sortType === "printid_asc") {
            this.dataTable.order([1, 'asc']).draw();
        } else if (sortType === "reg_asc") {
            this.dataTable.order([0, 'asc']).draw();
        } else if (sortType === "urgency") {
            this.dataTable.order([3, 'asc']).draw();
        } else if (sortType === "owner_asc") {
            this.dataTable.order([1, 'asc']).draw();
        } else if (sortType === "newest") {
            this.dataTable.order([], 'desc').draw();
        }
    },

    applyFilters() {
        const getVal = (id) => document.getElementById(id)?.value || "";
        const getChk = (id) => document.getElementById(id)?.checked || false;

        this.filterCache = {
            customerVal: String(getVal("customerFilter")),
            statusVal: this.activeMetricFilter === "ALL" ? "" : this.activeMetricFilter,
            catVal: getVal("categoryFilter"),
            filterPermitOnly: getChk("btnTogglePermit"),
            filterNPOnly: getChk("btnToggleNP"),
            dateFrom: getVal("customDateFrom"),
            dateTo: getVal("customDateTo")
        };

        const f = this.filterCache;
        const hasActiveFilter = Boolean(
            f.customerVal || f.statusVal || f.catVal ||
            f.filterPermitOnly || f.filterNPOnly || f.dateFrom || f.dateTo
        );

        const filterBadge = document.getElementById("activeFilterBadge");
        if (filterBadge) {
            filterBadge.classList.toggle("d-none", !hasActiveFilter);
        }

        if (this.dataTable) {
            this.dataTable.draw();
        }
    },

    clearAllFilters() {
        if (this.tomSelectFilter) this.tomSelectFilter.clear(true);
        const sortSel = document.getElementById("sortOptionSelect");
        const catSel = document.getElementById("categoryFilter");
        const permitChk = document.getElementById("btnTogglePermit");
        const npChk = document.getElementById("btnToggleNP");
        const dFrom = document.getElementById("customDateFrom");
        const dTo = document.getElementById("customDateTo");

        if (sortSel) sortSel.value = "printid_asc";
        if (catSel) catSel.value = "";
        if (permitChk) permitChk.checked = false;
        if (npChk) npChk.checked = false;
        if (dFrom) dFrom.value = "";
        if (dTo) dTo.value = "";

        document.querySelectorAll(".metric-card").forEach(c => c.classList.remove("active-metric-filter"));
        document.querySelector('.metric-card[data-metric="ALL"]')?.classList.add("active-metric-filter");
        this.activeMetricFilter = "ALL";
        this.applySorting("printid_asc");
        this.applyFilters();
    },

    printReport() {
        const stamp = document.getElementById("printDateStamp");
        if (stamp) stamp.innerText = new Date().toLocaleString();
        if (!this.dataTable) return;
        const prevLength = this.dataTable.page.len();
        this.dataTable.page.len(-1).draw();

        setTimeout(() => {
            window.print();
            this.dataTable.page.len(prevLength).draw();
        }, 300);
    }
});