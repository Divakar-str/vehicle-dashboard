/**
 * ReportController Module (Lag-Free & Print-Safe SaaS Edition)
 * - Fixes print truncation (ensures all rows render before print dialog)
 * - Secure double-click & mobile double-tap [data-quick-date] delegation
 * - Universal date normalization & strict N/A vs - logic
 * - Missing papers specific breakdown
 */
const ReportController = {
    dataTable: null,
    vehicles: [],
    customers: [],
    filteredRows: [],
    activePreset: "ALL",
    targetVehicleId: null,
    targetRegNo: null,
    targetDoc: null,
    autoPrintOnLoad: false,
    tomSelect: null,
    quickDateModal: null,
    quickRemarksModal: null,
    toast: null,
    _lastTapTime: 0,
    _lastTapTarget: null,

    init() {
        const qDateEl = document.getElementById("quickDateModal");
        const qRemEl = document.getElementById("quickRemarksModal");
        const toastEl = document.getElementById("liveToast");

        if (qDateEl) this.quickDateModal = new bootstrap.Modal(qDateEl);
        if (qRemEl) this.quickRemarksModal = new bootstrap.Modal(qRemEl);
        if (toastEl) this.toast = new bootstrap.Toast(toastEl, { delay: 3500 });

        this.initDoubleTapDelegate();
        this.readUrlParameters();
        this.load();
    },

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

        document.addEventListener("dblclick", (e) => {
            const target = e.target.closest("[data-quick-date]");
            if (target) {
                e.preventDefault();
                e.stopPropagation();
                triggerQuickDate(target);
            }
        });

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

    showToast(message, type = "success") {
        if (!this.toast) return;
        const toastEl = document.getElementById("liveToast");
        const msgEl = document.getElementById("toastMessage");
        if (toastEl && msgEl) {
            toastEl.className = `toast align-items-center text-white border-0 shadow bg-${type === "error" ? "danger" : (type === "warning" ? "warning text-dark" : "dark")}`;
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
        target.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    },

    getNextTaxCycle(baseDateStr) {
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

        if (month < 3 || (month === 3 && day < 31)) return `${year}-03-31`;
        if (month < 6 || (month === 6 && day < 30)) return `${year}-06-30`;
        if (month < 9 || (month === 9 && day < 30)) return `${year}-09-30`;
        if (month < 12 || (month === 12 && day < 31)) return `${year}-12-31`;
        return `${year + 1}-03-31`;
    },

    clearInput(inputId) {
        const el = document.getElementById(inputId);
        if (!el) return;
        el.value = "";
        el.dispatchEvent(new Event("change"));
        el.focus();
    },

    readUrlParameters() {
        const params = new URLSearchParams(window.location.search);
        if (params.has("vehicle_id")) this.targetVehicleId = params.get("vehicle_id").trim();
        if (params.has("reg_no")) this.targetRegNo = params.get("reg_no").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (params.has("preset")) this.activePreset = params.get("preset").trim();
        if (params.has("doc")) this.targetDoc = params.get("doc").trim().toLowerCase();
        if (params.get("autoprint") === "true" || params.get("print") === "true") this.autoPrintOnLoad = true;
    },

    async quickAdvanceTax(vehicleId) {
        const vehicle = this.vehicles.find(v => String(v.vehicle_id) === String(vehicleId));
        if (!vehicle || vehicle.tax_type === "Lifetime") return;

        const nextCycle = this.getNextTaxCycle(vehicle.road_tax_due);
        const updatedPayload = Object.assign({}, vehicle, { road_tax_due: nextCycle });
        try {
            await Api.request("/vehicles", "PUT", updatedPayload);
            this.showToast(`Advanced Road Tax for ${vehicle.registration_no} to ${this.formatDisplayDate(nextCycle)}`);
            await this.load();
        } catch (err) {
            this.showToast("Failed to advance tax: " + err.message, "error");
        }
    },

    resetDates() {
        const dFrom = document.getElementById("dateFilterFrom");
        const dTo = document.getElementById("dateFilterTo");
        if (dFrom) dFrom.value = "";
        if (dTo) dTo.value = "";
        this.targetVehicleId = null;
        this.targetRegNo = null;
        this.targetDoc = null;
        this.applyFilters();
    },

    setQuickPreset(presetVal, chipEl) {
        document.querySelectorAll(".filter-preset-chip").forEach(c => c.classList.remove("active"));
        if (chipEl) chipEl.classList.add("active");
        this.activePreset = presetVal;
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

            const vMap = new Map();
            (vData || []).forEach(v => {
                if (v.vehicle_id && !vMap.has(v.vehicle_id)) vMap.set(v.vehicle_id, v);
            });
            this.vehicles = Array.from(vMap.values());

            const cMap = new Map();
            (cData || []).forEach(c => {
                if (c.id && !cMap.has(c.id)) cMap.set(c.id, c);
            });
            this.customers = Array.from(cMap.values());

            this.setupCustomerSelect();
            this.syncUrlFiltersToUI();
            this.applyFilters();

            if (this.autoPrintOnLoad) {
                setTimeout(() => {
                    this.printReport();
                    this.autoPrintOnLoad = false;
                }, 800);
            }
        } catch (err) {
            this.showToast("Failed to load reports: " + err.message, "error");
        } finally {
            if (icon) icon.classList.remove("spin-animation");
        }
    },

    setupCustomerSelect() {
        const select = document.getElementById("reportCustomerSelect");
        if (!select) return;
        if (this.tomSelect) {
            this.tomSelect.destroy();
            this.tomSelect = null;
        }

        select.innerHTML = '<option value="">All Customers / Firms</option>' +
            this.customers.map(c => `
                <option value="${c.id}" data-phone="${this.escape(c.mobile || '')}">${this.escape(c.name)} (${this.escape(c.mobile)})</option>
            `).join('');

        this.tomSelect = new TomSelect("#reportCustomerSelect", {
            create: false,
            maxItems: 1,
            dropdownParent: 'body',
            placeholder: "Search customer or firm...",
            onChange: () => ReportController.applyFilters(),
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
            const f = document.getElementById("dateFilterFrom");
            if (f) f.value = params.get("from");
        }
        if (params.has("to")) {
            const t = document.getElementById("dateFilterTo");
            if (t) t.value = params.get("to");
        }

        if (this.targetDoc) {
            const docCheckboxes = { fc: "col_fc", permit: "col_permit", np: "col_np", tax: "col_tax", gtax: "col_gtax", ins: "col_ins", puc: "col_puc" };
            if (docCheckboxes[this.targetDoc]) {
                Object.keys(docCheckboxes).forEach(k => {
                    const chk = document.getElementById(docCheckboxes[k]);
                    if (chk) chk.checked = (k === this.targetDoc);
                });
            }
        }
    },

    applyFilters() {
        const custId = document.getElementById("reportCustomerSelect")?.value || "";
        const catVal = document.getElementById("reportCategoryFilter")?.value || "";
        const permitMode = document.getElementById("reportPermitFilter")?.value || "ALL";
        const dateFrom = document.getElementById("dateFilterFrom")?.value || "";
        const dateTo = document.getElementById("dateFilterTo")?.value || "";
        const preset = this.activePreset;

        let list = [...this.vehicles].filter(v => (v.active_status || "Active") === "Active");

        if (this.targetVehicleId) {
            list = list.filter(v => String(v.vehicle_id) === String(this.targetVehicleId));
        }
        if (this.targetRegNo) {
            list = list.filter(v => (v.registration_no || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === this.targetRegNo);
        }

        if (custId) list = list.filter(v => String(v.customer_id) === String(custId));
        if (catVal) list = list.filter(v => v.vehicle_category === catVal);

        if (permitMode === "PERMIT_ONLY") {
            list = list.filter(v => v.permit_applicable === "Yes");
        } else if (permitMode === "NP_ONLY") {
            list = list.filter(v => v.national_permit_applicable === "Yes");
        } else if (permitMode === "NO_PERMIT") {
            list = list.filter(v => v.permit_applicable !== "Yes");
        }

        if (dateFrom || dateTo) {
            list = list.filter(v => {
                const dates = [v.permit_expiry, v.national_permit_expiry, v.fc_expiry, v.road_tax_due, v.green_tax_due, v.insurance_expiry, v.puc_expiry].filter(Boolean);
                if (dates.length === 0) return false;
                return dates.some(d => {
                    const iso = this.normalizeIsoDate(d);
                    if (dateFrom && iso < dateFrom) return false;
                    if (dateTo && iso > dateTo) return false;
                    return true;
                });
            });
        }

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
                return true;
            });
        } else {
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
        const cust = this.customers.find(c => String(c.id) === String(v.customer_id)) || {};
        const primaryPhone = cust.mobile || v.customer_mobile || "";
        if (!primaryPhone) return null;

        let cleanNumber = String(primaryPhone).replace(/\D/g, "");
        if (cleanNumber.length === 11 && cleanNumber.startsWith("0")) cleanNumber = cleanNumber.slice(1);
        const formattedPhone = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;

        const msgLines = [];
        msgLines.push(`*VEHICLE COMPLIANCE REMINDER: ${v.registration_no}*`);
        msgLines.push(`Customer: ${v.customer_name || cust.name || 'Client'}`);
        msgLines.push(`Owner: ${v.owner_name}`);
        msgLines.push(``);
        msgLines.push(`*Document Expiry Status:*`);
        if (v.permit_applicable === "Yes") msgLines.push(`- Permit: ${this.formatDisplayDate(v.permit_expiry)}`);
        if (v.national_permit_applicable === "Yes") msgLines.push(`- NP: ${this.formatDisplayDate(v.national_permit_expiry)}`);
        msgLines.push(`- Fitness (FC): ${this.formatDisplayDate(v.fc_expiry)}`);
        msgLines.push(`- Road Tax: ${v.tax_type === 'Lifetime' ? 'LTT' : this.formatDisplayDate(v.road_tax_due)}`);
        msgLines.push(`- Insurance: ${this.formatDisplayDate(v.insurance_expiry)}`);
        msgLines.push(`- Pollution (PUC): ${this.formatDisplayDate(v.puc_expiry)}`);

        msgLines.push(``);
        msgLines.push(`Please renew required items to avoid penalty.`);
        const encodedText = encodeURIComponent(msgLines.join("\n"));
        return `https://wa.me/${formattedPhone}?text=${encodedText}`;
    },

    renderDateCell(vehicleId, fieldName, fieldLabel, dateStr, isApplicable = true, showRemDays = true) {
        if (!isApplicable) {
            return '<span class="badge-na" title="Not Applicable">N/A</span>';
        }

        const iso = this.normalizeIsoDate(dateStr);
        if (!iso) {
            return `
                <span class="editable-report-date text-muted fw-bold unset-dash"
                      title="No date set - Double-click / double-tap to set ${this.escape(fieldLabel)}"
                      data-quick-date="1"
                      data-vehicle-id="${this.escape(vehicleId)}"
                      data-field-key="${this.escape(fieldName)}"
                      data-field-label="${this.escape(fieldLabel)}"
                      data-date-str=""
                      onclick="event.stopPropagation();">-</span>
            `;
        }

        return `
            <div class="date-stack-cell">
              <span class="editable-report-date font-monospace"
                    title="Double-click / double-tap to edit ${this.escape(fieldLabel)}"
                    data-quick-date="1"
                    data-vehicle-id="${this.escape(vehicleId)}"
                    data-field-key="${this.escape(fieldName)}"
                    data-field-label="${this.escape(fieldLabel)}"
                    data-date-str="${this.escape(iso)}"
                    onclick="event.stopPropagation();">
                ${this.formatDisplayDate(iso)}
              </span>
              ${showRemDays ? this.renderCountdownPill(iso) : ''}
            </div>
        `;
    },

    renderDataTable() {
        const badge = document.getElementById("reportCountBadge");
        if (badge) badge.innerText = `${this.filteredRows.length} Vehicles`;

        const getCheckVal = (id) => document.getElementById(id)?.checked || false;
        const showChassis = getCheckVal("fld_chassis");
        const showCat = getCheckVal("fld_category");
        const showTyre = getCheckVal("fld_tyre");
        const showTaxAmt = getCheckVal("fld_tax_amt");
        const showTaxType = getCheckVal("fld_tax_type");
        const showRemDays = getCheckVal("fld_rem_days");
        const showAltContacts = getCheckVal("fld_alt_contacts");

        const showPermit = getCheckVal("col_permit");
        const showNP = getCheckVal("col_np");
        const showFC = getCheckVal("col_fc");
        const showTax = getCheckVal("col_tax");
        const showGTax = getCheckVal("col_gtax");
        const showIns = getCheckVal("col_ins");
        const showPUC = getCheckVal("col_puc");

        if ($.fn.DataTable.isDataTable("#reportDataTable")) {
            this.dataTable.destroy();
            $("#reportDataTable").empty();
        }

        const columns = [];
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

                const specHtml = specs.filter(Boolean).length > 0 ? `<div class="spec-stack">${specs.filter(Boolean).join(" &bull; ")}</div>` : "";
                const chassisHtml = showChassis && row.chassis_no ? `<div class="text-center mt-1"><small class="text-muted font-monospace fw-bold">Chassis: ${ReportController.escape(row.chassis_no)}</small></div>` : "";

                return `
                    <div>
                      <div class="reg-no-text font-monospace">${ReportController.escape(row.registration_no)}</div>
                      ${specHtml}
                      ${chassisHtml}
                    </div>
                `;
            }
        });

        columns.push({
            title: "Customer Contacts",
            data: null,
            render: (data, type, row) => {
                const cust = ReportController.customers.find(c => String(c.id) === String(row.customer_id)) || {};
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
                        <div class="customer-name-heading text-truncate fw-black" style="max-width: 150px;">${ReportController.escape(row.customer_name || cust.name || 'Individual')}</div>
                        ${waLink ? `<a href="${waLink}" target="_blank" class="btn-whatsapp-icon ms-1" title="Send WhatsApp Notice"><i class="bi bi-whatsapp"></i></a>` : ''}
                      </div>
                      <div class="owner-sub fw-bold"><i class="bi bi-person-fill me-1 text-secondary"></i>Owner: ${ReportController.escape(row.owner_name)}</div>
                      <div class="contact-phone-block">
                        ${cust.mobile || row.customer_mobile ? `
                          <div><a href="tel:${cust.mobile || row.customer_mobile}" class="phone-link"><i class="bi bi-telephone-fill me-1 text-primary"></i>${ReportController.escape(cust.mobile || row.customer_mobile)}</a></div>
                        ` : ''}
                        ${altContactsHtml}
                      </div>
                    </div>
                `;
            }
        });

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
                    const isApp = row.national_permit_applicable === "Yes";
                    let npRuleBadge = "";
                    if (isApp && row.date_of_registration) {
                        const regYear = new Date(row.date_of_registration).getFullYear();
                        const currentYear = new Date().getFullYear();
                        const age = currentYear - regYear;
                        if (age >= 15) {
                            npRuleBadge = `<div class="mt-1"><span class="badge-np-convert-gv" title="Over 15 Years: National Permit not allowed">🚨 15y+: Convert to GV</span></div>`;
                        } else if (age >= 14) {
                            npRuleBadge = `<div class="mt-1"><span class="badge-np-final-year" title="14th Year: Final year for NP">⚠️ 14y: Final NP Year</span></div>`;
                        }
                    }
                    return `
                        <div>
                          ${ReportController.renderDateCell(row.vehicle_id, "national_permit_expiry", "National Permit Expiry", row.national_permit_expiry, isApp, showRemDays)}
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
                    const isLTT = row.tax_type === "Lifetime";
                    if (isLTT) return '<span class="badge bg-secondary">LTT (N/A)</span>';
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

        columns.push({
            title: "Remarks & Missing Papers",
            data: null,
            render: (data, type, row) => {
                const missingList = [];
                if (row.permit_applicable === "Yes" && !row.permit_expiry) missingList.push("Permit");
                if (row.national_permit_applicable === "Yes" && !row.national_permit_expiry) missingList.push("National Permit");
                if (!row.fc_expiry) missingList.push("Fitness (FC)");
                if (row.tax_type !== "Lifetime" && !row.road_tax_due) missingList.push("Road Tax");
                if (!row.insurance_expiry) missingList.push("Insurance");
                if (!row.puc_expiry) missingList.push("PUC");

                let missingHtml = "";
                if (missingList.length > 0) {
                    missingHtml = `<div class="mt-1"><span class="badge bg-danger-subtle text-danger border border-danger-subtle fw-bold" style="font-size: 0.68rem;"><i class="fa fa-triangle-exclamation me-1"></i>Missing: ${missingList.join(", ")}</span></div>`;
                }

                let blockerHtml = "";
                if (Array.isArray(row.dependency_blockers) && row.dependency_blockers.length > 0) {
                    blockerHtml = row.dependency_blockers.map(b => `
                        <div><span class="blocker-pill"><i class="bi bi-exclamation-octagon-fill me-1"></i>${ReportController.escape(b)}</span></div>
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
                      ${missingHtml}
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
            deferRender: true, // Performance boost
            language: {
                search: "Search Records:",
                searchPlaceholder: "Plate, Customer, Category...",
                lengthMenu: "Show _MENU_ vehicles",
                emptyTable: "No records match active filters",
                info: "Showing _START_ to _END_ of _TOTAL_ vehicles",
                paginate: {
                    previous: "<i class='bi bi-chevron-left'></i>",
                    next: "<i class='bi bi-chevron-right'></i>"
                }
            }
        });
    },

    openQuickDate(vehicleId, fieldName, fieldLabel, currentDate) {
        const iso = this.normalizeIsoDate(currentDate);
        document.getElementById("qd_vehicle_id").value = vehicleId;
        document.getElementById("qd_field_name").value = fieldName;
        document.getElementById("qd_old_value").value = iso;
        document.getElementById("qd_label").innerText = `Update ${fieldLabel}`;
        document.getElementById("qd_input").value = iso;

        const diffBox = document.getElementById("qd_diff_box");
        diffBox.classList.add("d-none");

        const taxCycleBox = document.getElementById("qd_tax_cycle_box");
        if (fieldName === "road_tax_due") {
            const vehicle = this.vehicles.find(v => String(v.vehicle_id) === String(vehicleId));
            if (vehicle && vehicle.tax_type === "Lifetime") {
                taxCycleBox.classList.add("d-none");
            } else {
                taxCycleBox.classList.remove("d-none");
                this.updateModalCyclePreview(iso);
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
        const currentVal = document.getElementById("qd_input").value;
        const oldVal = document.getElementById("qd_old_value").value;

        const diffBox = document.getElementById("qd_diff_box");
        const diffOld = document.getElementById("qd_diff_old");
        const diffNew = document.getElementById("qd_diff_new");

        if (String(oldVal).trim() !== String(currentVal).trim()) {
            diffOld.innerText = oldVal ? this.formatDisplayDate(oldVal) : "(Blank)";
            diffNew.innerText = currentVal ? this.formatDisplayDate(currentVal) : "(Blank)";
            diffBox.classList.remove("d-none");
        } else {
            diffBox.classList.add("d-none");
        }

        if (fieldName === "road_tax_due") {
            this.updateModalCyclePreview(currentVal);
        }
    },

    applyNextTaxCycleFromModal() {
        const nextDate = document.getElementById("btnApplyNextQuarter").getAttribute("data-next-date");
        if (nextDate) {
            document.getElementById("qd_input").value = nextDate;
            this.onQuickDateInputChange();
            this.showToast(`Set to next cycle: ${this.formatDisplayDate(nextDate)}`, "info");
        }
    },

    setModalCycleDate(monthDay) {
        const currentVal = document.getElementById("qd_input").value;
        const year = currentVal ? currentVal.split("-")[0] : new Date().getFullYear();
        const newDate = `${year}-${monthDay}`;
        document.getElementById("qd_input").value = newDate;
        this.onQuickDateInputChange();
    },

    async saveQuickDate() {
        const vehicleId = document.getElementById("qd_vehicle_id").value;
        const fieldName = document.getElementById("qd_field_name").value;
        const newDate = document.getElementById("qd_input").value;
        const saveBtn = document.getElementById("btnSaveQuickDate");

        const vehicle = this.vehicles.find(v => String(v.vehicle_id) === String(vehicleId));
        if (!vehicle) return;

        saveBtn.disabled = true;
        saveBtn.innerText = "Saving...";

        const updatedPayload = Object.assign({}, vehicle, { [fieldName]: newDate || null });
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

        const vehicle = this.vehicles.find(v => String(v.vehicle_id) === String(vehicleId));
        if (!vehicle) return;

        saveBtn.disabled = true;
        saveBtn.innerText = "Saving...";

        const updatedPayload = Object.assign({}, vehicle, { remarks: newRemarks || null });
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

    /**
     * Requirement 4: Safe Print rendering with 800ms settle timeout so all rows are visible
     */
    printReport() {
        const stamp = document.getElementById("printDateStamp");
        if (stamp) stamp.innerText = new Date().toLocaleString();

        if (this.dataTable) {
            const origLength = this.dataTable.page.len();
            this.dataTable.page.len(-1).draw();
            setTimeout(() => {
                window.print();
                setTimeout(() => {
                    this.dataTable.page.len(origLength).draw();
                }, 500);
            }, 800);
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
            const cust = this.customers.find(c => String(c.id) === String(v.customer_id)) || {};
            const numOnly = v.no_of_tyres ? String(v.no_of_tyres).replace(/[^0-9]/g, "") : "";

            let r = [v.registration_no];
            if (showCat) r.push(v.vehicle_category || "");
            if (showTyre) r.push(numOnly ? `${numOnly} Tyres` : "");
            if (showTaxType) r.push(v.tax_type || "");
            if (showTaxAmt) r.push(v.tax_amount || 0);
            if (showChassis) r.push(v.chassis_no || "");

            r.push(v.customer_name || cust.name || "", v.owner_name || "", cust.mobile || v.customer_mobile || "");
            if (showAltContacts) r.push(cust.mobile_2 || "", cust.mobile_3 || "");

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