import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Car,
  Fuel,
  Wrench,
  ClipboardList,
  Download,
  Upload,
  Plus,
  ArrowLeft,
  Trash2,
  Pencil,
  ChevronDown,
} from "lucide-react";

const DB_NAME = "vehicle-records-db";
const DB_VERSION = 1;
const STORE_NAME = "app-state";
const STATE_KEY = "vehicle-records-state";

const SOON_MILES_THRESHOLD = 500;
const SOON_DAYS_THRESHOLD = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const defaultMaintenanceSchedule = [
  {
    id: "oil-change",
    title: "Oil Change",
    intervalMiles: 5000,
    intervalMonths: 6,
  },
  {
    id: "tire-rotation",
    title: "Tire Rotation",
    intervalMiles: 5000,
    intervalMonths: 6,
  },
  {
    id: "engine-air-filter",
    title: "Engine Air Filter",
    intervalMiles: 30000,
    intervalMonths: 36,
  },
  {
    id: "cabin-air-filter",
    title: "Cabin Air Filter",
    intervalMiles: 15000,
    intervalMonths: 12,
  },
];

const starterState = {
  appVersion: "0.1.0",
  vehicles: [
    {
      id: crypto.randomUUID(),
      nickname: "Vehicle #1",
      year: "Year",
      make: "Make",
      model: "Model",
      odometer: 0,
      photo: "",
      maintenanceSchedule: defaultMaintenanceSchedule,
      entries: [
        {
          id: crypto.randomUUID(),
          type: "fuel",
          date: new Date().toISOString().slice(0, 10),
          odometer: 0,
          gallons: 0,
          totalCost: 0,
          station: "Example Station",
          notes: "Starter example entry. Delete whenever you want.",
          createdAt: new Date().toISOString(),
        },
      ],
    },
  ],
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadState() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(STATE_KEY);

    request.onsuccess = () => resolve(request.result || starterState);
    request.onerror = () => reject(request.error);
  });
}

