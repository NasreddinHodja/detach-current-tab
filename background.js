"use strict";

// Stack of detach records — most recent on top.
// Each entry: { tabId, originalWindowId, originalIndex }
const detachStack = [];

browser.commands.onCommand.addListener(async (command) => {
  try {
    if (command === "detach-tab") {
      await detachActiveTab();
    } else if (command === "reattach-tab") {
      await reattachLastTab();
    }
  } catch (err) {
    console.error(`[Detach Tab] Command "${command}" failed:`, err);
  }
});

async function detachActiveTab() {
  const currentWindow = await browser.windows.getCurrent({ populate: true });

  // Don't detach if this is the only tab in the window.
  if (currentWindow.tabs.length <= 1) return;

  const activeTab = currentWindow.tabs.find((t) => t.active);
  if (!activeTab) return;

  // Push to the stack BEFORE detaching, while we still have the origin info.
  detachStack.push({
    tabId: activeTab.id,
    originalWindowId: currentWindow.id,
    originalIndex: activeTab.index,
  });

  await browser.windows.create({ tabId: activeTab.id });
}

async function reattachLastTab() {
  if (detachStack.length === 0) return;

  const entry = detachStack.pop();

  // Verify the original window still exists.
  const allWindows = await browser.windows.getAll();
  const targetExists = allWindows.some((w) => w.id === entry.originalWindowId);

  if (!targetExists) {
    console.warn(
      `[Detach Tab] Original window ${entry.originalWindowId} no longer exists.`
    );
    return;
  }

  // Move the tab back to its original window and position.
  await browser.tabs.move(entry.tabId, {
    windowId: entry.originalWindowId,
    index: entry.originalIndex,
  });

  // Focus the original window and activate the reattached tab.
  await browser.windows.update(entry.originalWindowId, { focused: true });
  await browser.tabs.update(entry.tabId, { active: true });
}

// Clean up: if a tracked tab is closed, remove it from the stack.
browser.tabs.onRemoved.addListener((tabId) => {
  const idx = detachStack.findIndex((entry) => entry.tabId === tabId);
  if (idx !== -1) detachStack.splice(idx, 1);
});

// Clean up: if an original window is closed, remove entries targeting it.
browser.windows.onRemoved.addListener((windowId) => {
  for (let i = detachStack.length - 1; i >= 0; i--) {
    if (detachStack[i].originalWindowId === windowId) {
      detachStack.splice(i, 1);
    }
  }
});
