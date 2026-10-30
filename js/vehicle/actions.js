/**
 * Vehicle API Operations, Single-Row Fast Updates, Quick Date & Quick Remarks
 * Location: js/vehicle/actions.js
 */
Object.assign(VehicleController, {
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

            // Build Customer List & O(1) Customer Map first
            this.customerList = (customers || []).sort((a, b) => (Number(a.printid) || 999999) - (Number(b.printid) || 999999));
            this.customerMap.clear();
            this.customerList.forEach(c => this.customerMap.set(String(c.id), c));

            // Deduplicate Vehicles & Enrich
            const uniqueMap = new Map();
            (vehicles || []).forEach(item => {
                if (item.vehicle_id && !uniqueMap.has(item.vehicle_id)) {
                    uniqueMap.set(item.vehicle_id, item);
                }
            });

            this.data = Array.from(uniqueMap.values());
            this.rebuildIndexes();
            this.populateCustomerDropdowns();

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

    /**
     * Updates a single row in memory and DataTables in <2ms without re-downloading everything
     */
    updateSingleVehicleInPlace(vehicleId, updatedFields) {
        const existing = this.vehicleMap.get(String(vehicleId));
        if (!existing) {
            this.load();
            return;
        }

        const cust = this.customerMap.get(String(updatedFields.customer_id ?? existing.customer_id));
        if (cust && updatedFields.customer_id) {
            updatedFields.customer_name = cust.name;
            updatedFields.customer_mobile = cust.mobile;
        }

        Object.assign(existing, updatedFields, { _recalcDays: true });
        this.enrichVehicleRow(existing);

        if (this.dataTable) {
            this.dataTable.rows((idx, data) => String(data.vehicle_id) === String(vehicleId))
                .invalidate()
                .draw(false);
        }

        this.updateTopMetrics();

        const viewModalEl = document.getElementById("vehicleViewModal");
        if (this.activeViewVehicleId && String(this.activeViewVehicleId) === String(vehicleId) && viewModalEl?.classList.contains("show")) {
            this.openView(vehicleId);
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

        const vehicle = this.vehicleMap.get(String(vehicleId));
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
            this.updateSingleVehicleInPlace(vehicleId, { remarks: newRemarks });
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
            const vehicle = this.vehicleMap.get(String(vehicleId));
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

        const vehicle = this.vehicleMap.get(String(vehicleId));
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
            this.updateSingleVehicleInPlace(vehicleId, { [fieldName]: newDate || null });
        } catch (err) {
            this.showToast("Failed to update date: " + err.message, "error");
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa fa-save me-1"></i>Update';
            }
        }
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
            const original = this.vehicleMap.get(String(id));
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

            if (id) {
                // Fast in-place update for edits
                this.updateSingleVehicleInPlace(id, payload);
                this.rebuildIndexes();
            } else {
                // Full reload only when a brand-new vehicle is created (to get server-assigned vehicle_id)
                await this.load();
            }
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

            // Fast local removal without full reload
            this.data = this.data.filter(v => String(v.vehicle_id) !== String(id));
            this.rebuildIndexes();
            if (this.dataTable) {
                this.dataTable.rows((idx, data) => String(data.vehicle_id) === String(id)).remove().draw(false);
            }
            this.updateTopMetrics();
        } catch (err) {
            this.showToast("Could not delete: " + err.message, "error");
        }
    }
});