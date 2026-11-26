"use client";
import { getSettings, setSettings } from "./settings";
import { readCompanion, saveCompanion } from "./companionSettings";
import { mergeServerMeasurements } from "./measurements";
import { scopedKey } from "./userScope";
import { sameMeasurement, type AccountSetup } from "./setup";
export const SETUP_CACHE_KEY = "r2.setup.v1";
export function applySetupToDevice(setup: AccountSetup) {
  const key = scopedKey(SETUP_CACHE_KEY);
  const previous = JSON.parse(
    localStorage.getItem(key) || "null",
  ) as AccountSetup | null;
  if (previous?.updatedAt !== setup.updatedAt) {
    const current = getSettings();
    setSettings({
      ...current,
      profile: setup.profile,
      targets: setup.targets,
      targetsCustom: setup.targetsCustom,
      startDate: setup.companionGoal.baselineDate,
      routine: {
        trainingDays: setup.trainingDays,
        sleepHours: setup.sleepHours,
      },
      foodPreferences: { style: setup.foodStyle, allergies: setup.allergies },
    });
    const companion = readCompanion(setup.person);
    const serverGoalChanged =
      Boolean(setup.companionGoalUpdatedAt) &&
      setup.companionGoalUpdatedAt !== previous?.companionGoalUpdatedAt;
    const prevServerGoalDiffers =
      previous !== null &&
      JSON.stringify(previous.companionGoal) !==
        JSON.stringify(setup.companionGoal);
    const goal =
      serverGoalChanged || prevServerGoalDiffers
        ? setup.companionGoal
        : companion.goal?.mode === "recomp" && setup.companionGoal?.mode !== "recomp"
          ? companion.goal
          : setup.companionGoal;
    saveCompanion({
      character: setup.person,
      goal,
    });
    if (!sameMeasurement(previous?.measurement, setup.measurement))
      mergeServerMeasurements([setup.measurement]);
    localStorage.setItem(key, JSON.stringify(setup));
  }
}
