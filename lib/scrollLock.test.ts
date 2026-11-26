import { test } from "node:test";
import assert from "node:assert/strict";
import { createScrollLockController } from "./scrollLock.ts";

test("createScrollLockController reference-counts stacked sheets and preserves scrollY", () => {
  const classes = new Set<string>();
  let scrollY = 340;
  const restored: number[] = [];

  const controller = createScrollLockController(() => ({
    addClass: (c) => classes.add(c),
    removeClass: (c) => classes.delete(c),
    getScrollY: () => scrollY,
    restoreScrollY: (y) => {
      scrollY = y;
      restored.push(y);
    },
  }));

  const releaseOuter = controller.acquire();
  assert.equal(controller.getCount(), 1);
  assert.equal(classes.has("modal-open"), true);

  // Stacked inner sheet acquires while outer is still open.
  const releaseInner = controller.acquire();
  assert.equal(controller.getCount(), 2);
  assert.equal(classes.has("modal-open"), true);

  // Releasing inner sheet must keep scroll locked.
  releaseInner();
  releaseInner(); // idempotent second call
  assert.equal(controller.getCount(), 1);
  assert.equal(classes.has("modal-open"), true);
  assert.deepEqual(restored, []);

  // Simulate spurious browser scroll shift before outer closes.
  scrollY = 0;
  releaseOuter();
  assert.equal(controller.getCount(), 0);
  assert.equal(classes.has("modal-open"), false);
  assert.deepEqual(restored, [340]);
  assert.equal(scrollY, 340);
});
