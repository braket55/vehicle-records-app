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
  BarChart3,
  CircleDot,
} from "lucide-react";

const DB_NAME = "vehicle-records-db";
const DB_VERSION = 1;
const STORE_NAME = "app-state";
const STATE_KEY = "vehicle-records-state";

const DEFAULT_SOON_MILES = 500;
const DEFAULT_SOON_MONTHS = 1;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const defaultMaintenanceSchedule = [
  { id: "oil-change", title: "Oil Change", intervalMiles: 5000, intervalMonths: 6, soonMiles: 500, soonMonths: 1 },
  { id: "engine-air-filter", title: "Engine Air Filter", intervalMiles: 30000, intervalMonths: 36, soonMiles: 1000, soonMonths: 2 },
  { id: "cabin-air-filter", title: "Cabin Air Filter", intervalMiles: 15000, intervalMonths: 12, soonMiles: 1000, soonMonths: 1 },
];

const rangeOptions = [
  { id: "1M", label: "1M" },
  { id: "3M", label: "3M" },
  { id: "6M", label: "6M" },
  { id: "YTD", label: "YTD" },
  { id: "1Y", label: "1Y" },
  { id: "ALL", label: "All" },
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
          date: todayLocalString(),
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
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
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

    request.onsuccess = () => {
      const loaded = request.result || starterState;

      resolve({
        ...loaded,
        vehicles: loaded.vehicles.map((vehicle) => ({
          ...vehicle,
          maintenanceSchedule: normalizeMaintenanceSchedule(vehicle.maintenanceSchedule),
          tireSets: normalizeTireSets(vehicle.tireSets),
        })),
      });
    };
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
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value) {
  if (value === undefined || value === null) return "";
  const stringValue = String(value);
  if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes('"')) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildCsvRows(state) {
  const rows = [[
    "vehicle_nickname",
    "vehicle_year",
    "vehicle_make",
    "vehicle_model",
    "entry_type",
    "date",
    "odometer",
    "gallons",
    "fuel_total_cost",
    "mpg",
    "vehicle_estimated_mpg",
    "include_vehicle_estimated_mpg",
    "vehicle_mpg_difference_percent",
    "miles_since_last_fillup",
    "station",
    "maintenance_type",
    "service_reminder",
    "maintenance_title",
    "maintenance_cost",
    "service_provider",
    "status",
    "notes",
  ]];

  state.vehicles.forEach((vehicle) => {
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

    const sortedEntries = [...vehicle.entries].sort((a, b) => new Date(a.date) - new Date(b.date));

    sortedEntries.forEach((entry) => {
      rows.push([
        vehicle.nickname,
        vehicle.year,
        vehicle.make,
        vehicle.model,
        entry.type,
        entry.date,
        entry.odometer,
        entry.type === "fuel" ? entry.gallons : "",
        entry.type === "fuel" ? entry.totalCost : "",
        entry.type === "fuel" && mpgByEntryId[entry.id] ? mpgByEntryId[entry.id].toFixed(2) : "",
        entry.type === "fuel" ? entry.vehicleEstimatedMpg || "" : "",
        entry.type === "fuel" ? Boolean(entry.includeVehicleEstimatedMpg) : "",
        entry.type === "fuel" &&
        entry.includeVehicleEstimatedMpg &&
        entry.vehicleEstimatedMpg &&
        mpgByEntryId[entry.id]
          ? (
              ((Number(entry.vehicleEstimatedMpg) - mpgByEntryId[entry.id]) /
                mpgByEntryId[entry.id]) *
              100
            ).toFixed(2)
          : "",
        entry.type === "fuel" && milesByEntryId[entry.id] ? milesByEntryId[entry.id] : "",
        entry.type === "fuel" ? entry.station : "",
        entry.type === "maintenance" ? entry.maintenanceType : "",
        entry.type === "maintenance" ? getScheduleItemTitle(entry.serviceKey, vehicle) : "",
        entry.type === "maintenance" ? entry.title : "",
        entry.type === "maintenance" ? entry.cost : "",
        entry.type === "maintenance" ? entry.serviceProvider : "",
        entry.type === "maintenance" ? entry.status : "",
        entry.notes,
      ]);
    });
  });

  return rows;
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
  if (value === undefined || value === null || value === "" || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function number(value, digits = 0) {
  if (value === undefined || value === null || value === "" || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function addMonths(dateString, months) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date;
}

function todayLocalString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateToString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const filteredSource = source.filter((item) => item.id !== "tire-rotation");
  return filteredSource.map((item) => ({
    id: item.id || makeServiceId(item.title),
    title: item.title || "Untitled Service",
    intervalMiles: Number(item.intervalMiles || 0),
    intervalMonths: Number(item.intervalMonths || 0),
    soonMiles: Number(item.soonMiles ?? DEFAULT_SOON_MILES),
    soonMonths: Number(item.soonMonths ?? DEFAULT_SOON_MONTHS),
  }));
}

function normalizeTireSets(tireSets) {
  if (!Array.isArray(tireSets)) return [];

  return tireSets.map((set) => ({
    id: set.id || crypto.randomUUID(),
    name: set.name || "Untitled Tire Set",
    brand: set.brand || "",
    model: set.model || "",
    size: set.size || "",
    status: set.status || "stored",
    purchaseDate: set.purchaseDate || "",
    purchaseOdometer: Number(set.purchaseOdometer || 0),
    installedAtOdometer: set.installedAtOdometer === undefined ? "" : Number(set.installedAtOdometer || 0),
    removedAtOdometer: set.removedAtOdometer === undefined ? "" : Number(set.removedAtOdometer || 0),
    initialMiles: Number(set.initialMiles || 0),
    storedMiles: Number(set.storedMiles || 0),
    rotationIntervalMiles: Number(set.rotationIntervalMiles || 5000),
    rotationSoonMiles: Number(set.rotationSoonMiles || 500),
    lastRotatedAtOdometer: set.lastRotatedAtOdometer === undefined ? "" : Number(set.lastRotatedAtOdometer || 0),
    notes: set.notes || "",
    createdAt: set.createdAt || new Date().toISOString(),
  }));
}

function getTireSets(vehicle) {
  return normalizeTireSets(vehicle.tireSets);
}

function getActiveTireSet(vehicle) {
  return getTireSets(vehicle).find((set) => set.status === "active") || null;
}

function getTireSetMiles(tireSet, vehicle) {
  const currentOdometer = getCurrentOdometer(vehicle);

  const initialMiles = Number(tireSet.initialMiles || 0);
  const storedMiles = Number(tireSet.storedMiles || 0);

  if (tireSet.status !== "active") {
    return initialMiles + storedMiles;
  }

  const installedAt = Number(
    tireSet.installedAtOdometer || currentOdometer || 0
  );

  const activeMiles = Math.max(
    0,
    currentOdometer - installedAt
  );

  return initialMiles + storedMiles + activeMiles;
}

function getTireRotationStatus(tireSet, vehicle) {
  if (!tireSet || tireSet.status !== "active") return null;

  const currentOdometer = getCurrentOdometer(vehicle);
  const interval = Number(tireSet.rotationIntervalMiles || 5000);
  const installedAt = Number(tireSet.installedAtOdometer || currentOdometer || 0);
  const initialMiles = Number(tireSet.initialMiles || 0);

  const rotationLogs = (vehicle.entries || [])
    .filter(
      (entry) =>
        entry.type === "tire" &&
        entry.action === "rotation" &&
        entry.tireSetId === tireSet.id &&
        Number(entry.odometer) > 0
    )
    .sort((a, b) => Number(b.odometer) - Number(a.odometer));

  const lastRotationOdometer = rotationLogs[0]?.odometer;

  const milesSinceRotation =
    lastRotationOdometer !== undefined
      ? Math.max(0, currentOdometer - Number(lastRotationOdometer))
      : initialMiles + Math.max(0, currentOdometer - installedAt);

  const milesRemaining = interval - milesSinceRotation;
  const soonThreshold = Number(tireSet.rotationSoonMiles || 500);

  if (milesRemaining <= 0) {
    return {
      status: "overdue",
      message: `Rotation overdue by ${number(Math.abs(milesRemaining))} mi`,
      milesSinceRotation,
      milesRemaining,
    };
  }

  if (milesRemaining <= soonThreshold) {
    return {
      status: "soon",
      message: `Rotate soon: ${number(milesRemaining)} mi remaining`,
      milesSinceRotation,
      milesRemaining,
    };
  }

  return {
    status: "ok",
    message: `Rotate in ${number(milesRemaining)} mi`,
    milesSinceRotation,
    milesRemaining,
  };
}

function makeTireHistoryEntry({ title, action, tireSetId, tireSetName, date, odometer, notes = "" }) {
  return {
    id: crypto.randomUUID(),
    type: "tire",
    action,
    tireSetId,
    tireSetName,
    date,
    odometer: Number(odometer || 0),
    title,
    notes,
    createdAt: new Date().toISOString(),
  };
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

  return { fuelCount: fuelEntries.length, totalFuelCost, totalMaintenanceCost, avgMpg };
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
    (entry) => ["fuel", "maintenance", "tire"].includes(entry.type) && entry.date && Number(entry.odometer) > 0
  );
  if (odometerEntries.length === 0) return Number(vehicle.odometer || 0);
  const mostRecentDate = odometerEntries.map((entry) => entry.date).sort().at(-1);
  const entriesOnMostRecentDate = odometerEntries.filter((entry) => entry.date === mostRecentDate);
  return Math.max(...entriesOnMostRecentDate.map((entry) => Number(entry.odometer)));
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
    const soonMiles = Number(scheduleItem.soonMiles ?? DEFAULT_SOON_MILES);
    const soonDays = Number(scheduleItem.soonMonths ?? DEFAULT_SOON_MONTHS) * 30;
    const isSoon = milesRemaining <= soonMiles || daysUntilDue <= soonDays;

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
  const activeTireSet = getActiveTireSet(vehicle);
  const tireRotationStatus = getTireRotationStatus(activeTireSet, vehicle);

  if (
    reminders.some((reminder) => reminder.status === "overdue" || reminder.status === "due") ||
    tireRotationStatus?.status === "overdue"
  ) {
    return { status: "danger", label: "Due", className: "bg-red-500 text-white shadow-red-950/40" };
  }

  if (
    reminders.some((reminder) => reminder.status === "soon") ||
    tireRotationStatus?.status === "soon"
  ) {
    return { status: "soon", label: "Soon", className: "bg-amber-400 text-slate-950 shadow-amber-950/30" };
  }

  return null;
}

function parseEntryDate(entry) {
  return new Date(`${entry.date}T00:00:00`);
}

function getRangeStartDate(rangeId) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (rangeId === "ALL") return null;
  if (rangeId === "YTD") return new Date(today.getFullYear(), 0, 1);
  if (rangeId === "1M") { start.setDate(start.getDate() - 30); return start; }
  if (rangeId === "3M") { start.setDate(start.getDate() - 90); return start; }
  if (rangeId === "6M") { start.setDate(start.getDate() - 180); return start; }
  if (rangeId === "1Y") { start.setDate(start.getDate() - 365); return start; }
  return null;
}

