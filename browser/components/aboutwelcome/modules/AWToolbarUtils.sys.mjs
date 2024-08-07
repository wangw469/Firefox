/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
const widgetId = "aboutwelcome-button";

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserUsageTelemetry: "resource:///modules/BrowserUsageTelemetry.sys.mjs",
  CustomizableUI: "resource:///modules/CustomizableUI.sys.mjs",
});

export const AWToolbarButton = {
  async maybeAddSetupButton() {
    // First check if we've already completed onboarding, in which
    // case we should remove the button.
    if (AWToolbarButton.didSeeFinalScreen) {
      AWToolbarButton.removeSetupButtonIfOnboardingComplete();
      return;
    }
    // Otherwise, check if this is a new profile where we need to add it.
    if (AWToolbarButton.hasToolbarButtonEnabled) {
      lazy.CustomizableUI.createWidget({
        id: widgetId,
        l10nId: "browser-aboutwelcome-button",
        defaultArea: lazy.CustomizableUI.AREA_BOOKMARKS,
        type: "button",
        onCreated(aNode) {
          aNode.className = "bookmark-item chromeclass-toolbar-additional";
          lazy.BrowserUsageTelemetry.recordWidgetChange(
            widgetId,
            lazy.CustomizableUI.AREA_BOOKMARKS,
            "create"
          );
        },
        onCommand(aEvent) {
          AWToolbarButton.openWelcome(aEvent.view);
        },
        onDestroyed() {
          lazy.BrowserUsageTelemetry.recordWidgetChange(
            widgetId,
            null,
            "destroy"
          );
        },
      });
    }
  },

  removeSetupButtonIfOnboardingComplete() {
    //Look for completion of Onboarding (we're using an AWFinish()
    //call from about:welcome as a proxy here)
    if (
      AWToolbarButton.didSeeFinalScreen ||
      !AWToolbarButton.hasToolbarButtonEnabled
    ) {
      lazy.CustomizableUI.destroyWidget(widgetId);
    }
  },

  openWelcome(win) {
    Services.prefs.setStringPref(
      "browser.aboutwelcome.entrypoint",
      "toolbarButton"
    );
    let viewURL = "about:welcome";
    win.gBrowser.addTrustedTab(viewURL, {
      inBackground: false,
    });
  },
};

XPCOMUtils.defineLazyPreferenceGetter(
  AWToolbarButton,
  "didSeeFinalScreen",
  "browser.aboutwelcome.didSeeFinalScreen",
  false,
  () => {
    AWToolbarButton.removeSetupButtonIfOnboardingComplete();
  }
);

XPCOMUtils.defineLazyPreferenceGetter(
  AWToolbarButton,
  "hasToolbarButtonEnabled",
  "browser.aboutwelcome.toolbarButtonEnabled",
  false,
  () => {
    AWToolbarButton.removeSetupButtonIfOnboardingComplete();
  }
);
