/**
 * Vehicle Modals, TomSelect Builders, Permit/Tax Toggles & Edit Diff Calculator
 * Location: js/vehicle/modals.js
 */
Object.assign(VehicleController, {
    populateCustomerDropdowns() {
        // 1. Top Filter TomSelect
        const custFilterSelect = document.getElementById("customerFilter");
        if (custFilterSelect) {
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

            if (prevValue) this.tomSelectFilter.setValue(prevValue, true);
        }

        // 2. Form Modal TomSelect (Initialized ONCE on data load so opening Add/Edit modal is instant!)
        const formSelect = document.getElementById("v_cust_id");
        if (formSelect) {
            const prevFormVal = formSelect.value;
            if (this.tomSelectForm) {
                this.tomSelectForm.destroy();
                this.tomSelectForm = null;
            }

            formSelect.innerHTML = '<option value="">Select or search customer / firm...</option>' +
                this.customerList.map(c => `
                    <option value="${c.id}" data-phone="${this.escape(c.mobile || '')}">
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

            if (prevFormVal) this.tomSelectForm.setValue(prevFormVal, true);
        }
    },

    setupCustomerSelect(selectedId = null) {
        if (!this.tomSelectForm) {
            this.populateCustomerDropdowns();
        }
        if (this.tomSelectForm) {
            if (selectedId) {
                this.tomSelectForm.setValue(String(selectedId), true);
            } else {
                this.tomSelectForm.clear(true);
            }
        }
    },

    copyCustomerToOwner() {
        const custId = document.getElementById("v_cust_id")?.value;
        if (!custId) {
            this.showToast("Select a Customer / Firm first.", "warning");
            return;
        }
        const cust = this.customerMap.get(String(custId));
        if (cust && cust.name) {
            const ownerInput = document.getElementById("v_owner");
            if (ownerInput) ownerInput.value = cust.name;
            this.showToast(`Owner set to "${cust.name}"`, "info");
        }
    },

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

    openView(id) {
        const v = this.vehicleMap.get(String(id));
        if (!v) return;
        this.activeViewVehicleId = id;

        const regEl = document.getElementById("viewRegNo");
        if (regEl) regEl.innerText = v.registration_no;

        const uniquePhones = (v._phoneList && v._phoneList.length > 0) ? v._phoneList.join(", ") : "-";
        const custInfoEl = document.getElementById("viewCustomerInfo");
        if (custInfoEl) {
            custInfoEl.innerText = `Owner: ${v.owner_name || '-'} • Firm: ${v.customer_name || 'Individual'} • Contact: ${uniquePhones}`;
        }

        const isLTT = v.tax_type === "Lifetime";
        const hasPermit = v.permit_applicable === "Yes";
        const hasNP = hasPermit && v.national_permit_applicable === "Yes";
        const gtaxApplicable = v._gtaxApplicable ?? this.isGreenTaxApplicableForRow(v);

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

    openAdd() {
        const form = document.getElementById("vehicleForm");
        if (form) {
            form.reset();
            form.querySelectorAll('input[type="date"]').forEach(el => this.syncDateInputDisplay(el));
        }

        const titleEl = document.getElementById("vehModalTitle");
        const subEl = document.getElementById("vehModalSubtitle");
        if (titleEl) titleEl.innerHTML = '<i class="fa fa-truck me-2"></i>Add New Vehicle';
        if (subEl) subEl.innerText = "Enter vehicle registration, customer firm, and compliance dates";

        this.setupCustomerSelect(null);

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
        const v = this.vehicleMap.get(String(id));
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

        const gtaxIso = this.normalizeIsoDate(v.green_tax_due);
        setVal("v_gtax", gtaxIso);
        this.checkGreenTax(true);

        setVal("v_remarks", v.remarks || "");

        if (this.vehicleModal) this.vehicleModal.show();
    },

    computeEditDiff(original, payload) {
        const changes = [];
        const getCustomerName = (cId) => {
            const c = this.customerMap.get(String(cId));
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
    }
});