function getEntriesInRange(vehicle, rangeId) {
  const startDate = getRangeStartDate(rangeId);
  const entries = vehicle.entries.filter((entry) => entry.date);
  if (!startDate) return entries;
  return entries.filter((entry) => parseEntryDate(entry) >= startDate);
}

function getMilesDrivenInRange(vehicle, rangeId) {
  const odometerEntries = vehicle.entries
    .filter((entry) => ["fuel", "maintenance"].includes(entry.type) && entry.date && Number(entry.odometer) > 0)
    .sort((a, b) => {
      const dateCompare = new Date(a.date) - new Date(b.date);
      if (dateCompare !== 0) return dateCompare;
      return Number(a.odometer || 0) - Number(b.odometer || 0);
    });
  if (odometerEntries.length < 2) return 0;
  const startDate = getRangeStartDate(rangeId);
  const entriesInRange = startDate ? odometerEntries.filter((entry) => parseEntryDate(entry) >= startDate) : odometerEntries;
  if (entriesInRange.length < 2) return 0;
  const firstOdometer = Number(entriesInRange[0].odometer || 0);
  const lastOdometer = Number(entriesInRange[entriesInRange.length - 1].odometer || 0);
  return Math.max(0, lastOdometer - firstOdometer);
}

function calculateRangeStats(vehicle, rangeId) {
  const entriesInRange = getEntriesInRange(vehicle, rangeId);
  const fuelEntries = entriesInRange.filter((entry) => entry.type === "fuel");
  const maintenanceEntries = entriesInRange.filter((entry) => entry.type === "maintenance");
  const totalFuelCost = fuelEntries.reduce((sum, entry) => sum + Number(entry.totalCost || 0), 0);
  const totalMaintenanceCost = maintenanceEntries.reduce((sum, entry) => sum + Number(entry.cost || 0), 0);
  const totalCost = totalFuelCost + totalMaintenanceCost;
  const milesDriven = getMilesDrivenInRange(vehicle, rangeId);
  return {
    entriesInRange,
    fuelEntries,
    maintenanceEntries,
    totalFuelCost,
    totalMaintenanceCost,
    totalCost,
    milesDriven,
    fuelCostPerMile: milesDriven > 0 ? totalFuelCost / milesDriven : null,
    maintenanceCostPerMile: milesDriven > 0 ? totalMaintenanceCost / milesDriven : null,
    totalCostPerMile: milesDriven > 0 ? totalCost / milesDriven : null,
  };
}

function buildMpgSeries(vehicle, rangeId) {
  const sortedFuelEntries = getFuelEntriesSorted(vehicle);
  const startDate = getRangeStartDate(rangeId);
  return sortedFuelEntries
    .map((entry, index) => ({ id: entry.id, date: entry.date, value: calculateEntryMpg(sortedFuelEntries, index) }))
    .filter((point) => point.value !== null)
    .filter((point) => !startDate || new Date(`${point.date}T00:00:00`) >= startDate);
}

function buildVehicleMpgDifferenceSeries(vehicle, rangeId) {
  const sortedFuelEntries = getFuelEntriesSorted(vehicle);
  const startDate = getRangeStartDate(rangeId);

  return sortedFuelEntries
    .map((entry, index) => {
      const calculatedMpg = calculateEntryMpg(sortedFuelEntries, index);
      const vehicleEstimatedMpg = Number(entry.vehicleEstimatedMpg || 0);

      if (!entry.includeVehicleEstimatedMpg || !calculatedMpg || vehicleEstimatedMpg <= 0) {
        return null;
      }

      return {
        id: entry.id,
        date: entry.date,
        value: ((vehicleEstimatedMpg - calculatedMpg) / calculatedMpg) * 100,
      };
    })
    .filter(Boolean)
    .filter((point) => !startDate || new Date(`${point.date}T00:00:00`) >= startDate);
}

function buildMonthlyFuelSeries(vehicle, rangeId) {
  const entries = getEntriesInRange(vehicle, rangeId)
    .filter((entry) => entry.type === "fuel")
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const byMonth = entries.reduce((acc, entry) => {
    const key = entry.date.slice(0, 7);
    acc[key] = (acc[key] || 0) + Number(entry.totalCost || 0);
    return acc;
  }, {});
  return Object.entries(byMonth).map(([date, value]) => ({ date, value }));
}

function buildMilesOverTimeSeries(vehicle, rangeId) {
  const startDate = getRangeStartDate(rangeId);
  return vehicle.entries
    .filter((entry) => ["fuel", "maintenance"].includes(entry.type))
    .filter((entry) => entry.date && Number(entry.odometer) > 0)
    .filter((entry) => !startDate || parseEntryDate(entry) >= startDate)
    .sort((a, b) => {
      const dateCompare = new Date(a.date) - new Date(b.date);
      if (dateCompare !== 0) return dateCompare;
      return Number(a.odometer || 0) - Number(b.odometer || 0);
    })
    .map((entry) => ({ id: entry.id, date: entry.date, value: Number(entry.odometer || 0) }));
}

