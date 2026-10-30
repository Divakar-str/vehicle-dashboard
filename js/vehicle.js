/**
 * Main Vehicle Controller - Entry & State
 * Location: js/vehicle.js
 */
const VehicleController = {
    dataTable: null,
    data: [],
    vehicleMap: new Map(),      // O(1) fast lookup by vehicle_id
    customerList: [],
    customerMap: new Map(),     // O(1) fast lookup by customer_id
    plateMap: new Map(),        // O(1) duplicate plate lookup
    chassisMap: new Map(),      // O(1) duplicate chassis lookup

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

    // Cached filter values so DataTables doesn't query the DOM 3,500+ times per keystroke
    filterCache: {
        customerVal: "",
        statusVal: "",
        catVal: "",
        filterPermitOnly: false,
        filterNPOnly: false,
        dateFrom: "",
        dateTo: ""
    },

    _lastTapTime: 0,
    _lastTapTarget: null,
    _todayMidnight: 0,

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
        this.refreshTodayTimestamp();

        const getModal = (id) => {
            const el = document.getElementById(id);
            return el ? new bootstrap.Modal(el) : null;
        };

        this.vehicleModal = getModal("vehicleModal");
        this.viewModal = getModal("vehicleViewModal");
        this.quickDateModal = getModal("quickDateModal");
        this.quickRemarksModal = getModal("quickRemarksModal");
        this.confirmChangesModal = getModal("confirmChangesModal");

        const toastEl = document.getElementById("liveToast");
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

        // Mobile / Tablet Touch Double-Tap (Scoped to DataTable & ViewModal so page scrolling stays 60fps)
        document.addEventListener("touchend", (e) => {
            const target = e.target.closest("[data-quick-date]");
            if (!target) return;

            const now = Date.now();
            if (this._lastTapTarget === target && (now - this._lastTapTime) < 350) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                this._lastTapTime = 0;
                this._lastTapTarget = null;
                triggerQuickDate(target);
            } else {
                this._lastTapTime = now;
                this._lastTapTarget = target;
            }
        }, { passive: true });
    },

    initLiveVehicleDuplicates() {
        const debounce = (fn, delay = 180) => {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        };

        const regInput = document.getElementById("v_reg_no");
        const regFeedback = document.getElementById("regDuplicateFeedback");
        if (regInput && regFeedback) {
            regInput.addEventListener("input", debounce((e) => {
                const currentId = String(document.getElementById("v_id")?.value || "");
                const cleanVal = e.target.value.trim().toUpperCase().replace(/\s+/g, '');
                if (!cleanVal) {
                    regFeedback.classList.add("d-none");
                    regInput.classList.remove("is-invalid");
                    return;
                }
                const found = this.plateMap.get(cleanVal);
                if (found && String(found.vehicle_id) !== currentId) {
                    regFeedback.innerText = `Already registered to ${found.owner_name || 'another client'}`;
                    regFeedback.classList.remove("d-none");
                    regInput.classList.add("is-invalid");
                } else {
                    regFeedback.classList.add("d-none");
                    regInput.classList.remove("is-invalid");
                }
            }));
        }

        const chassisInput = document.getElementById("v_chassis_no");
        const chassisFeedback = document.getElementById("chassisDuplicateFeedback");
        if (chassisInput && chassisFeedback) {
            chassisInput.addEventListener("input", debounce((e) => {
                const currentId = String(document.getElementById("v_id")?.value || "");
                const cleanVal = e.target.value.trim().toUpperCase().replace(/\s+/g, '');
                if (!cleanVal || cleanVal.length < 4) {
                    chassisFeedback.classList.add("d-none");
                    return;
                }
                const found = this.chassisMap.get(cleanVal);
                if (found && String(found.vehicle_id) !== currentId) {
                    chassisFeedback.innerText = `Matches plate ${found.registration_no}`;
                    chassisFeedback.classList.remove("d-none");
                } else {
                    chassisFeedback.classList.add("d-none");
                }
            }));
        }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    if (typeof Auth !== "undefined" && typeof Auth.requireAuth === "function") Auth.requireAuth();
    if (typeof Auth !== "undefined" && typeof Auth.initNavbarUser === "function") Auth.initNavbarUser();
    VehicleController.init();
});