async function saveState(state) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(state, STATE_KEY);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function compressImageFile(file, maxWidth = 1600, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function currency(value) {
  if (value === undefined || value === null || value === "") return "—";
  return Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function number(value, digits = 0) {
  if (value === undefined || value === null || value === "") return "—";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function addMonths(dateString, months) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date;
}

function dateToString(date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate, endDate) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.ceil((end - start) / MS_PER_DAY);
}

function approximateMonthsFromDays(days) {
  return Math.max(0, Math.ceil(Math.abs(days) / 30));
}

function makeServiceId(title) {
  const slug = String(title || "custom-service")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "custom-service";

  return `${slug}-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeMaintenanceSchedule(schedule) {
  const source = Array.isArray(schedule) && schedule.length > 0 ? schedule : defaultMaintenanceSchedule;

  return source.map((item) => ({
    id: item.id || makeServiceId(item.title),
    title: item.title || "Untitled Service",
    intervalMiles: Number(item.intervalMiles || 0),
    intervalMonths: Number(item.intervalMonths || 0),
  }));
}

function getFuelEntriesSorted(vehicle) {
  return vehicle.entries
    .filter((entry) => entry.type === "fuel")
    .sort((a, b) => Number(a.odometer) - Number(b.odometer));
}

function calculateFuelStats(vehicle) {
  const fuelEntries = getFuelEntriesSorted(vehicle);

  const mpgValues = fuelEntries
    .map((entry, index) => calculateEntryMpg(fuelEntries, index))
    .filter((mpg) => mpg !== null);

  const totalFuelCost = fuelEntries.reduce((sum, entry) => sum + Number(entry.totalCost || 0), 0);

  const totalMaintenanceCost = vehicle.entries
    .filter((entry) => entry.type === "maintenance")
    .reduce((sum, entry) => sum + Number(entry.cost || 0), 0);

  const avgMpg = mpgValues.length ? mpgValues.reduce((a, b) => a + b, 0) / mpgValues.length : null;

  return {
    fuelCount: fuelEntries.length,
    totalFuelCost,
    totalMaintenanceCost,
    avgMpg,
  };
}

function calculateEntryMpg(sortedFuelEntries, index) {
  if (index === 0) return null;

  const currentEntry = sortedFuelEntries[index];
  const previousEntry = sortedFuelEntries[index - 1];
  const milesDriven = Number(currentEntry.odometer) - Number(previousEntry.odometer);
  const gallonsAdded = Number(currentEntry.gallons);

  if (milesDriven <= 0 || gallonsAdded <= 0) return null;
  return milesDriven / gallonsAdded;
}

function getCurrentOdometer(vehicle) {
  const odometerEntries = vehicle.entries.filter(
    (entry) =>
      ["fuel", "maintenance"].includes(entry.type) &&
      entry.date &&
      Number(entry.odometer) > 0
  );

  if (odometerEntries.length === 0) {
    return Number(vehicle.odometer || 0);
  }

  const mostRecentDate = odometerEntries
    .map((entry) => entry.date)
    .sort()
    .at(-1);

  const entriesOnMostRecentDate = odometerEntries.filter(
    (entry) => entry.date === mostRecentDate
  );

  return Math.max(
    ...entriesOnMostRecentDate.map((entry) => Number(entry.odometer))
  );
}

function getMaintenanceSchedule(vehicle) {
  return normalizeMaintenanceSchedule(vehicle.maintenanceSchedule);
}

function getScheduleItemTitle(serviceKey, vehicle = null) {
  const schedule = vehicle ? getMaintenanceSchedule(vehicle) : defaultMaintenanceSchedule;
  return schedule.find((item) => item.id === serviceKey)?.title || "";
}

function calculateMaintenanceReminders(vehicle) {
  const today = new Date();
  const currentOdometer = getCurrentOdometer(vehicle);

  return getMaintenanceSchedule(vehicle).map((scheduleItem) => {
    const matchingLogs = vehicle.entries
      .filter((entry) => entry.type === "maintenance" && entry.serviceKey === scheduleItem.id)
      .sort((a, b) => {
        const dateCompare = new Date(b.date) - new Date(a.date);
        if (dateCompare !== 0) return dateCompare;
        return Number(b.odometer || 0) - Number(a.odometer || 0);
      });

    const lastLog = matchingLogs[0] || null;

    if (!lastLog) {
      return {
        ...scheduleItem,
        status: "no-record",
        lastLog: null,
        message: "No record yet",
        badgeClass: "bg-slate-700 text-slate-200 ring-slate-500/30",
        cardClass: "bg-slate-800/70 border-slate-600/30",
      };
    }

    const nextDueMileage = Number(lastLog.odometer || 0) + Number(scheduleItem.intervalMiles || 0);
    const dueDate = addMonths(lastLog.date, Number(scheduleItem.intervalMonths || 0));
    const daysUntilDue = daysBetween(today, dueDate);
    const milesRemaining = nextDueMileage - currentOdometer;

    const isMileageOverdue = milesRemaining < 0;
    const isDateOverdue = daysUntilDue < 0;
    const isDueNow = milesRemaining <= 0 || daysUntilDue <= 0;
    const isSoon = milesRemaining <= SOON_MILES_THRESHOLD || daysUntilDue <= SOON_DAYS_THRESHOLD;

    if (isMileageOverdue || isDateOverdue) {
      const overdueMiles = Math.max(0, Math.abs(milesRemaining));
      const overdueMonths = isDateOverdue ? approximateMonthsFromDays(daysUntilDue) : 0;
      const parts = [];
      if (overdueMiles > 0) parts.push(`${number(overdueMiles)} mi`);
      if (overdueMonths > 0) parts.push(`${overdueMonths} mo`);

      return {
        ...scheduleItem,
        status: "overdue",
        lastLog,
        nextDueMileage,
        dueDate: dateToString(dueDate),
        milesRemaining,
        daysUntilDue,
        message: parts.length ? `Overdue by ${parts.join(" / ")}` : "Overdue",
        badgeClass: "bg-red-500/20 text-red-200 ring-red-400/30",
        cardClass: "bg-red-950/30 border-red-500/30",
      };
    }

    if (isDueNow) {
      return {
        ...scheduleItem,
        status: "due",
        lastLog,
        nextDueMileage,
        dueDate: dateToString(dueDate),
        milesRemaining,
        daysUntilDue,
        message: "Due now",
        badgeClass: "bg-red-500/20 text-red-200 ring-red-400/30",
        cardClass: "bg-red-950/30 border-red-500/30",
      };
    }

    if (isSoon) {
      const monthsUntilDue = Math.max(0, Math.ceil(daysUntilDue / 30));
      return {
        ...scheduleItem,
        status: "soon",
        lastLog,
        nextDueMileage,
        dueDate: dateToString(dueDate),
        milesRemaining,
        daysUntilDue,
        message: `Due in ${number(Math.max(0, milesRemaining))} mi / ${monthsUntilDue} mo`,
        badgeClass: "bg-amber-400/20 text-amber-100 ring-amber-300/30",
        cardClass: "bg-amber-950/25 border-amber-400/30",
      };
    }

    const monthsUntilDue = Math.max(0, Math.ceil(daysUntilDue / 30));
    return {
      ...scheduleItem,
      status: "ok",
      lastLog,
      nextDueMileage,
      dueDate: dateToString(dueDate),
      milesRemaining,
      daysUntilDue,
      message: `Due in ${number(milesRemaining)} mi / ${monthsUntilDue} mo`,
      badgeClass: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/20",
      cardClass: "bg-emerald-950/20 border-emerald-400/20",
    };
  });
}

function getReminderSummary(vehicle) {
  const reminders = calculateMaintenanceReminders(vehicle);
  if (reminders.some((reminder) => reminder.status === "overdue" || reminder.status === "due")) {
    return { status: "danger", label: "Due", className: "bg-red-500 text-white shadow-red-950/40" };
  }
  if (reminders.some((reminder) => reminder.status === "soon")) {
    return { status: "soon", label: "Soon", className: "bg-amber-400 text-slate-950 shadow-amber-950/30" };
  }
  return null;
}

function App() {
  const [state, setState] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [entryPendingDelete, setEntryPendingDelete] = useState(null);
  const [screen, setScreen] = useState("garage");
  const [status, setStatus] = useState("Loading local database…");

  useEffect(() => {
    loadState()
      .then((loaded) => {
        setState(loaded);
        setStatus("Saved locally on this device.");
      })
      .catch((error) => setStatus(`Database error: ${error.message}`));
  }, []);

  useEffect(() => {
    if (!state) return;
    saveState(state)
      .then(() => setStatus("Saved locally on this device."))
      .catch((error) => setStatus(`Save error: ${error.message}`));
  }, [state]);

  const selectedVehicle = useMemo(() => {
    if (!state || !selectedVehicleId) return null;
    return state.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null;
  }, [state, selectedVehicleId]);

  function updateVehicle(vehicleId, updater) {
    setState((current) => ({
      ...current,
      vehicles: current.vehicles.map((vehicle) =>
        vehicle.id === vehicleId ? updater(vehicle) : vehicle
      ),
    }));
  }

  function addVehicle() {
    const newVehicle = {
      id: crypto.randomUUID(),
      nickname: "New Vehicle",
      year: "",
      make: "",
      model: "",
      odometer: "",
      photo: "",
      maintenanceSchedule: defaultMaintenanceSchedule,
      entries: [],
    };
    setState((current) => ({ ...current, vehicles: [...current.vehicles, newVehicle] }));
  }

  function updateEntry(vehicleId, updatedEntry) {
    updateVehicle(vehicleId, (vehicle) => ({
      ...vehicle,
      odometer: vehicle.odometer,
      entries: vehicle.entries.map((entry) =>
        entry.id === updatedEntry.id ? updatedEntry : entry
      ),
    }));
  }

  function deleteEntry(vehicleId, entryId) {
    updateVehicle(vehicleId, (vehicle) => ({
      ...vehicle,
      entries: vehicle.entries.filter((entry) => entry.id !== entryId),
    }));
  }

  function exportBackup() {
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`vehicle-records-backup-${date}.json`, state);
  }

  async function importBackup(file) {
    if (!file) return;
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!imported.vehicles || !Array.isArray(imported.vehicles)) {
      throw new Error("This does not look like a vehicle records backup file.");
    }
    setState(imported);
    setStatus("Backup restored and saved locally.");
  }

  if (!state) {
    return <div className="min-h-screen bg-slate-950 text-white p-6">{status}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-md px-4 py-5">
        <Header
          screen={screen}
          vehicle={selectedVehicle}
          onBack={() => {
            setScreen("garage");
            setSelectedVehicleId(null);
          }}
        />

        {screen === "garage" && (
          <GarageScreen
            state={state}
            onSelectVehicle={(vehicleId) => {
              setSelectedVehicleId(vehicleId);
              setScreen("dashboard");
            }}
            onAddVehicle={addVehicle}
            onExportBackup={exportBackup}
            onImportBackup={importBackup}
            status={status}
          />
        )}

        {screen === "dashboard" && selectedVehicle && (
          <VehicleDashboard
            vehicle={selectedVehicle}
            onLogFuel={() => setScreen("fuel")}
            onLogMaintenance={() => setScreen("maintenance")}
            onManageSchedule={() => setScreen("schedule")}
            onEditVehicle={() => setScreen("editVehicle")}
            onEditEntry={(entryId) => {
              const entry = selectedVehicle.entries.find((entry) => entry.id === entryId);
              setSelectedEntryId(entryId);
              setScreen(entry?.type === "maintenance" ? "editMaintenance" : "editFuel");
            }}
            onDeleteEntry={(entryId) => {
              const entry = selectedVehicle.entries.find((entry) => entry.id === entryId);
              setEntryPendingDelete(entry || null);
            }}
          />
        )}

        {screen === "schedule" && selectedVehicle && (
          <MaintenanceScheduleForm
            vehicle={selectedVehicle}
            onCancel={() => setScreen("dashboard")}
            onSave={(maintenanceSchedule) => {
              updateVehicle(selectedVehicle.id, (vehicle) => ({
                ...vehicle,
                maintenanceSchedule: normalizeMaintenanceSchedule(maintenanceSchedule),
              }));
              setScreen("dashboard");
            }}
          />
        )}

        {screen === "editVehicle" && selectedVehicle && (
          <VehicleForm
            vehicle={selectedVehicle}
            onCancel={() => setScreen("dashboard")}
            onSave={(updatedVehicle) => {
              updateVehicle(selectedVehicle.id, () => updatedVehicle);
              setScreen("dashboard");
            }}
          />
        )}

        {screen === "fuel" && selectedVehicle && (
          <FuelForm
            vehicle={selectedVehicle}
            onCancel={() => setScreen("dashboard")}
            onSave={(entry) => {
              updateVehicle(selectedVehicle.id, (vehicle) => ({
                ...vehicle,
                odometer: vehicle.odometer,
                entries: [entry, ...vehicle.entries],
              }));
              setScreen("dashboard");
            }}
          />
        )}

        {screen === "maintenance" && selectedVehicle && (
          <MaintenanceForm
            vehicle={selectedVehicle}
            onCancel={() => setScreen("dashboard")}
            onSave={(entry) => {
              updateVehicle(selectedVehicle.id, (vehicle) => ({
                ...vehicle,
                odometer: vehicle.odometer,
                entries: [entry, ...vehicle.entries],
              }));
              setScreen("dashboard");
            }}
          />
        )}

        {screen === "editFuel" && selectedVehicle && selectedEntryId && (
          <FuelForm
            vehicle={selectedVehicle}
            initialEntry={selectedVehicle.entries.find((entry) => entry.id === selectedEntryId)}
            onCancel={() => {
              setSelectedEntryId(null);
              setScreen("dashboard");
            }}
            onSave={(entry) => {
              updateEntry(selectedVehicle.id, entry);
              setSelectedEntryId(null);
              setScreen("dashboard");
            }}
          />
        )}

        {screen === "editMaintenance" && selectedVehicle && selectedEntryId && (
          <MaintenanceForm
            vehicle={selectedVehicle}
            initialEntry={selectedVehicle.entries.find((entry) => entry.id === selectedEntryId)}
            onCancel={() => {
              setSelectedEntryId(null);
              setScreen("dashboard");
            }}
            onSave={(entry) => {
              updateEntry(selectedVehicle.id, entry);
              setSelectedEntryId(null);
              setScreen("dashboard");
            }}
          />
        )}

        {entryPendingDelete && selectedVehicle && (
          <DeleteConfirmModal
            entry={entryPendingDelete}
            onCancel={() => setEntryPendingDelete(null)}
            onConfirm={() => {
              deleteEntry(selectedVehicle.id, entryPendingDelete.id);
              setEntryPendingDelete(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function DeleteConfirmModal({ entry, onCancel, onConfirm }) {
  const title = entry.type === "fuel" ? "Delete Fuel Entry?" : entry.type === "maintenance" ? "Delete Maintenance Entry?" : "Delete Entry?";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-6 backdrop-blur-sm sm:items-center sm:pb-0"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-sm rounded-[2rem] bg-slate-900 p-5 shadow-2xl shadow-black/40 ring-1 ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl bg-red-500/15 p-3 text-red-300">
            <Trash2 size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">{title}</h2>
            <p className="text-sm text-slate-400">This cannot be undone.</p>
          </div>
        </div>

        <div className="mb-4 rounded-2xl bg-slate-950 p-3 text-sm text-slate-300 ring-1 ring-white/10">
          <div>{entry.date} • {number(entry.odometer)} mi</div>
          {entry.type === "fuel" && <div>{number(entry.gallons, 3)} gal • {currency(entry.totalCost)}</div>}
          {entry.type === "maintenance" && <div>{entry.title || "Maintenance"} • {currency(entry.cost)}</div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-2xl bg-red-600 px-4 py-4 font-bold text-white shadow-lg shadow-red-950/30"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Header({ screen, vehicle, onBack }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {screen !== "garage" && (
        <button
          onClick={onBack}
          className="rounded-2xl bg-slate-800 p-3 shadow-lg shadow-black/20"
          aria-label="Back to garage"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {screen === "garage" ? "Vehicle Records" : vehicle?.nickname || "Vehicle"}
        </h1>
        <p className="text-sm text-slate-400">Vehicle Records App</p>
      </div>
    </div>
  );
}

function GarageScreen({ state, onSelectVehicle, onAddVehicle, onExportBackup, onImportBackup, status }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {state.vehicles.map((vehicle) => {
          const stats = calculateFuelStats(vehicle);
          const currentOdometer = getCurrentOdometer(vehicle);
          const reminderSummary = getReminderSummary(vehicle);

          return (
            <motion.button
              key={vehicle.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectVehicle(vehicle.id)}
              className="relative overflow-hidden rounded-3xl bg-slate-900 text-left shadow-xl shadow-black/20 ring-1 ring-white/10"
            >
              {reminderSummary && (
                <div className={`absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black shadow-lg ${reminderSummary.className}`}>
                  <AlertTriangle size={14} /> {reminderSummary.label}
                </div>
              )}

              <div className="flex h-36 items-center justify-center bg-gradient-to-br from-indigo-500 via-sky-500 to-cyan-400">
                {vehicle.photo ? (
                  <img src={vehicle.photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Car size={64} className="text-white/90" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">{vehicle.nickname}</h2>
                    <p className="text-sm text-slate-400">
                      {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle details not set"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-800 px-3 py-2 text-right text-sm">
                    <div className="font-semibold">{number(currentOdometer)} mi</div>
                    <div className="text-slate-400">odometer</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <StatPill
                    label="Logs"
                    value={`${stats.fuelCount} fuel • ${
                      vehicle.entries.filter((entry) => entry.type === "maintenance").length
                    } maintenance`}
                  />
                  <StatPill
                    label="Avg MPG"
                    value={stats.avgMpg ? number(stats.avgMpg, 1) : "—"}
                  />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <button
        onClick={onAddVehicle}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-4 font-semibold shadow-lg shadow-black/20"
      >
        <Plus size={18} /> Add Vehicle
      </button>

      <div className="rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
        <h2 className="mb-3 font-bold">Backup & Restore</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onExportBackup}
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold"
          >
            <Download size={18} /> Backup
          </button>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 font-semibold">
            <Upload size={18} /> Restore
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (event) => {
                try {
                  await onImportBackup(event.target.files?.[0]);
                } catch (error) {
                  alert(error.message);
                }
              }}
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-400">{status}</p>
      </div>
    </div>
  );
}

function VehicleDashboard({ vehicle, onLogFuel, onLogMaintenance, onManageSchedule, onEditVehicle, onEditEntry, onDeleteEntry }) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const stats = calculateFuelStats(vehicle);
  const currentOdometer = getCurrentOdometer(vehicle);
  const reminders = calculateMaintenanceReminders(vehicle);
  const activeReminders = reminders.filter((reminder) => reminder.status !== "ok");
  const sortedFuelEntries = getFuelEntriesSorted(vehicle);
  const mpgByEntryId = Object.fromEntries(
    sortedFuelEntries.map((entry, index) => [entry.id, calculateEntryMpg(sortedFuelEntries, index)])
  );
  const milesByEntryId = Object.fromEntries(
    sortedFuelEntries.map((entry, index) => {
      if (index === 0) return [entry.id, null];

      const previousEntry = sortedFuelEntries[index - 1];
      const milesDriven = Number(entry.odometer) - Number(previousEntry.odometer);

      return [entry.id, milesDriven > 0 ? milesDriven : null];
    })
  );
  const sortedEntries = [...vehicle.entries].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950 shadow-2xl shadow-black/30 ring-1 ring-white/10">
        <div className="flex h-40 items-center justify-center bg-gradient-to-br from-cyan-400/30 via-sky-500/20 to-indigo-500/20">
          {vehicle.photo ? (
            <img src={vehicle.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <Car size={76} className="text-white/70" />
          )}
        </div>

        <div className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-2xl font-black tracking-tight">{vehicle.nickname}</div>
              <div className="text-sm text-slate-400">
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle details not set"}
              </div>
            </div>
            <button
              onClick={onEditVehicle}
              className="rounded-2xl bg-white/10 p-3 text-slate-200 backdrop-blur-xl"
              aria-label="Edit vehicle"
            >
              <Pencil size={18} />
            </button>
          </div>

          <div className="mb-4 rounded-2xl bg-black/20 px-3 py-2 text-right backdrop-blur-xl">
            <div className="text-lg font-bold">{number(currentOdometer)} mi</div>
            <div className="text-xs text-slate-400">current odometer</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DashboardStat icon={<ClipboardList size={18} className="text-slate-100" />} label="Entries" value={vehicle.entries.length} />
            <DashboardStat icon={<Fuel size={18} className="text-emerald-400" />} label="Avg MPG" value={stats.avgMpg ? number(stats.avgMpg, 1) : "—"} />
            <DashboardStat icon={<Fuel size={18} className="text-emerald-400" />} label="Fuel spent" value={currency(stats.totalFuelCost)} />
            <DashboardStat icon={<Wrench size={18} className="text-blue-400" />} label="Maintenance spent" value={currency(stats.totalMaintenanceCost)} />
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <button
          onClick={onLogFuel}
          className="flex items-center justify-center gap-3 rounded-3xl bg-emerald-500 px-5 py-5 text-lg font-bold text-slate-950 shadow-lg shadow-emerald-950/40"
        >
          <Fuel size={24} /> Log Fuel
        </button>
        <button
          onClick={onLogMaintenance}
          className="flex items-center justify-center gap-3 rounded-3xl bg-cyan-500 px-5 py-5 text-lg font-bold text-slate-950 shadow-cyan-950/40"
        >
          <Wrench size={24} /> Log Maintenance
        </button>
        <button
          onClick={onManageSchedule}
          className="flex items-center justify-center gap-3 rounded-3xl bg-slate-800 px-5 py-4 text-base font-bold text-slate-100 shadow-lg shadow-black/20"
        >
          <ClipboardList size={22} /> Manage Maintenance Schedule
        </button>
      </div>

      {activeReminders.length > 0 && (
        <div className="rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <AlertTriangle size={20} className="text-amber-300" /> Maintenance Reminders
          </h2>
          <div className="space-y-3">
            {activeReminders.map((reminder) => (
              <div key={reminder.id} className={`rounded-2xl border p-3 ${reminder.cardClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold">{reminder.title}</div>
                    <div className="text-sm text-slate-300">{reminder.message}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ring-1 ${reminder.badgeClass}`}>
                    {reminder.status === "no-record" ? "No record" : reminder.status}
                  </span>
                </div>
                {reminder.lastLog && (
                  <div className="mt-2 text-xs text-slate-400">
                    Last done: {reminder.lastLog.date} • {number(reminder.lastLog.odometer)} mi
                  </div>
                )}
                {reminder.nextDueMileage && reminder.dueDate && (
                  <div className="mt-1 text-xs text-slate-400">
                    Next due: {number(reminder.nextDueMileage)} mi • {reminder.dueDate}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
        <button
          type="button"
          onClick={() => setHistoryExpanded((current) => !current)}
          className="flex w-full items-center justify-between"
        >
          <div>
            <h2 className="text-left text-lg font-bold">Recent History</h2>
            <p className="text-left text-sm text-slate-400">
              {sortedEntries.length} entries
            </p>
          </div>

          <motion.div
            animate={{ rotate: historyExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={22} className="text-slate-300" />
          </motion.div>
        </button>

        {historyExpanded && (
          <div className="mt-4">
            {sortedEntries.length === 0 ? (
              <p className="text-sm text-slate-400">No entries yet.</p>
            ) : (
              <div className="space-y-3">
                {sortedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-2xl p-3 border shadow-lg ${
                      entry.type === "fuel"
                        ? "bg-gradient-to-br from-emerald-950/40 to-slate-800 border-emerald-500/20 shadow-emerald-950/20"
                        : entry.type === "maintenance"
                        ? "bg-gradient-to-br from-blue-950/50 via-indigo-950/30 to-slate-800 border-blue-500/30 shadow-blue-950/30"
                        : "bg-slate-800 border-white/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold capitalize">{entry.type}</div>
                        <div className="text-sm text-slate-400">
                          {entry.date} • {number(entry.odometer)} mi
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {(entry.type === "fuel" || entry.type === "maintenance") && (
                          <button
                            onClick={() => onEditEntry(entry.id)}
                            className="rounded-xl bg-slate-700 p-2 text-slate-300"
                            aria-label="Edit entry"
                          >
                            <Pencil size={16} />
                          </button>
                        )}

                        <button
                          onClick={() => onDeleteEntry(entry.id)}
                          className="rounded-xl bg-slate-700 p-2 text-slate-300"
                          aria-label="Delete entry"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {entry.type === "fuel" && (
                      <div className="mt-2 text-sm text-slate-300">
                        {milesByEntryId[entry.id]
                          ? `${number(milesByEntryId[entry.id])} mi since last fill-up`
                          : "Miles pending"}{" "}
                        • {number(entry.gallons, 3)} gal •{" "}
                        {currency(entry.totalCost)} •{" "}
                        {mpgByEntryId[entry.id]
                          ? `${number(mpgByEntryId[entry.id], 1)} MPG`
                          : "MPG pending"}
                        {entry.station ? ` • ${entry.station}` : ""}
                      </div>
                    )}

                    {entry.type === "maintenance" && (
                      <div className="mt-2 text-sm text-slate-300">
                        <div className="font-semibold">
                          {entry.title || "Maintenance"}
                        </div>

                        <div>
                          {entry.maintenanceType} • {entry.status} •{" "}
                          {currency(entry.cost)}
                        </div>

                        {entry.serviceKey && (
                          <div className="text-slate-400">
                            Satisfies:{" "}
                            {getScheduleItemTitle(entry.serviceKey, vehicle)}
                          </div>
                        )}

                        {entry.serviceProvider && (
                          <div className="text-slate-400">
                            {entry.serviceProvider}
                          </div>
                        )}
                      </div>
                    )}

                    {entry.photo && (
                      <img
                        src={entry.photo}
                        alt="Fuel log attachment"
                        className="mt-3 h-36 w-full rounded-2xl object-cover ring-1 ring-white/10"
                      />
                    )}

                    {entry.attachments?.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {entry.attachments.map((attachment, index) => (
                          <img
                            key={index}
                            src={attachment}
                            alt={`Maintenance attachment ${index + 1}`}
                            className="h-28 w-full rounded-2xl object-cover ring-1 ring-white/10"
                          />
                        ))}
                      </div>
                    )}

                    {entry.notes && (
                      <p className="mt-2 text-sm text-slate-400">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>  

    </div>
  );
}

function MaintenanceScheduleForm({ vehicle, onCancel, onSave }) {
  const [schedule, setSchedule] = useState(getMaintenanceSchedule(vehicle));

  function updateItem(id, field, value) {
    setSchedule((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === "title" ? value : Number(value || 0),
            }
          : item
      )
    );
  }

  function addItem() {
    const newItem = {
      id: makeServiceId("New Service"),
      title: "New Service",
      intervalMiles: 5000,
      intervalMonths: 6,
    };
    setSchedule((current) => [...current, newItem]);
  }

  function deleteItem(id) {
    setSchedule((current) => current.filter((item) => item.id !== id));
  }

  function resetToDefaults() {
    if (!window.confirm("Reset this vehicle's maintenance schedule to the default reminders?")) return;
    setSchedule(defaultMaintenanceSchedule);
  }

  function submit(event) {
    event.preventDefault();
    const cleaned = normalizeMaintenanceSchedule(schedule).filter((item) => item.title.trim());
    onSave(cleaned.length ? cleaned : defaultMaintenanceSchedule);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
      <div>
        <h2 className="text-xl font-bold">Manage Maintenance Schedule</h2>
        <p className="mt-1 text-sm text-slate-400">
          Customize reminder intervals for this vehicle. Logged maintenance only clears a reminder when its “Satisfies Reminder” field matches one of these items.
        </p>
      </div>

      <div className="space-y-3">
        {schedule.map((item) => (
          <div key={item.id} className="rounded-3xl bg-slate-950 p-3 ring-1 ring-white/10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-semibold text-slate-200">Reminder Item</div>
              <button
                type="button"
                onClick={() => deleteItem(item.id)}
                className="rounded-xl bg-slate-800 p-2 text-slate-300"
                aria-label="Delete schedule item"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <Field
              label="Service Name"
              value={item.title}
              onChange={(value) => updateItem(item.id, "title", value)}
              required
            />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field
                label="Miles"
                type="number"
                value={item.intervalMiles}
                onChange={(value) => updateItem(item.id, "intervalMiles", value)}
                required
              />
              <Field
                label="Months"
                type="number"
                value={item.intervalMonths}
                onChange={(value) => updateItem(item.id, "intervalMonths", value)}
                required
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-4 font-semibold"
      >
        <Plus size={18} /> Add Reminder Item
      </button>

      <button
        type="button"
        onClick={resetToDefaults}
        className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-300"
      >
        Reset to Defaults
      </button>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold">
          Cancel
        </button>
        <button type="submit" className="rounded-2xl bg-cyan-500 px-4 py-4 font-bold text-slate-950">
          Save Schedule
        </button>
      </div>
    </form>
  );
}

function VehicleForm({ vehicle, onCancel, onSave }) {
  const [form, setForm] = useState({
    nickname: vehicle.nickname || "",
    year: vehicle.year || "",
    make: vehicle.make || "",
    model: vehicle.model || "",
    odometer: vehicle.odometer || "",
    photo: vehicle.photo || "",
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSave({
      ...vehicle,
      nickname: form.nickname.trim() || "Untitled Vehicle",
      year: form.year.trim(),
      make: form.make.trim(),
      model: form.model.trim(),
      odometer: Number(form.odometer || 0),
      photo: form.photo,
      maintenanceSchedule: getMaintenanceSchedule(vehicle),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
      <h2 className="text-xl font-bold">Edit Vehicle</h2>
      <Field label="Nickname" value={form.nickname} onChange={(value) => update("nickname", value)} required />
      <Field label="Year" value={form.year} onChange={(value) => update("year", value)} />
      <Field label="Make" value={form.make} onChange={(value) => update("make", value)} />
      <Field label="Model" value={form.model} onChange={(value) => update("model", value)} />
      <Field label="Current Odometer" type="number" value={form.odometer} onChange={(value) => update("odometer", value)} required />

      <div className="rounded-3xl bg-slate-950 p-3 ring-1 ring-white/10">
        <span className="mb-2 block text-sm font-medium text-slate-300">Vehicle Banner Photo</span>
        {form.photo ? (
          <img src={form.photo} alt="Vehicle preview" className="mb-3 h-40 w-full rounded-2xl object-cover" />
        ) : (
          <div className="mb-3 flex h-40 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
            No vehicle photo yet
          </div>
        )}
        <label className="block cursor-pointer rounded-2xl bg-slate-800 px-4 py-3 text-center font-semibold">
          Choose Vehicle Photo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const compressed = await compressImageFile(file, 1600, 0.8);
              update("photo", compressed);
            }}
          />
        </label>
        {form.photo && (
          <button
            type="button"
            onClick={() => update("photo", "")}
            className="mt-2 w-full rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-300"
          >
            Remove Photo
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold">
          Cancel
        </button>
        <button type="submit" className="rounded-2xl bg-cyan-500 px-4 py-4 font-bold text-slate-950">
          Save Vehicle
        </button>
      </div>
    </form>
  );
}

function MaintenanceForm({ vehicle, initialEntry = null, onCancel, onSave }) {
  const schedule = getMaintenanceSchedule(vehicle);
  const isEditing = Boolean(initialEntry);
  const [form, setForm] = useState({
    maintenanceType: initialEntry?.maintenanceType || "Scheduled Maintenance",
    serviceKey: initialEntry?.serviceKey || "",
    title: initialEntry?.title || "",
    date: initialEntry?.date || new Date().toISOString().slice(0, 10),
    odometer: initialEntry?.odometer ?? getCurrentOdometer(vehicle) ?? "",
    cost: initialEntry?.cost ?? "",
    serviceProvider: initialEntry?.serviceProvider || "",
    status: initialEntry?.status || "Completed",
    notes: initialEntry?.notes || "",
    attachments: initialEntry?.attachments || [],
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addAttachments(files) {
    const fileList = Array.from(files || []);
    if (fileList.length === 0) return;
    const compressedImages = await Promise.all(
      fileList.map((file) => compressImageFile(file, 1400, 0.72))
    );
    update("attachments", [...form.attachments, ...compressedImages]);
  }

  function removeAttachment(indexToRemove) {
    update(
      "attachments",
      form.attachments.filter((_, index) => index !== indexToRemove)
    );
  }

  function submit(event) {
    event.preventDefault();
    const scheduleTitle = getScheduleItemTitle(form.serviceKey, vehicle);
    const entry = {
      id: initialEntry?.id || crypto.randomUUID(),
      type: "maintenance",
      maintenanceType: form.maintenanceType,
      serviceKey: form.serviceKey,
      title: form.title.trim() || scheduleTitle || "Maintenance",
      date: form.date,
      odometer: Number(form.odometer),
      cost: Number(form.cost || 0),
      serviceProvider: form.serviceProvider.trim(),
      status: form.status,
      notes: form.notes.trim(),
      attachments: form.attachments,
      createdAt: initialEntry?.createdAt || new Date().toISOString(),
      updatedAt: isEditing ? new Date().toISOString() : undefined,
    };
    onSave(entry);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
      <h2 className="text-xl font-bold">{isEditing ? "Edit Maintenance Log" : "Log Maintenance"}</h2>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-300">Reason for Log</span>
        <select
          value={form.maintenanceType}
          onChange={(event) => update("maintenanceType", event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
        >
          <option>Scheduled Maintenance</option>
          <option>Repair</option>
          <option>Recall / TSB</option>
          <option>Inspection</option>
          <option>Tire Service</option>
          <option>Modification / Upgrade</option>
          <option>Diagnostic</option>
          <option>Emergency Repair</option>
          <option>Other</option>
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-300">Satisfies Reminder</span>
        <select
          value={form.serviceKey}
          onChange={(event) => update("serviceKey", event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
        >
          <option value="">Does not satisfy a reminder</option>
          {schedule.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>

      <Field label="Title / Short Description" value={form.title} onChange={(value) => update("title", value)} />
      <Field label="Date" type="date" value={form.date} onChange={(value) => update("date", value)} required />
      <Field label="Odometer" type="number" value={form.odometer} onChange={(value) => update("odometer", value)} required />
      <Field label="Cost" type="number" step="0.01" value={form.cost} onChange={(value) => update("cost", value)} />
      <Field label="Service Provider / Location" value={form.serviceProvider} onChange={(value) => update("serviceProvider", value)} />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-300">Status</span>
        <select
          value={form.status}
          onChange={(event) => update("status", event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
        >
          <option>Completed</option>
          <option>Monitoring</option>
          <option>Needs Repair</option>
          <option>Scheduled</option>
          <option>Deferred</option>
        </select>
      </label>

      <div className="rounded-3xl bg-slate-950 p-3 ring-1 ring-white/10">
        <span className="mb-2 block text-sm font-medium text-slate-300">Photos / Attachments</span>
        {form.attachments.length > 0 ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {form.attachments.map((attachment, index) => (
              <div key={index} className="relative">
                <img src={attachment} alt={`Attachment ${index + 1}`} className="h-32 w-full rounded-2xl object-cover" />
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="absolute right-2 top-2 rounded-xl bg-black/70 p-2 text-white"
                  aria-label="Remove attachment"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-3 flex h-32 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
            No attachments yet
          </div>
        )}
        <label className="block cursor-pointer rounded-2xl bg-slate-800 px-4 py-3 text-center font-semibold">
          Add Photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (event) => {
              await addAttachments(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-300">Notes</span>
        <textarea
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
          className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold">
          Cancel
        </button>
        <button type="submit" className="rounded-2xl bg-cyan-500 px-4 py-4 font-bold text-slate-950">
          {isEditing ? "Save Changes" : "Save Maintenance"}
        </button>
      </div>
    </form>
  );
}

function FuelForm({ vehicle, initialEntry = null, onCancel, onSave }) {
  const isEditing = Boolean(initialEntry);
  const [form, setForm] = useState({
    date: initialEntry?.date || new Date().toISOString().slice(0, 10),
    odometer: initialEntry?.odometer ?? getCurrentOdometer(vehicle) ?? "",
    gallons: initialEntry?.gallons ?? "",
    totalCost: initialEntry?.totalCost ?? "",
    station: initialEntry?.station || "",
    notes: initialEntry?.notes || "",
    photo: initialEntry?.photo || "",
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    const entry = {
      id: initialEntry?.id || crypto.randomUUID(),
      type: "fuel",
      date: form.date,
      odometer: Number(form.odometer),
      gallons: Number(form.gallons),
      totalCost: Number(form.totalCost),
      station: form.station.trim(),
      notes: form.notes.trim(),
      photo: form.photo,
      createdAt: initialEntry?.createdAt || new Date().toISOString(),
      updatedAt: isEditing ? new Date().toISOString() : undefined,
    };
    onSave(entry);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
      <h2 className="text-xl font-bold">{isEditing ? "Edit Fuel Log" : "Log Fuel"}</h2>
      <Field label="Date" type="date" value={form.date} onChange={(value) => update("date", value)} required />
      <Field label="Odometer" type="number" value={form.odometer} onChange={(value) => update("odometer", value)} required />
      <Field label="Gallons" type="number" step="0.001" value={form.gallons} onChange={(value) => update("gallons", value)} required />
      <Field label="Total Cost" type="number" step="0.01" value={form.totalCost} onChange={(value) => update("totalCost", value)} required />
      <Field label="Station" value={form.station} onChange={(value) => update("station", value)} />
      <div className="rounded-3xl bg-slate-950 p-3 ring-1 ring-white/10">
        <span className="mb-2 block text-sm font-medium text-slate-300">Pump or Receipt Photo</span>
        {form.photo ? (
          <img src={form.photo} alt="Fuel log preview" className="mb-3 h-44 w-full rounded-2xl object-cover" />
        ) : (
          <div className="mb-3 flex h-44 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
            No photo attached
          </div>
        )}
        <label className="block cursor-pointer rounded-2xl bg-slate-800 px-4 py-3 text-center font-semibold">
          Take or Choose Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const compressed = await compressImageFile(file, 1400, 0.72);
              update("photo", compressed);
            }}
          />
        </label>
        {form.photo && (
          <button
            type="button"
            onClick={() => update("photo", "")}
            className="mt-2 w-full rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-300"
          >
            Remove Photo
          </button>
        )}
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-300">Notes</span>
        <textarea
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
          className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
        />
      </label>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold">
          Cancel
        </button>
        <button type="submit" className="rounded-2xl bg-emerald-500 px-4 py-4 font-bold text-slate-950">
          {isEditing ? "Save Changes" : "Save Fuel"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, type = "text", required = false, step }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      <input
        type={type}
        step={step}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
      />
    </label>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-800 px-3 py-2">
      <div className="font-semibold">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function DashboardStat({ icon, label, value }) {
  return (
    <div className="rounded-2xl bg-slate-800 p-3">
      <div className="mb-2">{icon}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

export default App;