function App() {
  const [state, setState] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [entryPendingDelete, setEntryPendingDelete] = useState(null);
  const [vehiclePendingDelete, setVehiclePendingDelete] = useState(null);
  const [screen, setScreen] = useState("garage");
  const [status, setStatus] = useState("Loading local database…");

  useEffect(() => {
    loadState()
      .then((loaded) => { setState(loaded); setStatus("Saved locally on this device."); })
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
      vehicles: current.vehicles.map((vehicle) => (vehicle.id === vehicleId ? updater(vehicle) : vehicle)),
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
      tireSets: [],
      entries: [],
    };
    setState((current) => ({ ...current, vehicles: [...current.vehicles, newVehicle] }));
  }

  function updateEntry(vehicleId, updatedEntry) {
    updateVehicle(vehicleId, (vehicle) => ({
      ...vehicle,
      odometer: vehicle.odometer,
      entries: vehicle.entries.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry)),
    }));
  }

  function deleteEntry(vehicleId, entryId) {
    updateVehicle(vehicleId, (vehicle) => ({ ...vehicle, entries: vehicle.entries.filter((entry) => entry.id !== entryId) }));
  }

  function deleteVehicle(vehicleId) {
    setState((current) => ({ ...current, vehicles: current.vehicles.filter((vehicle) => vehicle.id !== vehicleId) }));
  }

  function exportBackup() {
    const date = todayLocalString();
    downloadJson(`vehicle-records-backup-${date}.json`, state);
  }

  function exportCsv() {
    const date = todayLocalString();
    downloadCsv(`vehicle-records-export-${date}.csv`, buildCsvRows(state));
  }

  async function importBackup(file) {
    if (!file) return;
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!imported.vehicles || !Array.isArray(imported.vehicles)) throw new Error("This does not look like a vehicle records backup file.");
    setState(imported);
    setStatus("Backup restored and saved locally.");
  }

  if (!state) return <div className="min-h-screen bg-slate-950 text-white p-6">{status}</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-md px-4 py-5">
        <Header screen={screen} vehicle={selectedVehicle} onBack={() => { setScreen("garage"); setSelectedVehicleId(null); }} />

        {screen === "garage" && (
          <GarageScreen
            state={state}
            onSelectVehicle={(vehicleId) => { setSelectedVehicleId(vehicleId); setScreen("dashboard"); }}
            onAddVehicle={addVehicle}
            onExportBackup={exportBackup}
            onExportCsv={exportCsv}
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
            onViewStats={() => setScreen("stats")}
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
            onManageTires={() => setScreen("tires")}
          />
        )}

        {screen === "stats" && selectedVehicle && <StatsScreen vehicle={selectedVehicle} />}

        {screen === "schedule" && selectedVehicle && (
          <MaintenanceScheduleForm
            vehicle={selectedVehicle}
            onCancel={() => setScreen("dashboard")}
            onSave={(maintenanceSchedule) => {
              updateVehicle(selectedVehicle.id, (vehicle) => ({ ...vehicle, maintenanceSchedule: normalizeMaintenanceSchedule(maintenanceSchedule) }));
              setScreen("dashboard");
            }}
          />
        )}

        {screen === "editVehicle" && selectedVehicle && (
          <VehicleForm
            vehicle={selectedVehicle}
            onCancel={() => setScreen("dashboard")}
            onRequestDeleteVehicle={() => setVehiclePendingDelete(selectedVehicle)}
            onSave={(updatedVehicle) => { updateVehicle(selectedVehicle.id, () => updatedVehicle); setScreen("dashboard"); }}
          />
        )}

        {screen === "tires" && selectedVehicle && (
          <TireSetsScreen
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
              updateVehicle(selectedVehicle.id, (vehicle) => ({ ...vehicle, odometer: vehicle.odometer, entries: [entry, ...vehicle.entries] }));
              setScreen("dashboard");
            }}
          />
        )}

        {screen === "maintenance" && selectedVehicle && (
          <MaintenanceForm
            vehicle={selectedVehicle}
            onCancel={() => setScreen("dashboard")}
            onSave={(entry) => {
              updateVehicle(selectedVehicle.id, (vehicle) => ({ ...vehicle, odometer: vehicle.odometer, entries: [entry, ...vehicle.entries] }));
              setScreen("dashboard");
            }}
          />
        )}

        {screen === "editFuel" && selectedVehicle && selectedEntryId && (
          <FuelForm
            vehicle={selectedVehicle}
            initialEntry={selectedVehicle.entries.find((entry) => entry.id === selectedEntryId)}
            onCancel={() => { setSelectedEntryId(null); setScreen("dashboard"); }}
            onSave={(entry) => { updateEntry(selectedVehicle.id, entry); setSelectedEntryId(null); setScreen("dashboard"); }}
          />
        )}

        {screen === "editMaintenance" && selectedVehicle && selectedEntryId && (
          <MaintenanceForm
            vehicle={selectedVehicle}
            initialEntry={selectedVehicle.entries.find((entry) => entry.id === selectedEntryId)}
            onCancel={() => { setSelectedEntryId(null); setScreen("dashboard"); }}
            onSave={(entry) => { updateEntry(selectedVehicle.id, entry); setSelectedEntryId(null); setScreen("dashboard"); }}
          />
        )}

        {entryPendingDelete && selectedVehicle && (
          <DeleteConfirmModal
            entry={entryPendingDelete}
            onCancel={() => setEntryPendingDelete(null)}
            onConfirm={() => { deleteEntry(selectedVehicle.id, entryPendingDelete.id); setEntryPendingDelete(null); }}
          />
        )}

        {vehiclePendingDelete && (
          <DeleteVehicleConfirmModal
            vehicle={vehiclePendingDelete}
            onCancel={() => setVehiclePendingDelete(null)}
            onConfirm={() => {
              deleteVehicle(vehiclePendingDelete.id);
              setVehiclePendingDelete(null);
              setSelectedVehicleId(null);
              setScreen("garage");
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-6 backdrop-blur-sm sm:items-center sm:pb-0" onClick={onCancel}>
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }} className="w-full max-w-sm rounded-[2rem] bg-slate-900 p-5 shadow-2xl shadow-black/40 ring-1 ring-white/10" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl bg-red-500/15 p-3 text-red-300"><Trash2 size={22} /></div>
          <div><h2 className="text-xl font-black tracking-tight">{title}</h2><p className="text-sm text-slate-400">This cannot be undone.</p></div>
        </div>
        <div className="mb-4 rounded-2xl bg-slate-950 p-3 text-sm text-slate-300 ring-1 ring-white/10">
          <div>{entry.date} • {number(entry.odometer)} mi</div>
          {entry.type === "fuel" && <div>{number(entry.gallons, 3)} gal • {currency(entry.totalCost)}</div>}
          {entry.type === "maintenance" && <div>{entry.title || "Maintenance"} • {currency(entry.cost)}</div>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold text-slate-200">Cancel</button>
          <button type="button" onClick={onConfirm} className="rounded-2xl bg-red-600 px-4 py-4 font-bold text-white shadow-lg shadow-red-950/30">Delete</button>
        </div>
      </motion.div>
    </div>
  );
}

function DeleteVehicleConfirmModal({ vehicle, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-6 backdrop-blur-sm sm:items-center sm:pb-0" onClick={onCancel}>
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }} className="w-full max-w-sm rounded-[2rem] bg-slate-900 p-5 shadow-2xl shadow-black/40 ring-1 ring-white/10" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl bg-red-500/15 p-3 text-red-300"><Trash2 size={22} /></div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Remove Vehicle?</h2>
            <p className="text-sm text-slate-400">This will remove the vehicle and all of its logs from this device.</p>
          </div>
        </div>
        <div className="mb-4 rounded-2xl bg-slate-950 p-3 text-sm text-slate-300 ring-1 ring-white/10">
          <div className="font-bold">{vehicle.nickname || "Untitled Vehicle"}</div>
          <div>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle details not set"}</div>
          <div>{vehicle.entries.length} saved entries</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold text-slate-200">Cancel</button>
          <button type="button" onClick={onConfirm} className="rounded-2xl bg-red-600 px-4 py-4 font-bold text-white shadow-lg shadow-red-950/30">Remove</button>
        </div>
      </motion.div>
    </div>
  );
}

function Header({ screen, vehicle, onBack }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {screen !== "garage" && <button onClick={onBack} className="rounded-2xl bg-slate-800 p-3 shadow-lg shadow-black/20" aria-label="Back to garage"><ArrowLeft size={20} /></button>}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{screen === "garage" ? "Vehicle Records" : vehicle?.nickname || "Vehicle"}</h1>
        <p className="text-sm text-slate-400">Vehicle Records App</p>
      </div>
    </div>
  );
}

