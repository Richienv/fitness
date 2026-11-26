import test from "node:test";
import assert from "node:assert/strict";
import { getStreakTier, nextStreakMilestone } from "./streakTiers.ts";

test("streak tiers evolve visibly across count milestones", () => {
  assert.equal(getStreakTier(0).id, "dormant");
  assert.equal(getStreakTier(1).id, "ember");
  assert.equal(getStreakTier(2).id, "ember");
  assert.equal(getStreakTier(3).id, "blaze");
  assert.equal(getStreakTier(4).id, "blue_flame");
  assert.equal(getStreakTier(5).id, "lightning");
  assert.equal(getStreakTier(6).id, "lightning");
  assert.equal(getStreakTier(7).id, "golden");
  assert.equal(getStreakTier(14).id, "godfire");
  assert.equal(getStreakTier(30).id, "godfire");
});

test("nextStreakMilestone computes upcoming unlock accurately", () => {
  assert.deepEqual(nextStreakMilestone(2), {
    nextAt: 3,
    nextTitle: "Api Membara",
    remaining: 1,
  });
  assert.deepEqual(nextStreakMilestone(3), {
    nextAt: 4,
    nextTitle: "Api Biru",
    remaining: 1,
  });
  assert.deepEqual(nextStreakMilestone(4), {
    nextAt: 5,
    nextTitle: "Petir Ungu",
    remaining: 1,
  });
  assert.equal(nextStreakMilestone(14), null);
});
