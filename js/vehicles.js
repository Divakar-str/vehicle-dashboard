/**
 * Vehicle Controller
 * - Robust Green Tax preservation & date normalization on Edit
 * - One-line compact Permit toggles (shows date input only when Yes, N/A box when No)
 * - Double-click & Mobile Double-tap quick date editing in Table & View Modal
 * - Change-Diff Preview & Confirmation Modal before saving edits
 */
const VehicleController = {
    dataTable: null,
    data: [],
    customerList: [],
    vehicleModal: null,
    viewModal: null,
    quickDateModal: null,
    quickRemarksModal: null,
    confirmChangesModal: null,
    toast: null,
    tomSelectForm: null,
    tomSelectFilter: null,
    activeMetricFilter: "ALL",
    activeViewVehicleId: null,
    pendingSavePayload: null,
    _lastTapTime: 0,
    _lastTapTarget: null,

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
        const vModalEl = document.getElementById("vehicleModal");
        const vViewEl = document.getElementById("vehicleViewModal");
        const qDateEl = document.getElementById("quickDateModal");
        const qRemEl = document.getElementById("quickRemarksModal");
        const cDiffEl = document.getElementById("confirmChangesModal");
        const toastEl = document.getElementById("liveToast");

        if (vModalEl) this.vehicleModal = new bootstrap.Modal(vModalEl);
        if (vViewEl) this.viewModal = new bootstrap.Modal(vViewEl);
        if (qDateEl) this.quickDateModal = new bootstrap.Modal(qDateEl);
        if (qRemEl) this.quickRemarksModal = new bootstrap.Modal(qRemEl);
        if (cDiffEl) this.confirmChangesModal = new bootstrap.Modal(cDiffEl);
        if (toastEl) this.toast = new bootstrap.Toast(toastEl, { delay: 4000 });

        const switchToEditBtn = document.getElementById("btnSwitchToEdit");
        if (switchToEditBtn) {
            switchToEditBtn.addEventListener("click", () => {
                if (this.activeViewVehicleId) {
                    if (this.viewModal) this.viewModal.hide();
                    this.openEdit(this.activeViewVehicleId);
                }
            });
        }

        this.initDoubleTapDelegate();
        this.initLiveVehicleDuplicates();
        this.initTable();
        this.load();
    },

    /**
     * Requirement 3: Double-Click (Desktop) & Double-Tap (Mobile/Touch) Quick Date Editor
     * Works seamlessly in both the main DataTable and the Vehicle Full Details View Modal
     */
    initDoubleTapDelegate() {
        const triggerQuickDate = (el) => {
            const vId = el.getAttribute("data-vehicle-id");
            const fKey = el.getAttribute("data-field-key");
            const fLabel = el.getAttribute("data-field-label");
            const dStr = el.getAttribute("data-date-str") || "";
            if (vId && fKey) {
                this.openQuickDate(vId, fKey, fLabel, dStr);
            }
        };

        // Desktop Double-Click
        document.addEventListener("dblclick", (e) => {
            const target = e.target.closest("[data-quick-date]");
            if (target) {
                e.preventDefault();
                e.stopPropagation();
                triggerQuickDate(target);
            }
        });

        // Mobile / Tablet Touch Double-Tap
        document.addEventListener("touchend", (e) => {
            const target = e.target.closest("[data-quick-date]");
            if (!target) return;

            const now = Date.now();
            if (this._lastTapTarget === target && (now - this._lastTapTime) < 350) {
                e.preventDefault();
                e.stopPropagation();
                this._lastTapTime = 0;
                this._lastTapTarget = null;
                triggerQuickDate(target);
            } else {
                this._lastTapTime = now;
                this._lastTapTarget = target;
            }
        }, { passive: false });
    },

    clearInput(inputId) {
        const el = document.getElementById(inputId);
        if (!el || el.disabled) return;
        el.value = "";
        el.dispatchEvent(new Event("input"));
        el.focus();
    },

    /**
     * Requirement 2 & 5: Compact One-Line Permit Toggle
     * Shows date input only when Permit is "Yes"; shows "N/A" placeholder when "No"
     */
    setPermitMode(type, val, autoFocus = true) {
        if (type === "permit") {
            const sel = document.getElementById("v_permit_app");
            if (sel) sel.value = val;
            this.togglePermits(val);
            if (val === "Yes" && autoFocus) {
                document.getElementById("v_permit")?.focus();
            }
        } else if (type === "np") {
            const permitVal = document.getElementById("v_permit_app")?.value;
            if (permitVal !== "Yes" && val === "Yes") {
                this.showToast("Enable State Permit first to activate National Permit.", "warning");
                return;
            }
            const isYes = val === "Yes";
            const npSel = document.getElementById("v_np_app");
            const npDate = document.getElementById("v_np_expiry");
            const npDateWrap = document.getElementById("npDateWrap");
            const npNaBadge = document.getElementById("npNaBadge");

            if (npSel) npSel.value = isYes ? "Yes" : "No";

            document.getElementById("pillNpYes")?.classList.toggle("active-yes", isYes);
            document.getElementById("pillNpNo")?.classList.toggle("active-no", !isYes);

            if (isYes) {
                npDate?.removeAttribute("disabled");
                npDateWrap?.classList.remove("d-none");
                npNaBadge?.classList.add("d-none");
                if (autoFocus) npDate?.focus();
            } else {
                if (npDate) {
                    npDate.value = "";
                    npDate.setAttribute("disabled", true);
                }
                npDateWrap?.classList.add("d-none");
                npNaBadge?.classList.remove("d-none");
            }
        }
    },

    togglePermits(val) {
        const isYes = val === "Yes";
        const permitSel = document.getElementById("v_permit_app");
        const permitDate = document.getElementById("v_permit");
        const permitDateWrap = document.getElementById("permitDateWrap");
        const permitNaBadge = document.getElementById("permitNaBadge");

        const npSel = document.getElementById("v_np_app");
        const npDate = document.getElementById("v_np_expiry");
        const npDateWrap = document.getElementById("npDateWrap");
        const npNaBadge = document.getElementById("npNaBadge");
        const npPillGroup = document.getElementById("npPillGroup");

        if (permitSel) permitSel.value = isYes ? "Yes" : "No";

        document.getElementById("pillPermitYes")?.classList.toggle("active-yes", isYes);
        document.getElementById("pillPermitNo")?.classList.toggle("active-no", !isYes);

        if (isYes) {
            permitDate?.removeAttribute("disabled");
            permitDateWrap?.classList.remove("d-none");
            permitNaBadge?.classList.add("d-none");

            npSel?.removeAttribute("disabled");
            npPillGroup?.classList.remove("opacity-50", "pe-none");
        } else {
            if (permitDate) {
                permitDate.value = "";
                permitDate.setAttribute("disabled", true);
            }
            permitDateWrap?.classList.add("d-none");
            permitNaBadge?.classList.remove("d-none");

            if (npSel) {
                npSel.value = "No";
                npSel.setAttribute("disabled", true);
            }
            if (npDate) {
                npDate.value = "";
                npDate.setAttribute("disabled", true);
            }
            npDateWrap?.classList.add("d-none");
            npNaBadge?.classList.remove("d-none");

            document.getElementById("pillNpYes")?.classList.remove("active-yes");
            document.getElementById("pillNpNo")?.classList.add("active-no");
            npPillGroup?.classList.add("opacity-50", "pe-none");
        }
    },

    initLiveVehicleDuplicates() {
        const regInput = document.getElementById("v_reg_no");
        const regFeedback = document.getElementById("regDuplicateFeedback");
        if (regInput && regFeedback) {
            regInput.addEventListener("input", (e) => {
                const currentId = document.getElementById("v_id")?.value || "";
                const cleanVal = e.target.value.trim().toUpperCase().replace(/\s+/g, '');
                if (!cleanVal) {
                    regFeedback.classList.add("d-none");
                    regInput.classList.remove("is-invalid");
                    return;
                }
                const found = this.data.find(v =>
                    String(v.vehicle_id) !== String(currentId) &&
                    String(v.registration_no || "").trim().toUpperCase().replace(/\s+/g, '') === cleanVal
                );
                if (found) {
                    regFeedback.innerText = `Already registered to ${found.owner_name || 'another client'}`;
                    regFeedback.classList.remove("d-none");
                    regInput.classList.add("is-invalid");
                } else {
                    regFeedback.classList.add("d-none");
                    regInput.classList.remove("is-invalid");
                }
            });
        }

        const chassisInput = document.getElementById("v_chassis_no");
        const chassisFeedback = document.getElementById("chassisDuplicateFeedback");
        if (chassisInput && chassisFeedback) {
            chassisInput.addEventListener("input", (e) => {
                const currentId = document.getElementById("v_id")?.value || "";
                const cleanVal = e.target.value.trim().toUpperCase().replace(/\s+/g, '');
                if (!cleanVal || cleanVal.length < 4) {
                    chassisFeedback.classList.add("d-none");
                    return;
                }
                const found = this.data.find(v =>
                    String(v.vehicle_id) !== String(currentId) &&
                    String(v.chassis_no || "").trim().toUpperCase().replace(/\s+/g, '') === cleanVal
                );
                if (found) {
                    chassisFeedback.innerText = `Matches plate ${found.registration_no}`;
                    chassisFeedback.classList.remove("d-none");
                } else {
                    chassisFeedback.classList.add("d-none");
                }
            });
        }
    },

    copyCustomerToOwner() {
        const custId = document.getElementById("v_cust_id")?.value;
        if (!custId) {
            this.showToast("Select a Customer / Firm first.", "warning");
            return;
        }
        const cust = this.customerList.find(c => String(c.id) === String(custId));
        if (cust && cust.name) {
            const ownerInput = document.getElementById("v_owner");
            if (ownerInput) ownerInput.value = cust.name;
            this.showToast(`Owner set to "${cust.name}"`, "info");
        }
    },

    showToast(message, type = "success") {
        if (!this.toast) return;
        const toastEl = document.getElementById("liveToast");
        const msgEl = document.getElementById("toastMessage");
        if (toastEl && msgEl) {
            toastEl.className = `toast align-items-center text-white border-0 shadow-lg rounded-3 bg-${type === "error" ? "danger" : (type === "warning" ? "warning text-dark" : "dark")}`;
            msgEl.innerText = message;
            this.toast.show();
        }
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

    /**
     * Requirement 1: Universal Date Normalizer (converts DD-MM-YYYY, DD/MM/YYYY, or ISO into YYYY-MM-DD)
     */
    normalizeIsoDate(dateVal) {
        if (!dateVal) return "";
        const raw = String(dateVal).trim().split("T")[0].split(" ")[0].replace(/\//g, "-");
        const parts = raw.split("-");
        if (parts.length === 3) {
            if (parts[0].length === 2 && parts[2].length === 4) {
                return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
            }
            if (parts[0].length === 4) {
                return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
            }
        }
        return raw;
    },

    formatDisplayDate(dateStr) {
        if (!dateStr) return "-";
        const iso = this.normalizeIsoDate(dateStr);
        const parts = iso.split("-");
        return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : iso;
    },

    getDaysLeft(dateStr) {
        if (!dateStr) return null;
        const iso = this.normalizeIsoDate(dateStr);
        const parts = iso.split("-").map(Number);
        if (parts.length !== 3 || isNaN(parts[0])) return null;
        const target = new Date(parts[0], parts[1] - 1, parts[2]);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        target.setHours(0, 0, 0, 0);
        return Math.round((target - now) / (1000 * 60 * 60 * 24));
    },

    /**
     * Requirement 3, 4 & 5:
     * - Not applicable -> "N/A"
     * - Applicable but empty -> "-" (double-tappable to set date)
     * - Applicable with date -> colored date pill (double-tappable to edit date)
     */
    renderDateBadge(dateStr, vehicleId, fieldKey, fieldLabel, isApplicable = true) {
        if (!isApplicable) {
            return `<span class="badge-na" title="Not Applicable">N/A</span>`;
        }

        const isoDate = this.normalizeIsoDate(dateStr);
        if (!isoDate) {
            return `
                <span class="exp-pill unset-dash"
                      title="No date set - Double-click / double-tap to set ${this.escape(fieldLabel)}"
                      data-quick-date="1"
                      data-vehicle-id="${this.escape(vehicleId)}"
                      data-field-key="${this.escape(fieldKey)}"
                      data-field-label="${this.escape(fieldLabel)}"
                      data-date-str=""
                      onclick="event.stopPropagation();">-</span>
            `;
        }

        const days = this.getDaysLeft(isoDate);
        let cssClass = "safe";
        let statusHint = `${days}d remaining`;

        if (days <= 0) {
            cssClass = "expired";
            statusHint = "Expired / Overdue";
        } else if (days <= 15) {
            cssClass = "urgent";
            statusHint = `${days}d left (Urgent)`;
        } else if (days <= 30) {
            cssClass = "soon";
            statusHint = `${days}d left (Due Soon)`;
        } else if (days <= 45) {
            cssClass = "soon";
            statusHint = `${days}d left`;
        }

        return `
            <span class="exp-pill ${cssClass}"
                  title="${statusHint} - Double-click / double-tap to edit"
                  data-quick-date="1"
                  data-vehicle-id="${this.escape(vehicleId)}"
                  data-field-key="${this.escape(fieldKey)}"
                  data-field-label="${this.escape(fieldLabel)}"
                  data-date-str="${this.escape(isoDate)}"
                  onclick="event.stopPropagation();">
              ${this.formatDisplayDate(isoDate)}
            </span>
        `;
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
    },

    getTaxCycle(baseDateStr, direction = 1) {
        let year, month, day;
        const iso = this.normalizeIsoDate(baseDateStr);
        if (iso) {
            const parts = iso.split("-");
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            day = parseInt(parts[2], 10);
        } else {
            const now = new Date();
            year = now.getFullYear();
            month = now.getMonth() + 1;
            day = now.getDate();
        }

        let targetMonth = 3;
        let targetDay = 31;

        if (direction > 0) {
            if (month < 3 || (month === 3 && day < 31)) { targetMonth = 3; targetDay = 31; }
            else if (month < 6 || (month === 6 && day < 30)) { targetMonth = 6; targetDay = 30; }
            else if (month < 9 || (month === 9 && day < 30)) { targetMonth = 9; targetDay = 30; }
            else if (month < 12 || (month === 12 && day < 31)) { targetMonth = 12; targetDay = 31; }
            else { year += 1; targetMonth = 3; targetDay = 31; }
        } else {
            if (month > 9 || (month === 9 && day > 30)) { targetMonth = 9; targetDay = 30; }
            else if (month > 6 || (month === 6 && day > 30)) { targetMonth = 6; targetDay = 30; }
            else if (month > 3 || (month === 3 && day > 31)) { targetMonth = 3; targetDay = 31; }
            else { year -= 1; targetMonth = 12; targetDay = 31; }
        }

        const mStr = String(targetMonth).padStart(2, '0');
        const dStr = String(targetDay).padStart(2, '0');
        return `${year}-${mStr}-${dStr}`;
    },

    shiftFormRoadTax(direction) {
        const taxInput = document.getElementById("v_tax");
        if (!taxInput || taxInput.disabled) return;
        const currentVal = taxInput.value;
        const target = this.getTaxCycle(currentVal, direction);
        taxInput.value = target;
        this.showToast(`Road Tax Due set to ${this.formatDisplayDate(target)}`, "info");
    },

    applyPrevTaxCycleFromCurrent() {
        const prevDate = document.getElementById("btnApplyPrevQuarter")?.getAttribute("data-prev-date");
        const qdInput = document.getElementById("qd_input");
        if (prevDate && qdInput) {
            qdInput.value = prevDate;
            this.showToast(`Set to ${this.formatDisplayDate(prevDate)}`, "info");
        }
    },

    applyNextTaxCycleFromCurrent() {
        const nextDate = document.getElementById("btnApplyNextQuarter")?.getAttribute("data-next-date");
        const qdInput = document.getElementById("qd_input");
        if (nextDate && qdInput) {
            qdInput.value = nextDate;
            this.showToast(`Set to ${this.formatDisplayDate(nextDate)}`, "info");
        }
    },

    setSpecificCycleDate(monthDay) {
        const qdInput = document.getElementById("qd_input");
        if (!qdInput) return;
        const currentVal = qdInput.value;
        const year = currentVal ? currentVal.split("-")[0] : new Date().getFullYear();
        qdInput.value = `${year}-${monthDay}`;
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

    clearAllFilters() {
        if (this.tomSelectFilter) this.tomSelectFilter.clear();
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

    isGreenTaxApplicableForRow(row) {
        if (this.normalizeIsoDate(row.green_tax_due)) return true;
        if (!row.date_of_registration) return false;
        const iso = this.normalizeIsoDate(row.date_of_registration);
        const reg = new Date(iso);
        if (isNaN(reg.getTime())) return false;
        const now = new Date();
        let age = now.getFullYear() - reg.getFullYear();
        const mDiff = now.getMonth() - reg.getMonth();
        if (mDiff < 0 || (mDiff === 0 && now.getDate() < reg.getDate())) age--;
        return age >= 7;
    },

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
                                ${isLTT ? `
                                  <span class="badge bg-secondary text-white fw-bold" style="font-size: 0.65rem;">LTT</span>
                                ` : `
                                  <span class="tax-amount-text fw-black">₹${Number(row.tax_amount || 0).toLocaleString('en-IN')} <small class="text-dark fw-bold">(Q)</small></span>
                                `}
                              </div>
                            </div>
                        `;
                    }
                },
                {
                    data: null,
                    render: (data, type, row) => {
                        const cust = VehicleController.customerList.find(c => String(c.id) === String(row.customer_id)) || {};
                        const printIdNum = cust.printid ? Number(cust.printid) : 999999;

                        if (type === "sort" || type === "type") {
                            return printIdNum;
                        }

                        const rawNumbers = [
                            row.customer_mobile, row.mobile, row.phone, row.phone1, row.alt_phone, row.secondary_phone,
                            cust.mobile, cust.mobile_2, cust.mobile_3, cust.alt_phone, cust.contact_no
                        ];

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

                        if (type === "filter") {
                            return `${row.owner_name || ""} ${row.customer_name || ""} ${phoneList.join(" ")}`;
                        }

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
                        const gtaxApp = VehicleController.isGreenTaxApplicableForRow(row);

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

        $.fn.dataTable.ext.search.push((settings, data, dataIndex, rowData) => {
            const customerVal = document.getElementById("customerFilter")?.value || "";
            const statusVal = VehicleController.activeMetricFilter === "ALL" ? "" : VehicleController.activeMetricFilter;
            const catVal = document.getElementById("categoryFilter")?.value || "";
            const filterPermitOnly = document.getElementById("btnTogglePermit")?.checked || false;
            const filterNPOnly = document.getElementById("btnToggleNP")?.checked || false;

            const dateFrom = document.getElementById("customDateFrom")?.value || "";
            const dateTo = document.getElementById("customDateTo")?.value || "";

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
                    rowData.permit_expiry, rowData.national_permit_expiry, rowData.fc_expiry,
                    rowData.road_tax_due, rowData.insurance_expiry, rowData.puc_expiry, rowData.green_tax_due
                ].filter(Boolean);

                if (dateFields.length === 0) return false;

                const inRange = dateFields.some(d => {
                    const cleanD = VehicleController.normalizeIsoDate(d);
                    if (dateFrom && cleanD < dateFrom) return false;
                    if (dateTo && cleanD > dateTo) return false;
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
                refreshBtn.classList.add("btn-glass-light");
            }
            if (refreshText) refreshText.innerText = "Refresh";

            const uniqueMap = new Map();
            (vehicles || []).forEach(item => {
                if (item.vehicle_id && !uniqueMap.has(item.vehicle_id)) {
                    uniqueMap.set(item.vehicle_id, item);
                }
            });

            this.data = Array.from(uniqueMap.values());
            this.customerList = (customers || []).sort((a, b) => (Number(a.printid) || 999999) - (Number(b.printid) || 999999));

            this.populateCustomerFilter();

            if (this.dataTable) {
                this.dataTable.clear();
                this.dataTable.rows.add(this.data);
                this.dataTable.draw(false);
            }

            this.updateTopMetrics();

            const viewModalEl = document.getElementById("vehicleViewModal");
            if (this.activeViewVehicleId && viewModalEl && viewModalEl.classList.contains("show")) {
                this.openView(this.activeViewVehicleId);
            }
        } catch (err) {
            if (refreshBtn) {
                refreshBtn.classList.remove("btn-glass-light");
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
        if (!custFilterSelect) return;
        const prevValue = custFilterSelect.value;

        if (this.tomSelectFilter) {
            this.tomSelectFilter.destroy();
            this.tomSelectFilter = null;
        }

        custFilterSelect.innerHTML = '<option value="">All Customers / Firms</option>' +
            this.customerList.map(c => `
                <option value="${c.id}" data-phone="${this.escape(c.mobile || '')}">
                    ${this.escape(c.name)} ${c.mobile ? `(${this.escape(c.mobile)})` : ''}
                </option>
            `).join('');

        this.tomSelectFilter = new TomSelect("#customerFilter", {
            create: false,
            dropdownParent: "body",
            placeholder: "All Customers / Firms...",
            allowEmptyOption: true,
            maxOptions: 200,
            render: {
                option: (data, escape) => {
                    if (!data.value) return `<div class="py-1 px-2 fw-bold text-secondary">All Customers / Firms</div>`;
                    return `<div class="d-flex justify-content-between align-items-center py-1 px-2">
                        <span class="fw-bold text-dark">${escape(data.text.replace(/\s*\([^)]*\)$/, ''))}</span>
                        ${data.phone ? `<span class="badge bg-light text-dark border font-monospace">${escape(data.phone)}</span>` : ''}
                    </div>`;
                }
            }
        });

        if (prevValue) {
            this.tomSelectFilter.setValue(prevValue, true);
        }
    },

    setupCustomerSelect(selectedId = null) {
        const select = document.getElementById("v_cust_id");
        if (!select) return;
        if (this.tomSelectForm) {
            this.tomSelectForm.destroy();
            this.tomSelectForm = null;
        }

        select.innerHTML = '<option value="">Select or search customer / firm...</option>' +
            this.customerList.map(c => `
                <option value="${c.id}" data-phone="${this.escape(c.mobile || '')}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>
                    ${this.escape(c.name)} ${c.mobile ? `— ${this.escape(c.mobile)}` : ''}
                </option>
            `).join('');

        this.tomSelectForm = new TomSelect("#v_cust_id", {
            create: false,
            maxItems: 1,
            maxOptions: 200,
            placeholder: "Search customer name or phone...",
            render: {
                option: (data, escape) => {
                    if (!data.value) return '';
                    const cleanName = data.text.split(" — ")[0];
                    return `<div class="d-flex justify-content-between align-items-center py-1 px-2">
                        <span class="fw-bold text-dark">${escape(cleanName)}</span>
                        ${data.phone ? `<span class="badge bg-primary-subtle text-primary font-monospace">${escape(data.phone)}</span>` : ''}
                    </div>`;
                },
                item: (data, escape) => {
                    const cleanName = data.text.split(" — ")[0];
                    return `<div class="fw-bold text-dark">${escape(cleanName)} ${data.phone ? `<span class="text-muted small ms-1">(${escape(data.phone)})</span>` : ''}</div>`;
                }
            }
        });

        if (selectedId) {
            this.tomSelectForm.setValue(selectedId, true);
        }
    },

    applyFilters() {
        const checkEl = (id) => document.getElementById(id);
        const hasActiveFilter =
            (checkEl("customerFilter")?.value || "") !== "" ||
            this.activeMetricFilter !== "ALL" ||
            (checkEl("categoryFilter")?.value || "") !== "" ||
            (checkEl("btnTogglePermit")?.checked || false) ||
            (checkEl("btnToggleNP")?.checked || false) ||
            (checkEl("customDateFrom")?.value || "") !== "" ||
            (checkEl("customDateTo")?.value || "") !== "";

        const filterBadge = document.getElementById("activeFilterBadge");
        if (filterBadge) {
            if (hasActiveFilter) filterBadge.classList.remove("d-none");
            else filterBadge.classList.add("d-none");
        }

        if (this.dataTable) {
            this.dataTable.draw();
        }
    },

    openQuickRemarks(vehicleId, currentRemarks) {
        const vIdInput = document.getElementById("qr_vehicle_id");
        const qrInput = document.getElementById("qr_input");
        if (vIdInput) vIdInput.value = vehicleId;
        if (qrInput) qrInput.value = currentRemarks || "";
        if (this.quickRemarksModal) this.quickRemarksModal.show();
    },

    async saveQuickRemarks() {
        const vehicleId = document.getElementById("qr_vehicle_id")?.value;
        const newRemarks = document.getElementById("qr_input")?.value.trim() || "";
        const saveBtn = document.getElementById("btnSaveQuickRemarks");

        const vehicle = this.data.find(v => String(v.vehicle_id) === String(vehicleId));
        if (!vehicle) return;

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerText = "Saving...";
        }

        const updatedPayload = { ...vehicle, remarks: newRemarks };

        try {
            await Api.request("/vehicles", "PUT", updatedPayload);
            if (this.quickRemarksModal) this.quickRemarksModal.hide();
            this.showToast(`Saved notes for ${vehicle.registration_no}`);
            await this.load();
        } catch (err) {
            this.showToast("Failed to update notes: " + err.message, "error");
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa fa-save me-1"></i>Save Notes';
            }
        }
    },

    openQuickDate(vehicleId, fieldName, fieldLabel, currentDate) {
        const qdVId = document.getElementById("qd_vehicle_id");
        const qdField = document.getElementById("qd_field_name");
        const qdLabel = document.getElementById("qd_label");
        const qdInput = document.getElementById("qd_input");
        const isoCurrent = this.normalizeIsoDate(currentDate);

        if (qdVId) qdVId.value = vehicleId;
        if (qdField) qdField.value = fieldName;
        if (qdLabel) qdLabel.innerText = `Update ${fieldLabel}`;
        if (qdInput) qdInput.value = isoCurrent;

        const taxCycleBox = document.getElementById("qd_tax_cycle_box");
        if (fieldName === "road_tax_due" && taxCycleBox) {
            const vehicle = this.data.find(v => String(v.vehicle_id) === String(vehicleId));
            if (vehicle && vehicle.tax_type === "Lifetime") {
                taxCycleBox.classList.add("d-none");
            } else {
                taxCycleBox.classList.remove("d-none");
                const prevCycle = this.getTaxCycle(isoCurrent, -1);
                const nextCycle = this.getTaxCycle(isoCurrent, 1);

                const prevTxt = document.getElementById("qd_prev_quarter_text");
                const nextTxt = document.getElementById("qd_next_quarter_text");
                const btnPrev = document.getElementById("btnApplyPrevQuarter");
                const btnNext = document.getElementById("btnApplyNextQuarter");

                if (prevTxt) prevTxt.innerText = this.formatDisplayDate(prevCycle);
                if (btnPrev) btnPrev.setAttribute("data-prev-date", prevCycle);

                if (nextTxt) nextTxt.innerText = this.formatDisplayDate(nextCycle);
                if (btnNext) btnNext.setAttribute("data-next-date", nextCycle);
            }
        } else if (taxCycleBox) {
            taxCycleBox.classList.add("d-none");
        }

        if (this.quickDateModal) this.quickDateModal.show();
    },

    async saveQuickDate() {
        const vehicleId = document.getElementById("qd_vehicle_id")?.value;
        const fieldName = document.getElementById("qd_field_name")?.value;
        const newDate = document.getElementById("qd_input")?.value || "";
        const saveBtn = document.getElementById("btnSaveQuickDate");

        const vehicle = this.data.find(v => String(v.vehicle_id) === String(vehicleId));
        if (!vehicle) return;

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerText = "Saving...";
        }

        const updatedPayload = { ...vehicle, [fieldName]: newDate || null };

        try {
            await Api.request("/vehicles", "PUT", updatedPayload);
            if (this.quickDateModal) this.quickDateModal.hide();
            this.showToast(`Updated ${fieldName.replace(/_/g, ' ')} for ${vehicle.registration_no}`);
            await this.load();
        } catch (err) {
            this.showToast("Failed to update date: " + err.message, "error");
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa fa-save me-1"></i>Update';
            }
        }
    },

    openView(id) {
        const v = this.data.find(item => String(item.vehicle_id) === String(id));
        if (!v) return;
        this.activeViewVehicleId = id;

        const regEl = document.getElementById("viewRegNo");
        if (regEl) regEl.innerText = v.registration_no;

        const cust = this.customerList.find(c => String(c.id) === String(v.customer_id)) || {};
        const numbers = [v.customer_mobile, v.mobile, v.phone, v.alt_mobile, cust.mobile, cust.mobile_2, cust.mobile_3].filter(Boolean);
        const uniquePhones = [...new Set(numbers)].join(", ") || "-";

        const custInfoEl = document.getElementById("viewCustomerInfo");
        if (custInfoEl) {
            custInfoEl.innerText = `Owner: ${v.owner_name || '-'} • Firm: ${v.customer_name || 'Individual'} • Contact: ${uniquePhones}`;
        }

        const isLTT = v.tax_type === "Lifetime";
        const hasPermit = v.permit_applicable === "Yes";
        const hasNP = hasPermit && v.national_permit_applicable === "Yes";
        const gtaxApplicable = this.isGreenTaxApplicableForRow(v);

        const renderDateCard = (label, icon, dateVal, fieldKey, isApplicable) => {
            if (!isApplicable) {
                return `
                    <div class="col-lg-3 col-md-4 col-sm-6">
                      <div class="p-3 rounded-3 border border-light bg-light bg-opacity-75 h-100">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                          <span class="small fw-bold text-secondary text-uppercase" style="font-size: 0.7rem;"><i class="fa ${icon} me-1"></i>${label}</span>
                          <span class="badge bg-secondary-subtle text-secondary">N/A</span>
                        </div>
                        <div class="fw-black fs-5 text-muted font-monospace mt-1">N/A</div>
                      </div>
                    </div>
                `;
            }

            const isoDate = this.normalizeIsoDate(dateVal);
            const days = this.getDaysLeft(isoDate);
            let statusBadge = '<span class="badge bg-light text-secondary border">Not Set</span>';
            let cardClass = "border-light";

            if (isoDate) {
                if (days <= 0) {
                    statusBadge = '<span class="badge bg-danger">Expired</span>';
                    cardClass = "border-danger-subtle bg-danger-subtle bg-opacity-10";
                } else if (days <= 15) {
                    statusBadge = `<span class="badge bg-warning text-dark">${days}d Left</span>`;
                    cardClass = "border-warning-subtle bg-warning-subtle bg-opacity-10";
                } else if (days <= 45) {
                    statusBadge = `<span class="badge bg-info text-dark">${days}d Left</span>`;
                } else {
                    statusBadge = `<span class="badge bg-success-subtle text-success">${days}d Safe</span>`;
                }
            }

            return `
                <div class="col-lg-3 col-md-4 col-sm-6">
                  <div class="p-3 rounded-3 border ${cardClass} bg-white h-100 shadow-2xs view-date-card-editable"
                       title="Double-click / double-tap to quick-edit ${label}"
                       data-quick-date="1"
                       data-vehicle-id="${this.escape(v.vehicle_id)}"
                       data-field-key="${this.escape(fieldKey)}"
                       data-field-label="${this.escape(label)}"
                       data-date-str="${this.escape(isoDate)}">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <span class="small fw-bold text-secondary text-uppercase" style="font-size: 0.7rem;"><i class="fa ${icon} me-1"></i>${label}</span>
                      ${statusBadge}
                    </div>
                    <div class="d-flex justify-content-between align-items-baseline mt-1">
                      <span class="fw-black fs-5 text-dark font-monospace">${isoDate ? this.formatDisplayDate(isoDate) : '-'}</span>
                      <small class="text-primary fw-bold" style="font-size: 0.65rem;"><i class="fa fa-pen me-1"></i>2x Tap</small>
                    </div>
                  </div>
                </div>
            `;
        };

        const bodyEl = document.getElementById("viewModalBody");
        if (bodyEl) {
            bodyEl.innerHTML = `
                <div class="row g-3 mb-4">
                  <div class="col-md-3 col-6">
                    <div class="p-3 rounded-3 bg-light border">
                      <small class="text-secondary fw-bold text-uppercase d-block" style="font-size: 0.7rem;">Vehicle Status</small>
                      <span class="badge ${v.active_status === 'Active' ? 'bg-success' : 'bg-secondary'} fw-bold mt-1">${this.escape(v.active_status || 'Active')}</span>
                    </div>
                  </div>
                  <div class="col-md-3 col-6">
                    <div class="p-3 rounded-3 bg-light border">
                      <small class="text-secondary fw-bold text-uppercase d-block" style="font-size: 0.7rem;">Category &amp; Axles</small>
                      <div class="fw-black text-dark mt-1">${this.escape(v.vehicle_category)} • ${this.escape(v.no_of_tyres || 'N/A')}</div>
                    </div>
                  </div>
                  <div class="col-md-3 col-6">
                    <div class="p-3 rounded-3 bg-light border">
                      <small class="text-secondary fw-bold text-uppercase d-block" style="font-size: 0.7rem;">Road Tax Mode</small>
                      <div class="fw-black text-success mt-1">${isLTT ? 'Lifetime (LTT)' : `₹${Number(v.tax_amount || 0).toLocaleString('en-IN')} / Qtr`}</div>
                    </div>
                  </div>
                  <div class="col-md-3 col-6">
                    <div class="p-3 rounded-3 bg-light border">
                      <small class="text-secondary fw-bold text-uppercase d-block" style="font-size: 0.7rem;">Registration Date</small>
                      <div class="fw-black text-dark font-monospace mt-1">${v.date_of_registration ? this.formatDisplayDate(v.date_of_registration) : '-'}</div>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="p-3 rounded-3 bg-light border d-flex justify-content-between align-items-center">
                      <span class="text-secondary fw-bold text-uppercase" style="font-size: 0.72rem;">Chassis Number:</span>
                      <code class="fw-black fs-6 text-dark">${this.escape(v.chassis_no) || '-'}</code>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="p-3 rounded-3 bg-light border d-flex justify-content-between align-items-center">
                      <span class="text-secondary fw-bold text-uppercase" style="font-size: 0.72rem;">Engine Number:</span>
                      <code class="fw-black fs-6 text-dark">${this.escape(v.engine_no) || '-'}</code>
                    </div>
                  </div>
                </div>

                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h6 class="fw-black text-uppercase small text-primary mb-0"><i class="fa fa-calendar-check me-1"></i>Compliance &amp; Expiry Schedule</h6>
                  <small class="text-muted fw-bold"><i class="fa fa-hand-pointer me-1"></i>Double-click / double-tap any applicable date card to quick-edit</small>
                </div>
                <div class="row g-3">
                  ${renderDateCard("State Permit", "fa-map-location-dot", v.permit_expiry, "permit_expiry", hasPermit)}
                  ${renderDateCard("National Permit", "fa-globe", v.national_permit_expiry, "national_permit_expiry", hasNP)}
                  ${renderDateCard("Fitness (FC)", "fa-certificate", v.fc_expiry, "fc_expiry", true)}
                  ${renderDateCard("Road Tax Due", "fa-coins", v.road_tax_due, "road_tax_due", !isLTT)}
                  ${renderDateCard("Insurance", "fa-shield-heart", v.insurance_expiry, "insurance_expiry", true)}
                  ${renderDateCard("Pollution (PUC)", "fa-smog", v.puc_expiry, "puc_expiry", true)}
                  ${renderDateCard("Green Tax", "fa-leaf", v.green_tax_due, "green_tax_due", gtaxApplicable)}
                </div>

                <div class="mt-4">
                  <small class="text-secondary fw-bold d-block mb-1 text-uppercase" style="font-size: 0.72rem;">Operational Notes &amp; Remarks (Double-click to edit)</small>
                  <div class="p-3 bg-warning-subtle bg-opacity-25 rounded-3 border border-warning-subtle fw-bold text-dark"
                       style="cursor: pointer;"
                       ondblclick="VehicleController.openQuickRemarks('${this.escape(v.vehicle_id)}', '${this.escape(v.remarks || '')}')">
                    ${this.escape(v.remarks) || '<span class="text-muted fw-normal">-</span>'}
                  </div>
                </div>
            `;
        }

        if (this.viewModal) this.viewModal.show();
    },

    applyTyreRules(tyre) {
        const rule = this.tyreMatrix[tyre];
        if (rule) {
            const taxType = document.getElementById("v_tax_type")?.value;
            const taxAmt = document.getElementById("v_tax_amount");
            const cat = document.getElementById("v_category");
            if (taxAmt && taxType !== "Lifetime") taxAmt.value = rule.amount;
            if (cat) cat.value = rule.category;
        }
    },

    toggleTaxType(type) {
        const taxInput = document.getElementById("v_tax");
        const hint = document.getElementById("lttHint");
        const amount = document.getElementById("v_tax_amount");
        const stepperGroup = document.getElementById("roadTaxStepperGroup");

        if (type === "Lifetime") {
            if (taxInput) { taxInput.value = ""; taxInput.setAttribute("disabled", true); }
            if (stepperGroup) stepperGroup.classList.add("d-none");
            if (hint) hint.classList.remove("d-none");
            if (amount) amount.value = "0.00";
        } else {
            if (taxInput) taxInput.removeAttribute("disabled");
            if (stepperGroup) stepperGroup.classList.remove("d-none");
            if (hint) hint.classList.add("d-none");
        }
    },

    /**
     * Requirement 1 FIXED:
     * Never wipes out an existing Green Tax date during Edit!
     */
    checkGreenTax(preserveExisting = true) {
        const regDateStr = document.getElementById("v_reg_date")?.value;
        const gtax = document.getElementById("v_gtax");
        if (!gtax) return;

        if (preserveExisting && gtax.value) {
            gtax.removeAttribute("disabled");
            return;
        }

        if (!regDateStr) {
            gtax.setAttribute("disabled", true);
            if (!preserveExisting) gtax.value = "";
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
            if (!preserveExisting) gtax.value = "";
        }
    },

    unlockGreenTax() {
        const gtax = document.getElementById("v_gtax");
        if (gtax) {
            gtax.removeAttribute("disabled");
            gtax.focus();
            this.showToast("Green Tax date unlocked", "info");
        }
    },

    openAdd() {
        const form = document.getElementById("vehicleForm");
        if (form) form.reset();

        const titleEl = document.getElementById("vehModalTitle");
        const subEl = document.getElementById("vehModalSubtitle");
        if (titleEl) titleEl.innerHTML = '<i class="fa fa-truck me-2"></i>Add New Vehicle';
        if (subEl) subEl.innerText = "Enter vehicle registration, customer firm, and compliance dates";

        this.setupCustomerSelect();

        const vId = document.getElementById("v_id");
        const regInput = document.getElementById("v_reg_no");
        const regFeedback = document.getElementById("regDuplicateFeedback");
        const chassisFeedback = document.getElementById("chassisDuplicateFeedback");

        if (vId) vId.value = "";
        if (regInput) {
            regInput.value = "";
            regInput.removeAttribute("readonly");
            regInput.classList.remove("is-invalid");
        }
        if (regFeedback) regFeedback.classList.add("d-none");
        if (chassisFeedback) chassisFeedback.classList.add("d-none");

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setVal("v_owner", "");
        setVal("v_reg_date", "");
        setVal("v_engine_no", "");
        setVal("v_chassis_no", "");
        setVal("v_active_status", "Active");
        setVal("v_no_of_tyres", "14 TYRE");
        this.applyTyreRules("14 TYRE");

        setVal("v_tax_type", "Quarterly");
        this.toggleTaxType("Quarterly");
        setVal("v_tax", this.getTaxCycle(null, 1));

        this.setPermitMode("permit", "No", false);
        this.setPermitMode("np", "No", false);

        setVal("v_ins", "");
        setVal("v_fc", "");
        setVal("v_puc", "");
        setVal("v_permit", "");
        setVal("v_np_expiry", "");
        setVal("v_gtax", "");
        setVal("v_remarks", "");

        this.checkGreenTax(false);
        if (this.vehicleModal) this.vehicleModal.show();
    },

    openEdit(id) {
        const v = this.data.find(item => String(item.vehicle_id) === String(id));
        if (!v) return;

        const titleEl = document.getElementById("vehModalTitle");
        const subEl = document.getElementById("vehModalSubtitle");
        if (titleEl) titleEl.innerHTML = `<i class="fa fa-pen-to-square me-2"></i>Edit ${this.escape(v.registration_no)}`;
        if (subEl) subEl.innerText = "Update vehicle registration details or compliance dates";

        this.setupCustomerSelect(v.customer_id);

        const vId = document.getElementById("v_id");
        const regInput = document.getElementById("v_reg_no");
        const regFeedback = document.getElementById("regDuplicateFeedback");
        const chassisFeedback = document.getElementById("chassisDuplicateFeedback");

        if (vId) vId.value = v.vehicle_id;
        if (regInput) {
            regInput.value = v.registration_no;
            regInput.removeAttribute("readonly");
            regInput.classList.remove("is-invalid");
        }
        if (regFeedback) regFeedback.classList.add("d-none");
        if (chassisFeedback) chassisFeedback.classList.add("d-none");

        const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
        setVal("v_owner", v.owner_name || "");
        setVal("v_reg_date", this.normalizeIsoDate(v.date_of_registration));
        setVal("v_engine_no", v.engine_no || "");
        setVal("v_chassis_no", v.chassis_no || "");
        setVal("v_active_status", v.active_status || "Active");

        const tyreEl = document.getElementById("v_no_of_tyres");
        const tyre = String(v.no_of_tyres || "").trim();
        if (tyreEl) tyreEl.value = tyre.includes("TYRE") ? tyre : (tyre ? tyre + " TYRE" : "");

        setVal("v_category", v.vehicle_category || "LGV");
        setVal("v_tax_amount", v.tax_amount || "");

        setVal("v_tax_type", v.tax_type === "Lifetime" ? "Lifetime" : "Quarterly");
        this.toggleTaxType(document.getElementById("v_tax_type")?.value || "Quarterly");

        this.setPermitMode("permit", v.permit_applicable || "No", false);
        this.setPermitMode("np", v.national_permit_applicable || "No", false);

        setVal("v_ins", this.normalizeIsoDate(v.insurance_expiry));
        setVal("v_fc", this.normalizeIsoDate(v.fc_expiry));
        setVal("v_puc", this.normalizeIsoDate(v.puc_expiry));
        setVal("v_tax", this.normalizeIsoDate(v.road_tax_due));
        setVal("v_permit", this.normalizeIsoDate(v.permit_expiry));
        setVal("v_np_expiry", this.normalizeIsoDate(v.national_permit_expiry));

        // Requirement 1 Fixed: Set Green Tax ISO date first, then unlock
        const gtaxIso = this.normalizeIsoDate(v.green_tax_due);
        setVal("v_gtax", gtaxIso);
        this.checkGreenTax(true);

        setVal("v_remarks", v.remarks || "");

        if (this.vehicleModal) this.vehicleModal.show();
    },

    /**
     * Requirement 7: Computes field-by-field diff when editing an existing vehicle
     */
    computeEditDiff(original, payload) {
        const changes = [];
        const getCustomerName = (cId) => {
            const c = this.customerList.find(item => String(item.id) === String(cId));
            return c ? c.name : (cId || "-");
        };

        const compareField = (label, oldVal, newVal, isDate = false) => {
            const normOld = isDate ? this.normalizeIsoDate(oldVal) : String(oldVal ?? "").trim();
            const normNew = isDate ? this.normalizeIsoDate(newVal) : String(newVal ?? "").trim();
            if (normOld !== normNew) {
                changes.push({
                    label,
                    oldDisplay: isDate ? (normOld ? this.formatDisplayDate(normOld) : "-") : (normOld || "-"),
                    newDisplay: isDate ? (normNew ? this.formatDisplayDate(normNew) : "-") : (normNew || "-")
                });
            }
        };

        compareField("Vehicle Plate No.", original.registration_no, payload.registration_no);
        if (String(original.customer_id) !== String(payload.customer_id)) {
            changes.push({
                label: "Customer / Firm",
                oldDisplay: getCustomerName(original.customer_id),
                newDisplay: getCustomerName(payload.customer_id)
            });
        }
        compareField("Owner Name", original.owner_name, payload.owner_name);
        compareField("Registration Date", original.date_of_registration, payload.date_of_registration, true);
        compareField("Chassis Number", original.chassis_no, payload.chassis_no);
        compareField("Engine Number", original.engine_no, payload.engine_no);
        compareField("Vehicle Status", original.active_status || "Active", payload.active_status);
        compareField("Tyres / Axles", original.no_of_tyres, payload.no_of_tyres);
        compareField("Category", original.vehicle_category, payload.vehicle_category);
        compareField("Tax Mode", original.tax_type || "Quarterly", payload.tax_type);
        compareField("Tax Amount (₹)", Number(original.tax_amount || 0), Number(payload.tax_amount || 0));
        compareField("Road Tax Due Date", original.road_tax_due, payload.road_tax_due, true);
        compareField("State Permit Applicable", original.permit_applicable || "No", payload.permit_applicable);
        compareField("State Permit Expiry", original.permit_expiry, payload.permit_expiry, true);
        compareField("National Permit Applicable", original.national_permit_applicable || "No", payload.national_permit_applicable);
        compareField("National Permit Expiry", original.national_permit_expiry, payload.national_permit_expiry, true);
        compareField("Fitness (FC) Expiry", original.fc_expiry, payload.fc_expiry, true);
        compareField("Insurance Expiry", original.insurance_expiry, payload.insurance_expiry, true);
        compareField("Pollution (PUC) Expiry", original.puc_expiry, payload.puc_expiry, true);
        compareField("Green Tax Due", original.green_tax_due, payload.green_tax_due, true);
        compareField("Notes / Remarks", original.remarks, payload.remarks);

        return changes;
    },

    async save() {
        const id = document.getElementById("v_id")?.value || "";
        const regInput = document.getElementById("v_reg_no");
        const custSelect = document.getElementById("v_cust_id");

        const regNo = regInput ? regInput.value.trim().toUpperCase().replace(/\s+/g, '') : "";
        const custId = custSelect ? custSelect.value : "";

        if (!regNo) {
            this.showToast("Vehicle Plate No. is required.", "warning");
            if (regInput) regInput.focus();
            return;
        }
        if (!custId) {
            this.showToast("Please select a Customer / Firm.", "warning");
            return;
        }

        const getElVal = (elId) => document.getElementById(elId)?.value || "";

        const payload = {
            vehicle_id: id || undefined,
            registration_no: regNo,
            customer_id: custId,
            owner_name: getElVal("v_owner").trim(),
            vehicle_category: getElVal("v_category") || "LGV",
            engine_no: getElVal("v_engine_no").trim() || null,
            chassis_no: getElVal("v_chassis_no").trim() || null,
            date_of_registration: getElVal("v_reg_date") || null,
            active_status: getElVal("v_active_status") || "Active",
            permit_applicable: getElVal("v_permit_app") || "No",
            national_permit_applicable: getElVal("v_np_app") || "No",
            tax_type: getElVal("v_tax_type") || "Quarterly",
            tax_amount: getElVal("v_tax_type") === "Lifetime" ? 0 : (parseFloat(getElVal("v_tax_amount")) || 0),
            no_of_tyres: getElVal("v_no_of_tyres") || null,
            insurance_expiry: getElVal("v_ins") || null,
            fc_expiry: getElVal("v_fc") || null,
            puc_expiry: getElVal("v_puc") || null,
            road_tax_due: getElVal("v_tax_type") === "Lifetime" ? null : (getElVal("v_tax") || null),
            permit_expiry: getElVal("v_permit_app") === "Yes" ? (getElVal("v_permit") || null) : null,
            national_permit_expiry: getElVal("v_np_app") === "Yes" ? (getElVal("v_np_expiry") || null) : null,
            green_tax_due: getElVal("v_gtax") || null,
            remarks: getElVal("v_remarks").trim()
        };

        if (id) {
            const original = this.data.find(item => String(item.vehicle_id) === String(id));
            if (original) {
                const diffs = this.computeEditDiff(original, payload);
                if (diffs.length === 0) {
                    this.showToast("No changes were made to this vehicle.", "info");
                    return;
                }

                this.pendingSavePayload = payload;
                const subtitle = document.getElementById("confirmChangesSubtitle");
                const tbody = document.getElementById("confirmChangesBody");
                if (subtitle) subtitle.innerText = `Vehicle: ${regNo} (${diffs.length} field${diffs.length > 1 ? 's' : ''} modified)`;
                if (tbody) {
                    tbody.innerHTML = diffs.map(d => `
                        <tr>
                          <td class="text-secondary">${this.escape(d.label)}</td>
                          <td class="text-danger text-decoration-line-through font-monospace">${this.escape(d.oldDisplay)}</td>
                          <td class="text-success font-monospace"><i class="fa fa-arrow-right me-1 small"></i>${this.escape(d.newDisplay)}</td>
                        </tr>
                    `).join("");
                }
                if (this.confirmChangesModal) this.confirmChangesModal.show();
                return;
            }
        }

        await this.executeSaveRequest(payload);
    },

    async confirmAndExecuteSave() {
        if (!this.pendingSavePayload) return;
        const payload = this.pendingSavePayload;
        this.pendingSavePayload = null;
        if (this.confirmChangesModal) this.confirmChangesModal.hide();
        await this.executeSaveRequest(payload);
    },

    async executeSaveRequest(payload) {
        const saveBtn = document.getElementById("btnSaveVehicle");
        const spinner = document.getElementById("saveBtnSpinner");
        const btnText = document.getElementById("saveBtnText");
        const id = payload.vehicle_id;

        if (saveBtn) saveBtn.disabled = true;
        if (spinner) spinner.classList.remove("d-none");
        if (btnText) btnText.innerText = "Saving...";

        try {
            const method = id ? "PUT" : "POST";
            await Api.request("/vehicles", method, payload);
            if (this.vehicleModal) this.vehicleModal.hide();
            this.showToast(`Vehicle ${payload.registration_no} saved successfully.`);
            await this.load();
        } catch (err) {
            this.showToast(err.message, "error");
        } finally {
            if (saveBtn) saveBtn.disabled = false;
            if (spinner) spinner.classList.add("d-none");
            if (btnText) btnText.innerHTML = '<i class="fa fa-save me-1"></i>Save Vehicle';
        }
    },

    async delete(id, regNo) {
        if (!confirm(`Are you sure you want to delete ${regNo}?`)) return;
        try {
            await Api.request(`/vehicles?id=${encodeURIComponent(id)}`, "DELETE");
            this.showToast(`Vehicle ${regNo} deleted successfully.`);
            await this.load();
        } catch (err) {
            this.showToast("Could not delete: " + err.message, "error");
        }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    if (typeof Auth !== "undefined" && typeof Auth.requireAuth === "function") Auth.requireAuth();
    if (typeof Auth !== "undefined" && typeof Auth.initNavbarUser === "function") Auth.initNavbarUser();
    VehicleController.init();
});