function GarageScreen({ state, onSelectVehicle, onAddVehicle, onExportBackup, onExportCsv, onImportBackup, status }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {state.vehicles.map((vehicle) => {
          const stats = calculateFuelStats(vehicle);
          const currentOdometer = getCurrentOdometer(vehicle);
          const reminderSummary = getReminderSummary(vehicle);
          return (
            <motion.button key={vehicle.id} whileTap={{ scale: 0.98 }} onClick={() => onSelectVehicle(vehicle.id)} className="relative overflow-hidden rounded-3xl bg-slate-900 text-left shadow-xl shadow-black/20 ring-1 ring-white/10">
              {reminderSummary && <div className={`absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black shadow-lg ${reminderSummary.className}`}><AlertTriangle size={14} /> {reminderSummary.label}</div>}
              <div className="flex h-36 items-center justify-center bg-gradient-to-br from-indigo-500 via-sky-500 to-cyan-400">
                {vehicle.photo ? <img src={vehicle.photo} alt="" className="h-full w-full object-cover" /> : <Car size={64} className="text-white/90" />}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">{vehicle.nickname}</h2>
                    <p className="text-sm text-slate-400">{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle details not set"}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800 px-3 py-2 text-right text-sm">
                    <div className="font-semibold">{number(currentOdometer)} mi</div>
                    <div className="text-slate-400">odometer</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <StatPill label="Logs" value={`${stats.fuelCount} fuel • ${vehicle.entries.filter((entry) => entry.type === "maintenance").length} maintenance`} />
                  <StatPill label="Avg MPG" value={stats.avgMpg ? number(stats.avgMpg, 1) : "—"} />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <button onClick={onAddVehicle} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-4 font-semibold shadow-lg shadow-black/20"><Plus size={18} /> Add Vehicle</button>

      <div className="rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
        <h2 className="mb-3 font-bold">Backup & Restore</h2>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onExportBackup} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold"><Download size={18} /> Backup</button>
            <button onClick={onExportCsv} className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-4 py-3 font-semibold text-white"><Download size={18} /> CSV</button>
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 font-semibold">
            <Upload size={18} /> Restore
            <input type="file" accept="application/json" className="hidden" onChange={async (event) => { try { await onImportBackup(event.target.files?.[0]); } catch (error) { alert(error.message); } }} />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-400">{status}</p>
      </div>
    </div>
  );
}

function getMaintenanceUsage(reminder, currentOdometer) {
  if (!reminder.lastLog) return null;

  const milesSinceLast = Math.max(
    0,
    Number(currentOdometer || 0) - Number(reminder.lastLog.odometer || 0)
  );

  const daysSinceLast = Math.max(
    0,
    daysBetween(new Date(`${reminder.lastLog.date}T00:00:00`), new Date())
  );

  const mileageUsage =
    Number(reminder.intervalMiles || 0) > 0
      ? milesSinceLast / Number(reminder.intervalMiles)
      : 0;

  const timeUsage =
    Number(reminder.intervalMonths || 0) > 0
      ? daysSinceLast / (Number(reminder.intervalMonths) * 30)
      : 0;

  return Math.max(mileageUsage, timeUsage) * 100;
}

function getMaintenanceProgressClasses(
  reminder,
  usagePercent,
  soonPercent
) {
  if (
    reminder.status === "overdue" ||
    reminder.status === "due" ||
    usagePercent >= 100
  ) {
    return {
      bar: "bg-red-500",
      text: "text-red-200",
      ring: "ring-red-400/30",
    };
  }

  if (
    reminder.status === "soon" ||
    usagePercent >= soonPercent
  ) {
    return {
      bar: "bg-amber-400",
      text: "text-amber-100",
      ring: "ring-amber-300/30",
    };
  }

  return {
    bar: "bg-emerald-500",
    text: "text-emerald-200",
    ring: "ring-emerald-400/20",
  };
}


function VehicleDashboard({ vehicle, onLogFuel, onLogMaintenance, onManageSchedule, onManageTires, onViewStats, onEditVehicle, onEditEntry, onDeleteEntry }) {
  const stats = calculateFuelStats(vehicle);
  const currentOdometer = getCurrentOdometer(vehicle);
  const reminders = calculateMaintenanceReminders(vehicle);
  const shouldOpenMaintenanceStatus = reminders.some((reminder) =>
    ["soon", "due", "overdue"].includes(reminder.status)
  );

  const [maintenanceExpanded, setMaintenanceExpanded] = useState(shouldOpenMaintenanceStatus);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    setMaintenanceExpanded(shouldOpenMaintenanceStatus);
  }, [vehicle.id, shouldOpenMaintenanceStatus]);

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
          {vehicle.photo ? <img src={vehicle.photo} alt="" className="h-full w-full object-cover" /> : <Car size={76} className="text-white/70" />}
        </div>

        <div className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-2xl font-black tracking-tight">{vehicle.nickname}</div>
              <div className="text-sm text-slate-400">
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle details not set"}
              </div>
            </div>
            <button onClick={onEditVehicle} className="rounded-2xl bg-white/10 p-3 text-slate-200 backdrop-blur-xl" aria-label="Edit vehicle">
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
        <button onClick={onLogFuel} className="flex items-center justify-center gap-3 rounded-3xl bg-emerald-500 px-5 py-5 text-lg font-bold text-slate-950 shadow-lg shadow-emerald-950/40">
          <Fuel size={24} /> Log Fuel
        </button>
        <button onClick={onLogMaintenance} className="flex items-center justify-center gap-3 rounded-3xl bg-cyan-500 px-5 py-5 text-lg font-bold text-slate-950 shadow-cyan-950/40">
          <Wrench size={24} /> Log Maintenance
        </button>
        <button onClick={onManageTires} className="flex items-center justify-center gap-3 rounded-3xl bg-slate-800 px-5 py-4 text-base font-bold text-slate-100 shadow-lg shadow-black/20">
          <CircleDot size={22} /> Tire Sets
        </button>
        <button onClick={onViewStats} className="flex items-center justify-center gap-3 rounded-3xl bg-indigo-500 px-5 py-4 text-base font-bold text-white shadow-lg shadow-indigo-950/30">
          <BarChart3 size={22} /> Stats & Analytics
        </button>
        <button onClick={onManageSchedule} className="flex items-center justify-center gap-3 rounded-3xl bg-slate-800 px-5 py-4 text-base font-bold text-slate-100 shadow-lg shadow-black/20">
          <ClipboardList size={22} /> Manage Maintenance Schedule
        </button>
      </div>

      <TireStatusSection vehicle={vehicle} />

      <MaintenanceStatusSection
        reminders={reminders}
        currentOdometer={currentOdometer}
        expanded={maintenanceExpanded}
        onToggle={() => setMaintenanceExpanded((current) => !current)}
      />

      <div className="rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
        <button type="button" onClick={() => setHistoryExpanded((current) => !current)} className="flex w-full items-center justify-between">
          <div>
            <h2 className="text-left text-lg font-bold">Recent History</h2>
            <p className="text-left text-sm text-slate-400">{sortedEntries.length} entries</p>
          </div>
          <motion.div animate={{ rotate: historyExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={22} className="text-slate-300" />
          </motion.div>
        </button>

        {historyExpanded && (
          <div className="mt-4">
            {sortedEntries.length === 0 ? <p className="text-sm text-slate-400">No entries yet.</p> : (
              <div className="space-y-3">
                {sortedEntries.map((entry) => (
                  <div key={entry.id} className={`rounded-2xl p-3 border shadow-lg ${entry.type === "fuel" ? "bg-gradient-to-br from-emerald-950/40 to-slate-800 border-emerald-500/20 shadow-emerald-950/20" : entry.type === "maintenance" ? "bg-gradient-to-br from-blue-950/50 via-indigo-950/30 to-slate-800 border-blue-500/30 shadow-blue-950/30" : "bg-slate-800 border-white/5"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold capitalize">{entry.type}</div>
                        <div className="text-sm text-slate-400">{entry.date} • {number(entry.odometer)} mi</div>
                      </div>
                      <div className="flex gap-2">
                        {(entry.type === "fuel" || entry.type === "maintenance") && <button onClick={() => onEditEntry(entry.id)} className="rounded-xl bg-slate-700 p-2 text-slate-300" aria-label="Edit entry"><Pencil size={16} /></button>}
                        <button onClick={() => onDeleteEntry(entry.id)} className="rounded-xl bg-slate-700 p-2 text-slate-300" aria-label="Delete entry"><Trash2 size={16} /></button>
                      </div>
                    </div>

                    {entry.type === "fuel" && (
                      <div className="mt-2 text-sm text-slate-300">
                        {milesByEntryId[entry.id] ? `${number(milesByEntryId[entry.id])} mi since last fill-up` : "Miles pending"}{" "}
                        • {number(entry.gallons, 3)} gal • {currency(entry.totalCost)} •{" "}
                        {mpgByEntryId[entry.id] ? `${number(mpgByEntryId[entry.id], 1)} MPG` : "MPG pending"}
                        {entry.includeVehicleEstimatedMpg && entry.vehicleEstimatedMpg && mpgByEntryId[entry.id] && (
                          <>
                            {" "}• Vehicle est: {number(entry.vehicleEstimatedMpg, 1)} MPG
                            {" "}• Diff: {number(((Number(entry.vehicleEstimatedMpg) - mpgByEntryId[entry.id]) / mpgByEntryId[entry.id]) * 100, 1)}%
                          </>
                        )}
                        {entry.station ? ` • ${entry.station}` : ""}
                      </div>
                    )}

                    {entry.type === "maintenance" && (
                      <div className="mt-2 text-sm text-slate-300">
                        <div className="font-semibold">{entry.title || "Maintenance"}</div>
                        <div>{entry.maintenanceType} • {entry.status} • {currency(entry.cost)}</div>
                        {entry.serviceKey && <div className="text-slate-400">Satisfies: {getScheduleItemTitle(entry.serviceKey, vehicle)}</div>}
                        {entry.serviceProvider && <div className="text-slate-400">{entry.serviceProvider}</div>}
                      </div>
                    )}

                    {entry.type === "tire" && (
                      <div className="mt-2 text-sm text-slate-300">
                        <div className="font-semibold">{entry.title || "Tire Event"}</div>
                        <div>
                          {entry.action === "install" && "Installed"}
                          {entry.action === "rotation" && "Rotated"}
                          {entry.action === "retire" && "Retired"}
                          {!entry.action && "Tire update"}
                          {entry.tireSetName ? ` • ${entry.tireSetName}` : ""}
                        </div>
                        {entry.notes && <div className="text-slate-400">{entry.notes}</div>}
                      </div>
                    )}

                    {entry.photo && <img src={entry.photo} alt="Fuel log attachment" className="mt-3 h-36 w-full rounded-2xl object-cover ring-1 ring-white/10" />}
                    {entry.attachments?.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{entry.attachments.map((attachment, index) => <img key={index} src={attachment} alt={`Maintenance attachment ${index + 1}`} className="h-28 w-full rounded-2xl object-cover ring-1 ring-white/10" />)}</div>}
                    {entry.notes && <p className="mt-2 text-sm text-slate-400">{entry.notes}</p>}
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

function TireStatusSection({ vehicle }) {
  const tireSets = getTireSets(vehicle);

  const activeSet = tireSets.find((set) => set.status === "active") || null;
  const rotationStatus = getTireRotationStatus(activeSet, vehicle);

  const shouldOpenTireStatus =
    rotationStatus && ["soon", "overdue"].includes(rotationStatus.status);

  const [expanded, setExpanded] = useState(Boolean(shouldOpenTireStatus));

  useEffect(() => {
    setExpanded(Boolean(shouldOpenTireStatus));
  }, [vehicle.id, shouldOpenTireStatus]);

  const storedSets = tireSets.filter((set) => set.status === "stored");
  const retiredSets = tireSets.filter((set) => set.status === "retired");

  const rotationInterval = Number(activeSet?.rotationIntervalMiles || 5000);
  const rotationUsagePercent =
    rotationStatus && rotationInterval > 0
      ? (rotationStatus.milesSinceRotation / rotationInterval) * 100
      : null;

  const displayedRotationUsage =
    rotationUsagePercent === null ? 0 : Math.min(rotationUsagePercent, 125);

  const rotationSoonPercent =
    rotationInterval > 0
      ? ((rotationInterval - Number(activeSet?.rotationSoonMiles || 500)) /
          rotationInterval) *
        100
      : 80;

  const rotationBarClass =
    rotationStatus?.status === "overdue" || rotationUsagePercent >= 100
      ? "bg-red-500"
      : rotationStatus?.status === "soon" ||
        rotationUsagePercent >= rotationSoonPercent
      ? "bg-amber-400"
      : "bg-emerald-500";

  const rotationBadgeClass =
    rotationStatus?.status === "overdue"
      ? "bg-red-500/20 text-red-200 ring-red-400/30"
      : rotationStatus?.status === "soon"
      ? "bg-amber-400/20 text-amber-100 ring-amber-300/30"
      : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/20";

  return (
    <div className="rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between"
      >
        <div>
          <h2 className="text-left text-lg font-bold">Tire Status</h2>

          <p className="text-left text-sm text-slate-400">
            {rotationStatus && ["soon", "overdue"].includes(rotationStatus.status)
              ? rotationStatus.message
              : activeSet
              ? `${activeSet.name} currently installed`
              : "No active tire set"}
          </p>
        </div>

        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={22} className="text-slate-300" />
        </motion.div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {activeSet ? (
            <div className="rounded-3xl border border-emerald-500/20 bg-emerald-950/20 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-lg font-black">{activeSet.name}</div>
                  <div className="text-sm text-slate-300">
                    {activeSet.brand} {activeSet.model}
                  </div>
                </div>

                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-200">
                  Active
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <StatPill label="Size" value={activeSet.size || "—"} />
                <StatPill label="Miles" value={`${number(getTireSetMiles(activeSet, vehicle))} mi`} />
              </div>

              {activeSet.installedAtOdometer !== "" && (
                <div className="mt-3 text-sm text-slate-400">
                  Installed at {number(activeSet.installedAtOdometer)} mi
                </div>
              )}

              {rotationStatus && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold">Tire Rotation</div>
                      <div className="text-sm text-slate-300">{rotationStatus.message}</div>
                    </div>

                    <span className={`rounded-full px-2 py-1 text-xs font-bold ring-1 ${rotationBadgeClass}`}>
                      {rotationStatus.status}
                    </span>
                  </div>

                  <div className="mb-2">
                    <div className="mb-1 flex justify-between text-xs text-slate-400">
                      <span>{number(rotationUsagePercent, 0)}% used</span>
                      <span>100% due</span>
                    </div>

                    <div className="relative h-4 overflow-hidden rounded-full bg-slate-950 ring-1 ring-white/10">
                      <div
                        className={`h-full rounded-full ${rotationBarClass}`}
                        style={{ width: `${displayedRotationUsage}%` }}
                      />

                      <div
                        className="absolute bottom-0 top-0 w-px bg-white/50"
                        style={{
                          left: `${Math.max(
                            0,
                            Math.min(
                              100,
                              ((rotationInterval - Number(activeSet?.rotationSoonMiles || 500)) /
                                rotationInterval) *
                                100
                            )
                          )}%`,
                        }}
                      />

                      <div className="absolute bottom-0 top-0 w-px bg-white/80" style={{ left: "100%" }} />
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-slate-400">
                    {number(rotationStatus.milesSinceRotation)} mi since last rotation
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    Next due: {number(getCurrentOdometer(vehicle) + rotationStatus.milesRemaining)} mi
                  </div>

                  {rotationUsagePercent > 125 && (
                    <div className="mt-2 text-xs font-semibold text-red-200">
                      Over 125% used — actual usage is {number(rotationUsagePercent, 0)}%.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-3xl bg-slate-950 p-4 text-sm text-slate-400 ring-1 ring-white/10">
              No tire set is currently marked active.
            </div>
          )}

          {storedSets.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
                Stored Sets
              </div>

              <div className="space-y-2">
                {storedSets.map((set) => (
                  <div key={set.id} className="rounded-2xl bg-slate-950 p-3 ring-1 ring-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{set.name}</div>
                        <div className="text-sm text-slate-400">
                          {set.brand} {set.model}
                        </div>
                      </div>

                      <div className="text-right text-sm">
                        <div className="font-bold">{number(getTireSetMiles(set, vehicle))} mi</div>
                        <div className="text-slate-400">stored</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {retiredSets.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
                Retired Sets
              </div>

              <div className="space-y-2">
                {retiredSets.map((set) => (
                  <div key={set.id} className="rounded-2xl bg-slate-950/70 p-3 ring-1 ring-white/5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-300">{set.name}</div>
                        <div className="text-sm text-slate-500">
                          {set.brand} {set.model}
                        </div>
                      </div>

                      <div className="text-right text-sm">
                        <div className="font-bold text-slate-300">
                          {number(getTireSetMiles(set, vehicle))} mi
                        </div>
                        <div className="text-slate-500">retired</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MaintenanceStatusSection({ reminders, currentOdometer, expanded, onToggle }) {
  const alertCount = reminders.filter((reminder) =>
    ["soon", "due", "overdue"].includes(reminder.status)
  ).length;

  return (
    <div className="rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between">
        <div>
          <h2 className="text-left text-lg font-bold">Maintenance Status</h2>
          <p className="text-left text-sm text-slate-400">
            {alertCount > 0 ? `${alertCount} item${alertCount === 1 ? "" : "s"} need attention` : "All reminders are within range"}
          </p>
        </div>

        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={22} className="text-slate-300" />
        </motion.div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          {reminders.map((reminder) => (
            <MaintenanceStatusCard
              key={reminder.id}
              reminder={reminder}
              currentOdometer={currentOdometer}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MaintenanceStatusCard({ reminder, currentOdometer }) {
  const usagePercent = getMaintenanceUsage(reminder, currentOdometer);
  const displayedUsage = usagePercent === null ? 0 : Math.min(usagePercent, 125);

  const soonPercent =
    reminder.intervalMiles > 0
      ? ((reminder.intervalMiles - reminder.soonMiles) /
          reminder.intervalMiles) *
        100
      : 80;
  
  const classes = getMaintenanceProgressClasses(
    reminder,
    usagePercent || 0,
    soonPercent
  );

  return (
    <div className={`rounded-2xl border p-3 ${reminder.cardClass}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="font-bold">{reminder.title}</div>
          <div className="text-sm text-slate-300">{reminder.message}</div>
        </div>

        <span className={`rounded-full px-2 py-1 text-xs font-bold ring-1 ${reminder.badgeClass}`}>
          {reminder.status === "no-record" ? "No record" : reminder.status}
        </span>
      </div>

      <div className="mb-2">
        <div className="mb-1 flex justify-between text-xs text-slate-400">
          <span>{usagePercent === null ? "Not tracked yet" : `${number(usagePercent, 0)}% used`}</span>
          <span>100% due</span>
        </div>

        <div className="relative h-4 overflow-hidden rounded-full bg-slate-950 ring-1 ring-white/10">
          <div
            className={`h-full rounded-full ${classes.bar}`}
            style={{ width: `${displayedUsage}%` }}
          />

          <div
            className="absolute bottom-0 top-0 w-px bg-white/50"
            style={{
              left: `${Math.max(0, Math.min(100, soonPercent))}%`,
            }}
          />

          <div className="absolute bottom-0 top-0 w-px bg-white/80" style={{ left: "100%" }} />
        </div>
      </div>

      {reminder.lastLog && (
        <div className="mt-2 text-xs text-slate-400">
          Last done: {number(reminder.lastLog.odometer)} mi • {reminder.lastLog.date}
        </div>
      )}

      {reminder.nextDueMileage && reminder.dueDate && (
        <div className="mt-1 text-xs text-slate-400">
          Next due: {number(reminder.nextDueMileage)} mi • {reminder.dueDate}
        </div>
      )}

      {usagePercent !== null && usagePercent > 125 && (
        <div className="mt-2 text-xs font-semibold text-red-200">
          Over 125% used — actual usage is {number(usagePercent, 0)}%.
        </div>
      )}
    </div>
  );
}

function TireSetsScreen({ vehicle, onCancel, onSave }) {
  const [pendingRotations, setPendingRotations] = useState([]);
  const [tireSets, setTireSets] = useState(getTireSets(vehicle));
  const [entries, setEntries] = useState(vehicle.entries || []);

  const currentOdometer = getCurrentOdometer(vehicle);

  function updateTireSet(id, field, value) {
    setTireSets((current) =>
      current.map((set) =>
        set.id === id
          ? {
              ...set,
              [field]: value,
            }
          : set
      )
    );
  }

  function addTireSet() {
    setTireSets((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: "New Tire Set",
        brand: "",
        model: "",
        size: "",
        status: "stored",
        purchaseDate: "",
        purchaseOdometer: currentOdometer,
        initialMiles: 0,
        installedAtOdometer: "",
        removedAtOdometer: "",
        storedMiles: 0,
        notes: "",
        rotationIntervalMiles: 5000,
        rotationSoonMiles: 500,
        lastRotatedAtOdometer: "",
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function deleteTireSet(id) {
    setTireSets((current) => current.filter((set) => set.id !== id));
  }

  function installTireSet(id) {
  const tireSet = tireSets.find((set) => set.id === id);

  if (!tireSet) return;

  setEntries((current) => [
    makeTireHistoryEntry({
      title: `Installed ${tireSet.brand} ${tireSet.model} ${tireSet.size}`.trim(),
      action: "install",
      tireSetId: tireSet.id,
      tireSetName: tireSet.name,
      date: todayLocalString(),
      odometer: currentOdometer,
    }),
    ...current,
  ]);

  setTireSets((current) =>
    current.map((set) => {
      if (set.id !== id) {
        if (set.status === "active") {
          return {
            ...set,
            status: "stored",
            removedAtOdometer: currentOdometer,
            storedMiles: getTireSetMiles(set, vehicle),
          };
        }

        return set;
      }

      return {
        ...set,
        status: "active",
        installedAtOdometer: currentOdometer,
        removedAtOdometer: "",
      };
    })
  );
}



  function retireTireSet(id) {
    const tireSet = tireSets.find((set) => set.id === id);

    if (!tireSet) return;

    setEntries((current) => [
      makeTireHistoryEntry({
        title: `Retired ${tireSet.brand} ${tireSet.model} ${tireSet.size}`.trim(),
        action: "retire",
        tireSetId: tireSet.id,
        tireSetName: tireSet.name,
        date: todayLocalString(),
        odometer: currentOdometer,
      }),
      ...current,
    ]);

    setTireSets((current) =>
      current.map((set) =>
        set.id === id
          ? {
              ...set,
              status: "retired",
              removedAtOdometer: currentOdometer,
              storedMiles: getTireSetMiles(set, vehicle),
            }
          : set
      )
    );
  }

  function submit(event) {
    event.preventDefault();

    const rotationEntries = pendingRotations
      .map((id) => tireSets.find((set) => set.id === id))
      .filter(Boolean)
      .map((tireSet) =>
        makeTireHistoryEntry({
          title: `Rotated ${tireSet.brand} ${tireSet.model} ${tireSet.size}`.trim(),
          action: "rotation",
          tireSetId: tireSet.id,
          tireSetName: tireSet.name,
          date: todayLocalString(),
          odometer: currentOdometer,
        })
      );

    const updatedTireSets = tireSets.map((set) =>
      pendingRotations.includes(set.id)
        ? {
            ...set,
            lastRotatedAtOdometer: currentOdometer,
          }
        : set
    );

    onSave({
      ...vehicle,
      tireSets: updatedTireSets,
      entries: [...rotationEntries, ...entries],
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10"
    >
      <div>
        <h2 className="text-xl font-bold">Tire Sets</h2>

        <p className="mt-1 text-sm text-slate-400">
          Track active, stored, and retired tire sets for this vehicle.
        </p>
      </div>

      <div className="space-y-4">
        {tireSets.map((set) => {
          const totalMiles = getTireSetMiles(set, vehicle);

          return (
            <div
              key={set.id}
              className="rounded-3xl bg-slate-950 p-4 ring-1 ring-white/10"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold">{set.name}</div>

                  <div className="text-sm text-slate-400">
                    {set.brand} {set.model}
                  </div>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    set.status === "active"
                      ? "bg-emerald-500/20 text-emerald-200"
                      : set.status === "stored"
                      ? "bg-amber-500/20 text-amber-100"
                      : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {set.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Set Name"
                  value={set.name}
                  onChange={(value) =>
                    updateTireSet(set.id, "name", value)
                  }
                />

                <Field
                  label="Size"
                  value={set.size}
                  onChange={(value) =>
                    updateTireSet(set.id, "size", value)
                  }
                />

                <Field
                  label="Brand"
                  value={set.brand}
                  onChange={(value) =>
                    updateTireSet(set.id, "brand", value)
                  }
                />

                <Field
                  label="Model"
                  value={set.model}
                  onChange={(value) =>
                    updateTireSet(set.id, "model", value)
                  }
                />
                <Field
                  label="Rotation Interval"
                  type="number"
                  value={set.rotationIntervalMiles}
                  onChange={(value) =>
                    updateTireSet(set.id, "rotationIntervalMiles", Number(value || 0))
                  }
                />

                <Field
                  label="Rotation Soon Warning"
                  type="number"
                  value={set.rotationSoonMiles || 500}
                  onChange={(value) =>
                    updateTireSet(
                      set.id,
                      "rotationSoonMiles",
                      Number(value || 0)
                    )
                  }
                />

                <Field
                  label="Initial Tire Miles"
                  type="number"
                  value={set.initialMiles || 0}
                  onChange={(value) =>
                    updateTireSet(
                      set.id,
                      "initialMiles",
                      Number(value || 0)
                    )
                  }
                />
              </div>

              <div className="mt-4 rounded-2xl bg-slate-900 p-3">
                <div className="text-sm text-slate-400">
                  Total Tire Miles
                </div>

                <div className="text-2xl font-black">
                  {number(totalMiles)} mi
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {set.status === "stored" && (
                  <button
                    type="button"
                    onClick={() => installTireSet(set.id)}
                    className="rounded-2xl bg-emerald-500 px-4 py-2 font-bold text-slate-950"
                  >
                    Install
                  </button>
                )}

                {set.status === "active" && (
                  <button
                    type="button"
                    onClick={() =>
                      setPendingRotations((current) =>
                        current.includes(set.id)
                          ? current.filter((id) => id !== set.id)
                          : [...current, set.id]
                      )
                    }
                    className={`rounded-2xl px-4 py-2 font-bold ${
                      pendingRotations.includes(set.id)
                        ? "bg-amber-400 text-slate-950"
                        : "bg-cyan-500 text-slate-950"
                    }`}
                  >
                    {pendingRotations.includes(set.id)
                      ? "Rotation Pending ✓"
                      : "Mark Rotated"}
                  </button>
                )}

                {set.status !== "retired" && (
                  <button
                    type="button"
                    onClick={() => retireTireSet(set.id)}
                    className="rounded-2xl bg-amber-500 px-4 py-2 font-bold text-slate-950"
                  >
                    Retire
                  </button>
                )}

                {set.status === "retired" && (
                  <button
                    type="button"
                    onClick={() =>
                      updateTireSet(set.id, "status", "stored")
                    }
                    className="rounded-2xl bg-slate-700 px-4 py-2 font-bold text-slate-100"
                  >
                    Restore
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => deleteTireSet(set.id)}
                  className="rounded-2xl bg-red-600 px-4 py-2 font-bold text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addTireSet}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-4 font-semibold"
      >
        <Plus size={18} /> Add Tire Set
      </button>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold"
        >
          Cancel
        </button>

        <button
          type="submit"
          className="rounded-2xl bg-cyan-500 px-4 py-4 font-bold text-slate-950"
        >
          Save Tire Sets
        </button>
      </div>
    </form>
  );
}

function StatsScreen({ vehicle }) {
  const [range, setRange] = useState("1Y");
  const rangeStats = calculateRangeStats(vehicle, range);
  const mpgSeries = buildMpgSeries(vehicle, range);
  const monthlyFuelSeries = buildMonthlyFuelSeries(vehicle, range);
  const milesSeries = buildMilesOverTimeSeries(vehicle, range);
  const vehicleMpgDifferenceSeries = buildVehicleMpgDifferenceSeries(vehicle, range);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10"><div className="mb-3 flex items-center gap-2"><BarChart3 size={22} className="text-indigo-300" /><div><h2 className="text-xl font-black tracking-tight">Stats & Analytics</h2><p className="text-sm text-slate-400">Dynamic views for {vehicle.nickname}</p></div></div><RangeSelector value={range} onChange={setRange} /></div>
      <div className="grid grid-cols-2 gap-3"><DashboardStat icon={<ClipboardList size={18} className="text-slate-100" />} label="Miles driven" value={`${number(rangeStats.milesDriven)} mi`} /><DashboardStat icon={<Fuel size={18} className="text-emerald-400" />} label="Fuel / mile" value={rangeStats.fuelCostPerMile === null ? "—" : currency(rangeStats.fuelCostPerMile)} /><DashboardStat icon={<Wrench size={18} className="text-blue-400" />} label="Maint. / mile" value={rangeStats.maintenanceCostPerMile === null ? "—" : currency(rangeStats.maintenanceCostPerMile)} /><DashboardStat icon={<BarChart3 size={18} className="text-indigo-300" />} label="Total / mile" value={rangeStats.totalCostPerMile === null ? "—" : currency(rangeStats.totalCostPerMile)} /></div>
      <div className="grid grid-cols-2 gap-3"><StatPill label="Fuel spent" value={currency(rangeStats.totalFuelCost)} /><StatPill label="Maintenance spent" value={currency(rangeStats.totalMaintenanceCost)} /></div>
      <ChartCard title="MPG Over Time" subtitle="Calculated from fuel entries after the first fill-up."><MiniLineChart data={mpgSeries} valueLabel="MPG" yAxisLabel="MPG" xAxisLabel="Fuel entries" digits={1} emptyMessage="Add at least two fuel logs with increasing odometer readings to see MPG." /></ChartCard>
      <ChartCard title="Vehicle MPG Estimate Difference" subtitle="Positive means the vehicle estimate was higher than the calculated MPG.">
        <MiniLineChart data={vehicleMpgDifferenceSeries} valueLabel="%" yAxisLabel="% difference" xAxisLabel="Fuel entries" digits={1} emptyMessage="Add fuel logs with included vehicle MPG estimates to see this comparison."/>
      </ChartCard>
      <ChartCard title="Monthly Fuel Spending" subtitle="Fuel spending grouped by month in the selected range."><MiniLineChart data={monthlyFuelSeries} valueLabel="Fuel" yAxisLabel="Dollars" xAxisLabel="Month" formatValue={currency} emptyMessage="Add fuel logs to see monthly spending." /></ChartCard>
      <ChartCard title="Miles Over Time" subtitle="Odometer readings from fuel and maintenance entries."><MiniLineChart data={milesSeries} valueLabel="mi" yAxisLabel="Odometer" xAxisLabel="Date" digits={0} emptyMessage="Add entries with odometer readings to see miles over time." /></ChartCard>
      <CalculationNotes />
      <CostBreakdownCard fuel={rangeStats.totalFuelCost} maintenance={rangeStats.totalMaintenanceCost} />
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return <div className="rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10"><h2 className="mb-1 text-lg font-bold">{title}</h2><p className="mb-3 text-sm text-slate-400">{subtitle}</p>{children}</div>;
}

function RangeSelector({ value, onChange }) {
  return <div className="grid grid-cols-6 gap-1 rounded-2xl bg-slate-950 p-1 ring-1 ring-white/10">{rangeOptions.map((option) => <button key={option.id} type="button" onClick={() => onChange(option.id)} className={`rounded-xl px-2 py-2 text-xs font-bold transition ${value === option.id ? "bg-indigo-500 text-white shadow-lg shadow-indigo-950/30" : "text-slate-400"}`}>{option.label}</button>)}</div>;
}

function MiniLineChart({ data, valueLabel, yAxisLabel, xAxisLabel, digits = 0, formatValue, emptyMessage }) {
  if (!data || data.length === 0) return <div className="flex h-44 items-center justify-center rounded-2xl bg-slate-950 p-4 text-center text-sm text-slate-400 ring-1 ring-white/10">{emptyMessage}</div>;
  const width = 340, height = 190, paddingLeft = 54, paddingRight = 18, paddingTop = 22, paddingBottom = 42;
  const values = data.map((point) => Number(point.value || 0));
  const rawMinValue = Math.min(...values), rawMaxValue = Math.max(...values);
  const valueRange = rawMaxValue - rawMinValue || 1;
  const minValue = Math.max(0, rawMinValue - valueRange * 0.08);
  const maxValue = rawMaxValue + valueRange * 0.08;
  const adjustedRange = maxValue - minValue || 1;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const points = data.map((point, index) => {
    const x = data.length === 1 ? paddingLeft + plotWidth / 2 : paddingLeft + (index / (data.length - 1)) * plotWidth;
    const y = paddingTop + plotHeight - ((Number(point.value || 0) - minValue) / adjustedRange) * plotHeight;
    return { ...point, x, y };
  });
  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const fraction = index / 3;
    return { value: minValue + adjustedRange * (1 - fraction), y: paddingTop + plotHeight * fraction };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const latest = data[data.length - 1];
  const firstDate = data[0]?.date || "";
  const lastDate = data[data.length - 1]?.date || "";
  const displayValue = formatValue ? formatValue(latest.value) : `${number(latest.value, digits)} ${valueLabel}`;
  const formatTick = (value) => (formatValue ? formatValue(value) : number(value, digits));
  return (
    <div className="rounded-2xl bg-slate-950 p-3 ring-1 ring-white/10">
      <div className="mb-2 flex items-end justify-between gap-3"><div><div className="text-2xl font-black">{displayValue}</div><div className="text-xs text-slate-400">Latest value</div></div><div className="text-right text-xs text-slate-400"><div>High: {formatTick(rawMaxValue)}</div><div>Low: {formatTick(rawMinValue)}</div></div></div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full overflow-visible">
        {yTicks.map((tick, index) => <g key={index}><line x1={paddingLeft} y1={tick.y} x2={width - paddingRight} y2={tick.y} stroke="currentColor" className="text-slate-800" strokeWidth="1" /><text x={paddingLeft - 8} y={tick.y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{formatTick(tick.value)}</text></g>)}
        <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="currentColor" className="text-slate-700" strokeWidth="2" />
        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="currentColor" className="text-slate-700" strokeWidth="2" />
        <path d={path} fill="none" stroke="currentColor" className="text-cyan-300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => <circle key={point.id || point.date} cx={point.x} cy={point.y} r="4" fill="currentColor" className="text-cyan-200" />)}
        <text x={paddingLeft} y={height - 14} textAnchor="start" className="fill-slate-400 text-[10px]">{firstDate}</text>
        <text x={width - paddingRight} y={height - 14} textAnchor="end" className="fill-slate-400 text-[10px]">{lastDate}</text>
        <text x={width / 2} y={height - 2} textAnchor="middle" className="fill-slate-500 text-[10px]">{xAxisLabel}</text>
        <text x="12" y={height / 2} textAnchor="middle" transform={`rotate(-90 12 ${height / 2})`} className="fill-slate-500 text-[10px]">{yAxisLabel}</text>
      </svg>
    </div>
  );
}

function CalculationNotes() {
  return <div className="rounded-3xl bg-slate-900 p-4 text-sm text-slate-400 ring-1 ring-white/10"><h2 className="mb-2 text-lg font-bold text-slate-100">Calculation Notes</h2><p>Cost-per-mile cards use entries inside the selected range. Miles driven are estimated from the first and last odometer readings in that range.</p><p className="mt-2">MPG is calculated tank-by-tank from fuel logs: miles since previous fuel log divided by gallons added.</p></div>;
}

function CostBreakdownCard({ fuel, maintenance }) {
  const total = Number(fuel || 0) + Number(maintenance || 0);
  const fuelPercent = total > 0 ? (Number(fuel || 0) / total) * 100 : 0;
  const maintenancePercent = total > 0 ? 100 - fuelPercent : 0;
  return (
    <div className="rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10"><h2 className="mb-1 text-lg font-bold">Cost Breakdown</h2><p className="mb-3 text-sm text-slate-400">Fuel vs maintenance in the selected range.</p>{total <= 0 ? <div className="flex h-32 items-center justify-center rounded-2xl bg-slate-950 p-4 text-center text-sm text-slate-400 ring-1 ring-white/10">Add fuel or maintenance costs to see a cost breakdown.</div> : <div className="space-y-3"><div className="h-5 overflow-hidden rounded-full bg-slate-950 ring-1 ring-white/10"><div className="h-full bg-emerald-500" style={{ width: `${fuelPercent}%` }} /></div><div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-2xl bg-emerald-950/30 p-3 ring-1 ring-emerald-400/20"><div className="font-bold text-emerald-200">Fuel</div><div>{currency(fuel)}</div><div className="text-xs text-slate-400">{number(fuelPercent, 0)}%</div></div><div className="rounded-2xl bg-blue-950/30 p-3 ring-1 ring-blue-400/20"><div className="font-bold text-blue-200">Maintenance</div><div>{currency(maintenance)}</div><div className="text-xs text-slate-400">{number(maintenancePercent, 0)}%</div></div></div></div>}</div>
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
    setSchedule((current) => [
      ...current,
      {
        id: makeServiceId("New Service"),
        title: "New Service",
        intervalMiles: 5000,
        intervalMonths: 6,
        soonMiles: DEFAULT_SOON_MILES,
        soonMonths: DEFAULT_SOON_MONTHS,
      },
    ]);
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
          Customize reminder intervals and yellow “soon” warning thresholds for this vehicle.
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
                label="Interval Miles"
                type="number"
                value={item.intervalMiles}
                onChange={(value) => updateItem(item.id, "intervalMiles", value)}
                required
              />
              <Field
                label="Interval Months"
                type="number"
                value={item.intervalMonths}
                onChange={(value) => updateItem(item.id, "intervalMonths", value)}
                required
              />
              <Field
                label="Soon Warning Miles"
                type="number"
                value={item.soonMiles}
                onChange={(value) => updateItem(item.id, "soonMiles", value)}
                required
              />
              <Field
                label="Soon Warning Months"
                type="number"
                value={item.soonMonths}
                onChange={(value) => updateItem(item.id, "soonMonths", value)}
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

function VehicleForm({ vehicle, onCancel, onSave, onRequestDeleteVehicle }) {
  const [form, setForm] = useState({ nickname: vehicle.nickname || "", year: vehicle.year || "", make: vehicle.make || "", model: vehicle.model || "", odometer: vehicle.odometer || "", photo: vehicle.photo || "" });
  function update(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  function submit(event) {
    event.preventDefault();
    onSave({ ...vehicle, nickname: form.nickname.trim() || "Untitled Vehicle", year: form.year.trim(), make: form.make.trim(), model: form.model.trim(), odometer: Number(form.odometer || 0), photo: form.photo, maintenanceSchedule: getMaintenanceSchedule(vehicle) });
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
      <h2 className="text-xl font-bold">Edit Vehicle</h2>
      <Field label="Nickname" value={form.nickname} onChange={(value) => update("nickname", value)} required />
      <Field label="Year" value={form.year} onChange={(value) => update("year", value)} />
      <Field label="Make" value={form.make} onChange={(value) => update("make", value)} />
      <Field label="Model" value={form.model} onChange={(value) => update("model", value)} />
      <Field label="Current Odometer" type="number" value={form.odometer} onChange={(value) => update("odometer", value)} required />
      <div className="rounded-3xl bg-slate-950 p-3 ring-1 ring-white/10"><span className="mb-2 block text-sm font-medium text-slate-300">Vehicle Banner Photo</span>{form.photo ? <img src={form.photo} alt="Vehicle preview" className="mb-3 h-40 w-full rounded-2xl object-cover" /> : <div className="mb-3 flex h-40 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">No vehicle photo yet</div>}<label className="block cursor-pointer rounded-2xl bg-slate-800 px-4 py-3 text-center font-semibold">Choose Vehicle Photo<input type="file" accept="image/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const compressed = await compressImageFile(file, 1600, 0.8); update("photo", compressed); }} /></label>{form.photo && <button type="button" onClick={() => update("photo", "")} className="mt-2 w-full rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-300">Remove Photo</button>}</div>
      {onRequestDeleteVehicle && <button type="button" onClick={onRequestDeleteVehicle} className="w-full rounded-2xl bg-red-600 px-4 py-4 font-bold text-white shadow-lg shadow-red-950/30">Remove Vehicle</button>}
      <div className="grid grid-cols-2 gap-3 pt-2"><button type="button" onClick={onCancel} className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold">Cancel</button><button type="submit" className="rounded-2xl bg-cyan-500 px-4 py-4 font-bold text-slate-950">Save Vehicle</button></div>
    </form>
  );
}

function MaintenanceForm({ vehicle, initialEntry = null, onCancel, onSave }) {
  const schedule = getMaintenanceSchedule(vehicle);
  const isEditing = Boolean(initialEntry);
  const [form, setForm] = useState({ maintenanceType: initialEntry?.maintenanceType || "Scheduled Maintenance", serviceKey: initialEntry?.serviceKey || "", title: initialEntry?.title || "", date: initialEntry?.date || todayLocalString(), odometer: initialEntry?.odometer ?? getCurrentOdometer(vehicle) ?? "", cost: initialEntry?.cost ?? "", serviceProvider: initialEntry?.serviceProvider || "", status: initialEntry?.status || "Completed", notes: initialEntry?.notes || "", attachments: initialEntry?.attachments || [] });
  function update(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  async function addAttachments(files) { const fileList = Array.from(files || []); if (fileList.length === 0) return; const compressedImages = await Promise.all(fileList.map((file) => compressImageFile(file, 1400, 0.72))); update("attachments", [...form.attachments, ...compressedImages]); }
  function removeAttachment(indexToRemove) { update("attachments", form.attachments.filter((_, index) => index !== indexToRemove)); }
  function submit(event) { event.preventDefault(); const scheduleTitle = getScheduleItemTitle(form.serviceKey, vehicle); onSave({ id: initialEntry?.id || crypto.randomUUID(), type: "maintenance", maintenanceType: form.maintenanceType, serviceKey: form.serviceKey, title: form.title.trim() || scheduleTitle || "Maintenance", date: form.date, odometer: Number(form.odometer), cost: Number(form.cost || 0), serviceProvider: form.serviceProvider.trim(), status: form.status, notes: form.notes.trim(), attachments: form.attachments, createdAt: initialEntry?.createdAt || new Date().toISOString(), updatedAt: isEditing ? new Date().toISOString() : undefined }); }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
      <h2 className="text-xl font-bold">{isEditing ? "Edit Maintenance Log" : "Log Maintenance"}</h2>
      <SelectField label="Reason for Log" value={form.maintenanceType} onChange={(value) => update("maintenanceType", value)} options={["Scheduled Maintenance", "Repair", "Recall / TSB", "Inspection", "Tire Service", "Modification / Upgrade", "Diagnostic", "Emergency Repair", "Other"]} />
      <label className="block"><span className="mb-1 block text-sm font-medium text-slate-300">Satisfies Reminder</span><select value={form.serviceKey} onChange={(event) => update("serviceKey", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"><option value="">Does not satisfy a reminder</option>{schedule.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <Field label="Title / Short Description" value={form.title} onChange={(value) => update("title", value)} />
      <Field label="Date" type="date" value={form.date} onChange={(value) => update("date", value)} required />
      <Field label="Odometer" type="number" value={form.odometer} onChange={(value) => update("odometer", value)} required />
      <Field label="Cost" type="number" step="0.01" value={form.cost} onChange={(value) => update("cost", value)} />
      <Field label="Service Provider / Location" value={form.serviceProvider} onChange={(value) => update("serviceProvider", value)} />
      <SelectField label="Status" value={form.status} onChange={(value) => update("status", value)} options={["Completed", "Monitoring", "Needs Repair", "Scheduled", "Deferred"]} />
      <div className="rounded-3xl bg-slate-950 p-3 ring-1 ring-white/10"><span className="mb-2 block text-sm font-medium text-slate-300">Photos / Attachments</span>{form.attachments.length > 0 ? <div className="mb-3 grid grid-cols-2 gap-2">{form.attachments.map((attachment, index) => <div key={index} className="relative"><img src={attachment} alt={`Attachment ${index + 1}`} className="h-32 w-full rounded-2xl object-cover" /><button type="button" onClick={() => removeAttachment(index)} className="absolute right-2 top-2 rounded-xl bg-black/70 p-2 text-white" aria-label="Remove attachment"><Trash2 size={14} /></button></div>)}</div> : <div className="mb-3 flex h-32 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">No attachments yet</div>}<label className="block cursor-pointer rounded-2xl bg-slate-800 px-4 py-3 text-center font-semibold">Add Photos<input type="file" accept="image/*" multiple className="hidden" onChange={async (event) => { await addAttachments(event.target.files); event.target.value = ""; }} /></label></div>
      <TextAreaField label="Notes" value={form.notes} onChange={(value) => update("notes", value)} />
      <div className="grid grid-cols-2 gap-3 pt-2"><button type="button" onClick={onCancel} className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold">Cancel</button><button type="submit" className="rounded-2xl bg-cyan-500 px-4 py-4 font-bold text-slate-950">{isEditing ? "Save Changes" : "Save Maintenance"}</button></div>
    </form>
  );
}

function FuelForm({ vehicle, initialEntry = null, onCancel, onSave }) {
  const isEditing = Boolean(initialEntry);
  const [form, setForm] = useState({
    date: initialEntry?.date || todayLocalString(),
    odometer: initialEntry?.odometer ?? getCurrentOdometer(vehicle) ?? "",
    gallons: initialEntry?.gallons ?? "",
    totalCost: initialEntry?.totalCost ?? "",
    vehicleEstimatedMpg: initialEntry?.vehicleEstimatedMpg ?? "",
    includeVehicleEstimatedMpg: initialEntry?.includeVehicleEstimatedMpg ?? false,
    station: initialEntry?.station || "",
    notes: initialEntry?.notes || "",
    photo: initialEntry?.photo || "",
  });
  function update(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  function submit(event) {
    event.preventDefault();

    onSave({
      id: initialEntry?.id || crypto.randomUUID(),
      type: "fuel",
      date: form.date,
      odometer: Number(form.odometer),
      gallons: Number(form.gallons),
      totalCost: Number(form.totalCost),

      vehicleEstimatedMpg: form.includeVehicleEstimatedMpg
        ? Number(form.vehicleEstimatedMpg || 0)
        : "",

      includeVehicleEstimatedMpg: Boolean(form.includeVehicleEstimatedMpg),

      station: form.station.trim(),
      notes: form.notes.trim(),
      photo: form.photo,
      createdAt: initialEntry?.createdAt || new Date().toISOString(),
      updatedAt: isEditing ? new Date().toISOString() : undefined
    });
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-slate-900 p-4 ring-1 ring-white/10">
      <h2 className="text-xl font-bold">{isEditing ? "Edit Fuel Log" : "Log Fuel"}</h2>
      <Field label="Date" type="date" value={form.date} onChange={(value) => update("date", value)} required />
      <Field label="Odometer" type="number" value={form.odometer} onChange={(value) => update("odometer", value)} required />
      <Field label="Gallons" type="number" step="0.001" value={form.gallons} onChange={(value) => update("gallons", value)} required />
      <Field label="Total Cost" type="number" step="0.01" value={form.totalCost} onChange={(value) => update("totalCost", value)} required />
      <Field
        label="Vehicle Estimated MPG"
        type="number"
        step="0.1"
        value={form.vehicleEstimatedMpg}
        onChange={(value) => update("vehicleEstimatedMpg", value)}
      />

      <label className="flex items-start gap-3 rounded-2xl bg-slate-950 p-3 text-sm text-slate-300 ring-1 ring-white/10">
        <input
          type="checkbox"
          checked={form.includeVehicleEstimatedMpg}
          onChange={(event) =>
            update("includeVehicleEstimatedMpg", event.target.checked)
          }
          className="mt-1"
        />

        <span>
          <span className="block font-semibold text-slate-100">
            Include vehicle MPG estimate in comparison charts
          </span>

          <span className="text-slate-400">
            Only check this if you reset the vehicle’s trip MPG at the last fill-up.
          </span>
        </span>
      </label>
      <Field label="Station" value={form.station} onChange={(value) => update("station", value)} />
      <div className="rounded-3xl bg-slate-950 p-3 ring-1 ring-white/10"><span className="mb-2 block text-sm font-medium text-slate-300">Pump or Receipt Photo</span>{form.photo ? <img src={form.photo} alt="Fuel log preview" className="mb-3 h-44 w-full rounded-2xl object-cover" /> : <div className="mb-3 flex h-44 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">No photo attached</div>}<label className="block cursor-pointer rounded-2xl bg-slate-800 px-4 py-3 text-center font-semibold">Take or Choose Photo<input type="file" accept="image/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const compressed = await compressImageFile(file, 1400, 0.72); update("photo", compressed); }} /></label>{form.photo && <button type="button" onClick={() => update("photo", "")} className="mt-2 w-full rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-300">Remove Photo</button>}</div>
      <TextAreaField label="Notes" value={form.notes} onChange={(value) => update("notes", value)} />
      <div className="grid grid-cols-2 gap-3 pt-2"><button type="button" onClick={onCancel} className="rounded-2xl bg-slate-800 px-4 py-4 font-semibold">Cancel</button><button type="submit" className="rounded-2xl bg-emerald-500 px-4 py-4 font-bold text-slate-950">{isEditing ? "Save Changes" : "Save Fuel"}</button></div>
    </form>
  );
}

function SelectField({ label, value, onChange, options }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-slate-300">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400">{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function TextAreaField({ label, value, onChange }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-slate-300">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400" /></label>;
}

function Field({ label, value, onChange, type = "text", required = false, step }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-slate-300">{label}</span><input type={type} step={step} value={value} required={required} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400" /></label>;
}

function StatPill({ label, value }) {
  return <div className="rounded-2xl bg-slate-800 px-3 py-2"><div className="font-semibold">{value}</div><div className="text-xs text-slate-400">{label}</div></div>;
}

function DashboardStat({ icon, label, value }) {
  return <div className="rounded-2xl bg-slate-800 p-3"><div className="mb-2">{icon}</div><div className="text-lg font-bold">{value}</div><div className="text-xs text-slate-400">{label}</div></div>;
}

export default App;
