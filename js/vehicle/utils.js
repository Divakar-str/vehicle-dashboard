/**
 * Vehicle Utilities, Cross-Browser DD-MM-YYYY Date Formatter & O(1) Pre-processors
 * Location: js/vehicle/utils.js
 */
Object.assign(VehicleController, {
    refreshTodayTimestamp() {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        this._todayMidnight = now.getTime();
    },

    /**
     * Updates the visual DD-MM-YYYY attribute on an <input type="date">
     */
    syncDateInputDisplay(inputEl) {
        if (!inputEl || inputEl.type !== "date") return;
        const val = inputEl.value;
        if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
            const [y, m, d] = val.split("-");
            inputEl.setAttribute("data-display-date", `${d}-${m}-${y}`);
            inputEl.classList.remove("is-empty");
        } else {
            inputEl.setAttribute("data-display-date", "DD-MM-YYYY");
            inputEl.classList.add("is-empty");
        }
    },

    /**
     * Binds all <input type="date"> elements so they always display DD-MM-YYYY (e.g. 11-11-2011)
     * across all browsers, even when set via JS (el.value = ...)
     */
    initCrossBrowserDateInputs() {
        const nativeInputValueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        const self = this;

        document.querySelectorAll('input[type="date"]').forEach(input => {
            if (input.dataset.ddmmyyyyBound) return;
            input.dataset.ddmmyyyyBound = "1";
            input.classList.add("ddmmyyyy-formatted");

            // Intercept programmatic .value = "..." changes so data-display-date updates automatically
            if (nativeInputValueDescriptor && nativeInputValueDescriptor.get && nativeInputValueDescriptor.set) {
                Object.defineProperty(input, "value", {
                    get() {
                        return nativeInputValueDescriptor.get.call(this);
                    },
                    set(newVal) {
                        const iso = self.normalizeIsoDate(newVal);
                        nativeInputValueDescriptor.set.call(this, iso);
                        self.syncDateInputDisplay(this);
                    },
                    configurable: true
                });
            }

            // Sync on user selection
            input.addEventListener("input", () => this.syncDateInputDisplay(input));
            input.addEventListener("change", () => this.syncDateInputDisplay(input));

            // Open native date picker on single click anywhere inside the input box
            input.addEventListener("click", (e) => {
                if (!input.disabled && typeof input.showPicker === "function") {
                    try { input.showPicker(); } catch (_) {}
                }
            });

            this.syncDateInputDisplay(input);
        });
    },

    clearInput(inputId) {
        const el = document.getElementById(inputId);
        if (!el || el.disabled) return;
        el.value = "";
        this.syncDateInputDisplay(el);
        el.dispatchEvent(new Event("input"));
        el.focus();
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
        const iso = dateStr.length === 10 && dateStr[4] === "-" ? dateStr : this.normalizeIsoDate(dateStr);
        if (!iso) return null;
        const y = +iso.slice(0, 4);
        const m = +iso.slice(5, 7);
        const d = +iso.slice(8, 10);
        if (!y || !m || !d) return null;
        const targetTime = new Date(y, m - 1, d).getTime();
        return Math.round((targetTime - this._todayMidnight) / 86400000);
    },

    isGreenTaxApplicableForRow(row) {
        if (row._gtaxApplicable !== undefined) return row._gtaxApplicable;
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

    enrichVehicleRow(v) {
        const cust = this.customerMap.get(String(v.customer_id)) || {};
        v._printIdNum = cust.printid ? Number(cust.printid) : 999999;

        const rawNumbers = [
            v.customer_mobile, v.mobile, v.phone, v.phone1, v.alt_phone, v.secondary_phone,
            cust.mobile, cust.mobile_2, cust.mobile_3, cust.alt_phone, cust.contact_no
        ];
        const phoneSet = new Set();
        rawNumbers.forEach(item => {
            if (item) {
                String(item).split(/[,/|]/).forEach(num => {
                    const cleaned = num.trim();
                    if (cleaned) phoneSet.add(cleaned);
                });
            }
        });
        v._phoneList = Array.from(phoneSet);
        v._searchString = `${v.owner_name || ""} ${v.customer_name || ""} ${v._phoneList.join(" ")}`;

        const dateKeys = [
            "permit_expiry", "national_permit_expiry", "fc_expiry",
            "road_tax_due", "insurance_expiry", "puc_expiry", "green_tax_due"
        ];
        v._isoDates = [];
        let minDays = null;

        const isLTT = v.tax_type === "Lifetime";
        const hasPermit = v.permit_applicable === "Yes";
        const hasNP = hasPermit && v.national_permit_applicable === "Yes";

        delete v._gtaxApplicable;
        v._gtaxApplicable = this.isGreenTaxApplicableForRow(v);

        dateKeys.forEach(k => {
            const iso = this.normalizeIsoDate(v[k]);
            v[k] = iso || v[k];
            if (iso) {
                v._isoDates.push(iso);
                const applicable =
                    (k === "permit_expiry" && hasPermit) ||
                    (k === "national_permit_expiry" && hasNP) ||
                    (k === "road_tax_due" && !isLTT) ||
                    (k === "green_tax_due" && v._gtaxApplicable) ||
                    (k === "fc_expiry" || k === "insurance_expiry" || k === "puc_expiry");

                if (applicable) {
                    const dLeft = this.getDaysLeft(iso);
                    if (dLeft !== null && (minDays === null || dLeft < minDays)) {
                        minDays = dLeft;
                    }
                }
            }
        });

        if (v.min_days_remaining === undefined || v._recalcDays) {
            v.min_days_remaining = minDays;
            if (minDays !== null && minDays <= 0) v.compliance_status = "EXPIRED";
            delete v._recalcDays;
        }

        return v;
    },

    rebuildIndexes() {
        this.refreshTodayTimestamp();
        this.vehicleMap.clear();
        this.plateMap.clear();
        this.chassisMap.clear();

        this.data.forEach(v => {
            this.enrichVehicleRow(v);
            this.vehicleMap.set(String(v.vehicle_id), v);

            const cleanPlate = String(v.registration_no || "").trim().toUpperCase().replace(/\s+/g, '');
            if (cleanPlate) this.plateMap.set(cleanPlate, v);

            const cleanChassis = String(v.chassis_no || "").trim().toUpperCase().replace(/\s+/g, '');
            if (cleanChassis && cleanChassis.length >= 4) this.chassisMap.set(cleanChassis, v);
        });
    },

    renderDateBadge(dateStr, vehicleId, fieldKey, fieldLabel, isApplicable = true) {
        if (!isApplicable) {
            return `<span class="badge-na" title="Not Applicable">N/A</span>`;
        }

        const isoDate = this.normalizeIsoDate(dateStr);
        if (!isoDate) {
            return `<span class="exp-pill unset-dash"
                          title="No date set - Double-click / double-tap to set ${this.escape(fieldLabel)}"
                          data-quick-date="1"
                          data-vehicle-id="${this.escape(vehicleId)}"
                          data-field-key="${this.escape(fieldKey)}"
                          data-field-label="${this.escape(fieldLabel)}"
                          data-date-str=""
                          onclick="event.stopPropagation();">-</span>`;
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

        return `<span class="exp-pill ${cssClass}"
                      title="${statusHint} - Double-click / double-tap to edit"
                      data-quick-date="1"
                      data-vehicle-id="${this.escape(vehicleId)}"
                      data-field-key="${this.escape(fieldKey)}"
                      data-field-label="${this.escape(fieldLabel)}"
                      data-date-str="${this.escape(isoDate)}"
                      onclick="event.stopPropagation();">${this.formatDisplayDate(isoDate)}</span>`;
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
    }
});